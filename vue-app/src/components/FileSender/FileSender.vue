<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { notify } from '@/src/utils/notify'
import Swal from 'sweetalert2'
import axios from 'axios'
import { notifyApiError } from '@/src/utils/apiError'
import Cookies from 'js-cookie'
import { useFileDragAndDrop } from '@/src/composables/useFileDragAndDrop'
import type { DynamoDBFile, ShareLinkData } from '@/src/types'

const emit = defineEmits<{
  fileSent: []
  linkGenerated: [data: ShareLinkData]
}>()

interface SelectedFile {
  id: string; name: string; size: string; type: string; isFromS3: boolean
  s3Key?: string; file?: File; uploadStatus?: 'pending' | 'uploading' | 'success' | 'error'
}

const selectedFiles = ref<SelectedFile[]>([])
const recipientEmails = ref<string[]>([])
const currentEmail = ref('')
const customMessage = ref('')
const isLoading = ref(false)
const s3Files = ref<DynamoDBFile[]>([])
const isLoadingS3Files = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const loadS3Files = async () => {
  isLoadingS3Files.value = true
  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/user/files/paginated`, {
      headers: { Authorization: `Bearer ${Cookies.get('idToken')}` },
      params: { page: 1, limit: 100 },
    })
    s3Files.value = data.files || []
  } catch (err) {
    notifyApiError(err, 'File non caricati', 'Non siamo riusciti a caricare i tuoi file.')
  } finally {
    isLoadingS3Files.value = false
  }
}

onMounted(loadS3Files)

const { isDragOver, dragProps, dropZoneRef } = useFileDragAndDrop({
  onFilesDropped: (files: File[]) => {
    const newFiles: SelectedFile[] = files.map((file, i) => ({
      id: `local-${Date.now()}-${i}`,
      name: file.name,
      size: formatSize(file.size),
      type: file.type,
      isFromS3: false,
      file,
      uploadStatus: 'pending',
    }))
    selectedFiles.value = [...selectedFiles.value, ...newFiles]
  },
})

const handleFileInput = (e: Event) => {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  const newFiles: SelectedFile[] = Array.from(files).map((file, i) => ({
    id: `local-${Date.now()}-${i}`,
    name: file.name,
    size: formatSize(file.size),
    type: file.type,
    isFromS3: false,
    file,
    uploadStatus: 'pending',
  }))
  selectedFiles.value = [...selectedFiles.value, ...newFiles]
}

const addS3File = (s3File: DynamoDBFile) => {
  if (selectedFiles.value.some(f => f.s3Key === s3File.s3Key)) return
  selectedFiles.value.push({
    id: `s3-${s3File.s3Key}`,
    name: s3File.fileName || s3File.originalName || 'File',
    size: s3File.formattedSize || s3File.fileSize || '',
    type: s3File.fileType,
    isFromS3: true,
    s3Key: s3File.s3Key,
    uploadStatus: 'success',
  })
}

const removeFile = (id: string) => { selectedFiles.value = selectedFiles.value.filter(f => f.id !== id) }

const addEmail = () => {
  const email = currentEmail.value.trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { notify.error('Email non valida'); return }
  if (recipientEmails.value.includes(email)) { notify.warning('Email già aggiunta'); return }
  recipientEmails.value.push(email)
  currentEmail.value = ''
}

const removeEmail = (email: string) => { recipientEmails.value = recipientEmails.value.filter(e => e !== email) }

const handleSend = async () => {
  if (recipientEmails.value.length === 0) { notify.error('Aggiungi almeno un destinatario'); return }
  if (selectedFiles.value.length === 0) { notify.error('Seleziona almeno un file'); return }

  isLoading.value = true
  try {
    await axios.post(`${import.meta.env.VITE_API_URL}/share/send`, {
      recipients: recipientEmails.value,
      files: selectedFiles.value.map(f => ({ s3Key: f.s3Key, isFromS3: f.isFromS3, fileName: f.name })),
      message: customMessage.value,
    }, { headers: { Authorization: `Bearer ${Cookies.get('idToken')}` } })

    await Swal.fire({ title: 'File inviati!', text: 'I file sono stati inviati con successo.', icon: 'success', timer: 2000, showConfirmButton: false })
    selectedFiles.value = []
    recipientEmails.value = []
    customMessage.value = ''
    emit('fileSent')
  } catch (err) {
    notifyApiError(err, 'Invio non riuscito', "Errore durante l'invio")
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Destinatari -->
    <div>
      <h3 class="text-white font-semibold mb-3">Destinatari</h3>
      <div class="flex gap-2 mb-2">
        <InputText
          v-model="currentEmail"
          type="email"
          placeholder="email@esempio.com"
          fluid
          class="flex-1"
          @keydown.enter.prevent="addEmail"
        />
        <Button icon="pi pi-plus" @click="addEmail" />
      </div>
      <div class="flex flex-wrap gap-2">
        <Chip v-for="email in recipientEmails" :key="email" :label="email" removable @remove="removeEmail(email)" />
      </div>
    </div>

    <!-- Drag & Drop -->
    <div>
      <h3 class="text-white font-semibold mb-3">File</h3>
      <div
        ref="dropZoneRef"
        v-bind="dragProps"
        :class="['border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all', isDragOver ? 'border-brand-500 bg-deep-900' : 'border-white/10 hover:border-brand-500']"
        @click="fileInputRef?.click()"
      >
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileInput" />
        <i class="pi pi-inbox text-primary text-3xl" />
        <p class="text-haze-200 mt-2">{{ isDragOver ? 'Rilascia qui' : 'Trascina file o clicca per selezionare' }}</p>
      </div>
    </div>

    <!-- File S3 -->
    <div v-if="!isLoadingS3Files && s3Files.length > 0">
      <h4 class="text-haze-200 font-medium mb-2">Seleziona dai tuoi file caricati</h4>
      <div class="max-h-32 overflow-y-auto space-y-1">
        <div
          v-for="file in s3Files"
          :key="file.s3Key"
          class="flex items-center justify-between p-2 rounded bg-black/25 hover:bg-deep-900 cursor-pointer"
          @click="addS3File(file)"
        >
          <span class="text-white text-sm truncate">{{ file.fileName || file.originalName }}</span>
          <span class="text-haze-400 text-xs ml-2 flex-shrink-0">{{ file.formattedSize || file.fileSize }}</span>
        </div>
      </div>
    </div>

    <!-- File selezionati -->
    <div v-if="selectedFiles.length > 0">
      <h4 class="text-haze-200 font-medium mb-2">File selezionati</h4>
      <div class="space-y-1">
        <div v-for="file in selectedFiles" :key="file.id" class="flex items-center gap-2 p-2 rounded bg-black/25">
          <i class="pi pi-file text-primary flex-shrink-0" />
          <span class="text-white text-sm truncate flex-1">{{ file.name }}</span>
          <span class="text-haze-400 text-xs">{{ file.size }}</span>
          <Button icon="pi pi-trash" text severity="danger" size="small" @click="removeFile(file.id)" />
        </div>
      </div>
    </div>

    <!-- Messaggio -->
    <div>
      <label class="block text-haze-200 font-medium text-sm mb-1">Messaggio (opzionale)</label>
      <Textarea v-model="customMessage" :rows="2" placeholder="Scrivi un messaggio per i destinatari..." fluid />
    </div>

    <!-- Invio -->
    <div class="flex justify-end">
      <Button
        :label="isLoading ? 'Invio in corso...' : 'Invia File'"
        :icon="isLoading ? undefined : 'pi pi-send'"
        size="large"
        :loading="isLoading"
        :disabled="selectedFiles.length === 0 || recipientEmails.length === 0"
        @click="handleSend"
      />
    </div>
  </div>
</template>
