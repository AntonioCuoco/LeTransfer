import { ref, shallowRef, computed, onMounted, watch } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { notify } from '@/src/utils/notify'
import { notifyApiError } from '@/src/utils/apiError'
import {
  generateRSAKeyPair, exportPublicKeyToJWK, importPublicKeyFromJWK,
  exportPrivateKeyToJWK, importPrivateKeyFromJWK,
  wrapPrivateKeyWithMasterKey, unwrapPrivateKeyWithMasterKey, type KeyPairBackup,
} from '@/src/crypto/crypto'
import { idbGet, idbSet, idbDel } from '@/src/crypto/keyStore'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { useEncryptionStore } from '@/src/stores/encryption'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

// Chiavi localStorage LEGACY (versione originale, JWK in chiaro): sorgente di migrazione, poi cancellate.
const PRIVATE_KEY_LS = 'letransfer_private_key'
const PUBLIC_KEY_LS = 'letransfer_public_key'
const KEYPAIR_INIT_LS = 'letransfer_keypair_initialized'
// Chiavi IndexedDB LEGACY non-namespaciate (versione intermedia): migrate a quelle per-utente.
const LEGACY_PRIVATE_IDB = 'letransfer_private_key'
const LEGACY_PUBLIC_IDB = 'letransfer_public_key'

// Nomi delle voci IndexedDB, NAMESPACIATI per utente (sub): su un browser condiviso un secondo
// utente non carica la coppia del primo (no key bleed). La private key salvata è NON estraibile (#1).
const idbKeyNames = () => {
  const sub = getCurrentUser()?.sub || 'anon'
  return { pub: `letransfer_public_key_${sub}`, priv: `letransfer_private_key_${sub}` }
}

