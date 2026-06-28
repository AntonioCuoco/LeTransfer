<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { notify } from '@/src/utils/notify'
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
const apiMultipartUrl = import.meta.env.VITE_API_URL as string

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
  try { await navigator.clipboard.writeText(text); notify.success('Link copiato negli appunti!') }
  catch { notify.error('Errore durante la copia del link') }
}

const openFolderInput = () => {
  if (!isUploading.value) document.getElementById('folder-input')?.click()
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
      <StatCard :value="stats.totalFiles" label="File Totali" icon="pi pi-folder-open" trend="up" change="+12%" />
      <StatCard :value="stats.sharedFiles" label="File Condivisi" icon="pi pi-share-alt" variant="primary" />
      <StatCard :value="stats.totalSize" label="Spazio Utilizzato" icon="pi pi-cloud-upload" subtext="di 10 GB disponibili" />
    </div>

    <!-- Bento Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <!-- Folder Upload Card -->
      <BentoCard size="2x1" title="Carica Cartella" subtitle="Trascina una cartella o clicca per selezionare" icon="pi pi-folder-open">
        <div
          ref="dropZoneRef"
          v-bind="dragProps"
          :class="['border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 bg-[#4a4554]/20',
            isDragOver ? 'border-[#724CF9] bg-[#2c2638] scale-[1.02]' : 'border-[#4a4554] hover:border-[#724CF9] hover:bg-[#2c2638]',
            isUploading ? 'opacity-50 cursor-not-allowed' : '']"
          @click="openFolderInput"
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
            <i class="pi pi-folder-open text-primary text-4xl" />
            <div>
              <p :class="['text-base font-medium', isDragOver ? 'text-[#724CF9]' : 'text-[#DBD4D3]']">
                {{ isDragOver ? 'Rilascia la cartella qui' : 'Trascina una cartella o clicca per selezionare' }}
              </p>
              <p class="text-sm text-[#9ca3af] mt-1">Caricamento ricorsivo • Coda automatica</p>
            </div>
            <Button label="Sfoglia Cartella" icon="pi pi-folder-open" :disabled="isUploading" @click.stop="openFolderInput" />
          </div>
        </div>
      </BentoCard>

      <!-- Transfer Status Card -->
      <BentoCard size="1x2" title="Trasferimenti" subtitle="Stato upload/download" icon="pi pi-cloud-upload" class="overflow-y-auto max-h-[400px]">
        <TransferStatusPanel />
      </BentoCard>

      <!-- Multipart Upload Card -->
      <BentoCard size="2x1" title="File Grandi" subtitle="Per file superiori a 100MB" icon="pi pi-cloud-upload">
        <MultipartFileUploader :api-base-url="apiMultipartUrl" :on-upload-complete="handleLoadFiles" />
      </BentoCard>
    </div>

    <!-- File Sender -->
    <section class="mt-4">
      <BentoCard size="full" title="Invia File" subtitle="Condividi file via email" icon="pi pi-share-alt" padding="lg">
        <FileSender @file-sent="handleLoadFiles" @link-generated="(data: ShareLinkData) => { shareData = data; shareModalVisible = true }" />
      </BentoCard>
    </section>

    <!-- Share Link Modal (legacy FileSender result) -->
    <Dialog v-model:visible="shareModalVisible" modal :style="{ width: '600px' }">
      <template #header>
        <div class="flex items-center gap-2">
          <i class="pi pi-link text-primary" />
          <span class="text-white">Link di Condivisione Creato</span>
        </div>
      </template>
      <div v-if="shareData" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-[#DBD4D3] mb-2">🔗 Link per Download:</label>
          <div class="flex gap-2">
            <InputText :model-value="shareData.url || ''" readonly fluid class="flex-1" />
            <Button label="Copia" icon="pi pi-copy" @click="copyToClipboard(shareData.url)" />
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="bg-[#2c2638] p-4 rounded-lg">
            <h4 class="text-white font-medium mb-3 flex items-center gap-2"><i class="pi pi-file text-primary" /> Informazioni File</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between gap-2">
                <span class="text-[#DBD4D3]">Nome:</span>
                <span v-tooltip="shareData.fileName" class="text-white font-medium truncate cursor-help">{{ shareData.fileName }}</span>
              </div>
              <div class="flex gap-2"><span class="text-[#DBD4D3]">Dimensione:</span><span class="text-white">{{ shareData.fileSize }}</span></div>
            </div>
          </div>
          <div class="bg-[#2c2638] p-4 rounded-lg">
            <h4 class="text-white font-medium mb-3 flex items-center gap-2"><i class="pi pi-clock text-primary" /> Informazioni Link</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-[#DBD4D3]">Scadenza:</span><span class="text-white">{{ shareData.expiresIn }}</span></div>
              <div class="flex justify-between"><span class="text-[#DBD4D3]">Stato:</span><span class="text-green-400">✓ Attivo</span></div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Chiudi" severity="secondary" outlined @click="shareModalVisible = false" />
      </template>
    </Dialog>

    <!-- File Preview Modal (folder upload) -->
    <Dialog
      v-model:visible="previewModalVisible"
      modal
      header="Anteprima File da Caricare"
      :style="{ width: '600px' }"
      @hide="previewFiles = []"
    >
      <div class="max-h-64 overflow-y-auto space-y-2 py-2">
        <div v-for="(f, i) in previewFiles" :key="i" class="flex items-center gap-2 p-2 rounded bg-[#2c2638]">
          <i class="pi pi-file text-primary flex-shrink-0" />
          <span class="text-white text-sm truncate flex-1">{{ f.name }}</span>
          <span class="text-[#9ca3af] text-xs flex-shrink-0">{{ (f.size / 1024 / 1024).toFixed(2) }} MB</span>
        </div>
      </div>
      <template #footer>
        <Button label="Annulla" severity="secondary" outlined @click="() => { previewModalVisible = false; previewFiles = [] }" />
        <Button label="Carica tutti" @click="handleFilesConfirm(previewFiles)" />
      </template>
    </Dialog>

    <ShareFileModal
      :visible="shareUserModalVisible"
      :file="fileToShare"
      :on-close="() => { shareUserModalVisible = false; fileToShare = null }"
      :on-success="handleLoadFiles"
    />
  </div>
</template>
