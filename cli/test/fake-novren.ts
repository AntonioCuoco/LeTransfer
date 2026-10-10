import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  createKeyHash,
  encryptChunkFramed,
  encryptFile,
  encryptFileName,
  exportIVToBase64,
  exportKeyToBase64,
  generateAESKey,
  generateIV,
} from '../../vue-app/src/crypto/crypto'

/**
 * Un Novren finto per i test: le rotte pubbliche dei link, **con la forma del backend vero**
 * (il backend di Novren, `routes/sharedLinks.js`), più uno «storage» che serve il ciphertext.
 *
 * Per `login` e `send` ha anche le rotte della CLI (`routes/cli.js`), quelle dell'invio senza
 * account (`routes/guest.js`, con il token del dispositivo al posto di Turnstile), il claim, e
 * uno storage che accetta le parti multipart e risponde con l'ETag, come R2.
 *
 * I file sono cifrati con **il nucleo crittografico reale** di `vue-app`, lo stesso che usa il
 * sito per inviare. Se la CLI decifra questi, decifra quelli veri: è lo stesso codice.
 */

export interface FakeTransfer {
  publicToken: string
  /** Il contenuto in chiaro, per confrontarlo con ciò che la CLI scrive su disco. */
  plain: Uint8Array
  /** Il link completo, frammento compreso. */
  link: string
}

interface Stored {
  info: Record<string, unknown>
  body: Uint8Array
  password?: string
}

export type TokenKind = 'device' | 'account'

/** Il corpo di `complete`, com'è arrivato: per verificare cosa il server vede (e cosa no). */
export interface CompletedUpload {
  publicToken: string
  body: Record<string, unknown>
  /** Il ciphertext riassemblato dalle parti, nell'ordine di PartNumber. */
  stored: Uint8Array
  partCount: number
  claimedBy: string | null
}

export interface FakeNovren {
  apiUrl: string
  addV2(options: {
    name: string
    size: number
    chunkSize?: number
    encryptName?: boolean
    password?: string
    /** Nome cifrato con una chiave DIVERSA da quella del file: il nome non si aprirà. */
    foreignName?: boolean
  }): Promise<FakeTransfer>
  addV1(options: { name: string; size: number }): Promise<FakeTransfer & { iv: string }>
  expire(publicToken: string): void
  tamper(publicToken: string): void
  /** Richieste ricevute, con il corpo JSON: per verificare che la chiave non arrivi MAI al server. */
  requests: string[]
  /** Un token già emesso, come dopo un login: per i test di `send` che non provano il login. */
  issueToken(kind: TokenKind, options?: { email?: string }): string
  /** Il browser che approva una richiesta loopback: crea il codice e lo consegna alla CLI. */
  approveLoopback(authorizeUrl: string, kind: TokenKind): Promise<Response>
  /** L'utente che inserisce il codice breve su /cli/device e approva. */
  approveDevice(userCode: string, kind: TokenKind): void
  /** Il token revocato dal sito (impostazioni → dispositivi). */
  revokeToken(token: string): void
  isRevoked(token: string): boolean
  /** Invii al giorno oltre i quali `init` risponde CLI_DAILY_LIMIT. */
  dailyLimit: number
  /** false = il backend con la CLI spenta: il token si ignora e si pretende Turnstile. */
  cliEnabled: boolean
  completed: CompletedUpload[]
  aborted: string[]
  /** Le parti da far fallire (una volta ciascuna) con un 500 dello storage. */
  failPartsOnce: Set<number>
  close(): Promise<void>
}

const randomBytes = (n: number) => {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)))
  return out
}

let counter = 0
const newToken = () => `tok${String(++counter).padStart(8, '0')}AbCdEf`

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })

interface TokenState {
  kind: TokenKind
  deviceName: string
  email: string | null
  revoked: boolean
  sends: number
}

interface Upload {
  publicToken: string
  manageToken: string
  token: string
  parts: Map<number, { body: Uint8Array; etag: string }>
}

