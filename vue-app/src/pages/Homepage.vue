<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { notify } from '@/src/utils/notify'
import StatCard from '@/src/components/ui/StatCard.vue'
import TransferStatusPanel from '@/src/components/TransferStatusPanel.vue'
import FileSender from '@/src/components/FileSender/FileSender.vue'
import MultipartFileUploader from '@/src/components/MultipartFileUploader.vue'
import ShareFileModal from '@/src/components/ShareFileModal.vue'
import { useTransferStore } from '@/src/stores/transfer'
import { useFolderDragAndDrop } from '@/src/composables/useFolderDragAndDrop'
import { useFileFromDynamoDB } from '@/src/composables/useFileFromDynamoDB'
import { useSharedLinks } from '@/src/composables/useSharedLinks'
import { usePlan } from '@/src/composables/usePlan'
import { useUpgradePrompt } from '@/src/composables/useUpgradePrompt'
import { useDownloadActivity } from '@/src/composables/useDownloadActivity'
import PlanBadge from '@/src/components/billing/PlanBadge.vue'
import { formatBytes } from '@/src/types/plan'
import { fileBadge } from '@/src/utils/fileBadge'
import type { DynamoDBFile, ShareLinkData } from '@/src/types'

/**
 * Dashboard = **da dove parte un file** (roadmap F5). La gestione di ciò che è già
 * stato caricato vive in /app/profile: qui si sceglie soltanto un modo per mandare.
 *
 * I due modi sono separati perché sono due cose diverse, non due bottoni:
 *  • "nel tuo spazio" → il file resta tuo, poi ci generi i link quando vuoi
 *  • "a una persona"  → cifratura verso la chiave pubblica del destinatario
 *
 * ⚠️ Tutti i numeri di questa pagina sono calcolati da dati reali. La versione
 * precedente mostrava "+12%" e "di 10 GB disponibili" scritti nel template: il primo
 * non esisteva, e il secondo nemmeno come concetto (il backend impone un tetto per
 * FILE, non una quota di spazio — vedi PLAN_*_MAX_FILE_GB in BACKEND_API_DOCS §5).
 */

const router = useRouter()
const store = useTransferStore()
const { isUploading, loadFiles } = useFileFromDynamoDB()
const { links, fetchLinks } = useSharedLinks()
const {
  plan,
  limits,
  isAuthoritative,
  load: loadPlan,
  blockingLimitFor,
  storedRemaining,
  monthlyRemaining,
} = usePlan()
const { promptForFileSize } = useUpgradePrompt()
const { newSince } = useDownloadActivity()

const shareModalVisible = ref(false)
const shareData = ref<ShareLinkData | null>(null)
const shareUserModalVisible = ref(false)
const fileToShare = ref<DynamoDBFile | null>(null)
const previewFiles = ref<File[]>([])
const previewModalVisible = ref(false)
const recentFiles = ref<DynamoDBFile[]>([])
const totalFiles = ref(0)
const totalBytes = ref(0)
const apiMultipartUrl = import.meta.env.VITE_API_URL as string

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

// ── Numeri reali, tutti derivati dai record che il backend restituisce davvero ──
const activeLinks = computed(() =>
  links.value.filter((link) => !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now()),
)

const totalDownloads = computed(() =>
  links.value.reduce((sum, link) => sum + (link.downloadCount || 0), 0),
)

// Quanti download sono arrivati da quando l'utente ha guardato l'ultima volta. È la
// versione onesta della "notifica di download": l'invio vero (email/push) è lavoro
// backend che non esiste ancora, ma accorgersene si può già fare.
const newDownloads = computed(() => newSince(totalDownloads.value))

// Avvisi: solo situazioni vere e azionabili, niente riempitivi.
const expiringSoon = computed(() =>
  activeLinks.value.filter((link) => {
    const hoursLeft = (new Date(link.expiresAt).getTime() - Date.now()) / 3_600_000
    return hoursLeft <= 48
  }),
)

