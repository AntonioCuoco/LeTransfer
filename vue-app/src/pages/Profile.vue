<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { notify } from '@/src/utils/notify'
import ProfileHeader from '@/src/components/ProfileHeader.vue'
import FileStatsGrid from '@/src/components/FileStatsGrid.vue'
import FilesTable from '@/src/components/FilesTable.vue'
import SharedLinksTable from '@/src/components/SharedLinksTable.vue'
import ShareFileModal from '@/src/components/ShareFileModal.vue'
import RecoveryKeySetup from '@/src/components/RecoveryKeySetup.vue'
import { useFileFromDynamoDB } from '@/src/composables/useFileFromDynamoDB'
import { useShareFile } from '@/src/composables/useShareFile'
import { useSharedLinks } from '@/src/composables/useSharedLinks'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import type { DynamoDBFile, TableFile, SharedFile, FileStats } from '@/src/types'

const fileTypeOptions = [
  { value: '', label: 'Tutti i tipi' },
  { value: 'image', label: 'Immagini' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documenti' },
  { value: 'archive', label: 'Archivi' },
  { value: 'application', label: 'Applicazioni' },
]

const { files: dynamoFiles, isLoading: hookLoading, loadFiles: loadFilesFromDynamo, deleteFile: deleteFileFromDynamo, downloadFile } = useFileFromDynamoDB()
const { sharedFiles, isLoadingShared, getSharedWithMe, downloadSharedFile } = useShareFile()
const { links: sharedLinks, isLoading: isLinksLoading, fetchLinks, revokeLink, regenerateLink, updateLink, deleteLink } = useSharedLinks()
const { getRecoveryKeyStatus } = useRecoveryKeyAPI()

const isSetupRequired = ref(false)
const securitySetupVisible = ref(false)
const currentPage = ref(1)
const totalFiles = ref(0)
const pageSize = 10
const selectedFileType = ref('')
const activeTab = ref('all')
const shareModalVisible = ref(false)
const fileToShare = ref<DynamoDBFile | null>(null)
const allFiles = ref<TableFile[]>([])
const stats = ref<FileStats>({ uploaded: 0, downloaded: 0, sent: 0, received: 0, archived: 0, deleted: 0 })

const isLoading = computed(() => hookLoading.value || isLoadingShared.value || isLinksLoading.value)

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const convertFilesToTableFormat = (files: DynamoDBFile[]): TableFile[] =>
  files.map((file, i) => ({
    id: file.fileId || file.s3Key || String(i),
    name: file.fileName || file.originalName || 'File sconosciuto',
    type: file.fileType || 'application/octet-stream',
    size: file.fileSize || 'N/A',
    status: (file.sharedWith?.length ? 'sent' : 'uploaded') as TableFile['status'],
    date: file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('it-IT') : 'Sconosciuta',
    recipient: file.sharedWith?.length ? file.sharedWith.map(r => r.email).join(', ') : '-',
    originalFile: file,
    sharedWith: file.sharedWith,
    isShared: !!(file.sharedWith?.length),
    isReceived: false,
  }))

const convertSharedFilesToTableFormat = (files: SharedFile[]): TableFile[] =>
  files.map((file, i) => {
    const dynamoFile: DynamoDBFile = {
      fileId: file.shareId, fileName: file.fileName, originalName: file.fileName,
      fileSize: typeof file.fileSize === 'number' ? formatFileSize(file.fileSize) : file.fileSize,
      formattedSize: typeof file.fileSize === 'number' ? formatFileSize(file.fileSize) : file.fileSize,
      fileType: file.fileType, s3Key: file.s3Key, s3Url: file.s3Url, urlExpires: null,
      ownerUserId: file.ownerId, uploadedAt: file.createdAt, isReceived: true,
      senderEmail: file.ownerEmail, senderId: file.ownerId, shareId: file.shareId, sharedAt: file.createdAt,
    }
    return {
      id: file.shareId || String(i),
      name: file.fileName || 'File sconosciuto',
      type: file.fileType || 'application/octet-stream',
      size: typeof file.fileSize === 'number' ? formatFileSize(file.fileSize) : file.fileSize,
      status: 'received' as TableFile['status'],
      date: file.createdAt ? new Date(file.createdAt).toLocaleDateString('it-IT') : 'Sconosciuta',
      recipient: '-',
      originalFile: dynamoFile,
      isReceived: true,
      senderEmail: file.ownerEmail || 'Utente sconosciuto',
    }
  })

const updateStats = (uploadedCount: number, receivedCount: number) => {
  const sentCount = dynamoFiles.value.filter(f => f.sharedWith?.length).length
  stats.value = { uploaded: uploadedCount, downloaded: 0, sent: sentCount, received: receivedCount, archived: 0, deleted: 0 }
}

const loadFiles = async (page = 1) => {
  try {
    const options: { limit: number; fileType?: string } = { limit: pageSize * page }
    if (selectedFileType.value) options.fileType = selectedFileType.value
    const result = await loadFilesFromDynamo(options)
    if (result) { totalFiles.value = result.count; updateStats(result.count, sharedFiles.value.length) }
  } catch { notify.error('Errore durante il caricamento dei file') }
}

const loadSharedFiles = async () => {
  try {
    const files = await getSharedWithMe()
    updateStats(dynamoFiles.value.length, files.length)
  } catch { notify.error('Errore durante il caricamento dei file condivisi') }
}

const syncAllFiles = () => {
  const own = convertFilesToTableFormat(dynamoFiles.value)
  const received = convertSharedFilesToTableFormat(sharedFiles.value)
  if (activeTab.value === 'uploaded') { allFiles.value = own; totalFiles.value = own.length }
  else if (activeTab.value === 'received') { allFiles.value = received; totalFiles.value = received.length }
  else { allFiles.value = [...own, ...received]; totalFiles.value = own.length + received.length }
}

watch([dynamoFiles, sharedFiles, activeTab], syncAllFiles)

const currentPageFiles = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return allFiles.value.slice(start, start + pageSize)
})

