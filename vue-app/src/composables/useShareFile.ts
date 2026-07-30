import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'
import type { ShareFileRequest, ShareFileResponse, SharedFile, ShareFileOptions } from '@/src/types'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useUserKeyPair } from './useUserKeyPair'
import { wrapKeyWithPublicKey, unwrapKeyWithPrivateKey, importKeyFromBase64, importIVFromBase64, decryptFile } from '@/src/utils/crypto'
import { notify } from '@/src/utils/notify'
import { downloadAndDecryptV2, shouldWarnLargeDownload, DownloadCancelled } from '@/src/utils/streamingDownload'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const useShareFile = () => {
  const isSharing = ref(false)
  const isLoadingShared = ref(false)
  const sharedFiles = ref<SharedFile[]>([])
  const shareError = ref<string | null>(null)

  const { getRecipientPublicKey, privateKey } = useUserKeyPair()
  const encryptionStore = useEncryptionStore()

  const shareFile = async (s3Key: string, targetEmail: string, options?: ShareFileOptions): Promise<ShareFileResponse | null> => {
    isSharing.value = true
    shareError.value = null
    try {
      const token = Cookies.get('idToken')
      if (!token) throw new Error('Token di autenticazione non trovato')

      let encryptedAESKey: string | undefined
      let encryptionIV: string | undefined

      if (encryptionStore.isUnlocked) {
        const keyData = await encryptionStore.getKey(s3Key)
        if (keyData) {
          const recipientPublicKey = await getRecipientPublicKey(targetEmail)
          if (!recipientPublicKey) throw new Error('Il destinatario non ha ancora configurato la cifratura E2E.')

          // Verifica dell'impronta (F2): l'ultimo momento utile per accorgersi che la
          // chiave pubblica servita non è quella della persona giusta. Se l'utente non
          // conferma, ci si ferma qui — senza wrappare e senza chiamare il server.
          if (options?.verifyRecipient) {
            const approved = await options.verifyRecipient(recipientPublicKey, targetEmail)
            if (!approved) return null // il `finally` rimette isSharing a false
          }

          const aesKey = await importKeyFromBase64(keyData.key)
          encryptedAESKey = await wrapKeyWithPublicKey(aesKey, recipientPublicKey)
          encryptionIV = keyData.iv
        }
      }

      const body: ShareFileRequest = { s3Key, type: 'user', targetEmail, encryptedAESKey, encryptionIV }
      const { data } = await axios.post<ShareFileResponse>(`${API_BASE_URL}/share`, body, {
        headers: { 'Content-Type': 'application/json' },
      })

      options?.onSuccess?.(data)
      Swal.fire({ title: 'Condiviso!', text: `File condiviso con successo con ${targetEmail}`, icon: 'success', timer: 2000, showConfirmButton: false })
      return data
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string }
      let msg = 'Errore durante la condivisione del file'
      if (e.response?.status === 404) msg = "Utente non trovato. Verifica che l'email sia corretta."
      else if (e.response?.status === 400) msg = e.response?.data?.message || 'Non puoi inviare un file a te stesso.'
      else if (e.response?.data?.message) msg = e.response.data.message
      else if (e.message) msg = e.message
      shareError.value = msg
      options?.onError?.(new Error(msg))
      Swal.fire({ title: 'Errore!', text: msg, icon: 'error' })
      return null
    } finally {
      isSharing.value = false
    }
  }

  const getSharedWithMe = async (): Promise<SharedFile[]> => {
    isLoadingShared.value = true
    shareError.value = null
    try {
      const token = Cookies.get('idToken')
      if (!token) throw new Error('Token di autenticazione non trovato')
      const { data } = await axios.get<{ files: SharedFile[] }>(`${API_BASE_URL}/shared-files`)
      const files = data.files || []
      sharedFiles.value = files
      return files
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      shareError.value = e.response?.data?.message || e.message || 'Errore durante il caricamento dei file condivisi'
      return []
    } finally {
      isLoadingShared.value = false
    }
  }

  // Scarica un file ricevuto in condivisione (utente→utente). Se è cifrato E2E, la file key AES è
  // wrappata con la MIA chiave pubblica RSA: la sblocco con la mia private key (non estraibile, ma
  // può fare unwrap), poi decifro il file. Se non è cifrato, scarica direttamente.
  const downloadSharedFile = async (file: SharedFile): Promise<boolean> => {
    try {
      if (!file.s3Url) throw new Error('URL del file non disponibile')

      // La file key AES è wrappata con la MIA chiave pubblica RSA → la sblocco con la mia private key
      // (non estraibile, ma può comunque fare unwrap).
      let aesKey: CryptoKey | null = null
      if (file.encryptedAESKey) {
        if (!privateKey.value) throw new Error('Chiavi di cifratura non ancora pronte. Riprova tra un istante.')
        aesKey = await unwrapKeyWithPrivateKey(file.encryptedAESKey, privateKey.value)
      }

      // Formato v2 (#6): decifratura a chunk in streaming — niente file intero in RAM.
      if (aesKey && file.formatVersion === 2 && file.chunkSize && file.originalSize != null) {
        if (shouldWarnLargeDownload(file.originalSize)) {
          const warn = await Swal.fire({
            title: 'File molto grande',
            text: 'Su questo browser i file oltre ~2 GB potrebbero non scaricarsi. Per file di queste dimensioni usa Chrome o Edge.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Prova comunque',
            cancelButtonText: 'Annulla',
          })
          if (!warn.isConfirmed) return false
        }
        try {
          await downloadAndDecryptV2({
            url: file.s3Url,
            key: aesKey,
            chunkSize: file.chunkSize,
            originalSize: file.originalSize,
            fileName: file.fileName || 'download',
          })
          return true
        } catch (err) {
          if (err instanceof DownloadCancelled) return false
          throw err
        }
      }

      // --- Formato v1 (legacy): intero blob con un unico IV ---
      const res = await fetch(file.s3Url)
      let finalBlob = await res.blob()
      if (aesKey && file.encryptionIV) {
        const iv = importIVFromBase64(file.encryptionIV)
        finalBlob = await decryptFile(finalBlob, aesKey, iv)
      }

      const url = URL.createObjectURL(finalBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.fileName || 'download'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return true
    } catch (err: unknown) {
      const e = err as { message?: string }
      notify.error(e.message || 'Errore durante il download del file condiviso')
      return false
    }
  }

  const reset = () => {
    isSharing.value = false; isLoadingShared.value = false; sharedFiles.value = []; shareError.value = null
  }

  return { isSharing, isLoadingShared, sharedFiles, shareError, shareFile, getSharedWithMe, downloadSharedFile, reset }
}
