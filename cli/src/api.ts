/**
 * Il backend di Novren, per le rotte che la CLI usa.
 *
 * Le rotte pubbliche dei link e quelle dell'invio senza account sono **le stesse del sito**,
 * con la stessa forma: la CLI non introduce niente di suo, tranne l'autenticazione con un
 * token del dispositivo al posto di Turnstile (rotte /api/cli). `fetch` di Node, nessuna
 * libreria.
 */

declare const __NOVREN_CLI_VERSION__: string

/** Produzione per default; `NOVREN_API_URL` per staging o per un backend locale. */
export function apiBaseUrl(): string {
  return (process.env.NOVREN_API_URL ?? 'https://api.novren.net/api').replace(/\/$/, '')
}

const userAgent = () =>
  `novren-cli/${typeof __NOVREN_CLI_VERSION__ === 'string' ? __NOVREN_CLI_VERSION__ : 'dev'} node/${process.versions.node}`

/** Un errore da mostrare all'utente così com'è. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * I codici del backend, tradotti in frasi che dicono cosa fare. Il messaggio del server non
 * si mostra: è scritto per il sito, e a volte per chi legge i log.
 */
const MESSAGES: Record<string, string> = {
  LINK_NOT_FOUND: 'Questo link non esiste. Controlla di averlo copiato intero.',
  LINK_EXPIRED: 'Il link è scaduto: chiedi a chi te l’ha mandato di inviarlo di nuovo.',
  LINK_REVOKED: 'Il mittente ha ritirato questo link.',
  DOWNLOAD_LIMIT_REACHED: 'Il link ha raggiunto il numero massimo di download.',
  PASSWORD_REQUIRED: 'Questo link è protetto da una password.',
  INVALID_PASSWORD: 'Password errata.',
  RATE_LIMITED: 'Troppe richieste ravvicinate: riprova fra qualche minuto.',
  CLI_TOKEN_INVALID: 'L’accesso di questo computer è scaduto o è stato revocato: rifai «novren login».',
  CLI_DAILY_LIMIT:
    'Hai raggiunto gli invii di oggi da questo computer. Collegando un account («novren login») il limite è più alto.',
  // Il backend ignora il token della CLI e pretende Turnstile: la funzione non è attiva lì.
  CAPTCHA_REQUIRED: 'L’invio dalla CLI non è ancora attivo su Novren.',
  FILE_TOO_LARGE: 'Il file supera il limite degli invii senza account.',
  CLI_SCOPE: 'Questa operazione non si può fare dalla CLI: usa il sito.',
  FORBIDDEN: 'Novren ha rifiutato l’operazione: l’invio non esiste più o è già stato ritirato.',
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** Il token della CLI o la sessione di un link. */
  bearer?: string
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        'user-agent': userAgent(),
        'content-type': 'application/json',
        ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
  } catch {
    throw new ApiError('Non riesco a raggiungere Novren: controlla la connessione.', null, 0)
  }

  if (response.status === 204) return undefined as T

  const body = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; code?: string; errorCode?: string }
    | null

  if (!response.ok || !body || body.success === false) {
    // Il backend usa `code` nelle rotte dei link e `errorCode` nelle altre.
    const code = body?.code ?? body?.errorCode ?? null
    const fallback =
      response.status === 404 ? 'Non trovato.'
      : response.status === 410 ? 'Il link non è più disponibile.'
      : response.status >= 500 ? `Novren ha un problema in questo momento (HTTP ${response.status}): riprova fra poco.`
      : `Richiesta rifiutata (HTTP ${response.status}).`
    throw new ApiError((code && MESSAGES[code]) || fallback, code, response.status)
  }
  return (body.data ?? body) as T
}

// ── Link pubblici (ricezione) ────────────────────────────────────────────────

export interface LinkInfo {
  fileName: string
  fileSize: string
  fileType: string
  isPasswordProtected: boolean
  expiresAt: string
  ownerName?: string
  formatVersion?: number
  chunkSize?: number
  originalSize?: number
  nameVersion?: number
}

