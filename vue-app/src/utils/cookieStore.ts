import Cookies from 'js-cookie'

// Nomi dei cookie di autenticazione (Cognito).
export const AUTH_COOKIES = ['accessToken', 'idToken', 'refreshToken'] as const

// Opzioni di sicurezza applicate a TUTTI i cookie di auth.
// - sameSite:'strict' → protezione CSRF, attivo sia in dev sia in prod.
// - secure → il cookie viaggia solo su HTTPS. Fisso a `true` impedirebbe il set su
//   http://localhost (DEV) rompendo il login, quindi lo leghiamo al protocollo:
//   in dev (http) è false, in prod (https) è true → si "accende" da solo.
const secureOpts = {
  secure: window.location.protocol === 'https:',
  sameSite: 'strict',
} as const

/** Salva un cookie di auth con gli attributi di sicurezza. `days` = durata (come js-cookie `expires`). */
export const setAuthCookie = (name: string, value: string, days: number) =>
  Cookies.set(name, value, { expires: days, ...secureOpts })

/** Rimuove tutti i cookie di auth (logout / sessione scaduta). */
export const clearAuthCookies = () => AUTH_COOKIES.forEach((c) => Cookies.remove(c))
