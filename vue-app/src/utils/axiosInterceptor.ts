import axios, { type AxiosResponse, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import Cookies from 'js-cookie'
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId } from './cognitoClient'

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

    Cookies.set('accessToken', AccessToken, { expires: 1 / 24 })
    Cookies.set('idToken', IdToken, { expires: 1 / 24 })
    return AccessToken
  } catch (error) {
    Cookies.remove('accessToken')
    Cookies.remove('idToken')
    Cookies.remove('refreshToken')
    throw error
  }
}

export const setupRequestInterceptor = () => {
  axios.interceptors.request.use((config) => {
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
