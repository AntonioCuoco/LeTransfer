import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { apiErrorMessage, describeApiError } from '@/src/utils/apiError'
import { withDetail } from '@/src/utils/errorDetail'

export const useProfileImage = () => {
  const profileImageUrl = ref('')
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const user = getCurrentUser()

  const loadProfileImage = async () => {
    if (!user?.sub) return
    isLoading.value = true
    error.value = null
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/user/profile-image`)
      profileImageUrl.value = response.data?.profileImage?.url || ''
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
      if (e.response?.status === 404) profileImageUrl.value = ''
      else error.value = describeApiError(err, 'Non siamo riusciti a caricare la foto profilo.')
    } finally {
      isLoading.value = false
    }
  }

  // Il caricamento della foto è stato tolto il 17-10-2026: nessun componente lo usava, e la rotta
  // del backend che chiamava (`/upload-profile-image`) non esisteva nemmeno a quell'indirizzo.

  const deleteProfileImage = async () => {
    if (!user?.sub) { error.value = 'Utente non autenticato'; return }
    isLoading.value = true
    error.value = null
    try {
      const response = await axios.delete(`${import.meta.env.VITE_API_URL}/user/profile-image`)
      if (response.data?.message !== undefined) profileImageUrl.value = ''
      else throw new Error(response.data.error || "Errore durante l'eliminazione")
    } catch (err: unknown) {
      const e = err as { isAxiosError?: boolean; message?: string }
      const msg = apiErrorMessage(err) ?? (!e.isAxiosError && e.message ? e.message : withDetail('Eliminazione della foto non riuscita.', err))
      error.value = msg
      throw new Error(msg)
    } finally {
      isLoading.value = false
    }
  }

  const onProfileImageUpdate = () => loadProfileImage()

  let refreshInterval: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    loadProfileImage()
    window.addEventListener('profileImageUpdated', onProfileImageUpdate)
    refreshInterval = setInterval(loadProfileImage, 50 * 60 * 1000)
  })

  onUnmounted(() => {
    window.removeEventListener('profileImageUpdated', onProfileImageUpdate)
    if (refreshInterval) clearInterval(refreshInterval)
  })

  return { profileImageUrl, isLoading, error, deleteProfileImage, refreshProfileImage: loadProfileImage }
}