const exhausted = computed(() =>
  activeLinks.value.filter((link) => link.maxDownloads != null && link.downloadCount >= link.maxDownloads),
)

const hasAlerts = computed(() => expiringSoon.value.length > 0 || exhausted.value.length > 0)

const { isDragOver, dragProps, dropZoneRef } = useFolderDragAndDrop({
  onFilesDropped: (files: File[]) => {
    if (files.length > 0) { previewFiles.value = files; previewModalVisible.value = true }
  },
  multiple: true,
  disabled: false,
})

const handleFilesConfirm = (files: File[]) => {
  previewModalVisible.value = false
  previewFiles.value = []

  // Pre-controllo dei limiti del piano. Il server è comunque l'autorità (`413` a init e
  // ricontrollo reale a complete), ma far partire un upload destinato a essere rifiutato è
  // tempo dell'utente buttato: qui i file che non passerebbero non entrano in coda.
  //
  // Sono **tre** limiti, non uno, e vogliono risposte diverse: il file troppo grande si
  // risolve con un piano superiore, lo spazio pieno liberando, il tetto mensile aspettando.
  // Dirli tutti "troppo grande" manderebbe a comprare la cosa sbagliata.
  const accepted: File[] = []
  const tooBig: File[] = []
  const noRoom: File[] = []
  const noMonthly: File[] = []

  // Il controllo è cumulativo: dieci file da 2 GB stanno nella quota uno per uno, non
  // insieme. Senza questo, la coda partirebbe e si romperebbe a metà.
  let plannedBytes = 0
  for (const file of files) {
    switch (blockingLimitFor(file.size + plannedBytes)) {
      case 'file': tooBig.push(file); break
      case 'quota': noRoom.push(file); break
      case 'monthly': noMonthly.push(file); break
      default:
        accepted.push(file)
        plannedBytes += file.size
    }
  }

  accepted.forEach((f) => store.addUpload(f))
  if (accepted.length > 0) {
    notify.success(`${accepted.length} file aggiunti alla coda di caricamento.`, 'In coda')
  }

  if (tooBig.length > 0) {
    // Si propone il piano in base al file più grande: è quello che detta il fabbisogno.
    promptForFileSize(Math.max(...tooBig.map((f) => f.size)))
  } else if (noRoom.length > 0) {
    const free = storedRemaining.value
    notify.warning(
      free !== null
        ? `Spazio insufficiente: ne restano ${formatBytes(free)}. Libera spazio eliminando qualche file, oppure passa a un piano più capiente.`
        : 'Spazio insufficiente per questi file. Libera spazio eliminando qualcosa.',
    )
  } else if (noMonthly.length > 0) {
    // Nessun prompt di acquisto: il volume torna da solo il mese prossimo.
    const free = monthlyRemaining.value
    notify.warning(
      free !== null
        ? `Volume del mese quasi esaurito: ne restano ${formatBytes(free)}. Il conteggio riparte a inizio mese.`
        : 'Hai esaurito il volume di trasferimento di questo mese.',
    )
  }
}

const copyToClipboard = async (text: string) => {
  try { await navigator.clipboard.writeText(text); notify.success('Link copiato negli appunti!') }
  catch { notify.error('Errore durante la copia del link') }
}

const openFolderInput = () => {
  if (!isUploading.value) document.getElementById('folder-input')?.click()
}

const refreshAll = async () => {
  const result = await loadFiles({ limit: 100 })
  if (result?.files) {
    totalFiles.value = result.count ?? result.files.length
    totalBytes.value = result.files.reduce((acc: number, f: DynamoDBFile) => {
      const size = parseInt(String(f.fileSize) || '0')
      return acc + (isNaN(size) ? 0 : size)
    }, 0)
    recentFiles.value = [...result.files]
      .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime())
      .slice(0, 5)
  }
  await fetchLinks()
}

