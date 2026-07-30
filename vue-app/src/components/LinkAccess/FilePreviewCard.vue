<script setup lang="ts">
import { computed } from 'vue'

/**
 * Pannello di download dopo l'accesso. Non ripete l'identità del file (nome, peso,
 * tipo): quella sta una sola volta, in cima alla carta. Qui ci sono l'anteprima
 * quando è possibile, l'azione, e il progresso REALE della decifratura — la stessa
 * barra viola→menta dell'invio, così il rituale è lo stesso da entrambi i lati.
 */

const props = defineProps<{
  fileName: string
  fileType: string
  previewUrl?: string
  previewSupported?: boolean
  isDownloading?: boolean
  isDecrypting?: boolean
  decryptProgress?: number
  isDone?: boolean
  onDownload?: () => void
  onPreview?: () => void
}>()

const supportsInlinePreview = (type: string) =>
  type.startsWith('image/') || type === 'application/pdf' || type.startsWith('video/') || type.startsWith('audio/')

const canPreview = computed(() => !!props.previewSupported && !!props.previewUrl && supportsInlinePreview(props.fileType))

const busy = computed(() => !!props.isDownloading || !!props.isDecrypting)

const actionLabel = computed(() => {
  if (props.isDecrypting) return 'Decifro…'
  if (props.isDownloading) return 'Recupero i blocchi…'
  if (props.isDone) return 'Scarica di nuovo'
  return 'Decifra e scarica'
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div v-if="canPreview" class="overflow-hidden rounded-[12px] border border-[#e9e3f6] bg-[#f5f1fd]">
      <div class="flex aspect-video items-center justify-center bg-[#1f0d49]/5">
        <img v-if="fileType.startsWith('image/')" :src="previewUrl" :alt="fileName" class="max-h-full max-w-full object-contain" />
        <iframe v-else-if="fileType === 'application/pdf'" :src="previewUrl" :title="fileName" class="h-full min-h-[240px] w-full" />
        <video v-else-if="fileType.startsWith('video/')" :src="previewUrl" controls class="max-h-full max-w-full" />
        <audio v-else-if="fileType.startsWith('audio/')" :src="previewUrl" controls class="w-full max-w-md px-4" />
      </div>
    </div>

    <!-- Progresso reale della decifratura (nessuno spinner indeterminato) -->
    <div v-if="busy" class="flex flex-col gap-2">
      <div class="h-2 overflow-hidden rounded-full bg-[#e4dbf6]">
        <div
          class="h-full rounded-full bg-[linear-gradient(90deg,#7c4dff,#37e7c4)] transition-all duration-150"
          :class="isDecrypting ? '' : 'animate-pulse'"
          :style="{ width: isDecrypting ? `${decryptProgress ?? 0}%` : '100%' }"
        />
      </div>
      <div class="flex justify-between font-mono text-[0.7rem] text-[#6a5f8c]">
        <span>{{ isDecrypting ? `${decryptProgress ?? 0}%` : '···' }}</span>
        <span>il server ha mandato solo ciphertext</span>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        v-if="canPreview && onPreview"
        type="button"
        class="lt-btn-ghost flex-none"
        :disabled="busy"
        @click="onPreview"
      >
        Anteprima
      </button>
      <button type="button" class="lt-btn flex-1" :disabled="busy" @click="onDownload">
        {{ actionLabel }}
      </button>
    </div>
  </div>
</template>
