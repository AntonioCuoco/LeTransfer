import { defineStore } from 'pinia'
import { ref, watch, shallowRef } from 'vue'
import type { TransferItem, TransferControl, TransferStatus, TransferProgress } from '@/src/types/transfer'
import axios from 'axios'
import { notifyApiError } from '@/src/utils/apiError'

const LIMITS = {
  uploadLarge: { files: 3, parts: 2 },
  uploadSmall: { files: 6 },
  download: { files: 2 },
}

// --- DownloadRunner class ---
class DownloadRunner {
  private abortController: AbortController | null = null
  private started = false

  constructor(
    private transfer: TransferItem,
    private updateTransfer: (id: string, updates: Partial<TransferItem>) => void,
    registerControls: (id: string, controls: TransferControl) => void,
  ) {
    registerControls(transfer.id, {
      pause: () => {},
      resume: () => {},
      cancel: () => this.abortController?.abort(),
    })
    this.start()
  }

  private async start() {
    if (this.started) return
    this.started = true

    const url = this.transfer.fileOrUrl as string
    const filename = this.transfer.name
    this.abortController = new AbortController()

    this.updateTransfer(this.transfer.id, { status: 'downloading' })

    try {
      const response = await axios.get(url, {
        responseType: 'blob',
        signal: this.abortController.signal,
        onDownloadProgress: (evt) => {
          const total = evt.total || this.transfer.size || 0
          const loaded = evt.loaded
          const percentage = total > 0 ? (loaded / total) * 100 : 0
          this.updateTransfer(this.transfer.id, {
            status: 'downloading',
            progress: { percentage, loadedBytes: loaded, totalBytes: total, speed: evt.rate, eta: evt.estimated },
          })
        },
      })

      const blob = new Blob([response.data], { type: (response.headers['content-type'] as string) || undefined })
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)

      this.updateTransfer(this.transfer.id, { status: 'completed', progress: { ...this.transfer.progress, percentage: 100 } })
    } catch (err) {
      if (axios.isCancel(err) || (err instanceof Error && err.name === 'AbortError')) {
        this.updateTransfer(this.transfer.id, { status: 'cancelled' })
      } else {
        notifyApiError(err, 'Download non riuscito', 'Errore durante il download del file')
        this.updateTransfer(this.transfer.id, { status: 'error', error: err as Error })
      }
    }
  }

  destroy() {
    this.abortController?.abort()
  }
}

// --- UploadRunner class ---
// The actual upload logic lives in useS3MultipartUpload composable,
// which cannot be used inside a class. This is a thin shell that will be
// replaced when useS3MultipartUpload composable is created (Fase 2).
// For now it acts as a placeholder so the store structure is complete.
class UploadRunner {
  destroy() {}
}

// --- Store ---
export const useTransferStore = defineStore('transfer', () => {
  const transfers = ref<TransferItem[]>([])
  // Runners live outside reactive state to avoid Vue trying to make them reactive
  const runners = shallowRef(new Map<string, DownloadRunner | UploadRunner>())

  function updateTransfer(id: string, updates: Partial<TransferItem>) {
    const idx = transfers.value.findIndex(t => t.id === id)
    if (idx !== -1) {
      transfers.value[idx] = { ...transfers.value[idx], ...updates }
    }
  }

  function registerControls(id: string, controls: TransferControl) {
    updateTransfer(id, { controls })
  }

  function addUpload(file: File): string {
    const id = crypto.randomUUID()
    transfers.value.unshift({
      id,
      type: 'upload',
      name: file.name,
      size: file.size,
      mimeType: file.type,
      status: 'queued',
      progress: { percentage: 0, loadedBytes: 0, totalBytes: file.size, speed: 0, eta: 0 },
      fileOrUrl: file,
      createdAt: Date.now(),
    })
    return id
  }

  function addDownload(url: string, fileName: string, fileSize?: number): string {
    const id = crypto.randomUUID()
    transfers.value.unshift({
      id,
      type: 'download',
      name: fileName,
      size: fileSize || 0,
      status: 'queued',
      progress: { percentage: 0, loadedBytes: 0, totalBytes: fileSize || 0 },
      fileOrUrl: url,
      createdAt: Date.now(),
    })
    return id
  }

  function pauseTransfer(id: string) {
    const item = transfers.value.find(t => t.id === id)
    item?.controls?.pause()
    updateTransfer(id, { status: 'paused' })
  }

  function resumeTransfer(id: string) {
    const item = transfers.value.find(t => t.id === id)
    item?.controls?.resume()
    const status: TransferStatus = item?.type === 'upload' ? 'uploading' : 'downloading'
    updateTransfer(id, { status })
  }

  function cancelTransfer(id: string) {
    const item = transfers.value.find(t => t.id === id)
    if (item?.status === 'queued') {
      updateTransfer(id, { status: 'cancelled' })
    } else {
      item?.controls?.cancel()
      updateTransfer(id, { status: 'cancelled' })
    }
    runners.value.get(id)?.destroy()
    runners.value.delete(id)
  }

  function clearCompleted() {
    transfers.value = transfers.value.filter(
      t => !['completed', 'cancelled', 'error'].includes(t.status)
    )
  }

  // Scheduler: replaces the React useEffect on transfers
  watch(transfers, (list) => {
    const activeUploadsLarge = list.filter(
      t => t.type === 'upload' && t.fileOrUrl instanceof File && t.fileOrUrl.size > 100 * 1024 * 1024
        && ['initializing', 'uploading'].includes(t.status)
    ).length

    const activeUploadsSmall = list.filter(
      t => t.type === 'upload' && t.fileOrUrl instanceof File && t.fileOrUrl.size <= 100 * 1024 * 1024
        && ['initializing', 'uploading'].includes(t.status)
    ).length

    const activeDownloads = list.filter(
      t => t.type === 'download' && ['initializing', 'downloading'].includes(t.status)
    ).length

    const queued = [...list].reverse().filter(t => t.status === 'queued')

    queued.forEach(item => {
      if (runners.value.has(item.id)) return // Runner already spawned

      if (item.type === 'upload' && item.fileOrUrl instanceof File) {
        const isLarge = item.fileOrUrl.size > 100 * 1024 * 1024
        const canStart = isLarge
          ? activeUploadsLarge < LIMITS.uploadLarge.files
          : activeUploadsSmall < LIMITS.uploadSmall.files

        if (canStart) {
          updateTransfer(item.id, { status: 'initializing' })
          // UploadRunner will be wired with useS3MultipartUpload in Fase 2
          const runner = new UploadRunner()
          runners.value.set(item.id, runner)
        }
      } else if (item.type === 'download') {
        if (activeDownloads < LIMITS.download.files) {
          updateTransfer(item.id, { status: 'initializing' })
          const runner = new DownloadRunner(item, updateTransfer, registerControls)
          runners.value.set(item.id, runner)
        }
      }
    })

    // Clean up runners for finished transfers
    runners.value.forEach((_, id) => {
      const transfer = list.find(t => t.id === id)
      if (!transfer || ['completed', 'cancelled', 'error'].includes(transfer.status)) {
        runners.value.get(id)?.destroy()
        runners.value.delete(id)
      }
    })
  }, { deep: true })

  return {
    transfers,
    addUpload,
    addDownload,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    clearCompleted,
    updateTransfer,
    registerControls,
  }
})

export type { TransferProgress }
