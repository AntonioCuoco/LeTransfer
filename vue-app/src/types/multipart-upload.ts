export interface UploadPart {
  ETag: string
  PartNumber: number
}

export interface UploadedPart extends UploadPart {
  size: number
}

export interface MultipartUploadConfig {
  chunkSize: number
  concurrency: number
  apiBaseUrl: string
  getAuthToken?: () => Promise<string | null>
  userId?: string
  userEmail?: string
}

export type UploadStatus = 'idle' | 'initializing' | 'uploading' | 'completing' | 'completed' | 'error' | 'paused' | 'aborted'

export interface UploadProgress {
  uploadedBytes: number
  totalBytes: number
  percentage: number
  speed: number
  eta: number
}

export interface MultipartUploadState {
  status: UploadStatus
  progress: UploadProgress
  error: Error | null
  uploadId: string | null
  fileKey: string | null
  encryptionKey: CryptoKey | null
  encryptionIV: Uint8Array | null
}

export interface InitUploadResponse {
  uploadId: string
  fileKey: string
  existingParts?: UploadedPart[]
  /** Invio rapido accettato: la chiave del file è già salvata dal server. */
  keyStored?: boolean
  /** Invio rapido: gli URL delle prime parti. */
  urls?: Record<number, string>
}

export interface GetPresignedUrlsResponse {
  urls: Record<number, string>
}

export interface CompleteUploadResponse {
  location: string
  key: string
}

export interface AbortUploadResponse {
  status: string
}
