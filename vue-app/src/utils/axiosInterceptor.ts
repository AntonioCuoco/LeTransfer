import axios, { type AxiosResponse, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import Cookies from 'js-cookie'
import { setAuthCookie, clearAuthCookies } from './cookieStore'
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId } from './cognitoClient'

declare module 'axios' {
  interface AxiosRequestConfig {
    /**
     * Chiamata PUBBLICA (link guest): niente token Cognito in uscita, niente refresh né
     * redirect a /login su 401.
     *
     * Serve perché per quegli endpoint un 401 non vuol dire "sessione scaduta" ma "password
     * del link sbagliata" o "sessione del link scaduta": senza il flag, chi sbagliava la
     * password veniva buttato sulla pagina di login. E il token dell'utente loggato, se
     * attaccato, sovrascriveva il `Bearer` della sessione del link.
     *
     * Non si esclude per URL: `/shared-links` ospita anche gli endpoint autenticati del
     * proprietario (elenco, revoca, modifica).
     */
    skipAuth?: boolean
  }
}

let isRefreshing = false
let failedQueue: Array<{ resolve: (value: string | null) => void; reject: (error: unknown) => void }> = []

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  failedQueue = []
}

const doRefreshToken = async (): Promise<string | null> => {
  const refreshTokenValue = Cookies.get('refreshToken')
  if (!refreshTokenValue) throw new Error('No refresh token available')

  const command = new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: clientId,
    AuthParameters: { REFRESH_TOKEN: refreshTokenValue },
  })

  try {
    const response = await cognitoClient.send(command)
    const { AccessToken, IdToken } = response.AuthenticationResult ?? {}
    if (!AccessToken || !IdToken) throw new Error('Invalid refresh response')

    setAuthCookie('accessToken', AccessToken, 1 / 24)
    setAuthCookie('idToken', IdToken, 1 / 24)
    return AccessToken
  } catch (error) {
    clearAuthCookies()
    throw error
  }
}

export const setupRequestInterceptor = () => {
  axios.interceptors.request.use((config) => {
    if (config.skipAuth) return config
    const accessToken = Cookies.get('accessToken')
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  })
}

export const setupResponseInterceptor = () => {
  axios.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

      if (original?.skipAuth) return Promise.reject(error)

      if (error.response?.status === 401 && !original._retry) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          }).then((token) => {
            if (original.headers) original.headers.Authorization = `Bearer ${token}`
            return axios(original)
          })
        }

        original._retry = true
        isRefreshing = true

        try {
          const newToken = await doRefreshToken()
          processQueue(null, newToken)
          if (original.headers) original.headers.Authorization = `Bearer ${newToken}`
          return axios(original)
        } catch (refreshError) {
          processQueue(refreshError as Error, null)
          window.location.href = '/login'
          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      }

      return Promise.reject(error)
    }
  )
}

export const initializeAxiosInterceptors = () => {
  setupRequestInterceptor()
  setupResponseInterceptor()
}