export function getLinkInfo(publicToken: string): Promise<LinkInfo> {
  return request<LinkInfo>(`/shared-links/${encodeURIComponent(publicToken)}`).catch((error) => {
    if (error instanceof ApiError && error.status === 404 && !error.code) {
      throw new ApiError(MESSAGES.LINK_NOT_FOUND!, 'LINK_NOT_FOUND', 404)
    }
    throw error
  })
}

export interface LinkAccess {
  sessionToken: string
  downloadAllowed?: boolean
}

export function accessLink(publicToken: string, visitorName: string, password?: string): Promise<LinkAccess> {
  return request<LinkAccess>(`/shared-links/${encodeURIComponent(publicToken)}/access`, {
    body: password ? { visitorName, password } : { visitorName },
  })
}

/** L'URL firmato dello storage (valido 15 minuti), da cui scaricare il ciphertext. */
export async function downloadUrl(publicToken: string, sessionToken: string): Promise<string> {
  const data = await request<{ url: string }>(
    `/shared-links/${encodeURIComponent(publicToken)}/file?action=download`,
    { bearer: sessionToken },
  )
  if (!data?.url) throw new ApiError('Novren non ha restituito l’indirizzo del file.', null, 200)
  return data.url
}

// ── Accesso della CLI ────────────────────────────────────────────────────────

export interface IssuedToken {
  token: string
  kind: 'device' | 'account'
  expiresAt: string
  tokenId: string
}

export function exchangeCode(code: string, codeVerifier: string): Promise<IssuedToken> {
  return request<IssuedToken>('/cli/token', { body: { grantType: 'authorization_code', code, codeVerifier } })
}

export interface DeviceStart {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export function startDeviceLogin(deviceName: string): Promise<DeviceStart> {
  return request<DeviceStart>('/cli/device', { body: { deviceName } })
}

export function pollDeviceLogin(deviceCode: string): Promise<IssuedToken> {
  return request<IssuedToken>('/cli/token', { body: { grantType: 'device_code', deviceCode } })
}

export interface WhoAmI {
  kind: 'device' | 'account'
  deviceName: string
  expiresAt: string
  email?: string | null
}

export function whoami(token: string): Promise<WhoAmI> {
  return request<WhoAmI>('/cli/whoami', { bearer: token })
}

export function logout(token: string): Promise<void> {
  return request<void>('/cli/logout', { method: 'POST', body: {}, bearer: token })
}

// ── Invio (le stesse rotte dell'invio senza account del sito) ────────────────

export interface GuestInit {
  transferId: string
  publicToken: string
  manageToken: string
  uploadId: string
  fileKey: string
}

export function guestInit(token: string, body: { fileName: string; fileType: string; fileSize: number }): Promise<GuestInit> {
  return request<GuestInit>('/guest/upload/init', { body, bearer: token })
}

export async function guestPartUrl(token: string, fileKey: string, uploadId: string, partNumber: number): Promise<string> {
  const data = await request<{ urls: Record<string, string> }>('/guest/upload/urls', {
    body: { fileKey, uploadId, partNumbers: [partNumber] },
    bearer: token,
  })
  const url = data.urls[String(partNumber)]
  if (!url) throw new ApiError(`Novren non ha restituito l’indirizzo per la parte ${partNumber}.`, null, 200)
  return url
}

export function guestComplete(token: string, body: Record<string, unknown>): Promise<{ publicToken: string; url: string; expiresAt?: string }> {
  return request('/guest/upload/complete', { body, bearer: token })
}

export function guestAbort(token: string, fileKey: string, uploadId: string): Promise<unknown> {
  return request('/guest/upload/abort', { body: { fileKey, uploadId }, bearer: token })
}

export function guestRevoke(publicToken: string, manageToken: string): Promise<unknown> {
  return request(`/guest/${encodeURIComponent(publicToken)}/revoke`, { body: { manageToken } })
}

/** Con un account collegato: l'invio passa nell'account, senza toccare le chiavi. */
export function claim(token: string, publicToken: string, manageToken: string): Promise<unknown> {
  return request('/share/claim', { body: { publicToken, manageToken }, bearer: token })
}
