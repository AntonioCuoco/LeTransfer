import { ref, shallowRef, computed, onMounted } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { message } from 'ant-design-vue'
import {
  generateRSAKeyPair, exportPublicKeyToJWK, importPublicKeyFromJWK,
  exportPrivateKeyToJWK, importPrivateKeyFromJWK,
  encryptPrivateKeyForBackup, decryptPrivateKeyFromBackup, type KeyPairBackup,
} from '@/src/utils/crypto'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const PRIVATE_KEY_STORAGE_KEY = 'letransfer_private_key'
const PUBLIC_KEY_STORAGE_KEY = 'letransfer_public_key'
const KEYPAIR_INITIALIZED_KEY = 'letransfer_keypair_initialized'

export const useUserKeyPair = () => {
  const publicKey = shallowRef<CryptoKey | null>(null)
  const privateKey = shallowRef<CryptoKey | null>(null)
  const isInitializing = ref(false)
  const error = ref<string | null>(null)
  const needsPasswordForRestore = ref(false)

  const isKeyPairReady = computed(() => publicKey.value !== null && privateKey.value !== null)

  const getHeaders = () => {
    const token = Cookies.get('idToken')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const saveToLocalStorage = async (pubKey: CryptoKey, privKey: CryptoKey) => {
    const publicKeyJWK = await exportPublicKeyToJWK(pubKey)
    const privateKeyJWK = await exportPrivateKeyToJWK(privKey)
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, JSON.stringify(publicKeyJWK))
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, JSON.stringify(privateKeyJWK))
    localStorage.setItem(KEYPAIR_INITIALIZED_KEY, 'true')
  }

  const loadFromLocalStorage = async (): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey } | null> => {
    try {
      const pubStr = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)
      const privStr = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY)
      if (!pubStr || !privStr) return null
      const pubKey = await importPublicKeyFromJWK(JSON.parse(pubStr))
      const privKey = await importPrivateKeyFromJWK(JSON.parse(privStr))
      return { publicKey: pubKey, privateKey: privKey }
    } catch { return null }
  }

  const uploadPublicKeyToServer = async (pubKey: CryptoKey): Promise<boolean> => {
    try {
      await axios.post(`${API_BASE_URL}/user/public-key`, { publicKeyJWK: await exportPublicKeyToJWK(pubKey) }, { headers: getHeaders() })
      return true
    } catch { message.error("Errore nell'invio della chiave pubblica al server"); return false }
  }

  const checkServerBackup = async (): Promise<KeyPairBackup | null> => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/user/keypair-backup`, { headers: getHeaders() })
      return (data.success && data.data) ? data.data : null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status === 404) return null
      message.error('Errore nel controllo del backup sul server')
      return null
    }
  }

  const initializeKeyPair = async () => {
    if (isInitializing.value || isKeyPairReady.value) return
    isInitializing.value = true
    error.value = null
    try {
      const local = await loadFromLocalStorage()
      if (local) { publicKey.value = local.publicKey; privateKey.value = local.privateKey; return }

      const serverBackup = await checkServerBackup()
      if (serverBackup) { needsPasswordForRestore.value = true; return }

      const keyPair = await generateRSAKeyPair()
      await saveToLocalStorage(keyPair.publicKey, keyPair.privateKey)
      await uploadPublicKeyToServer(keyPair.publicKey)
      publicKey.value = keyPair.publicKey
      privateKey.value = keyPair.privateKey
    } catch {
      message.error('Impossibile inizializzare le chiavi di cifratura')
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
      const privKey = await decryptPrivateKeyFromBackup(serverBackup, password)
      const { data } = await axios.get(`${API_BASE_URL}/user/public-key`, { headers: getHeaders() })
      if (!data.success || !data.data?.publicKeyJWK) throw new Error('Failed to get public key from server')
      const pubKey = await importPublicKeyFromJWK(data.data.publicKeyJWK)
      await saveToLocalStorage(pubKey, privKey)
      publicKey.value = pubKey; privateKey.value = privKey; needsPasswordForRestore.value = false
      message.success('Chiavi ripristinate con successo dal backup')
      return true
    } catch { message.error('Password non corretta o backup corrotto'); error.value = 'Password non corretta o backup corrotto'; return false }
    finally { isInitializing.value = false }
  }

  const backupToServer = async (password: string): Promise<boolean> => {
    if (!privateKey.value) { error.value = 'Nessuna chiave privata da salvare'; return false }
    try {
      const backup = await encryptPrivateKeyForBackup(privateKey.value, password)
      await axios.post(`${API_BASE_URL}/user/keypair-backup`, backup, { headers: getHeaders() })
      message.success('Backup delle chiavi salvato sul server')
      return true
    } catch { message.error('Impossibile salvare il backup sul server'); error.value = 'Impossibile salvare il backup sul server'; return false }
  }

  const getRecipientPublicKey = async (email: string): Promise<CryptoKey | null> => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/user/by-email/${encodeURIComponent(email)}/public-key`, { headers: getHeaders() })
      if (data.success && data.data?.publicKeyJWK) return await importPublicKeyFromJWK(data.data.publicKeyJWK)
      return null
    } catch { message.error(`Impossibile recuperare la chiave pubblica per ${email}`); return null }
  }

  const exportPublicKeyJWK = async (): Promise<JsonWebKey | null> => {
    if (!publicKey.value) return null
    return exportPublicKeyToJWK(publicKey.value)
  }

  onMounted(() => {
    if (Cookies.get('idToken')) initializeKeyPair()
  })

  return { publicKey, privateKey, isKeyPairReady, isInitializing, error, needsPasswordForRestore, initializeKeyPair, restoreFromBackup, backupToServer, getRecipientPublicKey, exportPublicKeyJWK }
}
