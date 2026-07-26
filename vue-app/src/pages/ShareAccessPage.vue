<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { notify } from '@/src/utils/notify'
import { usePublicLink } from '@/src/composables/usePublicLink'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import BrandSeal from '@/src/components/landing/BrandSeal.vue'
import PrivacyReceipt from '@/src/components/landing/PrivacyReceipt.vue'
import LinkAccessForm from '@/src/components/LinkAccess/LinkAccessForm.vue'
import FilePreviewCard from '@/src/components/LinkAccess/FilePreviewCard.vue'
import LinkExpiredError from '@/src/components/LinkAccess/LinkExpiredError.vue'
import { fileBadge } from '@/src/utils/fileBadge'
import { parseKeyFromHash, importKeyFromBase64, importIVFromBase64, decryptFile } from '@/src/utils/crypto'
import { downloadAndDecryptV2, shouldWarnLargeDownload, DownloadCancelled } from '@/src/utils/streamingDownload'

/**
 * Ricezione di un link pubblico (roadmap F1.4) — l'altra metà della facciata.
 * Stesso mondo della landing (PublicShell) e stessa carta chiara del widget d'invio:
 * chi manda e chi riceve vedono lo stesso oggetto. La chiave arriva dal fragment `#`
 * dell'URL, quindi la decifratura avviene qui e il climax del sigillo si ripete.
 */

type PageState = 'loading' | 'access_form' | 'authenticated' | 'error'

interface EncryptionInfo {
  key: CryptoKey
  iv: Uint8Array
}

const route = useRoute()
const publicToken = ref(route.params.publicToken as string)

const shell = ref<InstanceType<typeof PublicShell> | null>(null)
const pageState = ref<PageState>('loading')
const isDownloading = ref(false)
const previewUrl = ref<string | null>(null)
const encryptionInfo = ref<EncryptionInfo | null>(null)
const isDecrypting = ref(false)
const decryptProgress = ref(0)
const isDone = ref(false)

const { linkInfo, linkStatus, isLoading, error, getLinkInfo, accessLink, downloadFile } = usePublicLink()

// ── Copy: la relazione umana prima del form ────────────────────────────────────
const senderName = computed(() => linkInfo.value?.ownerName?.trim() || '')

const headline = computed(() => {
  if (isDone.value) return 'Decifrato. È tuo.'
  return senderName.value ? `${senderName.value} ti ha mandato un file.` : 'Ti hanno mandato un file.'
})

const subline = computed(() => {
  if (isDone.value) {
    return 'Il file è stato decifrato qui, nel tuo browser. Il nostro server non ha mai avuto la chiave per aprirlo.'
  }
  if (encryptionInfo.value) {
    return 'È cifrato end-to-end. La chiave sta nel link che hai ricevuto — non ce l’abbiamo noi, quindi il file si apre solo da qui.'
  }
  return 'Il link è valido. Dì chi sei e potrai scaricarlo.'
})

const stateLabel = computed(() => {
  if (isDecrypting.value) return 'decifratura in corso'
  if (isDone.value) return 'decifrato · zero-knowledge'
  return encryptionInfo.value ? 'cifrato · chiave nel link' : 'link pubblico'
})
const stateLabelClass = computed(() => (isDecrypting.value ? 'text-[#724cf9]' : 'text-[#12b89a]'))

const badge = computed(() => fileBadge(linkInfo.value?.fileName || '', linkInfo.value?.fileType))

// "scade tra 6 giorni" è un dato del trasferimento, non decorazione: sta nei metadati.
const expiryLabel = computed(() => {
  const expiresAt = linkInfo.value?.expiresAt
  if (!expiresAt) return null
  const remainingMs = new Date(expiresAt).getTime() - Date.now()
  if (Number.isNaN(remainingMs)) return null
  if (remainingMs <= 0) return 'scaduto'
  const hours = Math.round(remainingMs / 3_600_000)
  if (hours < 1) return 'scade tra meno di un’ora'
  if (hours < 24) return `scade tra ${hours} ${hours === 1 ? 'ora' : 'ore'}`
  const days = Math.round(hours / 24)
  return `scade tra ${days} ${days === 1 ? 'giorno' : 'giorni'}`
})

// ── Flusso ─────────────────────────────────────────────────────────────────────
const extractEncryptionKey = async (): Promise<EncryptionInfo | null> => {
  const keyData = parseKeyFromHash(window.location.hash)
  if (!keyData) return null
  try {
    const key = await importKeyFromBase64(keyData.key)
    const iv = importIVFromBase64(keyData.iv)
    return { key, iv }
  } catch {
    notify.error('Impossibile importare la chiave di cifratura')
    return null
  }
}

