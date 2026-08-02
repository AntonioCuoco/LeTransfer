<script setup lang="ts">
import { ref } from 'vue'
import { useTransferStore } from '@/src/stores/transfer'
import Swal from 'sweetalert2'

const props = defineProps<{
  apiBaseUrl?: string
  onUploadComplete?: () => void
}>()

const store = useTransferStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragOver = ref(false)

const handleFiles = (files: FileList | File[]) => {
  const arr = Array.from(files)
  arr.forEach(f => store.addUpload(f))
  if (arr.length > 0) {
    Swal.fire({ title: 'Aggiunto alla coda', text: `${arr.length} file aggiunto/i alla coda di upload.`, icon: 'success', timer: 2000, showConfirmButton: false })
    props.onUploadComplete?.()
  }
}

const handleDrop = (e: DragEvent) => {
  isDragOver.value = false
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (files?.length) handleFiles(files)
}
</script>

<template>
  <div class="space-y-4">
    <div
      :class="['border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all', isDragOver ? 'border-brand-500 bg-deep-900 scale-[1.02]' : 'border-white/10 hover:border-brand-500']"
      @click="fileInputRef?.click()"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop="handleDrop"
    >
      <input ref="fileInputRef" type="file" multiple class="hidden" @change="(e) => handleFiles((e.target as HTMLInputElement).files!)" />
      <div class="flex flex-col items-center space-y-3">
        <i class="pi pi-inbox text-primary text-4xl" />
        <div>
          <p class="text-haze-200 font-medium">{{ isDragOver ? 'Rilascia qui' : 'Trascina file o clicca per selezionare' }}</p>
          <p class="text-haze-400 text-sm mt-1">Consigliato per file grandi (>100MB) • Upload multipart automatico</p>
        </div>
        <Button label="Seleziona File" icon="pi pi-cloud-upload" @click.stop="fileInputRef?.click()" />
      </div>
    </div>
  </div>
</template>
