import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { clearAuthCookies } from '@/src/utils/cookieStore'
import { isTokenExpired } from '@/src/utils/getCurrentUser'
import { refreshSession } from '@/src/utils/novrenId'
import { useSessionNotifications } from './useSessionNotifications'

export const useTokenManager = () => {
  const isAuthenticated = ref(false)
  const isRefreshing = ref(false)
  const isRefreshingRef = shallowRef(false) // anti-race-condition ref

  const router = useRouter()
  const { showError } = useSessionNotifications()

  const clearTokens = (reason = 'Sessione scaduta. Effettua nuovamente il login.') => {
    clearAuthCookies()
    isAuthenticated.value = false
    showError(reason)
  }

  const ensureValidToken = async (): Promise<boolean> => {
    const accessToken = Cookies.get('accessToken')
    const refreshTokenValue = Cookies.get('refreshToken')

    if (!accessToken && !refreshTokenValue) {
      clearTokens()
      return false
    }

    if (accessToken && !isTokenExpired(accessToken)) {
      isAuthenticated.value = true
      return true
    }

    if (!refreshTokenValue) {
      clearTokens()
      return false
    }

    // Wait if already refreshing
    if (isRefreshingRef.value) {
      return new Promise((resolve) => {
        const check = () => {
          if (!isRefreshingRef.value) resolve(!!Cookies.get('accessToken'))
          else setTimeout(check, 100)
        }
        check()
      })
    }

    isRefreshingRef.value = true
    isRefreshing.value = true

    try {
      // Novren ID: il token di rinnovo cambia a ogni uso; `refreshSession` salva quello nuovo.
      if (await refreshSession()) {
        isAuthenticated.value = true
        return true
      }
      clearTokens()
      return false
    } catch {
      clearTokens('Novren ID non risponde: la sessione non si è potuta rinnovare. Accedi di nuovo.')
      return false
    } finally {
      isRefreshingRef.value = false
      isRefreshing.value = false
    }
  }

  const isTokenExpiringSoon = (): boolean => {
    const accessToken = Cookies.get('accessToken')
    if (!accessToken) return true
    try {
      const base64Url = accessToken.split('.')[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(
        decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))
      )
      return (payload.exp - Math.floor(Date.now() / 1000)) < 300
    } catch {
      return true
    }
  }

  let intervalId: ReturnType<typeof setInterval> | null = null

  const checkToken = async () => {
    if (isTokenExpiringSoon() && !isRefreshingRef.value) {
      const success = await ensureValidToken()
      if (!success) router.push('/login')
    }
  }

  onMounted(async () => {
    const isValid = await ensureValidToken()
    if (!isValid) {
      router.push('/login')
      return
    }
    intervalId = setInterval(checkToken, 60000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', checkToken)
  })

  onUnmounted(() => {
    if (intervalId) clearInterval(intervalId)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', checkToken)
  })

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') checkToken()
  }

  return { isAuthenticated, isRefreshing, ensureValidToken, refreshToken: ensureValidToken, clearTokens }
}
