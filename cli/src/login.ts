import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { apiBaseUrl, exchangeCode, pollDeviceLogin, startDeviceLogin, whoami, ApiError, type IssuedToken } from './api'
import { saveCredentials, webBaseUrl, type Credentials } from './config'
import { info } from './ui'
import { UserError } from './commands/get'

/**
 * `novren login` — collegare questo computer a Novren, **una volta**.
 *
 * Due modi, scelti da soli:
 *
 *  a) BROWSER (RFC 8252 + PKCE) — il caso normale. La CLI ascolta su 127.0.0.1 su una porta
 *     casuale, apre la pagina /cli/authorize del sito con una sfida PKCE, e aspetta che il
 *     browser le riporti un codice monouso. Lo scambia per il token presentando il
 *     verificatore, che non ha mai lasciato questo processo: chi intercettasse il codice non
 *     ne farebbe niente.
 *
 *  b) CODICE BREVE (RFC 8628) — quando non c'è un browser (un server via SSH). La CLI mostra
 *     un indirizzo e un codice da inserire da un altro dispositivo, e interroga finché non è
 *     approvato.
 *
 * In nessuno dei due la password passa dal terminale.
 */

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

const b64url = (bytes: Buffer) => bytes.toString('base64url')

/** Un server senza schermo: SSH senza inoltro grafico, o Linux senza display. */
export function looksHeadless(): boolean {
  if (process.env.SSH_CONNECTION || process.env.SSH_TTY) {
    return !(process.env.DISPLAY || process.env.WAYLAND_DISPLAY) || process.platform !== 'linux'
  }
  return process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
}

/**
 * Apre l'URL nel browser di sistema. Senza shell (`spawn` con argomenti separati): l'URL
 * contiene `&`, e passato a una shell verrebbe spezzato in due comandi.
 * `NOVREN_OPEN_BROWSER=0` lo disattiva (test, ambienti in cui si preferisce copiare l'URL).
 */
function openBrowser(url: string): void {
  if (process.env.NOVREN_OPEN_BROWSER === '0') return
  const [command, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]]
  try {
    spawn(command, args as string[], { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
  } catch {
    // Nessun browser apribile: resta l'URL stampato, da copiare a mano.
  }
}

const PAGE = (title: string, text: string) => `<!doctype html><html lang="it"><meta charset="utf-8">
<title>${title} — Novren</title><body style="font-family:system-ui,sans-serif;background:#160934;color:#f2ecff;
display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:28rem;text-align:center">
<h1 style="font-size:1.4rem">${title}</h1><p style="color:#b9ace2">${text}</p></div></body></html>`

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function loginWithBrowser(deviceName: string): Promise<IssuedToken> {
  const verifier = b64url(randomBytes(32))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(24))

  let resolveCode!: (code: string) => void
  let rejectCode!: (error: Error) => void
  const codeArrived = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  // Solo 127.0.0.1: un indirizzo che nessun altro computer della rete può raggiungere.
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/callback') {
      res.writeHead(404).end()
      return
    }
    const code = url.searchParams.get('code')
    // Lo `state` lega la risposta a QUESTA richiesta: una pagina ostile che riuscisse a
    // indovinare la porta non potrebbe comunque consegnare un codice suo.
    if (!code || !sameText(url.searchParams.get('state') ?? '', state)) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(PAGE('Richiesta non valida', 'Rilancia «novren login» dal terminale.'))
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE('Fatto', 'Il terminale è collegato. Puoi chiudere questa pagina.'))
    resolveCode(code)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const params = new URLSearchParams({ port: String(port), state, challenge, device: deviceName })
  const url = `${webBaseUrl()}/cli/authorize?${params.toString()}`
  const check = `${challenge.slice(0, 4)}-${challenge.slice(4, 8)}`

  info('Apro il browser per collegare questo computer.')
  info(`Se non si apre, visita:\n  ${url}`)
  info(`Codice di controllo: ${check}  (la pagina deve mostrare lo stesso)`)
  openBrowser(url)

  const timeout = setTimeout(() => rejectCode(new UserError('Tempo scaduto: rilancia «novren login».')), LOGIN_TIMEOUT_MS)
  try {
    const code = await codeArrived
    return await exchangeCode(code, verifier)
  } finally {
    clearTimeout(timeout)
    server.close()
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function loginWithDeviceCode(deviceName: string): Promise<IssuedToken> {
  const started = await startDeviceLogin(deviceName)
  info('Da un altro dispositivo, apri:')
  info(`  ${started.verificationUri}`)
  info(`e inserisci il codice:  ${started.userCode}`)

  let interval = started.interval * 1000
  const deadline = Date.now() + started.expiresIn * 1000
  while (Date.now() < deadline) {
    await sleep(interval)
    try {
      return await pollDeviceLogin(started.deviceCode)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.code === 'AUTHORIZATION_PENDING') continue
      // Chiedere più spesso del dovuto: la RFC vuole che si rallenti di 5 secondi.
      if (error.code === 'SLOW_DOWN') {
        interval += 5000
        continue
      }
      if (error.code === 'EXPIRED_TOKEN') break
      throw error
    }
  }
  throw new UserError('Il codice è scaduto senza essere stato approvato: rilancia «novren login».')
}

export interface LoginOptions {
  deviceName: string
  mode?: 'browser' | 'device-code'
}

/** Collega il computer e salva il token. Restituisce le credenziali salvate. */
export async function login(options: LoginOptions): Promise<Credentials> {
  const mode = options.mode ?? (looksHeadless() ? 'device-code' : 'browser')
  const issued = mode === 'device-code' ? await loginWithDeviceCode(options.deviceName) : await loginWithBrowser(options.deviceName)

  const credentials: Credentials = {
    token: issued.token,
    kind: issued.kind,
    expiresAt: issued.expiresAt,
    deviceName: options.deviceName,
    apiUrl: apiBaseUrl(),
  }
  await saveCredentials(credentials)

  // Chi è collegato, detto subito: se un codice breve fosse stato approvato dall'account
  // sbagliato, è qui che ce ne si accorge.
  const me = await whoami(issued.token).catch(() => null)
  if (issued.kind === 'account') info(`Collegato all’account ${me?.email ?? ''}`.trim())
  else info('Collegato senza account. Per collegare un account: «novren login» e scegli «Accedi».')
  return credentials
}
