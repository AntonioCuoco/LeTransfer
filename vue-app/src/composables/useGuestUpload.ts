import { ref, shallowRef } from 'vue'
import axios from 'axios'
import { downloadZip } from 'client-zip'
import {
  generateAESKey,
  generateIV,
  encryptChunkFramed,
  encryptedSizeV2,
  createShareableKeyData,
  createKeyHash,
  FILE_FORMAT_VERSION,
} from '@/src/utils/crypto'

/**
 * Invio SENZA account (guest). La chiave nasce nel browser e finisce SOLO nel
 * fragment `#` del link — mai al server, che vede solo ciphertext.
 *
 * Due percorsi, stesso formato "v2" a chunk e stessi endpoint `/api/guest/*`:
 *  - **1 file**  → upload multipart concorrente (slice lazy: RAM ~ un chunk).
 *  - **più file / cartella** → **zip in streaming** (client-zip `.body`): l'archivio
 *    è prodotto e cifrato a chunk al volo, senza mai tenerlo in RAM. Un solo link.
 *    (Evoluzione futura "modello a collezione": vedi FRONTEND_WORKORDER_ROADMAP.md §F1.2.)
 *
 * Contratto backend: BACKEND_API_DOCS.md §4.9.
 */

export type GuestUploadStatus = 'idle' | 'preparing' | 'uploading' | 'finalizing' | 'done' | 'error'

export interface GuestUploadResult {
  shareUrl: string
  publicToken: string
  manageToken: string
  expiresAt: string | null
}

export interface GuestUploadOptions {
  turnstileToken?: string
  password?: string
  expiresInHours?: number
  maxDownloads?: number
}

interface InitResponse {
  transferId: string
  publicToken: string
  manageToken: string
  uploadId: string
  fileKey: string
}

interface UrlsResponse {
  urls: Record<number, string>
}

interface CompleteResponse {
  publicToken: string
  url: string
  expiresAt?: string
}

interface Part {
  PartNumber: number
  ETag: string
}

interface TransferContext {
  uploadId: string
  fileKey: string
  key: CryptoKey
}

interface FileMeta {
  fileName: string
  fileType: string
  fileSize: number
  originalSize: number
}

const CHUNK_SIZE = 10 * 1024 * 1024 // 10 MB (≥ 5 MB richiesto dal multipart, tranne l'ultima parte)
const CONCURRENCY = 3
const MAX_PART_RETRIES = 3

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || window.location.origin

