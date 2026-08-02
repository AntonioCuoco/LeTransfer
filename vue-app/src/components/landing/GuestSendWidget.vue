<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BrandSeal from './BrandSeal.vue'
import PrivacyReceipt from './PrivacyReceipt.vue'
import QrCode from '@/src/components/ui/QrCode.vue'
import { useGuestUpload } from '@/src/composables/useGuestUpload'
import { useTurnstile } from '@/src/composables/useTurnstile'
import { savePendingClaim } from '@/src/composables/usePendingClaim'
import { fileBadge } from '@/src/utils/fileBadge'
import { notify } from '@/src/utils/notify'

/**
 * Widget d'invio "senza account": aggiungi → configura → invia.
 * 1 file → upload diretto; più file / cartella → zip in streaming (useGuestUpload).
 * La chiave resta nel fragment del link; il server vede solo ciphertext.
 * Emette start/done/reset così che la pagina faccia reagire il campo generativo.
 */

const emit = defineEmits<{
  (event: 'start'): void
  (event: 'done'): void
  (event: 'reset'): void
}>()

const router = useRouter()
const { status, progress, fileProgress, result, errorMessage, upload, reset } = useGuestUpload()
const { enabled: turnstileEnabled, mount: mountTurnstile, getToken: getTurnstileToken, refresh: refreshTurnstile } = useTurnstile()

const files = ref<File[]>([])
const expiryDays = ref(7)
const passwordEnabled = ref(false)
const password = ref('')
const maxDownloads = ref<number | null>(null)
const optionsOpen = ref(false)

const isDragging = ref(false)
const qrOpen = ref(false)
const copyLabel = ref('Copia')
const claimLabel = ref('Reclama questo invio →')
const transferSummary = ref('')

const fileInputEl = ref<HTMLInputElement | null>(null)
const folderInputEl = ref<HTMLInputElement | null>(null)
const turnstileEl = ref<HTMLElement | null>(null)

