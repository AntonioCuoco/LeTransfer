import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { notify } from '@/src/utils/notify'
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
      await axios.post(`${import.meta.env.VITE_API_URL}/user/file-keys`, data, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      notify.error('Errore nel salvataggio della chiave di cifratura del file')
      error.value = e.response?.data?.message || e.message || null
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
        `${import.meta.env.VITE_API_URL}/user/file-keys/${encodeURIComponent(s3Key)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return data.data
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string }
      if (e.response?.status === 404) return null
      notify.error('Errore nel recupero della chiave di cifratura del file')
      error.value = e.response?.data?.message || e.message || null
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
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/user/file-keys`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return (data as GetFileKeysResponse).keys || []
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      notify.error('Errore nel recupero delle chiavi di cifratura')
      error.value = e.response?.data?.message || e.message || null
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
        `${import.meta.env.VITE_API_URL}/user/file-keys/${encodeURIComponent(s3Key)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return true
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      notify.error("Errore nell'eliminazione della chiave di cifratura")
      error.value = e.response?.data?.message || e.message || null
      return false
    } finally {
      isLoading.value = false
    }
  }

  return { saveFileKey, getFileKey, getAllFileKeys, deleteFileKey, isLoading, error }
}
