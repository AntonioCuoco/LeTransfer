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
import { useDownloadActivity } from '@/src/composables/useDownloadActivity'
import type { DynamoDBFile, TableFile, SharedFile } from '@/src/types'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useUserKeyPair } from '@/src/composables/useUserKeyPair'
import { hasEncryptedName, resolveFileName, NAME_UNAVAILABLE } from '@/src/utils/fileNames'
import { importKeyFromBase64 } from '@/src/crypto/crypto'
import { receivedFileRow, formatRowDate } from '@/src/utils/fileRows'

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
const { markSeen: markDownloadsSeen } = useDownloadActivity()

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

const convertFilesToTableFormat = (files: DynamoDBFile[]): TableFile[] =>
  files.map((file, i) => ({
    id: file.fileId || file.s3Key || String(i),
    name: hasEncryptedName(file)
      ? (resolvedNames.value[file.s3Key] ?? NAME_UNAVAILABLE)
      : file.fileName || file.originalName || 'File sconosciuto',
    type: file.fileType || 'application/octet-stream',
    size: file.fileSize || 'N/A',
    status: (file.sharedWith?.length ? 'sent' : 'uploaded') as TableFile['status'],
    date: formatRowDate(file.uploadedAt),
    recipient: file.sharedWith?.length ? file.sharedWith.map(r => r.email).join(', ') : '-',
    originalFile: file,
    sharedWith: file.sharedWith,
    isShared: !!(file.sharedWith?.length),
    isReceived: false,
  }))

// La riga la costruisce `utils/fileRows`, testato a parte: leggere qui i campi del server
// significava sbagliarne il nome senza che nulla lo segnalasse (data «Sconosciuta», colonna
// «Cifrato» a trattino su file cifrati). Qui resta solo ciò che dipende dalla pagina: il nome,
// che con `nameVersion: 2` arriva cifrato e si risolve in modo asincrono.
const convertSharedFilesToTableFormat = (files: SharedFile[]): TableFile[] =>
  files.map((file) =>
    receivedFileRow(
      file,
      hasEncryptedName(file)
        ? (resolvedNames.value[file.shareId] ?? NAME_UNAVAILABLE)
        : (file.fileName || 'File sconosciuto'),
    ),
  )

// Niente try/catch qui: i due composable non lanciano, e mostrano già l'errore con il
// messaggio del server. Un catch con un testo generico sarebbe solo un secondo messaggio,
// diverso da quello vero, pronto a comparire il giorno che qualcuno li fa lanciare.
const loadFiles = async (page = 1) => {
  const options: { limit: number; fileType?: string } = { limit: pageSize * page }
  if (selectedFileType.value) options.fileType = selectedFileType.value
  const result = await loadFilesFromDynamo(options)
  if (result) totalFiles.value = result.count
}

const loadSharedFiles = async () => {
  await getSharedWithMe()
}

/**
 * Nomi dei file, risolti a parte (O2.2).
 *
 * Con `nameVersion: 2` il campo che arriva dal server è ciphertext, e aprirlo richiede la
 * chiave del file — cioè un'operazione **asincrona**, mentre le funzioni che costruiscono la
 * tabella sono sincrone. Quindi: la tabella si disegna subito con un segnaposto, e i nomi
 * veri la raggiungono appena sono pronti.
 *
 * Chiave diversa per provenienza: i file propri la prendono dallo store (wrappata sulla
 * master key), quelli ricevuti la ricavano dalla propria RSA privata — e quella non richiede
 * nessuna chiamata di rete.
 */
const resolvedNames = ref<Record<string, string>>({})
const encryptionStoreForNames = useEncryptionStore()
const { privateKey, xwingPublicKey, unwrapReceivedKey } = useUserKeyPair()

const refreshNames = async () => {
  const next: Record<string, string> = { ...resolvedNames.value }

  await Promise.all([
    ...dynamoFiles.value.filter(hasEncryptedName).map(async (file) => {
      if (next[file.s3Key]) return
      const keyData = encryptionStoreForNames.isUnlocked
        ? await encryptionStoreForNames.getKey(file.s3Key)
        : null
      next[file.s3Key] = await resolveFileName(
        file,
        keyData ? await importKeyFromBase64(keyData.key) : null,
      )
    }),
    ...sharedFiles.value.filter(hasEncryptedName).map(async (file) => {
      if (next[file.shareId]) return
      let key: CryptoKey | null = null
      if (file.encryptedAESKey && privateKey.value) {
        try {
          key = await unwrapReceivedKey(file.encryptedAESKey)
        } catch {
          key = null
        }
      }
      next[file.shareId] = await resolveFileName(file, key)
    }),
  ])

  resolvedNames.value = next
  syncAllFiles()
}

// `xwingPublicKey`: quando la chiave post-quantum diventa pronta, i nomi dei file v2 si possono aprire.
watch([dynamoFiles, sharedFiles, () => encryptionStoreForNames.isUnlocked, privateKey, xwingPublicKey], refreshNames)

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
  if (!file) { notify.error(`Il file ${fileId} non è più nell’elenco caricato in questa pagina: ricaricala e riprova.`, 'File non trovato'); return }
  await deleteFileFromDynamo(file.fileId, file.s3Key, {
    // L'errore lo mostra già deleteFile, con il messaggio del server.
    // Con il file il backend toglie anche i suoi link: si ricarica pure quell'elenco.
    onSuccess: () => { notify.success('File eliminato con successo'); loadFiles(currentPage.value); fetchLinks() },
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

// Questa è la pagina in cui i download si guardano davvero (la tabella dei link li mostra
// uno per uno), quindi è qui che il badge "+N nuovi" della dashboard va azzerato. Farlo
// alla sola apertura della dashboard lo avrebbe spento prima che l'utente vedesse quali link.
watch(sharedLinks, (list) => {
  if (list.length > 0) {
    markDownloadsSeen(list.reduce((sum, link) => sum + (link.downloadCount || 0), 0))
  }
}, { immediate: true })
</script>

<template>
  <div class="h-fit bg-deep-900">
    <!-- L'intestazione resta a filo: è la fascia d'identità della pagina, non contenuto.
         Tutto il resto vive in `.lt-page`, lo stesso contenitore di /app e /app/settings. -->
    <ProfileHeader />

    <div class="lt-page space-y-8">
      <!-- Recovery key mancante: è il punto in cui gli utenti E2E perdono i file per sempre,
           quindi il tono è serio ma spiegato, non un rettangolo rosso da errore di sistema. -->
      <div v-if="isSetupRequired" class="rounded-panel border border-warn-400/30 bg-warn-400/[0.07] p-5">
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

      <FileStatsGrid :tiles="statTiles" />

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

      <div class="rounded-panel border border-white/10 bg-white/[0.03]">
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
