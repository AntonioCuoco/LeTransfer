export type TransferType = 'upload' | 'download'
export type TransferStatus = 'queued' | 'initializing' | 'uploading' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled'

export interface TransferProgress {
  percentage: number
  loadedBytes: number
  totalBytes: number
  speed?: number
  eta?: number
}

export interface TransferControl {
  pause: () => void
  resume: () => void
  cancel: () => void
}

export interface TransferItem {
  id: string
  type: TransferType
  name: string
  size?: number
  mimeType?: string
  status: TransferStatus
  progress: TransferProgress
  error?: Error | null
  fileOrUrl: File | string
  resultKey?: string
  controls?: TransferControl
  createdAt: number
}