const relativeDate = (iso?: string | null) => {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'oggi'
  if (days === 1) return 'ieri'
  if (days < 30) return `${days} giorni fa`
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

onMounted(() => {
  void refreshAll()
  void loadPlan()
})
</script>

<template>
  <div class="lt-page">
    <header class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="lt-label mb-2 !text-verified-400">Invia</p>
        <h1 class="m-0 text-3xl font-bold tracking-[-0.03em] text-haze-100">Da qui parte un file.</h1>
        <p class="mb-0 mt-1.5 text-haze-300">
          Caricalo nel tuo spazio, oppure mandalo direttamente a una persona. In entrambi i casi si cifra qui.
        </p>
        <!-- Il limite scritto PRIMA di incontrarlo: è il numero che il server applica. -->
        <p class="mb-0 mt-2.5 flex items-center gap-2 font-mono text-[0.72rem] text-haze-400">
          <PlanBadge :plan="plan" :presumed="!isAuthoritative" />
          <span>fino a {{ formatBytes(limits.maxFileBytes) }} per file</span>
          <RouterLink to="/app/settings" class="underline decoration-dotted underline-offset-2 hover:text-haze-200">
            cambia piano
          </RouterLink>
        </p>
      </div>
      <button type="button" class="lt-btn-dark" @click="router.push('/app/profile')">
        Gestisci i tuoi file →
      </button>
    </header>

    <!-- Numeri reali -->
    <div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard :value="totalFiles" label="File nel tuo spazio" icon="pi pi-folder" tone="brand" />
      <StatCard :value="formatSize(totalBytes)" label="Spazio occupato" icon="pi pi-database" />
      <StatCard
        :value="activeLinks.length"
        label="Link attivi"
        icon="pi pi-link"
        :hint="links.length > activeLinks.length ? `${links.length - activeLinks.length} scaduti o revocati` : undefined"
      />
      <StatCard
        :value="totalDownloads"
        label="Download ricevuti"
        icon="pi pi-download"
        tone="verified"
        :badge="newDownloads > 0 ? `+${newDownloads} nuovi` : undefined"
        :hint="newDownloads > 0 ? 'apri «I tuoi file» per vedere quali link' : 'su tutti i tuoi link'"
      />
    </div>

    <!-- Avvisi: compaiono solo se c'è davvero qualcosa da fare -->
    <div v-if="hasAlerts" class="mb-6 rounded-panel border border-warn-400/25 bg-warn-400/[0.06] p-5">
      <p class="lt-label mb-3 !text-warn-400">Richiede attenzione</p>
      <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[0.92rem] text-haze-200">
        <li v-if="expiringSoon.length" class="flex items-baseline gap-2.5">
          <span class="text-warn-400">•</span>
          <span>
            <b>{{ expiringSoon.length }}</b>
            {{ expiringSoon.length === 1 ? 'link scade' : 'link scadono' }} entro 48 ore
          </span>
        </li>
        <li v-if="exhausted.length" class="flex items-baseline gap-2.5">
          <span class="text-warn-400">•</span>
          <span>
            <b>{{ exhausted.length }}</b>
            {{ exhausted.length === 1 ? 'link ha' : 'link hanno' }} esaurito i download consentiti
          </span>
        </li>
      </ul>
      <button type="button" class="mt-3 text-[0.86rem] font-semibold text-warn-400 hover:underline" @click="router.push('/app/profile')">
        Vai alla gestione dei link →
      </button>
    </div>

    <!-- I due modi di mandare -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- 1. Nel tuo spazio -->
      <section class="rounded-panel border border-white/10 bg-white/[0.03] p-6">
        <div class="mb-1 flex items-baseline gap-2.5">
          <span class="font-mono text-[0.8rem] text-verified-400">01</span>
          <h2 class="m-0 text-lg font-semibold text-haze-100">Carica nel tuo spazio</h2>
        </div>
        <p class="mb-5 mt-0 text-[0.9rem] leading-relaxed text-haze-300">
          Il file resta tuo. Ci generi link quando vuoi, con scadenza, password e limite di download.
        </p>

        <div
          ref="dropZoneRef"
          v-bind="dragProps"
          class="cursor-pointer rounded-well border-2 border-dashed p-6 text-center transition-colors"
          :class="[
            isDragOver ? 'border-brand-400 bg-brand-500/10' : 'border-white/15 hover:border-brand-400 hover:bg-white/[0.04]',
            isUploading ? 'cursor-not-allowed opacity-50' : '',
          ]"
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
          <i class="pi pi-folder-open mb-3 block text-3xl text-brand-400" />
          <p class="m-0 text-[0.95rem] font-semibold" :class="isDragOver ? 'text-brand-300' : 'text-haze-100'">
            {{ isDragOver ? 'Rilascia qui' : 'Trascina file o cartelle' }}
          </p>
          <p class="m-0 mt-1 font-mono text-[0.72rem] text-haze-400">ricorsivo · coda automatica</p>
        </div>

        <details class="mt-4 rounded-well border border-white/10 bg-white/[0.02]">
          <summary class="cursor-pointer list-none px-4 py-3 text-[0.88rem] font-semibold text-haze-200 hover:text-haze-100">
            File molto grande (oltre 100 MB) →
          </summary>
          <div class="border-t border-white/10 p-4">
            <MultipartFileUploader :api-base-url="apiMultipartUrl" :on-upload-complete="refreshAll" />
          </div>
        </details>
      </section>

      <!-- 2. A una persona -->
      <section class="rounded-panel border border-white/10 bg-white/[0.03] p-6">
        <div class="mb-1 flex items-baseline gap-2.5">
          <span class="font-mono text-[0.8rem] text-verified-400">02</span>
          <h2 class="m-0 text-lg font-semibold text-haze-100">Manda a una persona</h2>
        </div>
        <p class="mb-5 mt-0 text-[0.9rem] leading-relaxed text-haze-300">
          Cifrato verso la sua chiave pubblica: nemmeno noi possiamo aprirlo. Prima di consegnare
          la chiave ti mostriamo l'impronta del destinatario, così puoi verificarla.
        </p>
        <FileSender
          @file-sent="refreshAll"
          @link-generated="(data: ShareLinkData) => { shareData = data; shareModalVisible = true }"
        />
      </section>
    </div>

    <!-- Trasferimenti in corso e ultimi caricati -->
    <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section class="rounded-panel border border-white/10 bg-white/[0.03] p-6">
        <h2 class="m-0 mb-4 text-lg font-semibold text-haze-100">Trasferimenti in corso</h2>
        <div class="max-h-[320px] overflow-y-auto">
          <TransferStatusPanel />
        </div>
      </section>

      <section class="rounded-panel border border-white/10 bg-white/[0.03] p-6">
        <div class="mb-4 flex items-baseline justify-between">
          <h2 class="m-0 text-lg font-semibold text-haze-100">Ultimi caricati</h2>
          <button type="button" class="text-[0.84rem] font-semibold text-verified-400 hover:underline" @click="router.push('/app/profile')">
            vedi tutti
          </button>
        </div>

        <p v-if="recentFiles.length === 0" class="m-0 text-[0.9rem] text-haze-400">
          Non hai ancora caricato niente. Il primo file lo trascini qui accanto.
        </p>
        <ul v-else class="m-0 flex list-none flex-col gap-1.5 p-0">
          <li
            v-for="file in recentFiles"
            :key="file.fileId || file.s3Key"
            class="flex items-center gap-2.5 rounded-chip border border-white/5 bg-white/[0.02] px-3 py-2.5"
          >
            <span
              class="flex-none rounded-badge px-1.5 py-1 font-mono text-[0.58rem] font-extrabold tracking-[0.03em] text-white"
              :style="{ background: fileBadge(file.fileName || '', file.fileType).color }"
            >
              {{ fileBadge(file.fileName || '', file.fileType).label }}
            </span>
            <span class="flex-1 truncate text-[0.88rem] text-haze-100" :title="file.fileName">{{ file.fileName }}</span>
            <span class="flex-none font-mono text-[0.72rem] text-haze-400">{{ relativeDate(file.uploadedAt) }}</span>
          </li>
        </ul>
      </section>
    </div>

    <!-- Link generato dal FileSender -->
    <Dialog v-model:visible="shareModalVisible" modal :style="{ width: 'min(600px, 94vw)' }">
      <template #header>
        <div class="flex items-center gap-2">
          <i class="pi pi-link text-primary" />
          <span class="text-white">Link di condivisione creato</span>
        </div>
      </template>
      <div v-if="shareData" class="space-y-4">
        <div>
          <label class="lt-label mb-2 block !text-haze-400">Link per il download</label>
          <div class="flex gap-2">
            <InputText :model-value="shareData.url || ''" readonly fluid class="flex-1" />
            <Button label="Copia" icon="pi pi-copy" @click="copyToClipboard(shareData.url)" />
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="rounded-well bg-white/[0.04] p-4">
            <h4 class="mb-3 flex items-center gap-2 font-medium text-white"><i class="pi pi-file text-primary" /> File</h4>
            <div class="space-y-2 font-mono text-[0.78rem]">
              <div class="flex justify-between gap-2">
                <span class="text-haze-400">nome</span>
                <span v-tooltip="shareData.fileName" class="cursor-help truncate text-haze-100">{{ shareData.fileName }}</span>
              </div>
              <div class="flex justify-between gap-2"><span class="text-haze-400">peso</span><span class="text-haze-100">{{ shareData.fileSize }}</span></div>
            </div>
          </div>
          <div class="rounded-well bg-white/[0.04] p-4">
            <h4 class="mb-3 flex items-center gap-2 font-medium text-white"><i class="pi pi-clock text-primary" /> Link</h4>
            <div class="space-y-2 font-mono text-[0.78rem]">
              <div class="flex justify-between"><span class="text-haze-400">scadenza</span><span class="text-haze-100">{{ shareData.expiresIn }}</span></div>
              <div class="flex justify-between"><span class="text-haze-400">stato</span><span class="text-verified-400">attivo ✓</span></div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Chiudi" severity="secondary" outlined @click="shareModalVisible = false" />
      </template>
    </Dialog>

    <!-- Anteprima della cartella trascinata -->
    <Dialog
      v-model:visible="previewModalVisible"
      modal
      header="File da caricare"
      :style="{ width: 'min(600px, 94vw)' }"
      @hide="previewFiles = []"
    >
      <div class="max-h-64 space-y-1.5 overflow-y-auto py-2">
        <div v-for="(f, i) in previewFiles" :key="i" class="flex items-center gap-2.5 rounded-chip bg-white/[0.04] p-2">
          <span
            class="flex-none rounded-badge px-1.5 py-1 font-mono text-[0.58rem] font-extrabold text-white"
            :style="{ background: fileBadge(f.name, f.type).color }"
          >
            {{ fileBadge(f.name, f.type).label }}
          </span>
          <span class="flex-1 truncate text-sm text-white">{{ f.name }}</span>
          <span class="flex-none font-mono text-xs text-haze-400">{{ formatSize(f.size) }}</span>
        </div>
      </div>
      <template #footer>
        <Button label="Annulla" severity="secondary" outlined @click="() => { previewModalVisible = false; previewFiles = [] }" />
        <Button :label="`Carica ${previewFiles.length} file`" @click="handleFilesConfirm(previewFiles)" />
      </template>
    </Dialog>

    <ShareFileModal
      :visible="shareUserModalVisible"
      :file="fileToShare"
      :on-close="() => { shareUserModalVisible = false; fileToShare = null }"
      :on-success="refreshAll"
    />
  </div>
</template>