export const useUserKeyPair = () => {
  const encryptionStore = useEncryptionStore()

  const publicKey = shallowRef<CryptoKey | null>(null)
  const privateKey = shallowRef<CryptoKey | null>(null)
  // Copia ESTRAIBILE della private key, tenuta solo in memoria e solo nella sessione in cui la
  // coppia è stata generata o ripristinata. Serve unicamente al backup (che deve poter esportare
  // la chiave). La copia persistente in IndexedDB è invece NON estraibile: è il guadagno del #1.
  const exportablePrivateKey = shallowRef<CryptoKey | null>(null)
  // Backup del server in attesa di essere ripristinato appena il vault viene sbloccato (master key).
  const pendingRestore = shallowRef<KeyPairBackup | null>(null)
  const isInitializing = ref(false)
  const error = ref<string | null>(null)

  const isKeyPairReady = computed(() => publicKey.value !== null && privateKey.value !== null)

  // Auth gestita dall'interceptor axios globale (accessToken, #8): nessun header manuale.
  const getHeaders = () => ({})

  // Salva la coppia in IndexedDB. La private key viene RE-IMPORTATA come non-estraibile prima di
  // essere salvata, così nemmeno un XSS può esportarla da IDB. Ritorna la private key non-estraibile.
  const persistKeys = async (pubKey: CryptoKey, extractablePriv: CryptoKey): Promise<CryptoKey> => {
    const privJWK = await exportPrivateKeyToJWK(extractablePriv)
    const nonExtractablePriv = await importPrivateKeyFromJWK(privJWK, false)
    const { pub, priv } = idbKeyNames()
    await idbSet(pub, pubKey)
    await idbSet(priv, nonExtractablePriv)
    return nonExtractablePriv
  }

  const loadFromIDB = async (): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey } | null> => {
    try {
      const { pub, priv } = idbKeyNames()
      const pubKey = await idbGet(pub)
      const privKey = await idbGet(priv)
      return pubKey && privKey ? { publicKey: pubKey, privateKey: privKey } : null
    } catch { return null }
  }

  // Migrazione una-tantum verso lo storage namespaciato, da due possibili sorgenti legacy:
  // 1) IDB non-namespaciato (versione intermedia di #1) → sposta le CryptoKey così come sono;
  // 2) localStorage (versione originale) → re-importa le JWK (private NON estraibile) e pulisce.
  const migrateLegacyKeys = async (): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey } | null> => {
    const { pub, priv } = idbKeyNames()

    try {
      const oldPub = await idbGet(LEGACY_PUBLIC_IDB)
      const oldPriv = await idbGet(LEGACY_PRIVATE_IDB)
      if (oldPub && oldPriv) {
        await idbSet(pub, oldPub)
        await idbSet(priv, oldPriv)
        await idbDel(LEGACY_PUBLIC_IDB)
        await idbDel(LEGACY_PRIVATE_IDB)
        return { publicKey: oldPub, privateKey: oldPriv }
      }
    } catch { /* prosegui col fallback localStorage */ }

    const pubStr = localStorage.getItem(PUBLIC_KEY_LS)
    const privStr = localStorage.getItem(PRIVATE_KEY_LS)
    if (!pubStr || !privStr) return null
    try {
      const pubKey = await importPublicKeyFromJWK(JSON.parse(pubStr))
      const privKey = await importPrivateKeyFromJWK(JSON.parse(privStr), false)
      await idbSet(pub, pubKey)
      await idbSet(priv, privKey)
      localStorage.removeItem(PRIVATE_KEY_LS)
      localStorage.removeItem(PUBLIC_KEY_LS)
      localStorage.removeItem(KEYPAIR_INIT_LS)
      return { publicKey: pubKey, privateKey: privKey }
    } catch { return null }
  }

  const uploadPublicKeyToServer = async (pubKey: CryptoKey): Promise<boolean> => {
    try {
      await axios.post(`${API_BASE_URL}/user/public-key`, { publicKeyJWK: await exportPublicKeyToJWK(pubKey) }, { headers: getHeaders() })
      return true
    } catch (err) { notifyApiError(err, 'Chiave pubblica non inviata', "Errore nell'invio della chiave pubblica al server"); return false }
  }

  const checkServerBackup = async (): Promise<KeyPairBackup | null> => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/user/keypair-backup`, { headers: getHeaders() })
      return (data.success && data.data) ? data.data : null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status === 404) return null
      return null
    }
  }

  // Carica il backup della keypair sul server, cifrato con la MASTER KEY. Richiede: vault sbloccato
  // (master key disponibile) + una copia ESTRAIBILE della private key (solo nella sessione in cui la
  // coppia è stata generata/ripristinata). Idempotente: non ricarica se un backup esiste già.
  const ensureServerBackup = async () => {
    const mk = encryptionStore.masterKey
    if (!mk || !exportablePrivateKey.value) return
    try {
      if (await checkServerBackup()) return
      const backup = await wrapPrivateKeyWithMasterKey(exportablePrivateKey.value, mk)
      await axios.post(`${API_BASE_URL}/user/keypair-backup`, backup, { headers: getHeaders() })
    } catch { /* backup non critico: si ritenta al prossimo avvio/sblocco */ }
  }

  // Ripristina la keypair dal backup del server usando la master key. Se il vault non è ancora
  // sbloccato, mette il backup in attesa: lo riprende il watcher su isUnlocked.
  const doRestore = async (backup: KeyPairBackup): Promise<boolean> => {
    const mk = encryptionStore.masterKey
    if (!mk) { pendingRestore.value = backup; return false }
    try {
      const extractablePriv = await unwrapPrivateKeyWithMasterKey(backup, mk)
      const { data } = await axios.get(`${API_BASE_URL}/user/public-key`, { headers: getHeaders() })
      if (!data.success || !data.data?.publicKeyJWK) throw new Error('Failed to get public key from server')
      const pubKey = await importPublicKeyFromJWK(data.data.publicKeyJWK)
      const nonExtractablePriv = await persistKeys(pubKey, extractablePriv)
      publicKey.value = pubKey
      privateKey.value = nonExtractablePriv
      exportablePrivateKey.value = extractablePriv
      pendingRestore.value = null
      return true
    } catch (err) {
      error.value = notifyApiError(err, 'Chiavi non ripristinate', 'Impossibile ripristinare le chiavi dal backup')
      return false
    }
  }

  const initializeKeyPair = async () => {
    if (isInitializing.value || isKeyPairReady.value) return
    isInitializing.value = true
    error.value = null
    try {
      const idb = await loadFromIDB()
      if (idb) { publicKey.value = idb.publicKey; privateKey.value = idb.privateKey; return }

      const migrated = await migrateLegacyKeys()
      if (migrated) { publicKey.value = migrated.publicKey; privateKey.value = migrated.privateKey; return }

      const serverBackup = await checkServerBackup()
      if (serverBackup) { await doRestore(serverBackup); return }

      const keyPair = await generateRSAKeyPair() // estraibile (transitoria)
      const nonExtractablePriv = await persistKeys(keyPair.publicKey, keyPair.privateKey)
      await uploadPublicKeyToServer(keyPair.publicKey)
      publicKey.value = keyPair.publicKey
      privateKey.value = nonExtractablePriv
      exportablePrivateKey.value = keyPair.privateKey
      ensureServerBackup() // se sbloccato fa subito il backup; altrimenti lo fa il watcher allo sblocco
    } catch (err) {
      error.value = notifyApiError(err, 'Chiavi non pronte', 'Impossibile inizializzare le chiavi di cifratura')
    } finally {
      isInitializing.value = false
    }
  }

  // Quando il vault si sblocca (master key disponibile): ripristina il backup in attesa, oppure
  // carica il backup della keypair se è appena stata generata/ripristinata e non è ancora sul server.
  watch(() => encryptionStore.isUnlocked, (unlocked) => {
    if (!unlocked) return
    if (pendingRestore.value) doRestore(pendingRestore.value)
    else if (isKeyPairReady.value) ensureServerBackup()
  })

  const getRecipientPublicKey = async (email: string): Promise<CryptoKey | null> => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/user/by-email/${encodeURIComponent(email)}/public-key`, { headers: getHeaders() })
      if (data.success && data.data?.publicKeyJWK) return await importPublicKeyFromJWK(data.data.publicKeyJWK)
      // Prima questo caso tornava `null` in silenzio, e chi chiamava doveva indovinare il perché.
      notify.error(
        (data as { message?: string }).message ?? `${email} non ha ancora attivato la cifratura: per ora non può ricevere file.`,
        'Destinatario non pronto',
      )
      return null
    } catch (err) { notifyApiError(err, 'Destinatario non raggiungibile', `Impossibile recuperare la chiave pubblica per ${email}`); return null }
  }

  const exportPublicKeyJWK = async (): Promise<JsonWebKey | null> => {
    if (!publicKey.value) return null
    return exportPublicKeyToJWK(publicKey.value)
  }

  onMounted(() => {
    if (Cookies.get('accessToken')) initializeKeyPair()
  })

  return { publicKey, privateKey, isKeyPairReady, isInitializing, error, initializeKeyPair, getRecipientPublicKey, exportPublicKeyJWK }
}

// Rimuove la coppia RSA dell'utente corrente da IndexedDB (funzione standalone: NON istanzia il
// composable, quindi niente onMounted). ⚠️ NON collegata al logout di proposito: la keypair è già
// ripristinabile dal backup cifrato con la master key, ma cancellarla al logout imporrebbe un
// restore a ogni login. Collegarla al logout solo se si vuole la semantica "dimentica dispositivo".
export async function clearPersistedKeyPair(): Promise<void> {
  try {
    const { pub, priv } = idbKeyNames()
    await idbDel(priv)
    await idbDel(pub)
  } catch { /* ignore */ }
}