export async function startFakeNovren(): Promise<FakeNovren> {
  const stored = new Map<string, Stored>()
  const expired = new Set<string>()
  const revoked = new Set<string>()
  /** Segreti già letti: come il backend, la lettura è una sola (anche come «anteprima»). */
  const secretsRead = new Set<string>()
  const requests: string[] = []
  let base = ''

  const tokens = new Map<string, TokenState>()
  const codes = new Map<string, { challenge: string; kind: TokenKind; deviceName: string }>()
  const devices = new Map<string, { userCode: string; deviceName: string; approved: TokenKind | null }>()
  const uploads = new Map<string, Upload>()
  const completed: CompletedUpload[] = []
  const aborted: string[] = []
  const failPartsOnce = new Set<number>()
  const control = { dailyLimit: 20, cliEnabled: true }

  const mint = (kind: TokenKind, deviceName: string, email: string | null = null) => {
    const token = `${kind === 'account' ? 'nva_' : 'nvd_'}${nodeRandomBytes(24).toString('base64url')}`
    tokens.set(token, {
      kind,
      deviceName,
      email: kind === 'account' ? (email ?? 'mario@example.com') : null,
      revoked: false,
      sends: 0,
    })
    return token
  }
  const issued = (token: string) => ({
    token,
    kind: tokens.get(token)!.kind,
    expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    tokenId: token.slice(4, 12),
  })

  const server: Server = createServer(async (req, res) => {
    const raw = await readBody(req)
    const isJson = (req.headers['content-type'] ?? '').includes('json')
    requests.push(`${req.method} ${req.url} ${req.headers.authorization ?? ''} ${isJson ? raw.toString('utf8') : ''}`)
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (): Record<string, any> => {
      try {
        return JSON.parse(raw.toString('utf8') || '{}')
      } catch {
        return {}
      }
    }
    const url = new URL(req.url ?? '/', base)
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    /** Il token della CLI se valido; altrimenti risponde 401 e restituisce null. */
    const cliToken = (): TokenState | null => {
      const state = tokens.get(bearer)
      if (!state || state.revoked) {
        send(401, { error: 'Unauthorized', errorCode: 'CLI_TOKEN_INVALID' })
        return null
      }
      return state
    }

    // ── Storage: GET del ciphertext, PUT delle parti ──
    const storage = url.pathname.match(/^\/storage\/([^/]+)$/)
    if (storage) {
      const entry = stored.get(storage[1]!)
      if (!entry) return send(404, {})
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      return res.end(Buffer.from(entry.body))
    }
    const partPut = url.pathname.match(/^\/upload\/([^/]+)\/(\d+)$/)
    if (partPut && req.method === 'PUT') {
      const upload = uploads.get(partPut[1]!)
      const partNumber = Number(partPut[2])
      if (!upload) return send(404, {})
      if (failPartsOnce.delete(partNumber)) return send(500, {})
      const etag = `"${createHash('md5').update(raw).digest('hex')}"`
      upload.parts.set(partNumber, { body: new Uint8Array(raw), etag })
      res.writeHead(200, { etag })
      return res.end()
    }

    // ── /api/cli ──
    if (url.pathname.startsWith('/api/cli/')) {
      // CLI spenta: il router non è montato, quindi 404 come una rotta inesistente.
      if (!control.cliEnabled) return send(404, { error: 'Not found' })
      const path = url.pathname.slice('/api/cli'.length)
      if (path === '/token' && req.method === 'POST') {
        const body = json()
        if (body.grantType === 'authorization_code') {
          const grant = codes.get(body.code)
          codes.delete(body.code)
          const challenge = createHash('sha256').update(String(body.codeVerifier ?? '')).digest('base64url')
          if (!grant || grant.challenge !== challenge) return send(400, { error: 'Invalid grant', errorCode: 'INVALID_GRANT' })
          return send(200, issued(mint(grant.kind, grant.deviceName)))
        }
        if (body.grantType === 'device_code') {
          const device = devices.get(body.deviceCode)
          if (!device) return send(400, { error: 'Expired', errorCode: 'EXPIRED_TOKEN' })
          if (!device.approved) return send(400, { error: 'Pending', errorCode: 'AUTHORIZATION_PENDING' })
          devices.delete(body.deviceCode)
          return send(200, issued(mint(device.approved, device.deviceName)))
        }
        return send(400, { error: 'Invalid request', errorCode: 'INVALID_REQUEST' })
      }
      if (path === '/device' && req.method === 'POST') {
        const deviceCode = nodeRandomBytes(16).toString('base64url')
        const userCode = `BCDF-GHJ${'MNPQRSTVWXZ2'[devices.size % 12]}`
        devices.set(deviceCode, { userCode, deviceName: json().deviceName ?? 'CLI', approved: null })
        // Intervallo 0 nei test: il backend vero dice 5 secondi.
        return send(201, { deviceCode, userCode, verificationUri: 'https://novren.net/cli/device', expiresIn: 600, interval: 0 })
      }
      if (path === '/whoami' && req.method === 'GET') {
        const state = cliToken()
        if (!state) return
        return send(200, {
          kind: state.kind,
          deviceName: state.deviceName,
          expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
          ...(state.kind === 'account' ? { email: state.email } : {}),
        })
      }
      if (path === '/logout' && req.method === 'POST') {
        const state = cliToken()
        if (!state) return
        state.revoked = true
        res.writeHead(204)
        return res.end()
      }
      return send(404, { error: 'Not found' })
    }

    // ── /api/guest: l'invio senza account, con il token al posto di Turnstile ──
    if (url.pathname === '/api/guest/upload/init' && req.method === 'POST') {
      // CLI spenta sul backend: il token si ignora e manca Turnstile.
      if (!control.cliEnabled || !bearer) return send(400, { error: 'Captcha required', errorCode: 'CAPTCHA_REQUIRED' })
      const state = cliToken()
      if (!state) return
      if (state.sends >= control.dailyLimit) return send(429, { error: 'Daily limit', errorCode: 'CLI_DAILY_LIMIT' })
      state.sends++
      // Con i nomi cifrati, init non deve mai vedere il nome vero.
      if (json().fileName !== 'file') return send(400, { error: 'plain name at init', errorCode: 'TEST_PLAIN_NAME' })
      const uploadId = `up${nodeRandomBytes(6).toString('hex')}`
      const publicToken = newToken()
      const manageToken = nodeRandomBytes(16).toString('hex')
      uploads.set(uploadId, { publicToken, manageToken, token: bearer, parts: new Map() })
      return send(201, { transferId: `tr-${uploadId}`, publicToken, manageToken, uploadId, fileKey: `uploads/guest/${uploadId}` })
    }
    if (url.pathname === '/api/guest/upload/urls' && req.method === 'POST') {
      const body = json()
      const upload = uploads.get(body.uploadId)
      if (!upload || upload.token !== bearer) return send(403, { error: 'Forbidden', errorCode: 'FORBIDDEN' })
      const urls: Record<string, string> = {}
      for (const n of body.partNumbers ?? []) urls[String(n)] = `${base}/upload/${body.uploadId}/${n}`
      return send(200, { urls })
    }
    if (url.pathname === '/api/guest/upload/complete' && req.method === 'POST') {
      const body = json()
      const upload = uploads.get(body.uploadId)
      if (!upload || upload.publicToken !== body.publicToken || upload.manageToken !== body.manageToken) {
        return send(403, { error: 'Forbidden', errorCode: 'FORBIDDEN' })
      }
      const parts = (body.parts as { PartNumber: number; ETag: string }[]).slice().sort((a, b) => a.PartNumber - b.PartNumber)
      const chunks: Uint8Array[] = []
      for (const [i, part] of parts.entries()) {
        const saved = upload.parts.get(part.PartNumber)
        // Come S3: parti contigue da 1, ETag corrispondente.
        if (part.PartNumber !== i + 1 || !saved || saved.etag !== part.ETag) return send(400, { error: 'InvalidPart' })
        chunks.push(saved.body)
      }
      const ciphertext = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
      let at = 0
      for (const c of chunks) {
        ciphertext.set(c, at)
        at += c.length
      }
      const hours = Math.min(Number(body.expiresInHours) || 168, 168)
      const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString()
      stored.set(upload.publicToken, {
        body: ciphertext,
        ...(body.password ? { password: body.password } : {}),
        info: {
          fileName: body.fileName,
          nameVersion: body.nameVersion,
          fileSize: String(body.fileSize),
          fileType: body.fileType,
          isPasswordProtected: Boolean(body.password),
          expiresAt,
          formatVersion: body.formatVersion,
          chunkSize: body.chunkSize,
          originalSize: body.originalSize,
        },
      })
      completed.push({ publicToken: upload.publicToken, body, stored: ciphertext, partCount: parts.length, claimedBy: null })
      uploads.delete(body.uploadId)
      return send(201, { publicToken: upload.publicToken, url: `https://novren.net/share/${upload.publicToken}`, expiresAt })
    }
    if (url.pathname === '/api/guest/upload/abort' && req.method === 'POST') {
      aborted.push(json().uploadId)
      return send(200, { status: 'aborted' })
    }
    const guestRevoke = url.pathname.match(/^\/api\/guest\/([^/]+)\/revoke$/)
    if (guestRevoke && req.method === 'POST') {
      const done = completed.find((c) => c.publicToken === guestRevoke[1])
      if (!done || done.body.manageToken !== json().manageToken) return send(403, { error: 'Not authorized', errorCode: 'FORBIDDEN' })
      revoked.add(done.publicToken)
      return send(200, { status: 'revoked' })
    }
    if (url.pathname === '/api/share/claim' && req.method === 'POST') {
      const state = tokens.get(bearer)
      if (!state || state.revoked || state.kind !== 'account') return send(401, { message: 'Unauthorized' })
      const body = json()
      const done = completed.find((c) => c.publicToken === body.publicToken)
      if (!done || done.body.manageToken !== body.manageToken) return send(403, { message: 'Not authorized' })
      done.claimedBy = state.email
      return send(200, { claimed: true })
    }

    // ── Link pubblici ──
    const route = url.pathname.match(/^\/api\/shared-links\/([^/]+)(\/access|\/file)?$/)
    if (!route) return send(404, { success: false })
    const [, token, action] = route
    const entry = stored.get(token!)
    if (!entry) return send(404, { success: false, code: 'LINK_NOT_FOUND', message: 'Link not found' })
    if (expired.has(token!)) return send(410, { success: false, code: 'LINK_EXPIRED', message: 'Link expired' })
    if (revoked.has(token!)) return send(410, { success: false, code: 'LINK_REVOKED', message: 'Link revoked' })
    const isSecret = entry.info.fileType === 'application/vnd.novren.secret'
    if (isSecret && secretsRead.has(token!)) return send(410, { success: false, errorCode: 'SECRET_ALREADY_READ', error: 'Secret already read' })

    if (!action && req.method === 'GET') return send(200, { success: true, data: entry.info })

    if (action === '/access' && req.method === 'POST') {
      const body = json() as { visitorName?: string; password?: string }
      if (!body.visitorName || body.visitorName.length < 2) return send(400, { success: false, code: 'INVALID_REQUEST' })
      if (entry.password && body.password !== entry.password) {
        return send(401, { success: false, code: body.password ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED' })
      }
      return send(200, { success: true, data: { sessionToken: `session-${token}`, downloadAllowed: true } })
    }

    if (action === '/file' && req.method === 'GET') {
      if (req.headers.authorization !== `Bearer session-${token}`) return send(401, { success: false })
      if (isSecret) secretsRead.add(token!)
      return send(200, { success: true, data: { url: `${base}/storage/${token}` } })
    }
    send(404, { success: false })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const linkFor = (token: string, fragment: string) => `https://novren.net/share/${token}${fragment}`

  return {
    apiUrl: `${base}/api`,
    requests,
    completed,
    aborted,
    failPartsOnce,
    get dailyLimit() {
      return control.dailyLimit
    },
    set dailyLimit(value: number) {
      control.dailyLimit = value
    },
    get cliEnabled() {
      return control.cliEnabled
    },
    set cliEnabled(value: boolean) {
      control.cliEnabled = value
    },

    async addV2({ name, size, chunkSize = 1000, encryptName = true, password, foreignName = false }) {
      const key = await generateAESKey()
      const plain = randomBytes(size)
      const chunks: Uint8Array[] = []
      for (let offset = 0, index = 0; offset < Math.max(size, 1); offset += chunkSize, index++) {
        chunks.push(await encryptChunkFramed(plain.slice(offset, offset + chunkSize).buffer, key, index))
      }
      const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
      let at = 0
      for (const chunk of chunks) {
        body.set(chunk, at)
        at += chunk.length
      }
      const token = newToken()
      stored.set(token, {
        body,
        ...(password ? { password } : {}),
        info: {
          fileName: encryptName ? await encryptFileName(name, foreignName ? await generateAESKey() : key) : name,
          ...(encryptName ? { nameVersion: 2 } : {}),
          fileSize: String(body.length),
          fileType: 'application/octet-stream',
          isPasswordProtected: Boolean(password),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          formatVersion: 2,
          chunkSize,
          originalSize: size,
        },
      })
      const fragment = createKeyHash({ key: await exportKeyToBase64(key), iv: exportIVToBase64(generateIV()) })
      return { publicToken: token, plain, link: linkFor(token, fragment) }
    },

    async addV1({ name, size }) {
      const key = await generateAESKey()
      const plain = randomBytes(size)
      const { encrypted, iv } = await encryptFile(new File([plain], name), key)
      const token = newToken()
      stored.set(token, {
        body: new Uint8Array(await encrypted.arrayBuffer()),
        info: {
          fileName: name,
          fileSize: String(size),
          fileType: 'application/octet-stream',
          isPasswordProtected: false,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      })
      const ivText = exportIVToBase64(iv)
      const fragment = createKeyHash({ key: await exportKeyToBase64(key), iv: ivText })
      return { publicToken: token, plain, link: linkFor(token, fragment), iv: ivText }
    },

    expire: (token) => expired.add(token),

    tamper(token) {
      const entry = stored.get(token)!
      entry.body[entry.body.length - 20] ^= 0x01
    },

    issueToken: (kind, options = {}) => mint(kind, 'test', options.email ?? null),

    async approveLoopback(authorizeUrl, kind) {
      // Quello che fa CliAuthorizePage: legge port/state/challenge, fa emettere il codice
      // (qui direttamente), e rimanda il browser a 127.0.0.1.
      const params = new URL(authorizeUrl).searchParams
      const code = nodeRandomBytes(16).toString('base64url')
      codes.set(code, { challenge: params.get('challenge')!, kind, deviceName: params.get('device') ?? 'CLI' })
      const back = new URLSearchParams({ code, state: params.get('state')! })
      return fetch(`http://127.0.0.1:${params.get('port')}/callback?${back.toString()}`)
    },

    approveDevice(userCode, kind) {
      const device = [...devices.values()].find((d) => d.userCode === userCode)
      if (!device) throw new Error(`codice sconosciuto: ${userCode}`)
      device.approved = kind
    },

    revokeToken(token) {
      tokens.get(token)!.revoked = true
    },
    isRevoked: (token) => tokens.get(token)?.revoked ?? true,

    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
