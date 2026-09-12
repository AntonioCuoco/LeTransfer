import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { notifyApiError } from '@/src/utils/apiError'
import type { SetupRecoveryKeyRequest, UserRecoveryKeyStatus } from '@/src/types'

export const useRecoveryKeyAPI = () => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const getAuthToken = () => Cookies.get('idToken')

  const setupRecoveryKey = async (data: SetupRecoveryKeyRequest): Promise<boolean> => {
    isLoading.value = true
    error.value = null
    try {
      const token = getAuthToken()
      if (!token) throw new Error('Not authenticated')
      await axios.post(`${import.meta.env.VITE_API_URL}/user/recovery-key/setup`, data)
      return true
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'Chiave di recupero non attivata', 'Errore durante la configurazione della chiave di ripristino')
      return false
    } finally {
      isLoading.value = false
    }
  }

  const getRecoveryKeyStatus = async (): Promise<UserRecoveryKeyStatus | null> => {
    isLoading.value = true
    error.value = null
    try {
      const token = getAuthToken()
      if (!token) throw new Error('Not authenticated')
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/user/recovery-key/status`)
      return data
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'Stato non verificato', 'Errore nel recupero dello stato della chiave di ripristino')
      return null
    } finally {
      isLoading.value = false
    }
  }

  return { setupRecoveryKey, getRecoveryKeyStatus, isLoading, error }
}