// Senza account il cap reale è GUEST_MAX_EXPIRY = 168h: oltre, il backend clampa in
// silenzio. Meglio mostrare il limite (e l'upgrade) che promettere una scadenza falsa.
const expiryOptions = [
  { value: 1, label: '24h', locked: false },
  { value: 7, label: '7 giorni', locked: false },
  { value: 30, label: '30 giorni', locked: true },
]
const maxDownloadOptions = [
  { value: null, label: '∞' },
  { value: 1, label: '1' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
]

const view = computed<'compose' | 'encrypting' | 'ready'>(() => {
  if (status.value === 'done') return 'ready'
  if (status.value === 'idle' || status.value === 'error') return 'compose'
  return 'encrypting'
})

const statusText = computed(() => {
  switch (status.value) {
    case 'preparing':
      return 'Genero una chiave a 256 bit nel tuo browser…'
    case 'uploading':
      return files.value.length > 1 ? 'Comprimo e cifro i file — AES-256-GCM…' : 'Cifro e carico i blocchi — AES-256-GCM…'
    case 'finalizing':
      return 'Creo il link condivisibile…'
    default:
      return ''
  }
})

const stateLabel = computed(() => {
  if (view.value === 'encrypting') return 'cifratura in corso'
  if (view.value === 'ready') return 'cifrato · zero-knowledge'
  return 'in chiaro sul device'
})
const stateLabelClass = computed(() => (view.value === 'encrypting' ? 'text-[#724cf9]' : 'text-[#12b89a]'))

const totalLabel = computed(() => formatSize(files.value.reduce((acc, f) => acc + f.size, 0)))

const linkBase = computed(() => (result.value ? result.value.shareUrl.split('#')[0].replace(/^https?:\/\//, '') : ''))
const linkFragmentPreview = computed(() => {
  if (!result.value) return ''
  const fragment = result.value.shareUrl.split('#')[1] || ''
  return fragment ? `#${fragment.slice(0, 8)}…` : ''
})

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

function addFiles(list: FileList | null | undefined) {
  if (list && list.length) files.value.push(...Array.from(list))
}
function openFilePicker() {
  if (view.value === 'compose') fileInputEl.value?.click()
}
function openFolderPicker() {
  if (view.value === 'compose') folderInputEl.value?.click()
}
function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(input.files)
  input.value = ''
}
function onFolderInput(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(input.files)
  input.value = ''
}
function onDrop(event: DragEvent) {
  isDragging.value = false
  if (view.value !== 'compose') return
  addFiles(event.dataTransfer?.files)
}
function removeFile(index: number) {
  files.value.splice(index, 1)
}

function summarize(): string {
  const filePart = files.value.length === 1 ? files.value[0].name : `${files.value.length} file`
  const expiryLabel = expiryDays.value === 1 ? '24 ore' : `${expiryDays.value} giorni`
  const extras: string[] = []
  if (passwordEnabled.value && password.value) extras.push('protetto')
  if (maxDownloads.value) extras.push(`max ${maxDownloads.value} download`)
  return `${filePart} · cifrato · scade tra ${expiryLabel}${extras.length ? ` · ${extras.join(' · ')}` : ''}`
}

async function startUpload() {
  if (files.value.length === 0) return
  // Se TURNSTILE_SECRET è impostata sul backend, init richiede un token valido.
  const turnstileToken = await getTurnstileToken()
  transferSummary.value = summarize()
  emit('start')
  await upload(files.value, {
    turnstileToken,
    expiresInHours: expiryDays.value * 24,
    password: passwordEnabled.value && password.value ? password.value : undefined,
    maxDownloads: maxDownloads.value ?? undefined,
  })
  refreshTurnstile()
}

function resetWidget() {
  reset()
  files.value = []
  qrOpen.value = false
  emit('reset')
}

function copyLink() {
  const url = result.value?.shareUrl
  if (!url) return
  try {
    navigator.clipboard?.writeText(url)
  } catch {
    // clipboard non disponibile
  }
  copyLabel.value = 'Copiato ✓'
  window.setTimeout(() => { copyLabel.value = 'Copia' }, 1400)
}

function claimTransfer() {
  if (result.value) {
    savePendingClaim({
      publicToken: result.value.publicToken,
      manageToken: result.value.manageToken,
      fileName: files.value.length === 1 ? files.value[0].name : `${files.value.length} file`,
    })
  }
  claimLabel.value = 'Ti portiamo alla registrazione…'
  router.push('/register')
}

watch(status, (current) => {
  if (current === 'done') {
    emit('done')
  } else if (current === 'error') {
    notify.error(errorMessage.value || 'Invio non riuscito')
    emit('reset')
    reset()
  }
})

onMounted(() => {
  if (turnstileEnabled) {
    mountTurnstile(turnstileEl.value)
  }
})
</script>

<template>
  <div class="lt-card w-[min(460px,100%)] p-2.5">
    <!-- Intestazione -->
    <div class="flex items-center justify-between px-3.5 pb-3 pt-3.5">
      <div class="flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
        <BrandSeal :size="19" variant="plain" />
        Nuovo trasferimento
      </div>
      <div class="font-mono text-[0.66rem] font-semibold tracking-[0.04em]" :class="stateLabelClass">
        {{ stateLabel }}
      </div>
    </div>

    <!-- COMPOSE -->
    <div v-show="view === 'compose'" class="px-1.5 pb-1.5">
      <!-- Aggiungi -->
      <div
        class="rounded-[14px] border-[1.5px] border-dashed p-3.5 transition-colors"
        :class="isDragging ? 'border-[#7c4dff] bg-[#efe9fb]' : 'border-[#cdbff0] bg-[#f5f1fd]'"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <div class="grid grid-cols-2 gap-2.5">
          <button type="button" class="flex items-center justify-center gap-2 rounded-[11px] border border-[#e9e3f6] bg-white p-2.5 text-[0.9rem] font-semibold transition hover:-translate-y-px hover:border-[#7c4dff]" @click="openFilePicker">
            <span class="grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] bg-[#724cf9] text-white">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="#fff" stroke-width="2.2"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            Aggiungi file
          </button>
          <button type="button" class="flex items-center justify-center gap-2 rounded-[11px] border border-[#e9e3f6] bg-white p-2.5 text-[0.9rem] font-semibold transition hover:-translate-y-px hover:border-[#7c4dff]" @click="openFolderPicker">
            <span class="grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] bg-[#724cf9] text-white">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="#fff" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
            </span>
            Cartelle
          </button>
        </div>
        <div class="mt-2.5 text-center text-[0.8rem] text-[#9086ad]">oppure trascina i file qui</div>
      </div>

      <!-- Lista file (scrolla oltre l'altezza massima) -->
      <div v-if="files.length" class="mt-3 flex max-h-[184px] flex-col gap-1.5 overflow-y-auto">
        <div v-for="(file, index) in files" :key="index" class="flex items-center gap-2.5 rounded-[11px] border border-[#e9e3f6] bg-white px-2.5 py-2">
          <span class="flex-none rounded-md px-1.5 py-1 font-mono text-[0.58rem] font-extrabold tracking-[0.03em] text-white" :style="{ background: fileBadge(file.name, file.type).color }">{{ fileBadge(file.name, file.type).label }}</span>
          <span class="flex-1 truncate text-[0.86rem] font-semibold">{{ file.name }}</span>
          <span class="flex-none font-mono text-[0.72rem] text-[#6a5f8c]">{{ formatSize(file.size) }}</span>
          <button type="button" class="flex-none rounded-[7px] px-1.5 text-[1rem] leading-none text-[#9086ad] transition hover:bg-[#fdeceb] hover:text-[#d64545]" title="Rimuovi" @click="removeFile(index)">×</button>
        </div>
      </div>
      <div v-if="files.length" class="flex justify-between px-1.5 pb-1 pt-2 font-mono text-[0.72rem] text-[#6a5f8c]">
        <span>{{ files.length }} file</span><span class="font-bold text-[#1b1140]">{{ totalLabel }}</span>
      </div>

      <div class="lt-rule my-2.5"></div>

      <!-- Opzioni (dropdown chiuso di default) -->
      <button type="button" class="flex w-full items-center justify-between rounded-[11px] px-2.5 py-2.5 text-left text-[0.9rem] font-semibold transition hover:bg-[#f5f1fd]" @click="optionsOpen = !optionsOpen">
        <span class="flex items-center gap-2.5">
          <svg viewBox="0 0 24 24" class="h-[17px] w-[17px]" fill="none" stroke="#724cf9" stroke-width="1.8"><path d="M10.3 4h3.4l.5 2.3 2 .8 2-1.2 2.4 2.4-1.2 2 .8 2 2.3.5v3.4l-2.3.5-.8 2 1.2 2-2.4 2.4-2-1.2-2 .8-.5 2.3h-3.4l-.5-2.3-2-.8-2 1.2-2.4-2.4 1.2-2-.8-2L2 13.7v-3.4l2.3-.5.8-2-1.2-2 2.4-2.4 2 1.2 2-.8z" /><circle cx="12" cy="12" r="2.6" /></svg>
          Opzioni <span class="font-normal text-[#9086ad]">scadenza · password · max download</span>
        </span>
        <svg viewBox="0 0 24 24" class="h-4 w-4 transition-transform" :class="optionsOpen ? 'rotate-180' : ''" fill="none" stroke="#9086ad" stroke-width="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      <div v-show="optionsOpen" class="px-1 pt-1">
        <!-- Scadenza -->
        <div class="flex items-center justify-between gap-3 py-2">
          <span class="flex items-center gap-2.5 text-[0.9rem] font-semibold">
            <svg viewBox="0 0 24 24" class="h-[17px] w-[17px]" fill="none" stroke="#724cf9" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
            Scade tra
          </span>
          <div class="flex gap-1.5">
            <button
              v-for="opt in expiryOptions"
              :key="opt.value"
              type="button"
              class="rounded-[9px] border px-2.5 py-1 font-mono text-[0.74rem] font-semibold transition"
              :class="opt.locked
                ? 'cursor-default border-dashed border-[#e0d8f4] bg-transparent text-[#b3a8cf]'
                : expiryDays === opt.value
                  ? 'border-[#724cf9] bg-[#724cf9] text-white'
                  : 'border-[#e9e3f6] bg-white text-[#6a5f8c] hover:border-[#7c4dff]'"
              :title="opt.locked ? 'Serve un account' : undefined"
              @click="opt.locked ? router.push('/register') : (expiryDays = opt.value)"
            >
              {{ opt.locked ? `🔒 ${opt.label}` : opt.label }}
            </button>
          </div>
        </div>
        <p class="px-1 pb-1 text-[0.72rem] text-[#9086ad]">Senza account i link durano al massimo 7 giorni.</p>

        <!-- Password -->
        <div class="flex items-center justify-between gap-3 py-2">
          <span class="flex items-center gap-2.5 text-[0.9rem] font-semibold">
            <svg viewBox="0 0 24 24" class="h-[17px] w-[17px]" fill="none" stroke="#724cf9" stroke-width="1.8"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            Password <span class="font-normal text-[#9086ad]">opzionale</span>
          </span>
          <button type="button" class="relative h-[23px] w-10 flex-none rounded-full transition-colors" :class="passwordEnabled ? 'bg-[#724cf9]' : 'bg-[#dcd3ef]'" @click="passwordEnabled = !passwordEnabled">
            <span class="absolute top-[2.5px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all" :class="passwordEnabled ? 'left-[19px]' : 'left-[2.5px]'"></span>
          </button>
        </div>
        <div v-show="passwordEnabled" class="px-0.5 pb-2">
          <input v-model="password" type="text" placeholder="Imposta una password per il link" class="w-full rounded-[10px] border border-[#e9e3f6] bg-white px-2.5 py-2 font-mono text-[0.82rem] outline-none focus:border-[#724cf9]" />
        </div>

        <!-- Max download -->
        <div class="flex items-center justify-between gap-3 py-2">
          <span class="flex items-center gap-2.5 text-[0.9rem] font-semibold">
            <svg viewBox="0 0 24 24" class="h-[17px] w-[17px]" fill="none" stroke="#724cf9" stroke-width="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            Max download
          </span>
          <div class="flex gap-1.5">
            <button v-for="opt in maxDownloadOptions" :key="String(opt.value)" type="button" class="rounded-[9px] border px-2.5 py-1 font-mono text-[0.74rem] font-semibold transition hover:border-[#7c4dff]" :class="maxDownloads === opt.value ? 'border-[#724cf9] bg-[#724cf9] text-white' : 'border-[#e9e3f6] bg-white text-[#6a5f8c]'" @click="maxDownloads = opt.value">{{ opt.label }}</button>
          </div>
        </div>
      </div>

      <div class="lt-rule my-2.5"></div>

      <div class="flex items-center gap-2 px-1.5 pb-1 font-mono text-[0.7rem] text-[#6a5f8c]">
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="#12b89a" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        cifrato nel tuo browser · la chiave resta nel link
      </div>

      <div v-if="turnstileEnabled" ref="turnstileEl" class="my-2 flex justify-center px-1.5"></div>

      <!-- v-lift: il "cede alla pressione" sul bottone che avvia una cifratura
           potenzialmente lunga — è lì che serve la conferma tattile di aver premuto. -->
      <button v-lift type="button" class="lt-btn mt-1" :disabled="files.length === 0" @click="startUpload">
        Cifra e crea il link
      </button>
    </div>

    <!-- ENCRYPTING -->
    <div v-show="view === 'encrypting'" class="flex flex-col gap-3 px-4 pb-4 pt-7">
      <div class="flex items-center gap-2.5 font-mono text-[0.86rem] font-semibold">
        <span class="text-[#12b89a]">▸</span> {{ statusText }}
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-[#e4dbf6]">
        <div class="h-full rounded-full bg-[linear-gradient(90deg,#7c4dff,#37e7c4)] transition-all duration-100" :style="{ width: `${progress}%` }" />
      </div>
      <div class="flex justify-between font-mono text-[0.7rem] text-[#6a5f8c]">
        <span>{{ progress }}%</span>
        <span>il server riceve solo ciphertext</span>
      </div>

      <!-- Progresso per-file (F1.1). Con un file solo la barra qui sopra È già il
           suo progresso: ripeterlo sarebbe rumore. Da due in su serve, perché i file
           finiscono in un unico zip e senza questo non si saprebbe a che punto è quale. -->
      <div v-if="fileProgress.length > 1" class="mt-0.5 flex max-h-[168px] flex-col gap-1.5 overflow-y-auto">
        <div v-for="item in fileProgress" :key="item.name" class="rounded-[11px] border border-[#e9e3f6] bg-white px-2.5 py-2">
          <div class="flex items-center gap-2.5">
            <span class="flex-none rounded-md px-1.5 py-1 font-mono text-[0.56rem] font-extrabold tracking-[0.03em] text-white" :style="{ background: fileBadge(item.name, item.type).color }">
              {{ fileBadge(item.name, item.type).label }}
            </span>
            <span class="flex-1 truncate text-[0.82rem] font-semibold">{{ item.name }}</span>
            <span
              class="flex-none font-mono text-[0.66rem] tabular-nums"
              :class="item.status === 'done' ? 'font-bold text-[#12b89a]' : item.status === 'active' ? 'text-[#724cf9]' : 'text-[#a79cc4]'"
            >
              {{ item.status === 'done' ? 'cifrato ✓' : item.status === 'pending' ? 'in attesa' : `${item.percent}%` }}
            </span>
          </div>
          <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-[#e4dbf6]">
            <div
              class="h-full rounded-full transition-all duration-150"
              :class="item.status === 'done' ? 'bg-[#12b89a]' : 'bg-[#7c4dff]'"
              :style="{ width: `${item.percent}%` }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- READY -->
    <div v-show="view === 'ready'" class="flex flex-col gap-3 p-4">
      <div class="flex items-center gap-3">
        <BrandSeal :size="36" variant="check" />
        <div>
          <div class="text-base font-bold leading-tight">Link pronto</div>
          <div class="text-[0.78rem] text-[#6a5f8c]">{{ transferSummary }}</div>
        </div>
      </div>

      <div class="flex gap-2">
        <div class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-[11px] border border-[#e9e3f6] bg-white px-3 py-2.5 font-mono text-[0.78rem]">
          <span class="text-[#6a5f8c]">{{ linkBase }}</span><span class="font-bold text-[#12b89a]">{{ linkFragmentPreview }}</span>
        </div>
        <!-- Il QR è la scorciatoia per il caso più frequente: passare un file al
             telefono che hai in mano. Chiuso di default — è un'alternativa al link,
             non un secondo protagonista. -->
        <button
          v-lift
          type="button"
          class="flex-none rounded-[11px] border px-2.5 py-2.5 transition-colors"
          :class="qrOpen ? 'border-[#724cf9] bg-[#f5f1fd] text-[#724cf9]' : 'border-[#e9e3f6] bg-white text-[#6a5f8c] hover:border-[#7c4dff]'"
          :aria-expanded="qrOpen"
          aria-label="Mostra il codice QR del link"
          title="Codice QR"
          @click="qrOpen = !qrOpen"
        >
          <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="1.9">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM18 18h3v3h-3z" />
          </svg>
        </button>
        <button v-lift type="button" class="rounded-[11px] bg-[#1b1140] px-3.5 py-2.5 text-[0.84rem] font-bold text-white transition hover:brightness-125" @click="copyLink">{{ copyLabel }}</button>
      </div>

      <div v-if="qrOpen && result" class="flex flex-col items-center gap-2 rounded-[14px] border border-[#e9e3f6] bg-white p-3">
        <QrCode :value="result.shareUrl" :size="164" label="Codice QR del link di download" />
        <p class="max-w-[30ch] text-center font-mono text-[0.64rem] leading-normal text-[#6a5f8c]">
          contiene la chiave: chi lo inquadra scarica il file
        </p>
      </div>

      <div class="font-mono text-[0.66rem] leading-normal text-[#6a5f8c]">
        <b class="text-[#12b89a]">↑</b> la chiave vive nel fragment <b class="text-[#12b89a]">#</b> — non è mai stata inviata al server
      </div>

      <PrivacyReceipt variant="send" />

      <div class="flex items-center justify-between pt-0.5">
        <button type="button" class="cursor-pointer text-[0.82rem] font-semibold text-[#12b89a] hover:underline" @click="claimTransfer">{{ claimLabel }}</button>
        <button type="button" class="cursor-pointer text-[0.82rem] font-semibold text-[#6a5f8c] hover:underline" @click="resetWidget">Nuovo invio</button>
      </div>
    </div>

    <!-- input nascosti -->
    <input ref="fileInputEl" type="file" multiple class="hidden" @change="onFileInput" />
    <input ref="folderInputEl" type="file" webkitdirectory multiple class="hidden" @change="onFolderInput" />
  </div>
</template>
