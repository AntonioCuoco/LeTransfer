import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'
import type { ShareFileRequest, ShareFileResponse, SharedFile, ShareFileOptions } from '@/src/types'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useUserKeyPair } from './useUserKeyPair'
import { wrapKeyWithPublicKey, importKeyFromBase64 } from '@/src/utils/crypto'

const API_BASE_URL = import.meta.env.VITE_LAMBDA_URL || ''

export const useShareFile = () => {
  const isSharing = ref(false)
  const isLoadingShared = ref(false)
  const sharedFiles = ref<SharedFile[]>([])
  const shareError = ref<string | null>(null)

  const { getRecipientPublicKey } = useUserKeyPair()
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
          const aesKey = await importKeyFromBase64(keyData.key)
          encryptedAESKey = await wrapKeyWithPublicKey(aesKey, recipientPublicKey)
          encryptionIV = keyData.iv
        }
      }

      const body: ShareFileRequest = { s3Key, type: 'user', targetEmail, encryptedAESKey, encryptionIV }
      const { data } = await axios.post<ShareFileResponse>(`${API_BASE_URL}/share`, body, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
      const { data } = await axios.get<{ files: SharedFile[] }>(`${API_BASE_URL}/shared-files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
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

  const reset = () => {
    isSharing.value = false; isLoadingShared.value = false; sharedFiles.value = []; shareError.value = null
  }

  return { isSharing, isLoadingShared, sharedFiles, shareError, shareFile, getSharedWithMe, reset }
}
