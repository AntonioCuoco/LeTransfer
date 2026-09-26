import { open, readdir, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { downloadZip } from 'client-zip'
import {
  createKeyHash,
  createShareableKeyData,
  encryptChunkFramed,
  encryptedSizeV2,
  encryptFileName,
  FILE_FORMAT_VERSION,
  FILENAME_VERSION,
  generateAESKey,
  generateIV,
} from '../../vue-app/src/crypto/crypto'
import { claim, guestAbort, guestComplete, guestInit, guestPartUrl, ApiError } from './api'
import { recordSend, webBaseUrl, type Credentials } from './config'
import { formatBytes, info, progress } from './ui'
import { UserError } from './commands/get'

/**
 * `novren send` — cifra qui e carica, **esattamente come il sito**.
 *
 * Non è un'imitazione: sono le stesse scelte di `vue-app/src/stores/guestUpload.ts`, e lo
 * stesso codice crittografico. Deve esserlo, perché chi riceve apre il link nel browser:
 *
 *  • chunk da 10 MiB, formato v2 (IV per chunk, AAD = indice), una parte multipart per chunk;
 *  • all'avvio il nome è «file»: il nome vero arriva solo al completamento, e **cifrato**
 *    (nameVersion 2) — il server non lo vede mai;
 *  • più file o una cartella → uno zip in streaming con `client-zip`, la stessa libreria del
 *    sito, così l'archivio ha lo stesso identico formato;
 *  • il link porta la chiave nel frammento (`#key=…&iv=…`), che non arriva mai al server.
 *
 * L'unica differenza è il cancello: al posto di Turnstile, il token di questo computer.
 */

/** Uguale al sito: ≥ 5 MB (minimo del multipart, tranne l'ultima parte). */
export const CHUNK_SIZE = 10 * 1024 * 1024
const CONCURRENCY = 3
const MAX_PART_RETRIES = 3

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const mimeOf = (name: string) => MIME[extname(name).toLowerCase()] ?? 'application/octet-stream'

export interface SendOptions {
  paths: string[]
  credentials: Credentials
  password?: string
  expiresInHours?: number
  maxDownloads?: number
}

export interface SendResult {
  link: string
  expiresAt: string | null
  claimed: boolean
  /** Il nome del file o dell'archivio: resta su questo computer, finisce solo nel messaggio. */
  name: string
  passwordProtected: boolean
}

interface Part {
  PartNumber: number
  ETag: string
}

/** Carica una parte già cifrata sull'URL firmato dello storage, con qualche tentativo. */
async function putPart(token: string, fileKey: string, uploadId: string, partNumber: number, body: Uint8Array): Promise<Part> {
  for (let attempt = 0; ; attempt++) {
    try {
      const url = await guestPartUrl(token, fileKey, uploadId, partNumber)
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/octet-stream' },
        body,
      })
      if (!response.ok) throw new Error(`Lo storage ha rifiutato la parte ${partNumber} (HTTP ${response.status}).`)
      const eTag = response.headers.get('etag')
      if (!eTag) throw new Error('Lo storage non ha restituito l’ETag della parte.')
      return { PartNumber: partNumber, ETag: eTag }
    } catch (error) {
      // Gli errori del backend (token, quota) non migliorano riprovando.
      if (error instanceof ApiError || attempt >= MAX_PART_RETRIES) throw error
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
    }
  }
}

/** Tutti i file di una cartella, con il percorso relativo che il sito userebbe nello zip. */
async function walk(dir: string, root: string): Promise<{ path: string; name: string }[]> {
  const out: { path: string; name: string }[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full, root)))
    else if (entry.isFile()) out.push({ path: full, name: relative(root, full).split(sep).join('/') })
    // Link simbolici e file speciali si saltano: non si inviano cose che non sono file.
  }
  return out
}

type Source =
  | { kind: 'single'; path: string; name: string; size: number }
  | { kind: 'archive'; name: string; files: { path: string; name: string; size: number; lastModified: Date }[] }

