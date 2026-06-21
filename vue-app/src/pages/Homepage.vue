<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  FolderOpenOutlined, ShareAltOutlined, CloudUploadOutlined, LinkOutlined,
  FileOutlined, ClockCircleOutlined, CopyOutlined,
} from '@ant-design/icons-vue'
import Swal from 'sweetalert2'
import BentoCard from '@/src/components/ui/BentoCard.vue'
import StatCard from '@/src/components/ui/StatCard.vue'
import TransferStatusPanel from '@/src/components/TransferStatusPanel.vue'
import FileSender from '@/src/components/FileSender/FileSender.vue'
import MultipartFileUploader from '@/src/components/MultipartFileUploader.vue'
import ShareFileModal from '@/src/components/ShareFileModal.vue'
import { useTransferStore } from '@/src/stores/transfer'
import { useFolderDragAndDrop } from '@/src/composables/useFolderDragAndDrop'
import { useFileFromDynamoDB } from '@/src/composables/useFileFromDynamoDB'
import type { DynamoDBFile, ShareLinkData } from '@/src/types'

const store = useTransferStore()
const { isUploading, loadFiles } = useFileFromDynamoDB()

const shareModalVisible = ref(false)
const shareData = ref<ShareLinkData | null>(null)
const shareUserModalVisible = ref(false)
const fileToShare = ref<DynamoDBFile | null>(null)
const previewFiles = ref<File[]>([])
const previewModalVisible = ref(false)
const stats = ref({ totalFiles: 0, sharedFiles: 0, totalSize: '0 B' })
const filesLoaded = ref(false)
const apiMultipartUrl = import.meta.env.VITE_API_MULTIPART_URL as string

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const { isDragOver, dragProps, dropZoneRef } = useFolderDragAndDrop({
  onFilesDropped: (files: File[]) => {
    if (files.length > 0) { previewFiles.value = files; previewModalVisible.value = true }
  },
  multiple: true,
  disabled: false,
})

const handleFilesConfirm = (files: File[]) => {
  previewModalVisible.value = false
  files.forEach(f => store.addUpload(f))
  Swal.fire({ title: 'Aggiunti alla Coda', text: `${files.length} file aggiunti alla coda di upload.`, icon: 'success', timer: 2000, showConfirmButton: false })
  previewFiles.value = []
}

const copyToClipboard = async (text: string) => {
  try { await navigator.clipboard.writeText(text); message.success('Link copiato negli appunti!') }
  catch { message.error('Errore durante la copia del link') }
}

const handleLoadFiles = async () => {
  const result = await loadFiles({ limit: 100 })
  if (result) filesLoaded.value = true
}

onMounted(async () => {
  const result = await loadFiles({ limit: 100 })
  if (result?.files) {
    filesLoaded.value = true
    const totalSize = result.files.reduce((acc: number, f: DynamoDBFile) => {
      const s = parseInt(String(f.fileSize) || '0')
      return acc + (isNaN(s) ? 0 : s)
    }, 0)
    stats.value = {
      totalFiles: result.files.length,
      sharedFiles: result.files.filter((f: DynamoDBFile) => f.isShared).length,
      totalSize: formatSize(totalSize),
    }
  }
})
</script>

