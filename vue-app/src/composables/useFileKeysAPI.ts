import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { notifyApiError } from '@/src/utils/apiError'
import type { WrappedKeyData, GetFileKeysResponse } from '@/src/types'

export const useFileKeysAPI = () => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const getAuthToken = () => Cookies.get('idToken')

  const saveFileKey = async (data: WrappedKeyData): Promise<boolean> => {
    isLoading.value = true
    try {
      const token = getAuthToken()
      if (!token) throw new Error('Not authenticated')
      await axios.post(`${import.meta.env.VITE_API_URL}/user/file-keys`, data)
      return true
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'Chiave non salvata', 'Errore nel salvataggio della chiave di cifratura del file')
      return false
    } finally {
      isLoading.value = false
    }
  }

  const getFileKey = async (s3Key: string): Promise<WrappedKeyData | null> => {
    isLoading.value = true
    try {
      const token = getAuthToken()
      if (!token) throw new Error('Not authenticated')
      const { data } = await axios.get(
        `${import.meta.env.VITE_API_URL}/user/file-keys/${encodeURIComponent(s3Key)}`
      )
      // ⚠️ Il backend risponde con la chiave **al primo livello** (`{ s3Key, wrappedKey, wrapIV,
      // fileIV }`, routes/e2e.js), non dentro `data`. Qui si leggeva `data.data`, cioè sempre
      // `undefined`: dopo un ricaricamento nessuna chiave salvata si apriva (nomi «non
      // disponibili», download dei propri file bloccati). Corretto il 2026-10-09; si accettano
      // entrambe le forme, così un futuro `{ data: … }` del server non lo rompe di nuovo.
      const body = (data && typeof data === 'object' && 'data' in data ? data.data : data) as WrappedKeyData | undefined
      return body && body.wrappedKey && body.wrapIV ? body : null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } }
      if (e.response?.status === 404) return null
      error.value = notifyApiError(err, 'Chiave non recuperata', 'Errore nel recupero della chiave di cifratura del file')
      return null
    } finally {
      isLoading.value = false
    }
  }

  const getAllFileKeys = async (): Promise<WrappedKeyData[]> => {
    isLoading.value = true
    try {
      const token = getAuthToken()
      if (!token) throw new Error('Not authenticated')
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/user/file-keys`)
      return (data as GetFileKeysResponse).keys || []
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'Chiavi non recuperate', 'Errore nel recupero delle chiavi di cifratura')
      return []
    } finally {
      isLoading.value = false
    }
  }

  const deleteFileKey = async (s3Key: string): Promise<boolean> => {
    isLoading.value = true
    try {
      const token = getAuthToken()
      if (!token) throw new Error('Not authenticated')
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/user/file-keys/${encodeURIComponent(s3Key)}`
      )
      return true
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'Chiave non eliminata', "Errore nell'eliminazione della chiave di cifratura")
      return false
    } finally {
      isLoading.value = false
    }
  }

  return { saveFileKey, getFileKey, getAllFileKeys, deleteFileKey, isLoading, error }
}