async function planSource(paths: string[]): Promise<Source> {
  const resolved = paths.map((p) => resolve(p))
  const stats = await Promise.all(resolved.map((p) => stat(p).catch(() => null)))
  const missing = resolved.find((_, i) => !stats[i])
  if (missing) throw new UserError(`Non trovo «${missing}».`)

  if (resolved.length === 1 && stats[0]!.isFile()) {
    return { kind: 'single', path: resolved[0]!, name: basename(resolved[0]!), size: stats[0]!.size }
  }

  // Più elementi o una cartella: uno zip, come il sito. Il nome segue la stessa regola:
  // una sola cartella → «cartella.zip», altrimenti «trasferimento.zip».
  const entries: { path: string; name: string }[] = []
  for (let i = 0; i < resolved.length; i++) {
    const p = resolved[i]!
    if (stats[i]!.isDirectory()) entries.push(...(await walk(p, resolve(p, '..'))))
    else entries.push({ path: p, name: basename(p) })
  }
  if (entries.length === 0) throw new UserError('Non c’è nessun file da inviare.')
  const files = await Promise.all(
    entries.map(async (e) => {
      const s = await stat(e.path)
      return { ...e, size: s.size, lastModified: s.mtime }
    }),
  )
  const name = resolved.length === 1 && stats[0]!.isDirectory() ? `${basename(resolved[0]!)}.zip` : 'trasferimento.zip'
  return { kind: 'archive', name, files }
}

export async function send(options: SendOptions): Promise<SendResult> {
  const { credentials } = options
  const token = credentials.token
  const source = await planSource(options.paths)

  const key = await generateAESKey()
  // «IV di file»: vestigiale in v2 (gli IV veri sono per chunk), ma sta nel frammento del link
  // come nel sito, così un link della CLI è identico a uno del sito.
  const iv = generateIV()

  const displaySize = source.kind === 'single' ? source.size : source.files.reduce((n, f) => n + f.size, 0)
  info(`${source.name} · ${formatBytes(displaySize)}`)

  const init = await guestInit(token, {
    fileName: 'file',
    fileType: source.kind === 'single' ? mimeOf(source.name) : 'application/zip',
    fileSize: source.kind === 'single' ? encryptedSizeV2(source.size, CHUNK_SIZE) : displaySize,
  })

  const bar = progress('cifro e carico')
  let parts: Part[]
  let plainSize: number
  try {
    if (source.kind === 'single') {
      plainSize = source.size
      parts = await uploadFile(token, init, source.path, source.size, key, bar.update)
    } else {
      const uploaded = await uploadArchive(token, init, source.files, key, displaySize, bar.update)
      parts = uploaded.parts
      plainSize = uploaded.size
    }
  } catch (error) {
    // Il multipart lasciato a metà si chiude: niente pezzi orfani sullo storage.
    await guestAbort(token, init.fileKey, init.uploadId).catch(() => {})
    throw error
  } finally {
    bar.end()
  }

  const completed = await guestComplete(token, {
    fileKey: init.fileKey,
    uploadId: init.uploadId,
    parts,
    publicToken: init.publicToken,
    manageToken: init.manageToken,
    transferId: init.transferId,
    fileName: await encryptFileName(source.name, key),
    nameVersion: FILENAME_VERSION,
    fileSize: plainSize,
    fileType: source.kind === 'single' ? mimeOf(source.name) : 'application/zip',
    formatVersion: FILE_FORMAT_VERSION,
    chunkSize: CHUNK_SIZE,
    originalSize: plainSize,
    ...(options.password ? { password: options.password } : {}),
    ...(options.expiresInHours ? { expiresInHours: options.expiresInHours } : {}),
    ...(options.maxDownloads ? { maxDownloads: options.maxDownloads } : {}),
  })

  // La chiave vive SOLO nel frammento: il server non l'ha mai vista, in nessuna richiesta.
  const fragment = createKeyHash(await createShareableKeyData(key, iv))
  const link = `${webBaseUrl()}/share/${completed.publicToken}${fragment}`

  // Con un account collegato l'invio passa nell'account, senza toccare le chiavi. Se non
  // riesce, il link funziona comunque: si avvisa e basta.
  let claimed = false
  if (credentials.kind === 'account') {
    try {
      await claim(token, init.publicToken, init.manageToken)
      claimed = true
    } catch {
      info('Inviato, ma non sono riuscito ad aggiungerlo al tuo account: il link funziona comunque.')
    }
  }

  await recordSend({
    publicToken: completed.publicToken,
    manageToken: init.manageToken,
    sentAt: new Date().toISOString(),
    expiresAt: completed.expiresAt ?? null,
    claimed,
  }).catch(() => {})

  return { link, expiresAt: completed.expiresAt ?? null, claimed, name: source.name, passwordProtected: Boolean(options.password) }
}

