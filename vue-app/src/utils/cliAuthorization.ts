/**
 * Autorizzare la CLI (`novren`) da questo sito — la logica senza interfaccia.
 *
 * La CLI non può risolvere Turnstile né digitare la password di Cognito: apre questo sito,
 * la persona sceglie (account o «senza account»), e il sito consegna alla CLI un codice
 * monouso che la CLI scambia per un token suo. Due modi:
 *
 *  • loopback (RFC 8252): la CLI ascolta su 127.0.0.1 e apre
 *      /cli/authorize?port=…&state=…&challenge=…&device=…
 *    dopo la scelta, il browser torna a http://127.0.0.1:<port>/callback?code=…&state=…
 *  • codice breve (RFC 8628), per i server via SSH: la CLI mostra un codice da inserire in
 *      /cli/device
 *
 * Contratto backend: rotte /api/cli (leTransferBackend, routes/cli.js).
 */

/** Il codice torna **solo** qui. Mai `localhost` (può risolvere altrove), mai un host dalla query. */
export const LOOPBACK_HOST = '127.0.0.1'

export interface LoopbackRequest {
  mode: 'loopback'
  port: number
  state: string
  codeChallenge: string
  deviceName: string
}

export interface DeviceRequest {
  mode: 'device'
  userCode: string
}

export type CliRequest = LoopbackRequest | DeviceRequest

const PORT_MIN = 1024
const PORT_MAX = 65535
const STATE = /^[A-Za-z0-9_-]{16,128}$/
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/

/** Il nome del dispositivo, per mostrarlo: niente caratteri di controllo, lunghezza limitata. */
export function cleanDeviceName(value: unknown): string {
  if (typeof value !== 'string') return 'CLI'
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80)
  return cleaned || 'CLI'
}

const first = (value: unknown): string | undefined =>
  Array.isArray(value) ? (typeof value[0] === 'string' ? value[0] : undefined) : typeof value === 'string' ? value : undefined

/**
 * I parametri che la CLI mette nell'URL, validati. `null` se anche uno solo non torna:
 * una pagina che prova a indovinare cosa intendesse un URL malformato è una pagina che si
 * lascia usare per cose che nessuno ha chiesto.
 */
export function parseLoopbackRequest(query: Record<string, unknown>): LoopbackRequest | null {
  const port = Number(first(query.port))
  const state = first(query.state)
  const codeChallenge = first(query.challenge)
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) return null
  if (!state || !STATE.test(state)) return null
  if (!codeChallenge || !CHALLENGE.test(codeChallenge)) return null
  return { mode: 'loopback', port, state, codeChallenge, deviceName: cleanDeviceName(first(query.device)) }
}

/**
 * Dove il browser riporta il codice. Host fisso, porta già validata: non esiste un valore
 * della query che possa mandare il codice su un altro computer.
 */
export function loopbackCallbackUrl(request: LoopbackRequest, code: string): string {
  const params = new URLSearchParams({ code, state: request.state })
  return `http://${LOOPBACK_HOST}:${request.port}/callback?${params.toString()}`
}

/**
 * Il codice di controllo mostrato sia dal terminale sia da questa pagina: i primi otto
 * caratteri della sfida PKCE, in due gruppi. Se non coincidono, la pagina non l'ha aperta la
 * propria CLI — e non va autorizzata.
 */
export function verificationCode(codeChallenge: string): string {
  const head = codeChallenge.slice(0, 8)
  return `${head.slice(0, 4)}-${head.slice(4)}`
}

/** Lo stesso alfabeto del backend: niente vocali, niente 0/O e 1/I/L. */
const USER_CODE = /^[BCDFGHJKMNPQRSTVWXZ2]{8}$/

/** «abcd efgh», «ABCDEFGH», «abcd-efgh» → «ABCD-EFGH»; `null` se non può essere un codice. */
export function normalizeUserCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return USER_CODE.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null
}

// ── La richiesta in sospeso, attraverso il login ────────────────────────────────
//
// Chi arriva senza sessione e sceglie «Accedi» passa dalla pagina di login (magari dal 2FA,
// o da Google) e deve tornare qui senza ricominciare dal terminale. Stessa scelta di
// `usePendingClaim`: sessionStorage — muore con la scheda, non viaggia verso il server —
// con una scadenza, perché la CLI dall'altra parte non aspetta per sempre.

const STORAGE_KEY = 'novren_pending_cli_request'
const MAX_AGE_MS = 10 * 60 * 1000

export function savePendingCliRequest(request: CliRequest, now = Date.now()): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...request, savedAt: now }))
  } catch {
    // Storage non disponibile: dopo il login si ricomincerà dal terminale. Non è critico.
  }
}

export function loadPendingCliRequest(now = Date.now()): CliRequest | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const saved = JSON.parse(raw) as CliRequest & { savedAt?: number }
    if (typeof saved.savedAt !== 'number' || now - saved.savedAt > MAX_AGE_MS) {
      clearPendingCliRequest()
      return null
    }
    // Si rivalida: sessionStorage è scrivibile da qualunque script della stessa origine.
    if (saved.mode === 'loopback') {
      return parseLoopbackRequest({ port: String(saved.port), state: saved.state, challenge: saved.codeChallenge, device: saved.deviceName })
    }
    if (saved.mode === 'device') {
      const userCode = normalizeUserCode(saved.userCode)
      return userCode ? { mode: 'device', userCode } : null
    }
  } catch {
    // illeggibile: come se non ci fosse
  }
  clearPendingCliRequest()
  return null
}

export function clearPendingCliRequest(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // niente da fare
  }
}

/**
 * Dove andare dopo un login riuscito: di nuovo alla pagina della CLI se c'è un'autorizzazione
 * in sospeso, altrimenti nell'app come sempre. Senza richiesta in sospeso il comportamento è
 * **esattamente** quello di prima: `/app`.
 */
export function postLoginPath(now = Date.now()): string {
  const pending = loadPendingCliRequest(now)
  if (!pending) return '/app'
  return pending.mode === 'loopback' ? '/cli/authorize' : '/cli/device'
}
