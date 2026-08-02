<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { notify } from '@/src/utils/notify'
import ProfileHeader from '@/src/components/ProfileHeader.vue'
import FileStatsGrid, { type StatTile } from '@/src/components/FileStatsGrid.vue'
import FilesTable from '@/src/components/FilesTable.vue'
import SharedLinksTable from '@/src/components/SharedLinksTable.vue'
import ShareFileModal from '@/src/components/ShareFileModal.vue'
import RecoveryKeySetup from '@/src/components/RecoveryKeySetup.vue'
import { useFileFromDynamoDB } from '@/src/composables/useFileFromDynamoDB'
import { useShareFile } from '@/src/composables/useShareFile'
import { useSharedLinks } from '@/src/composables/useSharedLinks'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import type { DynamoDBFile, TableFile, SharedFile } from '@/src/types'

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

// Tessere del riepilogo: solo grandezze che sappiamo davvero calcolare dai record
// che il backend restituisce. Le vecchie "archiviati"/"eliminati"/"scaricati" erano
// zeri costanti nel codice — non sono misure, quindi non si mostrano.
const statTiles = computed<StatTile[]>(() => {
  const sent = dynamoFiles.value.filter((f) => f.sharedWith?.length).length
  const active = sharedLinks.value.filter(
    (link) => !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now(),
  )
  const downloads = sharedLinks.value.reduce((sum, link) => sum + (link.downloadCount || 0), 0)

  return [
    { label: 'File caricati', value: dynamoFiles.value.length, icon: 'pi pi-folder', tone: 'brand' },
    { label: 'Inviati a persone', value: sent, icon: 'pi pi-send' },
    { label: 'Ricevuti da altri', value: sharedFiles.value.length, icon: 'pi pi-inbox' },
    {
      label: 'Link attivi',
      value: active.length,
      icon: 'pi pi-link',
      hint: sharedLinks.value.length > active.length
        ? `${sharedLinks.value.length - active.length} scaduti o revocati`
        : undefined,
    },
    { label: 'Download ricevuti', value: downloads, icon: 'pi pi-download', tone: 'verified', hint: 'su tutti i tuoi link' },
  ]
})

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

const loadFiles = async (page = 1) => {
  try {
    const options: { limit: number; fileType?: string } = { limit: pageSize * page }
    if (selectedFileType.value) options.fileType = selectedFileType.value
    const result = await loadFilesFromDynamo(options)
    if (result) totalFiles.value = result.count
  } catch { notify.error('Errore durante il caricamento dei file') }
}

const loadSharedFiles = async () => {
  try {
    await getSharedWithMe()
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
  <div class="h-fit bg-deep-900">
    <ProfileHeader />

    <!-- Recovery key mancante: è il punto in cui gli utenti E2E perdono i file per sempre,
         quindi il tono è serio ma spiegato, non un rettangolo rosso da errore di sistema. -->
    <div v-if="isSetupRequired" class="mx-8 mt-6 rounded-panel border border-warn-400/30 bg-warn-400/[0.07] p-5">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <i class="pi pi-shield mt-0.5 text-xl text-warn-400" />
          <div>
            <h4 class="m-0 font-semibold text-haze-100">Non hai ancora una chiave di recupero</h4>
            <p class="m-0 mt-1 max-w-[70ch] text-sm leading-relaxed text-haze-300">
              I tuoi file si aprono solo con la chiave che vive in questo browser. Se perdi il dispositivo
              e non hai una chiave di recupero, <b class="text-haze-100">nessuno può recuperarli — nemmeno noi</b>.
              Sono 24 parole da conservare fuori dal computer.
            </p>
          </div>
        </div>
        <Button label="Creala ora" @click="securitySetupVisible = true" />
      </div>
    </div>

    <div class="px-8 pt-8">
      <FileStatsGrid :tiles="statTiles" />
    </div>

    <div class="p-8">
      <div class="rounded-panel border border-white/10 bg-white/[0.03]">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h2 class="m-0 text-2xl font-bold tracking-[-0.02em] text-haze-100">I tuoi file</h2>
              <p v-if="totalFiles > 0" class="m-0 mt-1 font-mono text-[0.78rem] text-haze-400">{{ totalFiles }} in totale</p>
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
          <div v-else-if="allFiles.length === 0" class="py-10 text-center">
            <p class="m-0 text-lg text-haze-200">
              {{ activeTab === 'received' ? 'Nessun file ricevuto' : activeTab === 'uploaded' ? 'Non hai ancora caricato niente' : 'Qui non c’è ancora niente' }}
            </p>
            <p class="m-0 mt-2 text-sm text-haze-400">
              {{ activeTab === 'received' ? 'I file che ti mandano gli altri utenti compaiono qui.' : 'Trascina il primo file dalla home.' }}
            </p>
            <button v-if="activeTab !== 'received'" type="button" class="lt-btn-dark mt-5" @click="$router.push('/app')">
              Vai a caricare →
            </button>
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

      <div class="mt-8 rounded-panel border border-white/10 bg-white/[0.03]">
        <div class="p-6">
          <div class="mb-4">
            <h2 class="m-0 text-2xl font-bold tracking-[-0.02em] text-haze-100">Link generati</h2>
            <p class="m-0 mt-1 font-mono text-[0.78rem] text-haze-400">
              {{ sharedLinks.length }} in totale · la chiave di ognuno vive solo nel link
            </p>
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