const handleDeleteFile = async (fileId: string) => {
  const file = dynamoFiles.value.find(f => f.fileId === fileId || f.s3Key === fileId)
  if (!file) { notify.error('File non trovato'); return }
  await deleteFileFromDynamo(file.fileId, file.s3Key, {
    onSuccess: () => { notify.success('File eliminato con successo'); loadFiles(currentPage.value) },
    onError: () => notify.error("Errore durante l'eliminazione"),
  })
}

const handleShareFile = (file: DynamoDBFile) => { fileToShare.value = file; shareModalVisible.value = true }
const handleShareModalClose = () => { shareModalVisible.value = false; fileToShare.value = null }

// I file ricevuti (condivisione utente→utente) si decifrano con la MIA private key RSA, non con la
// master key: instradiamo il download di conseguenza.
const handleDownload = async (f: DynamoDBFile) => {
  if (f.isReceived) {
    const shared = sharedFiles.value.find(s => s.shareId === f.shareId || s.s3Key === f.s3Key)
    if (shared) { await downloadSharedFile(shared); return }
  }
  await downloadFile(f)
}

onMounted(async () => {
  loadFiles(1)
  loadSharedFiles()
  fetchLinks()
  const status = await getRecoveryKeyStatus()
  isSetupRequired.value = !status?.hasRecoveryKey
})
</script>

