<script setup lang="ts">
import { computed } from 'vue'
import { useTransferStore } from '@/src/stores/transfer'

const store = useTransferStore()
const { transfers, pauseTransfer, resumeTransfer, cancelTransfer, clearCompleted } = store

const downloadsCount = computed(() =>
  transfers.filter(t => t.type === 'download' && ['initializing', 'downloading', 'paused'].includes(t.status)).length
)
const hasFinished = computed(() =>
  transfers.some(t => ['completed', 'cancelled', 'error'].includes(t.status))
)

const formatBytes = (bytes: number, decimals = 2) => {
  if (!bytes) return '0 Bytes'
  const k = 1024
  const dm = Math.max(0, decimals)
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    paused: 'In Pausa', queued: 'In Coda', cancelled: 'Annullato', completed: 'Completato', error: 'Errore',
  }
  return map[status] || status
}
</script>

<template>
  <div class="flex flex-col w-full gap-4 transition-all duration-300">
    <div class="flex justify-between items-center">
      <div>
        <p class="font-semibold text-haze-200">Stato Trasferimenti</p>
        <p v-if="downloadsCount > 0" class="text-xs text-brand-400">{{ downloadsCount }} Download in corso</p>
      </div>
      <button v-if="hasFinished" class="text-xs text-haze-400 hover:text-white flex items-center gap-1" @click="clearCompleted">
        <i class="pi pi-trash" /> Pulisci
      </button>
    </div>

    <div class="flex flex-col gap-3 overflow-y-auto pr-2 flex-1 min-h-0">
      <div v-if="transfers.length === 0" class="flex flex-col items-center justify-center h-32 text-haze-400 border border-dashed border-white/10 rounded-lg">
        <p>Nessun trasferimento attivo</p>
      </div>
      <div v-for="t in transfers" :key="t.id" class="bg-deep-900 p-3 rounded border border-white/10 flex flex-col gap-2">
        <div class="flex justify-between items-start">
          <div class="flex items-center gap-2 overflow-hidden">
            <i v-if="t.type === 'upload'" class="pi pi-cloud-upload text-green-400" />
            <i v-else class="pi pi-cloud-download text-green-400" />
            <div class="flex flex-col min-w-0">
              <span class="text-haze-200 font-medium text-sm truncate" :title="t.name">{{ t.name }}</span>
              <span class="text-xs text-haze-400">{{ formatBytes(t.progress.loadedBytes) }} / {{ formatBytes(t.progress.totalBytes) }}</span>
            </div>
          </div>
          <div class="text-xs font-mono text-white">{{ t.status === 'completed' ? '100%' : `${t.progress.percentage.toFixed(1)}%` }}</div>
        </div>

        <div class="h-1.5 w-full bg-black/25 rounded-full overflow-hidden">
          <div
            :class="['h-full transition-all duration-300 rounded-full',
              t.status === 'error' || t.status === 'cancelled' ? 'bg-red-500' :
              t.status === 'completed' ? 'bg-green-500' :
              t.type === 'download' ? 'bg-green-400' : 'bg-brand-500',
              (t.status === 'uploading' || t.status === 'downloading') ? 'animate-pulse' : '']"
            :style="{ width: `${t.progress.percentage}%` }"
          />
        </div>

        <div class="flex justify-between items-center text-xs">
          <div class="flex items-center gap-2">
            <span v-if="t.status === 'uploading' || t.status === 'downloading'" class="text-haze-400">
              {{ t.progress.speed ? `${formatBytes(t.progress.speed)}/s` : 'Calcolo...' }}
            </span>
            <span
              v-else
              :class="t.status === 'error' ? 'text-red-400' : t.status === 'completed' ? 'text-green-400' : 'text-haze-400'"
            >
              {{ statusLabel(t.status) }}
            </span>
          </div>
          <div class="flex gap-2">
            <template v-if="t.status === 'uploading' || t.status === 'downloading'">
              <button v-if="t.controls?.pause" class="text-yellow-500 hover:text-yellow-400" title="Pausa" @click="pauseTransfer(t.id)"><i class="pi pi-pause-circle" /></button>
              <button class="text-red-500 hover:text-red-400" title="Annulla" @click="cancelTransfer(t.id)"><i class="pi pi-stop-circle" /></button>
            </template>
            <button v-if="t.status === 'paused'" class="text-green-500 hover:text-green-400" title="Riprendi" @click="resumeTransfer(t.id)"><i class="pi pi-play-circle" /></button>
            <i v-if="['completed', 'cancelled', 'error'].includes(t.status)" class="pi pi-check-circle" :class="t.status === 'completed' ? 'text-green-400' : 'text-transparent'" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