const loadLinkInfo = async () => {
  if (!publicToken.value) { pageState.value = 'error'; return }

  const encInfo = await extractEncryptionKey()
  if (encInfo) encryptionInfo.value = encInfo

  const info = await getLinkInfo(publicToken.value)
  pageState.value = info ? 'access_form' : 'error'
}

onMounted(loadLinkInfo)

const handleAccessSubmit = async (visitorName: string, password?: string) => {
  if (!publicToken.value) return
  const response = await accessLink(publicToken.value, { visitorName, password })
  if (response) {
    pageState.value = 'authenticated'
    if (response.previewSupported && !encryptionInfo.value) {
      const url = await downloadFile(publicToken.value, 'preview')
      if (url) previewUrl.value = url
    }
  }
}

const handleDownload = async () => {
  if (!publicToken.value) return
  isDownloading.value = true
  const url = await downloadFile(publicToken.value, 'download')
  if (url) {
    if (encryptionInfo.value) {
      isDecrypting.value = true
      decryptProgress.value = 0
      shell.value?.surge()
      try {
        const info = linkInfo.value
        // Formato v2 (#6): decifratura a chunk in streaming — niente file intero in RAM.
        if (info?.formatVersion === 2 && info.chunkSize && info.originalSize != null) {
          if (shouldWarnLargeDownload(info.originalSize)) {
            notify.error('Su questo browser i file oltre ~2 GB potrebbero non scaricarsi: per file di queste dimensioni usa Chrome o Edge.')
          }
          await downloadAndDecryptV2({
            url,
            key: encryptionInfo.value.key,
            chunkSize: info.chunkSize,
            originalSize: info.originalSize,
            fileName: info.fileName || 'download',
            onProgress: (decryptedBytes, totalBytes) => {
              decryptProgress.value = totalBytes > 0
                ? Math.min(100, Math.round((decryptedBytes / totalBytes) * 100))
                : 0
            },
          })
          markDecrypted()
        } else {
          // --- Formato v1 (legacy): intero blob con un unico IV ---
          const res = await fetch(url)
          const encryptedBlob = await res.blob()
          const decryptedBlob = await decryptFile(encryptedBlob, encryptionInfo.value.key, encryptionInfo.value.iv)
          const downloadUrl = URL.createObjectURL(decryptedBlob)
          const a = document.createElement('a')
          a.href = downloadUrl
          a.download = linkInfo.value?.fileName || 'download'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(downloadUrl)
          markDecrypted()
        }
      } catch (err) {
        shell.value?.calm()
        if (!(err instanceof DownloadCancelled)) notify.error('Errore durante la decifratura del file')
      } finally {
        isDecrypting.value = false
      }
    } else {
      window.open(url, '_blank')
      notify.success('Download avviato!')
    }
  }
  isDownloading.value = false
}

// Climax speculare a quello dell'invio: il campo si calma e il sigillo si stampa.
function markDecrypted() {
  decryptProgress.value = 100
  isDone.value = true
  shell.value?.settle()
  shell.value?.stampSeal()
}

const handlePreview = () => {
  if (previewUrl.value) window.open(previewUrl.value, '_blank')
}
</script>

