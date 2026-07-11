import { ref, shallowRef, computed, onMounted } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { notify } from '@/src/utils/notify'
import {
  generateRSAKeyPair, exportPublicKeyToJWK, importPublicKeyFromJWK,
  exportPrivateKeyToJWK, importPrivateKeyFromJWK,
  encryptPrivateKeyForBackup, decryptPrivateKeyFromBackup, type KeyPairBackup,
} from '@/src/utils/crypto'
import { idbGet, idbSet, idbDel } from '@/src/utils/keyStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

// Chiavi localStorage LEGACY: sorgente della migrazione una-tantum, poi cancellate.
const PRIVATE_KEY_LS = 'letransfer_private_key'
const PUBLIC_KEY_LS = 'letransfer_public_key'
const KEYPAIR_INIT_LS = 'letransfer_keypair_initialized'

// Chiavi IndexedDB: qui la private key è salvata come CryptoKey NON estraibile (fix #1).
const PRIVATE_KEY_IDB = 'letransfer_private_key'
const PUBLIC_KEY_IDB = 'letransfer_public_key'

export const useUserKeyPair = () => {
  const publicKey = shallowRef<CryptoKey | null>(null)
  const privateKey = shallowRef<CryptoKey | null>(null)
  // Copia ESTRAIBILE della private key, tenuta solo in memoria e solo nella sessione in cui la
  // coppia è stata generata o ripristinata. Serve unicamente al backup (che deve poter esportare
  // la chiave). La copia persistente in IndexedDB è invece NON estraibile: è questo il guadagno
  // del #1. Dopo un reload questa è null → per rifare un backup serve prima un restore.
  const exportablePrivateKey = shallowRef<CryptoKey | null>(null)
  const isInitializing = ref(false)
  const error = ref<string | null>(null)
  const needsPasswordForRestore = ref(false)

  const isKeyPairReady = computed(() => publicKey.value !== null && privateKey.value !== null)

  // Auth gestita dall'interceptor axios globale (accessToken, #8): nessun header manuale.
  const getHeaders = () => ({})

  // Salva la coppia in IndexedDB. La private key viene RE-IMPORTATA come non-estraibile prima di
  // essere salvata, così nemmeno un XSS può esportarla da IDB. Ritorna la private key non-estraibile.
  const persistKeys = async (pubKey: CryptoKey, extractablePriv: CryptoKey): Promise<CryptoKey> => {
    const privJWK = await exportPrivateKeyToJWK(extractablePriv)
    const nonExtractablePriv = await importPrivateKeyFromJWK(privJWK, false)
    await idbSet(PUBLIC_KEY_IDB, pubKey)
    await idbSet(PRIVATE_KEY_IDB, nonExtractablePriv)
    return nonExtractablePriv
  }

  const loadFromIDB = async (): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey } | null> => {
    try {
      const pub = await idbGet(PUBLIC_KEY_IDB)
      const priv = await idbGet(PRIVATE_KEY_IDB)
      return pub && priv ? { publicKey: pub, privateKey: priv } : null
    } catch { return null }
  }

  // Migrazione una-tantum: se esistono ancora le vecchie JWK in localStorage, le re-importa come
  // CryptoKey (private NON estraibile) in IndexedDB e pulisce localStorage.
  const migrateFromLocalStorage = async (): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey } | null> => {
    const pubStr = localStorage.getItem(PUBLIC_KEY_LS)
    const privStr = localStorage.getItem(PRIVATE_KEY_LS)
    if (!pubStr || !privStr) return null
    try {
      const pubKey = await importPublicKeyFromJWK(JSON.parse(pubStr))
      const privKey = await importPrivateKeyFromJWK(JSON.parse(privStr), false)
      await idbSet(PUBLIC_KEY_IDB, pubKey)
      await idbSet(PRIVATE_KEY_IDB, privKey)
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
    } catch { notify.error("Errore nell'invio della chiave pubblica al server"); return false }
  }

  const checkServerBackup = async (): Promise<KeyPairBackup | null> => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/user/keypair-backup`, { headers: getHeaders() })
      return (data.success && data.data) ? data.data : null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status === 404) return null
      notify.error('Errore nel controllo del backup sul server')
      return null
    }
  }

  const initializeKeyPair = async () => {
    if (isInitializing.value || isKeyPairReady.value) return
    isInitializing.value = true
    error.value = null
    try {
      const idb = await loadFromIDB()
      if (idb) { publicKey.value = idb.publicKey; privateKey.value = idb.privateKey; return }

      const migrated = await migrateFromLocalStorage()
      if (migrated) { publicKey.value = migrated.publicKey; privateKey.value = migrated.privateKey; return }

      const serverBackup = await checkServerBackup()
      if (serverBackup) { needsPasswordForRestore.value = true; return }

      const keyPair = await generateRSAKeyPair() // estraibile (transitoria)
      const nonExtractablePriv = await persistKeys(keyPair.publicKey, keyPair.privateKey)
      await uploadPublicKeyToServer(keyPair.publicKey)
      publicKey.value = keyPair.publicKey
      privateKey.value = nonExtractablePriv
      exportablePrivateKey.value = keyPair.privateKey // consente il backup in questa sessione
    } catch {
      notify.error('Impossibile inizializzare le chiavi di cifratura')
      error.value = 'Impossibile inizializzare le chiavi di cifratura'
    } finally {
      isInitializing.value = false
    }
  }

  const restoreFromBackup = async (password: string): Promise<boolean> => {
    isInitializing.value = true
    error.value = null
    try {
      const serverBackup = await checkServerBackup()
      if (!serverBackup) { error.value = 'Nessun backup trovato sul server'; return false }
      const extractablePriv = await decryptPrivateKeyFromBackup(serverBackup, password)
      const { data } = await axios.get(`${API_BASE_URL}/user/public-key`, { headers: getHeaders() })
      if (!data.success || !data.data?.publicKeyJWK) throw new Error('Failed to get public key from server')
      const pubKey = await importPublicKeyFromJWK(data.data.publicKeyJWK)
      const nonExtractablePriv = await persistKeys(pubKey, extractablePriv)
      publicKey.value = pubKey
      privateKey.value = nonExtractablePriv
      exportablePrivateKey.value = extractablePriv
      needsPasswordForRestore.value = false
      notify.success('Chiavi ripristinate con successo dal backup')
      return true
    } catch { notify.error('Password non corretta o backup corrotto'); error.value = 'Password non corretta o backup corrotto'; return false }
    finally { isInitializing.value = false }
  }

  const backupToServer = async (password: string): Promise<boolean> => {
    const exportable = exportablePrivateKey.value
    if (!exportable) {
      error.value = 'Backup non disponibile in questa sessione: ripristina prima le chiavi dal backup, oppure rigenera la coppia.'
      notify.error(error.value)
      return false
    }
    try {
      const backup = await encryptPrivateKeyForBackup(exportable, password)
      await axios.post(`${API_BASE_URL}/user/keypair-backup`, backup, { headers: getHeaders() })
      notify.success('Backup delle chiavi salvato sul server')
      return true
    } catch { notify.error('Impossibile salvare il backup sul server'); error.value = 'Impossibile salvare il backup sul server'; return false }
  }

  const getRecipientPublicKey = async (email: string): Promise<CryptoKey | null> => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/user/by-email/${encodeURIComponent(email)}/public-key`, { headers: getHeaders() })
      if (data.success && data.data?.publicKeyJWK) return await importPublicKeyFromJWK(data.data.publicKeyJWK)
      return null
    } catch { notify.error(`Impossibile recuperare la chiave pubblica per ${email}`); return null }
  }

  const exportPublicKeyJWK = async (): Promise<JsonWebKey | null> => {
    if (!publicKey.value) return null
    return exportPublicKeyToJWK(publicKey.value)
  }

  // Rimuove la coppia da memoria e IndexedDB (es. logout / cambio utente).
  const clearKeys = async () => {
    publicKey.value = null
    privateKey.value = null
    exportablePrivateKey.value = null
    needsPasswordForRestore.value = false
    try { await idbDel(PRIVATE_KEY_IDB); await idbDel(PUBLIC_KEY_IDB) } catch { /* ignore */ }
  }

  onMounted(() => {
    if (Cookies.get('accessToken')) initializeKeyPair()
  })

  return { publicKey, privateKey, isKeyPairReady, isInitializing, error, needsPasswordForRestore, initializeKeyPair, restoreFromBackup, backupToServer, getRecipientPublicKey, exportPublicKeyJWK, clearKeys }
}
