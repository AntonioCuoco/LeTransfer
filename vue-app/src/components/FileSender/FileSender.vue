<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { UploadOutlined, SendOutlined, FileOutlined, DeleteOutlined, PlusOutlined, InboxOutlined } from '@ant-design/icons-vue'
import Swal from 'sweetalert2'
import axios from 'axios'
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
  } catch { /* silently ignore */ } finally {
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
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { message.error('Email non valida'); return }
  if (recipientEmails.value.includes(email)) { message.warning('Email già aggiunta'); return }
  recipientEmails.value.push(email)
  currentEmail.value = ''
}

const removeEmail = (email: string) => { recipientEmails.value = recipientEmails.value.filter(e => e !== email) }

const handleSend = async () => {
  if (recipientEmails.value.length === 0) { message.error('Aggiungi almeno un destinatario'); return }
  if (selectedFiles.value.length === 0) { message.error('Seleziona almeno un file'); return }

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
  } catch {
    message.error("Errore durante l'invio")
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
        <input
          v-model="currentEmail"
          type="email"
          placeholder="email@esempio.com"
          class="flex-1 p-2 pl-3 rounded-lg bg-[#1a1625] border border-[#4a4554] text-white placeholder:text-[#676178] focus:outline-none focus:border-[#724CF9]"
          @keydown.enter.prevent="addEmail"
        />
        <a-button type="primary" class="!bg-[#724CF9] !border-none" @click="addEmail">
          <template #icon><PlusOutlined /></template>
        </a-button>
      </div>
      <div class="flex flex-wrap gap-2">
        <a-tag v-for="email in recipientEmails" :key="email" closable class="!bg-[#724CF9]/20 !text-[#a78bfa] !border-[#724CF9]/30" @close="removeEmail(email)">
          {{ email }}
        </a-tag>
      </div>
    </div>

    <!-- Drag & Drop -->
    <div>
      <h3 class="text-white font-semibold mb-3">File</h3>
      <div
        ref="dropZoneRef"
        v-bind="dragProps"
        :class="['border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all', isDragOver ? 'border-[#724CF9] bg-[#2c2638]' : 'border-[#4a4554] hover:border-[#724CF9]']"
        @click="fileInputRef?.click()"
      >
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileInput" />
        <InboxOutlined class="!text-[#724CF9] text-3xl" />
        <p class="text-[#DBD4D3] mt-2">{{ isDragOver ? 'Rilascia qui' : 'Trascina file o clicca per selezionare' }}</p>
      </div>
    </div>

    <!-- File S3 -->
    <div v-if="!isLoadingS3Files && s3Files.length > 0">
      <h4 class="text-[#DBD4D3] font-medium mb-2">Seleziona dai tuoi file caricati</h4>
      <div class="max-h-32 overflow-y-auto space-y-1">
        <div
          v-for="file in s3Files"
          :key="file.s3Key"
          class="flex items-center justify-between p-2 rounded bg-[#1a1625] hover:bg-[#2c2638] cursor-pointer"
          @click="addS3File(file)"
        >
          <span class="text-white text-sm truncate">{{ file.fileName || file.originalName }}</span>
          <span class="text-[#9ca3af] text-xs ml-2 flex-shrink-0">{{ file.formattedSize || file.fileSize }}</span>
        </div>
      </div>
    </div>

    <!-- File selezionati -->
    <div v-if="selectedFiles.length > 0">
      <h4 class="text-[#DBD4D3] font-medium mb-2">File selezionati</h4>
      <div class="space-y-1">
        <div v-for="file in selectedFiles" :key="file.id" class="flex items-center gap-2 p-2 rounded bg-[#1a1625]">
          <FileOutlined class="!text-[#724CF9] flex-shrink-0" />
          <span class="text-white text-sm truncate flex-1">{{ file.name }}</span>
          <span class="text-[#9ca3af] text-xs">{{ file.size }}</span>
          <a-button type="text" danger size="small" @click="removeFile(file.id)"><DeleteOutlined /></a-button>
        </div>
      </div>
    </div>

    <!-- Messaggio -->
    <div>
      <label class="block text-[#DBD4D3] font-medium text-sm mb-1">Messaggio (opzionale)</label>
      <a-textarea v-model:value="customMessage" :rows="2" placeholder="Scrivi un messaggio per i destinatari..." class="!bg-[#1a1625] !border-[#4a4554] !text-white" />
    </div>

    <!-- Invio -->
    <div class="flex justify-end">
      <a-button
        type="primary"
        size="large"
        :loading="isLoading"
        :disabled="selectedFiles.length === 0 || recipientEmails.length === 0"
        class="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none !text-white"
        style="border-radius: 10px; height: 48px; padding: 0 32px"
        @click="handleSend"
      >
        <template #icon><SendOutlined /></template>
        {{ isLoading ? 'Invio in corso...' : 'Invia File' }}
      </a-button>
    </div>
  </div>
</template>
