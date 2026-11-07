import Cookies from 'js-cookie'
import { beginLogin, completeLogin, refreshTokens, revokeTokens, type LoginResult, type Tokens } from '@novren/id-client/app'
import { setAuthCookie, clearAuthCookies } from './cookieStore'

/**
 * L'accesso a Novren passa da **Novren ID**, l'account unico di Novren, NovrenPass e Drive.
 *
 *   1. `startLogin()` porta all'area account di Novren ID (password, secondo fattore, passkey,
 *      recupero: tutto lì);
 *   2. Novren ID riporta su `/accesso` con un codice e — nel frammento `#`, che non arriva a
 *      nessun server — la chiave di Novren sigillata per questa scheda;
 *   3. `finishLogin()` apre la busta e scambia il codice: token d'accesso (5 minuti), token di
 *      rinnovo e la `productKey`, che apre la master key di Novren (`crypto/novrenIdMasterKey.ts`).
 *
 * Novren non vede mai la password, né le chiavi di NovrenPass o di Drive.
 *
 * ── Dove stanno i token ─────────────────────────────────────────────────────────
 * Nei cookie di sempre (`cookieStore.ts`): `accessToken` (scade col token) e `refreshToken`
 * (30 giorni, cambia a ogni rinnovo). L'email, che il token non porta, in `userEmail`: arriva
 * da Novren ID nel frammento e serve solo a mostrarla.
 */

const env = import.meta.env
export const ID_ACCOUNT_URL = ((env.VITE_ID_ACCOUNT_URL as string | undefined) ?? 'https://account.novren.net').replace(/\/$/, '')
export const ID_SERVER_URL = ((env.VITE_ID_SERVER_URL as string | undefined) ?? 'https://id.novren.net').replace(/\/$/, '')
const CLIENT_ID = 'novren-web'
const NEXT_KEY = 'novren-id/next'

const redirectUri = () => new URL('/accesso', window.location.origin).toString()

/** Rinnova un po' prima della scadenza: l'orologio del dispositivo non è mai esatto. */
const EARLY_SECONDS = 30

/** Dove tornare dopo l'accesso (un percorso dell'app, mai un indirizzo esterno). */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app'
}

/** Porta all'area account di Novren ID. `next`: dove riportare l'utente dopo. */
export async function startLogin(next?: string): Promise<void> {
  try {
    sessionStorage.setItem(NEXT_KEY, safeNext(next))
  } catch {
    // storage negato: si torna su /app
  }
  const { url } = await beginLogin({ accountUrl: ID_ACCOUNT_URL, clientId: CLIENT_ID, redirectUri: redirectUri() })
  window.location.assign(url)
}

/** Dove l'utente voleva andare prima dell'accesso. Si legge una volta sola. */
export function takeNext(): string {
  try {
    const next = sessionStorage.getItem(NEXT_KEY)
    sessionStorage.removeItem(NEXT_KEY)
    return safeNext(next ?? undefined)
  } catch {
    return '/app'
  }
}

function keep(tokens: Tokens): void {
  setAuthCookie('accessToken', tokens.access_token, Math.max(tokens.expires_in - EARLY_SECONDS, 30) / 86400)
  setAuthCookie('refreshToken', tokens.refresh_token, 30)
}

/** Sulla pagina `/accesso`: completa l'accesso, tiene token ed email, restituisce la chiave. */
export async function finishLogin(): Promise<LoginResult> {
  const result = await completeLogin({ idServerUrl: ID_SERVER_URL, clientId: CLIENT_ID, redirectUri: redirectUri() })
  keep(result.tokens)
  if (result.email) setAuthCookie('userEmail', result.email, 30)
  return result
}

let refreshing: Promise<string | null> | null = null

/**
 * Un token d'accesso nuovo dal token di rinnovo. `null` se non c'è o se Novren ID ha chiuso la
 * catena (app scollegata, password cambiata, dispositivo non più fidato): si rifà l'accesso.
 * Uno alla volta: il token di rinnovo vale UNA volta, e due rinnovi insieme sembrerebbero un
 * furto (Novren ID chiuderebbe la catena).
 */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const refreshToken = Cookies.get('refreshToken')
      if (!refreshToken) return null
      const next = await refreshTokens({ idServerUrl: ID_SERVER_URL, clientId: CLIENT_ID, refreshToken })
      if (!next) {
        clearAuthCookies()
        return null
      }
      keep(next)
      return next.access_token
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

/** Esce: chiude la catena di token in Novren ID (il server di Novren lo sa in pochi secondi). */
export async function signOut(): Promise<void> {
  const refreshToken = Cookies.get('refreshToken')
  clearAuthCookies()
  if (refreshToken) await revokeTokens({ idServerUrl: ID_SERVER_URL, clientId: CLIENT_ID, refreshToken })
}

/** Dove si gestiscono password, secondo fattore, passkey, dispositivi e app collegate. */
export const accountSecurityUrl = () => `${ID_ACCOUNT_URL}/sicurezza`
/** Dove si crea un Novren ID. */
export const registerUrl = () => `${ID_ACCOUNT_URL}/registrati`
