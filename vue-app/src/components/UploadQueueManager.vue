<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import { useTransferStore } from '@/src/stores/transfer'
import { useS3MultipartUpload } from '@/src/composables/useS3MultipartUpload'
import type { TransferStatus } from '@/src/types/transfer'
import type { UploadStatus } from '@/src/types/multipart-upload'

const MAX_SLOTS = 9 // covers max 3 large + 6 small concurrent uploads

const store = useTransferStore()

// Pre-allocate pool at setup time (composables cannot be called inside functions)
const pool = Array.from({ length: MAX_SLOTS }, () => useS3MultipartUpload())
const assignments = new Map<number, string>() // slot → transferId
const stopWatchers = new Map<number, () => void>() // slot → watcher stop fn

const getFreeSlot = (): number | null => {
  for (let i = 0; i < pool.length; i++) {
    if (!assignments.has(i)) return i
  }
  return null
}

const mapStatus = (s: UploadStatus): TransferStatus => {
  switch (s) {
    case 'uploading':
    case 'completing': return 'uploading'
    case 'completed': return 'completed'
    case 'error': return 'error'
    case 'aborted': return 'cancelled'
    case 'paused': return 'paused'
    default: return 'initializing'
  }
}

const freeSlot = (slotIdx: number) => {
  stopWatchers.get(slotIdx)?.() // stop watcher before resetting state
  stopWatchers.delete(slotIdx)
  assignments.delete(slotIdx)
  pool[slotIdx].resetUpload()
}

watch(
  () => store.transfers,
  (transfers) => {
    for (const transfer of transfers) {
      if (
        transfer.type !== 'upload' ||
        transfer.status !== 'initializing' ||
        !(transfer.fileOrUrl instanceof File)
      ) continue

      if ([...assignments.values()].includes(transfer.id)) continue

      const slotIdx = getFreeSlot()
      if (slotIdx === null) break // pool full — wait for next tick when a slot frees

      const instance = pool[slotIdx]
      const file = transfer.fileOrUrl
      const transferId = transfer.id

      assignments.set(slotIdx, transferId)

      store.registerControls(transferId, {
        pause: () => instance.pauseUpload(),
        resume: () => instance.resumeUpload(),
        cancel: () => { instance.abortUpload() },
      })

      const stopWatch = watch(
        instance.state,
        (s) => {
          // If the transfer was cancelled externally, just clean up
          const current = store.transfers.find(t => t.id === transferId)
          if (!current || ['completed', 'cancelled', 'error'].includes(current.status)) {
            freeSlot(slotIdx)
            return
          }

          store.updateTransfer(transferId, {
            status: mapStatus(s.status),
            progress: {
              percentage: s.progress.percentage,
              loadedBytes: s.progress.uploadedBytes,
              totalBytes: s.progress.totalBytes,
              speed: s.progress.speed,
              eta: s.progress.eta,
            },
            ...(s.error ? { error: s.error } : {}),
          })

          if (['completed', 'error', 'aborted'].includes(s.status)) {
            freeSlot(slotIdx)
          }
        },
        { deep: true },
      )

      stopWatchers.set(slotIdx, stopWatch)

      instance.uploadFile(file).catch(() => {
        // error already reflected in instance.state.status = 'error'
      })
    }
  },
  { deep: true },
)

onUnmounted(() => {
  for (const [slotIdx] of assignments) {
    pool[slotIdx].abortUpload().catch(() => {})
    freeSlot(slotIdx)
  }
})
</script>

<template>
  <!-- Manager invisibile: nessun output nel DOM (elemento sempre non renderizzato). -->
  <i v-if="false" />
</template>