/** File singolo: parti lette dal disco a pezzi, cifrate e caricate con un po' di parallelismo. */
async function uploadFile(
  token: string,
  init: { fileKey: string; uploadId: string },
  path: string,
  size: number,
  key: CryptoKey,
  onProgress: (done: number, total: number) => void,
): Promise<Part[]> {
  const totalParts = Math.max(1, Math.ceil(size / CHUNK_SIZE))
  const handle = await open(path, 'r')
  const parts = new Array<Part>(totalParts)
  let next = 0
  let done = 0
  try {
    const worker = async () => {
      for (;;) {
        const index = next++
        if (index >= totalParts) return
        const length = Math.min(CHUNK_SIZE, size - index * CHUNK_SIZE)
        const plain = new Uint8Array(Math.max(0, length))
        if (length > 0) await handle.read(plain, 0, length, index * CHUNK_SIZE)
        // AAD = indice del chunk: un chunk spostato di posizione non supera la verifica.
        const framed = await encryptChunkFramed(plain.buffer, key, index)
        parts[index] = await putPart(token, init.fileKey, init.uploadId, index + 1, framed)
        done += length
        onProgress(done, size)
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalParts) }, worker))
  } finally {
    await handle.close()
  }
  return parts
}

/** Più file o cartella: lo zip si produce e si cifra in streaming, senza mai stare in memoria. */
async function uploadArchive(
  token: string,
  init: { fileKey: string; uploadId: string },
  files: { path: string; name: string; size: number; lastModified: Date }[],
  key: CryptoKey,
  estimate: number,
  onProgress: (done: number, total: number) => void,
): Promise<{ parts: Part[]; size: number }> {
  const inputs = files.map((f) => ({
    name: f.name,
    lastModified: f.lastModified,
    size: f.size,
    input: Readable.toWeb(createReadStream(f.path)) as unknown as ReadableStream<Uint8Array>,
  }))
  const stream = downloadZip(inputs).body
  if (!stream) throw new Error('Non riesco a creare l’archivio.')
  const reader = stream.getReader()

  const parts: Part[] = []
  let pending: Uint8Array[] = []
  let pendingLen = 0
  let archiveBytes = 0

  const take = (size: number): Uint8Array => {
    const out = new Uint8Array(size)
    let offset = 0
    while (offset < size) {
      const head = pending[0]!
      const need = size - offset
      if (head.byteLength <= need) {
        out.set(head, offset)
        offset += head.byteLength
        pending.shift()
      } else {
        out.set(head.subarray(0, need), offset)
        pending[0] = head.subarray(need)
        offset += need
      }
    }
    pendingLen -= size
    return out
  }

  const flush = async (size: number) => {
    const index = parts.length
    const framed = await encryptChunkFramed(take(size).buffer, key, index)
    parts.push(await putPart(token, init.fileKey, init.uploadId, index + 1, framed))
    onProgress(Math.min(archiveBytes, estimate), estimate)
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    archiveBytes += value.byteLength
    pending.push(value)
    pendingLen += value.byteLength
    while (pendingLen >= CHUNK_SIZE) await flush(CHUNK_SIZE)
  }
  // Ultima parte, e almeno una anche per un archivio minuscolo.
  if (pendingLen > 0 || parts.length === 0) await flush(pendingLen)
  pending = []
  return { parts, size: archiveBytes }
}
