import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import { getCurrentUser } from '@/src/utils/getCurrentUser'

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
      else error.value = e.response?.data?.error || 'Errore nel caricamento della foto profilo'
    } finally {
      isLoading.value = false
    }
  }

  const uploadProfileImage = async (file: File): Promise<string | undefined> => {
    if (!user?.sub) { error.value = 'Utente non autenticato'; return }
    isLoading.value = true
    error.value = null
    try {
      if (!file.type.startsWith('image/')) throw new Error("Il file deve essere un'immagine")
      if (file.size > 5 * 1024 * 1024) throw new Error("L'immagine deve essere inferiore a 5MB")

      const formData = new FormData()
      formData.append('profileImage', file)
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/upload-profile-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      if (response.data?.profileImage?.location) {
        profileImageUrl.value = response.data.profileImage.location
        setTimeout(loadProfileImage, 500)
        return response.data.profileImage.location
      }
      throw new Error(response.data.error || "Errore durante l'upload")
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const msg = e.response?.data?.error || e.message || "Errore durante l'upload"
      error.value = msg
      throw new Error(msg)
    } finally {
      isLoading.value = false
    }
  }

  const deleteProfileImage = async () => {
    if (!user?.sub) { error.value = 'Utente non autenticato'; return }
    isLoading.value = true
    error.value = null
    try {
      const response = await axios.delete(`${import.meta.env.VITE_API_URL}/user/profile-image`)
      if (response.data?.message !== undefined) profileImageUrl.value = ''
      else throw new Error(response.data.error || "Errore durante l'eliminazione")
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } }; message?: string }
      const msg = e.response?.data?.error || e.message || "Errore durante l'eliminazione"
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

  return { profileImageUrl, isLoading, error, uploadProfileImage, deleteProfileImage, refreshProfileImage: loadProfileImage }
}