<template>
  <LinkExpiredError
    v-if="pageState === 'error' || (linkStatus !== 'valid' && linkStatus !== 'loading')"
    :status="linkStatus"
    :message="error || undefined"
  />

  <PublicShell v-else ref="shell" :show-nav="false">
    <div class="grid w-full flex-1 content-center gap-8 py-[clamp(26px,5vh,70px)] lg:grid-cols-[1.05fr_minmax(0,460px)] lg:items-center lg:gap-[60px]">
      <!-- Colonna narrativa: chi te l'ha mandato, e perché sei al sicuro -->
      <div class="max-w-[600px]">
        <p class="mb-[22px] font-mono text-[0.74rem] uppercase tracking-[0.32em] text-[#37e7c4]">
          {{ encryptionInfo ? 'Ricevuto · cifrato end-to-end' : 'Ricevuto · link condiviso' }}
        </p>
        <h1 class="mb-5 text-balance text-[clamp(2.3rem,5.4vw,4.2rem)] leading-[1.02] tracking-[-0.04em] [font-weight:840]">
          {{ headline }}
        </h1>
        <p class="max-w-[46ch] text-[clamp(1rem,1.5vw,1.18rem)] leading-relaxed text-[#b9ace2]">
          {{ subline }}
        </p>
      </div>

      <!-- La stessa carta chiara del widget d'invio -->
      <div class="w-[min(460px,100%)] rounded-[22px] bg-[#FBFAFF] p-2.5 text-[#1b1140] shadow-[0_40px_90px_-30px_rgba(8,2,24,0.7),inset_0_2px_0_rgba(255,255,255,0.5)] lg:justify-self-end">
        <div class="flex items-center justify-between px-3.5 pb-3 pt-3.5">
          <div class="flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
            <BrandSeal :size="19" :variant="isDone ? 'check' : 'plain'" />
            {{ isDone ? 'Trasferimento aperto' : 'File in arrivo' }}
          </div>
          <div class="font-mono text-[0.66rem] font-semibold tracking-[0.04em]" :class="stateLabelClass">
            {{ stateLabel }}
          </div>
        </div>

        <!-- In attesa delle info del link -->
        <div v-if="pageState === 'loading' || !linkInfo" class="px-4 pb-5 pt-2">
          <div class="h-3 w-2/3 animate-pulse rounded-full bg-[#ece5fa]" />
          <div class="mt-2.5 h-3 w-1/3 animate-pulse rounded-full bg-[#f2edfc]" />
          <p class="mt-4 font-mono text-[0.72rem] text-[#6a5f8c]">Verifico il link…</p>
        </div>

        <template v-else>
          <!-- Identità del file: il nome è la cosa più grande della carta -->
          <div class="px-2.5">
            <div class="flex items-start gap-2.5">
              <span
                class="mt-0.5 flex-none rounded-md px-1.5 py-1 font-mono text-[0.58rem] font-extrabold tracking-[0.03em] text-white"
                :style="{ background: badge.color }"
              >
                {{ badge.label }}
              </span>
              <h2 class="min-w-0 flex-1 break-words text-[1.15rem] font-bold leading-tight tracking-[-0.02em]" :title="linkInfo.fileName">
                {{ linkInfo.fileName }}
              </h2>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[0.72rem] text-[#6a5f8c]">
              <span class="font-bold text-[#1b1140]">{{ linkInfo.fileSize }}</span>
              <span class="text-[#cdbff0]">·</span>
              <span class="truncate">{{ linkInfo.fileType }}</span>
              <template v-if="expiryLabel">
                <span class="text-[#cdbff0]">·</span>
                <span>{{ expiryLabel }}</span>
              </template>
              <template v-if="linkInfo.isPasswordProtected">
                <span class="text-[#cdbff0]">·</span>
                <span>protetto da password</span>
              </template>
            </div>
          </div>

          <div class="my-3 h-px bg-[#f0ebfa]" />

          <div class="px-2.5 pb-2.5">
            <LinkAccessForm
              v-if="pageState === 'access_form'"
              :is-password-protected="linkInfo.isPasswordProtected"
              :is-loading="isLoading"
              :error="error"
              @submit="handleAccessSubmit"
            />
            <FilePreviewCard
              v-else
              :file-name="linkInfo.fileName"
              :file-type="linkInfo.fileType"
              :preview-url="previewUrl || undefined"
              :preview-supported="!!previewUrl"
              :is-downloading="isDownloading"
              :is-decrypting="isDecrypting"
              :decrypt-progress="decryptProgress"
              :is-done="isDone"
              :on-download="handleDownload"
              :on-preview="handlePreview"
            />

            <!-- La ricevuta: dopo la decifratura è un fatto, prima è una promessa -->
            <div v-if="encryptionInfo" class="pt-3">
              <PrivacyReceipt v-if="isDone" variant="receive" />
              <div v-else class="flex items-center gap-2 px-1.5 font-mono text-[0.7rem] text-[#6a5f8c]">
                <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 flex-none" fill="none" stroke="#12b89a" stroke-width="2">
                  <rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                si decifra nel tuo browser · la chiave è nel link
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <div class="relative z-[2] border-t border-white/10 px-[clamp(20px,5vw,64px)] py-4">
        <div class="flex flex-wrap items-center justify-between gap-x-10 gap-y-2">
          <div class="flex flex-wrap items-center gap-x-10 gap-y-2">
            <span class="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-[#37e7c4]">Come funziona</span>
            <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">La chiave viaggia nel frammento <b class="text-[#37e7c4]">#</b> del link</span>
            <span class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2]">Il server conserva solo ciphertext</span>
          </div>
          <a
            href="/"
            class="font-mono text-[0.74rem] tracking-[0.04em] text-[#b9ace2] underline-offset-4 transition-colors hover:text-[#F2ECFF] hover:underline"
          >
            Manda tu un file cifrato →
          </a>
        </div>
      </div>
    </template>
  </PublicShell>
</template>
