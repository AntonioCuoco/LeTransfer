import Cookies from 'js-cookie'

export interface DecodedToken {
  sub: string
  iss: string
  aud: string
  exp: number
  iat: number
  nbf: number
  email: string
  email_verified: boolean
  username: string
  name?: string
  surname?: string
  auth_time: number
  token_use: string
  scope: string
  client_id: string
  origin_jti: string
  jti: string
  nonce?: string
  'cognito:groups'?: string[]
  'cognito:roles'?: string[]
  'cognito:preferred_role'?: string
  [key: string]: unknown
}

export const getCurrentUser = (): DecodedToken | null => {
  try {
    const idToken = Cookies.get('idToken')
    if (!idToken) return null
    const base64Url = idToken.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
    return JSON.parse(jsonPayload) as DecodedToken
  } catch {
    return null
  }
}

export const isTokenExpired = (token: string): boolean => {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
    const decoded = JSON.parse(jsonPayload) as DecodedToken
    return decoded.exp < Math.floor(Date.now() / 1000)
  } catch {
    return true
  }
}