<template>
  <div class="h-fit bg-[#2c2638]">
    <ProfileHeader />

    <div v-if="isSetupRequired" class="mx-8 mt-6">
      <div class="bg-[#fff1f0] border border-[#ffa39e] p-4 rounded-lg flex items-center justify-between">
        <div class="flex items-center gap-3">
          <i class="pi pi-shield text-[#cf1322] text-xl" />
          <div>
            <h4 class="text-[#cf1322] font-semibold m-0">Sicurezza End-to-End non configurata</h4>
            <p class="text-[#cf1322] text-sm m-0">Per proteggere i tuoi file e accedervi da altri dispositivi, configura la Recovery Key.</p>
          </div>
        </div>
        <Button label="Configura Ora" severity="danger" @click="securitySetupVisible = true" />
      </div>
    </div>

    <FileStatsGrid :stats="stats" />

    <div class="p-8">
      <div class="bg-[#3c364c] rounded-lg">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h2 class="text-2xl font-bold text-white">Tutti i File</h2>
              <p v-if="totalFiles > 0" class="text-[#DBD4D3] text-sm mt-1">{{ totalFiles }} file totali</p>
            </div>
            <div class="flex items-center gap-3">
              <Select v-model="selectedFileType" class="w-48" placeholder="Filtra per tipo" :options="fileTypeOptions" option-label="label" option-value="value" @change="() => { currentPage = 1; loadFiles(1) }" />
              <Button :loading="isLoading" icon="pi pi-refresh" label="Aggiorna" @click="() => { loadFiles(currentPage); loadSharedFiles(); fetchLinks() }" />
            </div>
          </div>

          <Tabs v-model:value="activeTab" class="mb-4" @update:value="currentPage = 1">
            <TabList>
              <Tab value="all"><span class="flex items-center gap-2"><i class="pi pi-cloud-upload" /> Tutti ({{ dynamoFiles.length + sharedFiles.length }})</span></Tab>
              <Tab value="uploaded"><span class="flex items-center gap-2"><i class="pi pi-cloud-upload" /> Caricati ({{ dynamoFiles.length }})</span></Tab>
              <Tab value="received"><span class="flex items-center gap-2"><i class="pi pi-inbox" /> Ricevuti ({{ sharedFiles.length }})</span></Tab>
            </TabList>
          </Tabs>

          <div v-if="isLoading" class="flex justify-center items-center py-8">
            <ProgressSpinner />
          </div>
          <div v-else-if="allFiles.length === 0" class="text-center py-8">
            <p class="text-[#DBD4D3] text-lg">
              {{ activeTab === 'received' ? 'Nessun file ricevuto' : activeTab === 'uploaded' ? 'Nessun file caricato' : 'Nessun file' }}
            </p>
            <p class="text-[#DBD4D3] text-sm mt-2">
              {{ activeTab === 'received' ? 'I file che riceverai dagli altri utenti appariranno qui' : 'I file che carichi appariranno qui' }}
            </p>
          </div>
          <template v-else>
            <FilesTable
              :files="currentPageFiles"
              :hide-header="true"
              :on-delete-file="handleDeleteFile"
              :on-download-file="handleDownload"
              :on-share-file="handleShareFile"
            />
            <div v-if="totalFiles > pageSize" class="flex justify-center mt-6">
              <Paginator
                :rows="pageSize"
                :total-records="totalFiles"
                :first="(currentPage - 1) * pageSize"
                @page="(e) => { currentPage = e.page + 1 }"
              />
            </div>
          </template>
        </div>
      </div>

      <div class="bg-[#3c364c] rounded-lg mt-8">
        <div class="p-6">
          <div class="mb-4">
            <h2 class="text-2xl font-bold text-white">Link Generati</h2>
            <p class="text-[#DBD4D3] text-sm mt-1">{{ sharedLinks.length }} link attivi</p>
          </div>
          <div v-if="isLinksLoading" class="flex justify-center items-center py-8"><ProgressSpinner /></div>
          <SharedLinksTable
            v-else
            :links="sharedLinks"
            :on-revoke="revokeLink"
            :on-regenerate="regenerateLink"
            :on-update="updateLink"
            :on-delete="deleteLink"
          />
        </div>
      </div>
    </div>

    <ShareFileModal
      :visible="shareModalVisible"
      :file="fileToShare"
      :on-close="handleShareModalClose"
      :on-success="() => { loadFiles(currentPage); notify.success('File condiviso con successo!') }"
      :on-link-generated="fetchLinks"
    />

    <Dialog
      v-model:visible="securitySetupVisible"
      modal
      :closable="false"
      :dismissable-mask="false"
      :style="{ width: '800px' }"
      :pt="{ header: '!hidden', content: '!p-8' }"
    >
      <RecoveryKeySetup
        @complete="() => { securitySetupVisible = false; isSetupRequired = false; notify.success('Sicurezza configurata!') }"
        @cancel="securitySetupVisible = false"
      />
    </Dialog>
  </div>
</template>
