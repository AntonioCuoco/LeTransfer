import Cookies from 'js-cookie'

export const getUserIdFromToken = (): string | undefined => {
  const token = Cookies.get('accessToken')
  if (!token) return undefined
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    )
    return JSON.parse(jsonPayload).sub
  } catch {
    return undefined
  }
}

/** L'email dell'utente: Novren ID la consegna al login, il token non la porta. */
export const getUserEmailFromToken = (): string | undefined => Cookies.get('userEmail') || undefined
