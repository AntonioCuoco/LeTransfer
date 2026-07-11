import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { setAuthCookie, clearAuthCookies } from '@/src/utils/cookieStore'
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId } from '@/src/utils/cognitoClient'
import { isTokenExpired } from '@/src/utils/getCurrentUser'
import { useSessionNotifications } from './useSessionNotifications'

export const useTokenManager = () => {
  const isAuthenticated = ref(false)
  const isRefreshing = ref(false)
  const isRefreshingRef = shallowRef(false) // anti-race-condition ref

  const router = useRouter()
  const { showInfo, showError } = useSessionNotifications()

  const clearTokens = () => {
    clearAuthCookies()
    isAuthenticated.value = false
    showError('Sessione scaduta. Effettua nuovamente il login.')
  }

  const updateTokens = (accessToken: string, idToken: string, refreshToken?: string) => {
    setAuthCookie('accessToken', accessToken, 1 / 24)
    setAuthCookie('idToken', idToken, 1 / 24)
    if (refreshToken) setAuthCookie('refreshToken', refreshToken, 30)
    isAuthenticated.value = true
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
      const command = new InitiateAuthCommand({
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: clientId,
        AuthParameters: { REFRESH_TOKEN: refreshTokenValue },
      })
      const response = await cognitoClient.send(command)
      const { AccessToken, IdToken } = response.AuthenticationResult ?? {}

      if (AccessToken && IdToken) {
        updateTokens(AccessToken, IdToken)
        showInfo('Sessione rinnovata con successo')
        return true
      }

      clearTokens()
      return false
    } catch {
      showError('Impossibile rinnovare la sessione. Effettua nuovamente il login.')
      clearTokens()
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
