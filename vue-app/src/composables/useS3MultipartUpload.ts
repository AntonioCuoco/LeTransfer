import { ref, shallowRef } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { notify } from '@/src/utils/notify'
import type { MultipartUploadConfig, MultipartUploadState, UploadedPart, InitUploadResponse, GetPresignedUrlsResponse, CompleteUploadResponse } from '@/src/types/multipart-upload'
import { generateAESKey, generateIV, encryptChunkFramed, encryptedSizeV2, FILE_FORMAT_VERSION, exportKeyToBase64, exportIVToBase64 } from '@/src/utils/crypto'
import { useEncryptionStore } from '@/src/stores/encryption'

const DEFAULT_CONFIG: MultipartUploadConfig = {
  chunkSize: 10 * 1024 * 1024,
  concurrency: 3,
  apiBaseUrl: import.meta.env.VITE_API_URL || '/api',
}

interface PendingPart {
  partNumber: number
  chunk: Blob
  retries: number
}

export const useS3MultipartUpload = (config: Partial<MultipartUploadConfig> = {}) => {
  const finalConfig: MultipartUploadConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    concurrency: config.concurrency || DEFAULT_CONFIG.concurrency,
  }

  const encryptionStore = useEncryptionStore()

  const state = ref<MultipartUploadState>({
    status: 'idle',
    progress: { uploadedBytes: 0, totalBytes: 0, percentage: 0, speed: 0, eta: 0 },
    error: null,
    uploadId: null,
    fileKey: null,
    encryptionKey: null,
    encryptionIV: null,
  })

  // Non-reactive mutable refs (shallowRef avoids deep proxy wrapping)
  const abortController = shallowRef<AbortController | null>(null)
  const partsQueue = shallowRef<PendingPart[]>([])
  const uploadedParts = shallowRef<UploadedPart[]>([])
  const activePartsProgress = shallowRef<Record<number, number>>({})
  let activeUploads = 0
  let startTime = 0
  let fileRef: File | null = null
  let isPaused = false
  // Dimensione totale del file CIFRATO (v2 = originale + 28 byte per chunk): base dei progressi.
  let totalEncryptedBytes = 0

  // Encryption refs (avoid stale closure in async complete callback)
  const encryptionKeyRef = shallowRef<CryptoKey | null>(null)
  const encryptionIVRef = shallowRef<Uint8Array | null>(null)

  const getHeaders = async () => {
    // L'API multipart usa un'istanza axios propria (`api`), SENZA l'interceptor globale,
    // quindi il token va aggiunto qui. Default: accessToken (decisione #8), altrimenti gli
    // endpoint multipart autenticati lato Express risponderebbero 401.
    const token = finalConfig.getAuthToken ? await finalConfig.getAuthToken() : Cookies.get('accessToken')
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const api = axios.create({ baseURL: finalConfig.apiBaseUrl })
  const s3Api = axios.create() // fresh instance — no auth interceptor (breaks S3 presigned URLs)

  const updateProgress = (uploadedBytes: number, totalBytes: number) => {
    const elapsed = (Date.now() - startTime) / 1000
    const speed = elapsed > 0 ? uploadedBytes / elapsed : 0
    const eta = speed > 0 ? (totalBytes - uploadedBytes) / speed : 0
    state.value.progress = {
      uploadedBytes,
      totalBytes,
      percentage: Math.min(100, (uploadedBytes / totalBytes) * 100),
      speed,
      eta,
    }
  }

  const calculateTotalProgress = () => {
    const completed = uploadedParts.value.reduce((acc, p) => acc + p.size, 0)
    const active = Object.values(activePartsProgress.value).reduce((acc, b) => acc + b, 0)
    return completed + active
  }

  const handleError = (error: Error) => {
    notify.error("Errore durante l'upload del file")
    state.value.status = 'error'
    state.value.error = error
    abortController.value?.abort()
  }

  const completeMultipartUpload = async (uploadId?: string, fileKey?: string) => {
    const finalUploadId = uploadId || state.value.uploadId
    const finalFileKey = fileKey || state.value.fileKey
    if (!finalUploadId || !finalFileKey) return

    state.value.status = 'completing'

    try {
      const sortedParts = [...uploadedParts.value].sort((a, b) => a.PartNumber - b.PartNumber)
      const headers = await getHeaders()

      await api.post<CompleteUploadResponse>('/upload/multipart/complete', {
        fileKey: finalFileKey,
        uploadId: finalUploadId,
        parts: sortedParts.map(p => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
        fileName: fileRef?.name,
        fileSize: fileRef?.size,
        fileType: fileRef?.type,
        // Metadati del formato v2: servono al download per sapere come decifrare (#6).
        formatVersion: FILE_FORMAT_VERSION,
        chunkSize: finalConfig.chunkSize,
        originalSize: fileRef?.size,
        userId: finalConfig.userId,
        userEmail: finalConfig.userEmail,
      }, { headers })

      // Store encryption key wrapped with master key via Pinia store
      const currentKey = encryptionKeyRef.value
      const currentIV = encryptionIVRef.value
      state.value.encryptionKey = currentKey
      state.value.encryptionIV = currentIV
      if (currentKey && currentIV && encryptionStore.isUnlocked) {
        try {
          const keyBase64 = await exportKeyToBase64(currentKey)
          const ivBase64 = exportIVToBase64(currentIV)
          await encryptionStore.storeKey(finalFileKey, { key: keyBase64, iv: ivBase64 })
        } catch {
          notify.error('Errore nel salvataggio della chiave di cifratura')
        }
      }

      state.value.status = 'completed'
      state.value.progress.percentage = 100
    } catch (err) {
      handleError(err as Error)
    }
  }

  const uploadPart = async (part: PendingPart, uploadId: string, fileKey: string): Promise<void> => {
    const headers = await getHeaders()
    const { data } = await api.post<GetPresignedUrlsResponse>('/upload/multipart/urls', {
      fileKey,
      uploadId,
      partNumbers: [part.partNumber],
    }, { headers })

    const url = data.urls[part.partNumber]
    if (!url) throw new Error(`No presigned URL for part ${part.partNumber}`)

    const key = encryptionKeyRef.value
    if (!key) throw new Error('Chiave di cifratura non disponibile')

    // Streaming (#6): il chunk viene letto e cifrato SOLO adesso, uno alla volta. `part.chunk` è una
    // slice LAZY del file originale → in RAM sta al massimo un chunk per upload attivo, non il file.
    const raw = await part.chunk.arrayBuffer()
    const framed = await encryptChunkFramed(raw, key, part.partNumber - 1)
    const body = new Blob([framed])

    const response = await s3Api.put(url, body, {
      headers: { 'Content-Type': 'application/octet-stream' },
      onUploadProgress: (evt) => {
        if (evt.total) {
          activePartsProgress.value = { ...activePartsProgress.value, [part.partNumber]: evt.loaded }
          updateProgress(calculateTotalProgress(), totalEncryptedBytes)
        }
      },
      signal: abortController.value?.signal,
    })

    const eTag = response.headers['etag']
    if (!eTag) throw new Error('Missing ETag from S3 response')

    const newProgress = { ...activePartsProgress.value }
    delete newProgress[part.partNumber]
    activePartsProgress.value = newProgress

    uploadedParts.value = [...uploadedParts.value, { PartNumber: part.partNumber, ETag: eTag, size: body.size }]
    activeUploads--

    updateProgress(calculateTotalProgress(), totalEncryptedBytes)
    processQueue({ uploadId, fileKey })
  }

  const processQueue = (context?: { uploadId: string; fileKey: string }) => {
    if (isPaused || abortController.value?.signal.aborted) return
    if (state.value.status === 'error') return

    const currentUploadId = context?.uploadId || state.value.uploadId
    const currentFileKey = context?.fileKey || state.value.fileKey

    if (partsQueue.value.length === 0 && activeUploads === 0) {
      completeMultipartUpload(currentUploadId || undefined, currentFileKey || undefined)
      return
    }

    while (activeUploads < finalConfig.concurrency && partsQueue.value.length > 0) {
      const queue = [...partsQueue.value]
      const part = queue.shift()
      if (!part) break
      partsQueue.value = queue

      if (!currentUploadId || !currentFileKey) {
        notify.error("Errore interno durante l'upload")
        return
      }

      activeUploads++
      uploadPart(part, currentUploadId, currentFileKey).catch(async () => {
        activeUploads--
        const newProgress = { ...activePartsProgress.value }
        delete newProgress[part.partNumber]
        activePartsProgress.value = newProgress

        if (part.retries < 3 && !abortController.value?.signal.aborted) {
          part.retries++
          partsQueue.value = [part, ...partsQueue.value]
          processQueue(context)
        } else {
          handleError(new Error(`Failed to upload part ${part.partNumber} after retries`))
        }
      })
    }
  }

  const uploadFile = async (file: File) => {
    if (state.value.status === 'uploading' || state.value.status === 'initializing') return

    fileRef = file
    abortController.value = new AbortController()
    partsQueue.value = []
    uploadedParts.value = []
    activePartsProgress.value = {}
    activeUploads = 0
    startTime = Date.now()
    isPaused = false

    state.value = {
      status: 'initializing',
      progress: { uploadedBytes: 0, totalBytes: file.size, percentage: 0, speed: 0, eta: 0 },
      error: null,
      uploadId: null,
      fileKey: null,
      encryptionKey: null,
      encryptionIV: null,
    }

    try {
      const encryptionKey = await generateAESKey()
      // IV "di file": vestigiale in v2 (gli IV veri sono per-chunk, dentro il file stesso). Lo teniamo
      // per non cambiare lo schema dello store delle chiavi né il formato dei link pubblici; NON viene
      // usato per decifrare un file v2.
      const encryptionIV = generateIV()

      encryptionKeyRef.value = encryptionKey
      encryptionIVRef.value = encryptionIV
      state.value.encryptionKey = encryptionKey
      state.value.encryptionIV = encryptionIV

      const chunkSize = finalConfig.chunkSize
      const totalParts = Math.max(1, Math.ceil(file.size / chunkSize))
      totalEncryptedBytes = encryptedSizeV2(file.size, chunkSize)

      const headers = await getHeaders()
      const { data: initData } = await api.post<InitUploadResponse>('/upload/multipart/init', {
        fileName: file.name,
        fileType: file.type,
        fileSize: totalEncryptedBytes,
        originalSize: file.size,
        isEncrypted: true,
        formatVersion: FILE_FORMAT_VERSION,
        chunkSize,
        userId: finalConfig.userId,
      }, { headers })

      state.value.status = 'uploading'
      state.value.uploadId = initData.uploadId
      state.value.fileKey = initData.fileKey

      const existingPartNumbers = new Set((initData.existingParts || []).map(p => p.PartNumber))
      if (initData.existingParts) {
        uploadedParts.value = initData.existingParts
        updateProgress(calculateTotalProgress(), totalEncryptedBytes)
      }

      // Le parti in coda sono slice LAZY del file ORIGINALE: niente viene letto né cifrato finché
      // uploadPart non le processa, una alla volta (#6 — niente più file intero in RAM).
      const newQueue: PendingPart[] = []
      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1
        if (existingPartNumbers.has(partNumber)) continue
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        newQueue.push({ partNumber, chunk: file.slice(start, end), retries: 0 })
      }
      partsQueue.value = newQueue

      processQueue({ uploadId: initData.uploadId, fileKey: initData.fileKey })
    } catch (err) {
      handleError(err as Error)
    }
  }

  const pauseUpload = () => {
    if (state.value.status === 'uploading') {
      isPaused = true
      state.value.status = 'paused'
    }
  }

  const resumeUpload = () => {
    if (state.value.status === 'paused') {
      isPaused = false
      state.value.status = 'uploading'
      processQueue()
    }
  }

  const resetUpload = () => {
    state.value = {
      status: 'idle',
      progress: { uploadedBytes: 0, totalBytes: 0, percentage: 0, speed: 0, eta: 0 },
      error: null,
      uploadId: null,
      fileKey: null,
      encryptionKey: null,
      encryptionIV: null,
    }
    fileRef = null
    abortController.value = null
    partsQueue.value = []
    uploadedParts.value = []
    activePartsProgress.value = {}
    activeUploads = 0
    totalEncryptedBytes = 0
    encryptionKeyRef.value = null
    encryptionIVRef.value = null
  }

  const abortUpload = async () => {
    abortController.value?.abort()
    if (state.value.uploadId && state.value.fileKey) {
      try {
        const headers = await getHeaders()
        await api.post('/upload/multipart/abort', {
          fileKey: state.value.fileKey,
          uploadId: state.value.uploadId,
        }, { headers })
      } catch { /* ignore */ }
    }
    resetUpload()
  }

  const getEncryptionData = async (): Promise<{ key: string; iv: string } | null> => {
    if (!state.value.encryptionKey || !state.value.encryptionIV) return null
    return {
      key: await exportKeyToBase64(state.value.encryptionKey),
      iv: exportIVToBase64(state.value.encryptionIV),
    }
  }

  return {
    state,
    uploadFile,
    pauseUpload,
    resumeUpload,
    abortUpload,
    resetUpload,
    getEncryptionData,
    isUploading: () => ['uploading', 'initializing', 'completing'].includes(state.value.status),
  }
}