<template>
  <div class="p-6 max-w-[1400px] mx-auto">
    <header class="mb-6">
      <h1 class="m-0 text-3xl font-bold text-white">Dashboard</h1>
      <p class="mt-1 mb-0 text-base text-[#9ca3af]">Gestisci e condividi i tuoi file</p>
    </header>

    <!-- Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <StatCard :value="stats.totalFiles" label="File Totali" :icon="FolderOpenOutlined" trend="up" change="+12%" />
      <StatCard :value="stats.sharedFiles" label="File Condivisi" :icon="ShareAltOutlined" variant="primary" />
      <StatCard :value="stats.totalSize" label="Spazio Utilizzato" :icon="CloudUploadOutlined" subtext="di 10 GB disponibili" />
    </div>

    <!-- Bento Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <!-- Folder Upload Card -->
      <BentoCard size="2x1" title="Carica Cartella" subtitle="Trascina una cartella o clicca per selezionare" :icon="FolderOpenOutlined">
        <div
          ref="dropZoneRef"
          v-bind="dragProps"
          :class="['border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 bg-[#4a4554]/20',
            isDragOver ? 'border-[#724CF9] bg-[#2c2638] scale-[1.02]' : 'border-[#4a4554] hover:border-[#724CF9] hover:bg-[#2c2638]',
            isUploading ? 'opacity-50 cursor-not-allowed' : '']"
          @click="!isUploading && document.getElementById('folder-input')?.click()"
        >
          <input
            id="folder-input"
            type="file"
            webkitdirectory=""
            multiple
            :disabled="isUploading"
            class="hidden"
            @change="(e) => { const files = (e.target as HTMLInputElement).files; if (files?.length) { previewFiles = Array.from(files); previewModalVisible = true; (e.target as HTMLInputElement).value = '' } }"
          />
          <div class="flex flex-col items-center space-y-3">
            <FolderOpenOutlined class="!text-[#724CF9] text-4xl" />
            <div>
              <p :class="['text-base font-medium', isDragOver ? 'text-[#724CF9]' : 'text-[#DBD4D3]']">
                {{ isDragOver ? 'Rilascia la cartella qui' : 'Trascina una cartella o clicca per selezionare' }}
              </p>
              <p class="text-sm text-[#9ca3af] mt-1">Caricamento ricorsivo • Coda automatica</p>
            </div>
            <button
              :disabled="isUploading"
              class="px-4 py-2 bg-[#724CF9] text-white rounded-md hover:bg-[#5a3fd1] flex items-center gap-2 disabled:opacity-50 transition-colors"
              @click.stop="document.getElementById('folder-input')?.click()"
            >
              <FolderOpenOutlined />Sfoglia Cartella
            </button>
          </div>
        </div>
      </BentoCard>

      <!-- Transfer Status Card -->
      <BentoCard size="1x2" title="Trasferimenti" subtitle="Stato upload/download" :icon="CloudUploadOutlined" class="overflow-y-auto max-h-[400px]">
        <TransferStatusPanel />
      </BentoCard>

      <!-- Multipart Upload Card -->
      <BentoCard size="2x1" title="File Grandi" subtitle="Per file superiori a 100MB" :icon="CloudUploadOutlined">
        <MultipartFileUploader :api-base-url="apiMultipartUrl" :on-upload-complete="handleLoadFiles" />
      </BentoCard>
    </div>

    <!-- File Sender -->
    <section class="mt-4">
      <BentoCard size="full" title="Invia File" subtitle="Condividi file via email" :icon="ShareAltOutlined" padding="lg">
        <FileSender @file-sent="handleLoadFiles" @link-generated="(data: ShareLinkData) => { shareData = data; shareModalVisible = true }" />
      </BentoCard>
    </section>

    <!-- Share Link Modal (legacy FileSender result) -->
    <a-modal
      :open="shareModalVisible"
      :footer="null"
      :width="600"
      :styles="{ body: { backgroundColor: '#1a1625', color: '#DBD4D3', padding: '16px' }, header: { backgroundColor: '#2c2638' } }"
      @cancel="shareModalVisible = false"
    >
      <template #title>
        <div class="flex items-center gap-2">
          <LinkOutlined class="!text-[#724CF9]" />
          <span class="text-white">Link di Condivisione Creato</span>
        </div>
      </template>
      <div v-if="shareData" class="space-y-4 pt-4">
        <div>
          <label class="block text-sm font-medium text-[#DBD4D3] mb-2">🔗 Link per Download:</label>
          <div class="flex gap-2">
            <a-input :value="shareData.url || ''" readonly :style="{ backgroundColor: '#2c2638', color: '#DBD4D3', border: '1px solid #4a4554' }" />
            <a-button type="primary" class="!bg-[#724CF9]" @click="copyToClipboard(shareData.url)">
              <template #icon><CopyOutlined /></template>Copia
            </a-button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-[#2c2638] p-4 rounded-lg">
            <h4 class="text-white font-medium mb-3 flex items-center gap-2"><FileOutlined class="!text-[#724CF9]" /> Informazioni File</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between gap-2">
                <span class="text-[#DBD4D3]">Nome:</span>
                <a-tooltip :title="shareData.fileName"><span class="text-white font-medium truncate cursor-help">{{ shareData.fileName }}</span></a-tooltip>
              </div>
              <div class="flex gap-2"><span class="text-[#DBD4D3]">Dimensione:</span><span class="text-white">{{ shareData.fileSize }}</span></div>
            </div>
          </div>
          <div class="bg-[#2c2638] p-4 rounded-lg">
            <h4 class="text-white font-medium mb-3 flex items-center gap-2"><ClockCircleOutlined class="!text-[#724CF9]" /> Informazioni Link</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-[#DBD4D3]">Scadenza:</span><span class="text-white">{{ shareData.expiresIn }}</span></div>
              <div class="flex justify-between"><span class="text-[#DBD4D3]">Stato:</span><span class="text-green-400">✓ Attivo</span></div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <a-button @click="shareModalVisible = false">Chiudi</a-button>
      </template>
    </a-modal>

    <!-- File Preview Modal (folder upload) -->
    <a-modal
      :open="previewModalVisible"
      title="Anteprima File da Caricare"
      :width="600"
      ok-text="Carica tutti"
      cancel-text="Annulla"
      centered
      @ok="handleFilesConfirm(previewFiles)"
      @cancel="() => { previewModalVisible = false; previewFiles = [] }"
    >
      <div class="max-h-64 overflow-y-auto space-y-2 py-2">
        <div v-for="(f, i) in previewFiles" :key="i" class="flex items-center gap-2 p-2 rounded bg-[#2c2638]">
          <FileOutlined class="!text-[#724CF9] flex-shrink-0" />
          <span class="text-white text-sm truncate flex-1">{{ f.name }}</span>
          <span class="text-[#9ca3af] text-xs flex-shrink-0">{{ (f.size / 1024 / 1024).toFixed(2) }} MB</span>
        </div>
      </div>
    </a-modal>

    <ShareFileModal
      :visible="shareUserModalVisible"
      :file="fileToShare"
      :on-close="() => { shareUserModalVisible = false; fileToShare = null }"
      :on-success="handleLoadFiles"
    />
  </div>
</template>