export function useGuestUpload() {
  const status = ref<GuestUploadStatus>('idle')
  const progress = ref(0)
  const result = ref<GuestUploadResult | null>(null)
  const errorMessage = ref<string | null>(null)

  // Istanze axios dedicate: NESSUN interceptor globale. Il canale guest è no-auth e
  // gli URL S3/R2 presigned non devono mai ricevere l'header Authorization.
  const api = axios.create({ baseURL: API_BASE_URL })
  const storageApi = axios.create()

  const abortController = shallowRef<AbortController | null>(null)
  const activeUpload = shallowRef<{ uploadId: string; fileKey: string } | null>(null)

  // Progressi: byte "completati" + byte in volo delle parti attive (percorso concorrente).
  let totalBytes = 0
  let completedBytes = 0
  const activeBytes = new Map<number, number>()

  // Buffer del percorso streaming: accumula i byte dello zip fino a formare un chunk.
  let pending: Uint8Array[] = []
  let pendingLen = 0

  function updateProgress() {
    let inFlight = 0
    for (const bytes of activeBytes.values()) {
      inFlight += bytes
    }
    const uploaded = Math.min(totalBytes, completedBytes + inFlight)
    progress.value = totalBytes > 0 ? Math.min(100, Math.round((uploaded / totalBytes) * 100)) : 0
  }

  function messageForError(error: unknown): string {
    const axiosError = error as { response?: { status?: number; data?: { errorCode?: string } } }
    const httpStatus = axiosError.response?.status
    const errorCode = axiosError.response?.data?.errorCode

    if (httpStatus === 413 || errorCode === 'FILE_TOO_LARGE') {
      return 'Il trasferimento supera il limite per l’invio senza account. Registrati per file più grandi.'
    }
    if (httpStatus === 429 || errorCode === 'RATE_LIMITED') {
      return 'Troppi invii da questa rete. Riprova tra qualche minuto.'
    }
    if (errorCode === 'CAPTCHA_REQUIRED' || errorCode === 'CAPTCHA_FAILED') {
      return 'Verifica anti-bot non superata. Ricarica la pagina e riprova.'
    }
    if (httpStatus === 503 || errorCode === 'CAPTCHA_UNAVAILABLE') {
      return 'Servizio temporaneamente non disponibile. Riprova tra poco.'
    }
    return 'Qualcosa è andato storto durante l’invio. Riprova.'
  }

  async function beginTransfer(): Promise<{ key: CryptoKey; iv: Uint8Array }> {
    status.value = 'preparing'
    progress.value = 0
    result.value = null
    errorMessage.value = null
    completedBytes = 0
    activeBytes.clear()
    pending = []
    pendingLen = 0
    abortController.value = new AbortController()
    activeUpload.value = null

    const key = await generateAESKey()
    // "IV di file": vestigiale in v2 (gli IV veri sono per-chunk), ma lo teniamo per lo schema del fragment.
    const iv = generateIV()
    return { key, iv }
  }

  async function runInit(meta: FileMeta, estimatedSize: number, options: GuestUploadOptions): Promise<InitResponse> {
    const { data } = await api.post<InitResponse>('/guest/upload/init', {
      fileName: meta.fileName,
      fileType: meta.fileType,
      fileSize: estimatedSize,
      turnstileToken: options.turnstileToken,
    }, { signal: abortController.value?.signal })
    activeUpload.value = { uploadId: data.uploadId, fileKey: data.fileKey }
    return data
  }

  async function runComplete(init: InitResponse, parts: Part[], meta: FileMeta, options: GuestUploadOptions, key: CryptoKey, iv: Uint8Array) {
    const { data } = await api.post<CompleteResponse>('/guest/upload/complete', {
      fileKey: init.fileKey,
      uploadId: init.uploadId,
      parts,
      publicToken: init.publicToken,
      manageToken: init.manageToken,
      transferId: init.transferId,
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      fileType: meta.fileType,
      formatVersion: FILE_FORMAT_VERSION,
      chunkSize: CHUNK_SIZE,
      originalSize: meta.originalSize,
      password: options.password,
      expiresInHours: options.expiresInHours,
      maxDownloads: options.maxDownloads,
    }, { signal: abortController.value?.signal })

    // La chiave vive SOLO nel fragment del link — mai inviata al server.
    const keyData = await createShareableKeyData(key, iv)
    const fragment = createKeyHash(keyData)

    result.value = {
      shareUrl: `${FRONTEND_URL}/share/${data.publicToken}${fragment}`,
      publicToken: data.publicToken,
      manageToken: init.manageToken,
      expiresAt: data.expiresAt ?? null,
    }
    progress.value = 100
    status.value = 'done'
  }

  function handleUploadError(error: unknown) {
    // Annullamento volontario: torna a idle senza segnalare errore.
    if (abortController.value?.signal.aborted) {
      status.value = 'idle'
      return
    }
    errorMessage.value = messageForError(error)
    status.value = 'error'
  }

  async function requestPartUrl(partNumber: number, ctx: TransferContext): Promise<string> {
    const { data } = await api.post<UrlsResponse>('/guest/upload/urls', {
      fileKey: ctx.fileKey,
      uploadId: ctx.uploadId,
      partNumbers: [partNumber],
    }, { signal: abortController.value?.signal })
    const url = data.urls[partNumber]
    if (!url) throw new Error(`URL presigned mancante per la parte ${partNumber}`)
    return url
  }

  // ── Percorso 1: file singolo, multipart concorrente (slice lazy) ─────────────────
  async function uploadConcurrentPart(part: { partNumber: number; chunk: Blob }, ctx: TransferContext): Promise<Part> {
    let attempt = 0
    while (true) {
      try {
        const url = await requestPartUrl(part.partNumber, ctx)
        const raw = await part.chunk.arrayBuffer()
        const framed = await encryptChunkFramed(raw, ctx.key, part.partNumber - 1)
        const body = new Blob([framed])

        const response = await storageApi.put(url, body, {
          headers: { 'Content-Type': 'application/octet-stream' },
          signal: abortController.value?.signal,
          onUploadProgress: (event) => {
            activeBytes.set(part.partNumber, event.loaded)
            updateProgress()
          },
        })

        const eTag = response.headers['etag']
        if (!eTag) throw new Error('ETag mancante nella risposta di storage')

        activeBytes.delete(part.partNumber)
        completedBytes += body.size
        updateProgress()
        return { PartNumber: part.partNumber, ETag: eTag }
      } catch (error) {
        activeBytes.delete(part.partNumber)
        if (abortController.value?.signal.aborted) throw error
        attempt += 1
        if (attempt > MAX_PART_RETRIES) throw error
      }
    }
  }

  async function uploadSingle(file: File, options: GuestUploadOptions) {
    const { key, iv } = await beginTransfer()
    try {
      totalBytes = encryptedSizeV2(file.size, CHUNK_SIZE)
      const meta: FileMeta = {
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        originalSize: file.size,
      }
      const init = await runInit(meta, totalBytes, options)
      const ctx: TransferContext = { uploadId: init.uploadId, fileKey: init.fileKey, key }

      const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
      const queue: { partNumber: number; chunk: Blob }[] = []
      for (let index = 0; index < totalParts; index += 1) {
        const start = index * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        queue.push({ partNumber: index + 1, chunk: file.slice(start, end) })
      }

      status.value = 'uploading'
      const uploaded = new Array<Part>(queue.length)
      let next = 0
      const worker = async () => {
        while (true) {
          const index = next
          next += 1
          if (index >= queue.length) return
          uploaded[index] = await uploadConcurrentPart(queue[index], ctx)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()))

      status.value = 'finalizing'
      await runComplete(init, uploaded, meta, options, key, iv)
    } catch (error) {
      handleUploadError(error)
    }
  }

  // ── Percorso 2: più file / cartella, zip in streaming (RAM costante) ─────────────
  function takeChunk(size: number): Uint8Array {
    const out = new Uint8Array(size)
    let offset = 0
    while (offset < size) {
      const head = pending[0]
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

  function deriveArchiveName(files: File[]): string {
    const first = files[0] as File & { webkitRelativePath?: string }
    const relativePath = first.webkitRelativePath
    if (relativePath && relativePath.includes('/')) {
      return `${relativePath.split('/')[0]}.zip`
    }
    return 'trasferimento.zip'
  }

  async function uploadArchive(files: File[], options: GuestUploadOptions) {
    const { key, iv } = await beginTransfer()
    try {
      // Stima per la progress bar: la dimensione dello zip non è nota in anticipo,
      // ma è ~ la somma dei file (lo zip "store" aggiunge solo piccoli header).
      totalBytes = files.reduce((acc, file) => acc + file.size, 0) || 1
      const archiveName = deriveArchiveName(files)
      const meta: FileMeta = { fileName: archiveName, fileType: 'application/zip', fileSize: 0, originalSize: 0 }
      const init = await runInit(meta, totalBytes, options)
      const ctx: TransferContext = { uploadId: init.uploadId, fileKey: init.fileKey, key }

      const inputs = files.map((file) => {
        const withPath = file as File & { webkitRelativePath?: string }
        return { name: withPath.webkitRelativePath || file.name, input: file }
      })
      const stream = downloadZip(inputs).body
      if (!stream) throw new Error('Stream zip non disponibile')
      const reader = stream.getReader()

      const parts: Part[] = []
      let partNumber = 1
      let archiveBytes = 0

      status.value = 'uploading'

      const flushPart = async (size: number) => {
        const chunk = takeChunk(size)
        const framed = await encryptChunkFramed(chunk.buffer as ArrayBuffer, key, partNumber - 1)
        let attempt = 0
        while (true) {
          try {
            const url = await requestPartUrl(partNumber, ctx)
            const response = await storageApi.put(url, new Blob([framed]), {
              headers: { 'Content-Type': 'application/octet-stream' },
              signal: abortController.value?.signal,
            })
            const eTag = response.headers['etag']
            if (!eTag) throw new Error('ETag mancante nella risposta di storage')
            parts.push({ PartNumber: partNumber, ETag: eTag })
            break
          } catch (error) {
            if (abortController.value?.signal.aborted) throw error
            attempt += 1
            if (attempt > MAX_PART_RETRIES) throw error
          }
        }
        partNumber += 1
        completedBytes = Math.min(totalBytes, completedBytes + size)
        updateProgress()
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        archiveBytes += value.byteLength
        pending.push(value)
        pendingLen += value.byteLength
        while (pendingLen >= CHUNK_SIZE) {
          await flushPart(CHUNK_SIZE)
        }
      }
      // Ultima parte (byte residui). Garantisce almeno una parte anche per archivi minuscoli.
      if (pendingLen > 0 || parts.length === 0) {
        await flushPart(pendingLen)
      }

      status.value = 'finalizing'
      await runComplete(init, parts, { ...meta, fileSize: archiveBytes, originalSize: archiveBytes }, options, key, iv)
    } catch (error) {
      handleUploadError(error)
    }
  }

  // ── API pubblica ─────────────────────────────────────────────────────────────
  async function upload(files: File[], options: GuestUploadOptions = {}) {
    const busy = status.value === 'preparing' || status.value === 'uploading' || status.value === 'finalizing'
    if (busy || files.length === 0) return
    if (files.length === 1) {
      await uploadSingle(files[0], options)
    } else {
      await uploadArchive(files, options)
    }
  }

  async function abort() {
    abortController.value?.abort()
    const pendingUpload = activeUpload.value
    if (pendingUpload) {
      try {
        await api.post('/guest/upload/abort', { fileKey: pendingUpload.fileKey, uploadId: pendingUpload.uploadId })
      } catch {
        // la lifecycle dei multipart incompleti farà pulizia
      }
    }
    reset()
  }

  function reset() {
    status.value = 'idle'
    progress.value = 0
    result.value = null
    errorMessage.value = null
    completedBytes = 0
    totalBytes = 0
    activeBytes.clear()
    pending = []
    pendingLen = 0
    abortController.value = null
    activeUpload.value = null
  }

  return { status, progress, result, errorMessage, upload, abort, reset }
}
