import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export const usePresignedUrl = () => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const generateFileLink = async (s3Key: string, options?: { download?: boolean; expires?: number }): Promise<string | null> => {
    isLoading.value = true
    error.value = null
    try {
      const token = Cookies.get('idToken')
      if (!token) throw new Error('Token di autenticazione non trovato')

      const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
      const { data } = await axios.get<{ url: string }>(`${base}/file-url`, {
        params: { key: s3Key, download: options?.download || false, expires: options?.expires || 3600 },
      })
      return data.url
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      const msg = e.response?.data?.message || e.message || 'Errore nella generazione del link'
      error.value = msg
      Swal.fire({ title: 'Errore!', text: msg, icon: 'error' })
      return null
    } finally {
      isLoading.value = false
    }
  }

  const reset = () => {
    isLoading.value = false
    error.value = null
  }

  return { isLoading, error, generateFileLink, reset }
}
