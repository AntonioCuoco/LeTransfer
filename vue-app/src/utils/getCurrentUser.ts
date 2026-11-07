import Cookies from 'js-cookie'

/**
 * L'utente corrente, dal token d'accesso di Novren ID (`sub`, scadenza) più l'email che Novren ID
 * ha consegnato al login nel frammento dell'URL (cookie `userEmail`: il token non la porta).
 */
export interface DecodedToken {
  sub: string
  iss: string
  aud: string
  exp: number
  iat: number
  jti: string
  /** La catena di token di questa app su questo dispositivo. */
  sid?: string
  plan?: string
  email?: string
  [key: string]: unknown
}

function decode(token: string): DecodedToken {
  const base64Url = token.split('.')[1]
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
  const jsonPayload = decodeURIComponent(
    atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  )
  return JSON.parse(jsonPayload) as DecodedToken
}

export const getCurrentUser = (): DecodedToken | null => {
  try {
    const accessToken = Cookies.get('accessToken')
    if (!accessToken) return null
    return { ...decode(accessToken), email: Cookies.get('userEmail') }
  } catch {
    return null
  }
}

export const isTokenExpired = (token: string): boolean => {
  try {
    return decode(token).exp < Math.floor(Date.now() / 1000)
  } catch {
    return true
  }
}
