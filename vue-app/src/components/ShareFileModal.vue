<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { notify } from '@/src/utils/notify'
import { useShareFile } from '@/src/composables/useShareFile'
import { useSharedLinks } from '@/src/composables/useSharedLinks'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useVerifiedKeys, type VerificationState } from '@/src/composables/useVerifiedKeys'
import { keyThumbprint } from '@/src/crypto/fingerprint'
import RecipientFingerprintDialog from '@/src/components/RecipientFingerprintDialog.vue'
import type { DynamoDBFile } from '@/src/types'

const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || window.location.origin

const props = defineProps<{
  visible: boolean
  file: DynamoDBFile | null
  onClose: () => void
  onSuccess?: () => void
  onLinkGenerated?: () => void
}>()

const confirm = useConfirm()
const { shareFile, isSharing } = useShareFile()
const { createLink, isCreating } = useSharedLinks()
const encryptionStore = useEncryptionStore()
const { checkRecipient, getVerified } = useVerifiedKeys()

const email = ref('')
const emailError = ref('')
const generatedLink = ref('')
const linkCopied = ref(false)
const usePassword = ref(false)
const password = ref('')
const expiresInHours = ref<number>(168)
const maxDownloads = ref<number | null>(null)
const useMaxDownloads = ref(false)

const resetState = () => {
  email.value = ''
  emailError.value = ''
  generatedLink.value = ''
  linkCopied.value = false
  usePassword.value = false
  password.value = ''
  expiresInHours.value = 168
  maxDownloads.value = null
  useMaxDownloads.value = false
}

watch(() => props.visible, (v) => { if (!v) resetState() })

const validateEmail = (val: string) => {
  if (!val.trim()) { emailError.value = 'Email obbligatoria'; return false }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { emailError.value = 'Formato email non valido'; return false }
  emailError.value = ''
  return true
}

// ── Verifica dell'impronta del destinatario (roadmap F2) ─────────────────────
// Il dialog si interpone tra "ho la chiave pubblica di X" e "ci wrappo dentro la
// chiave del file": è lì che l'utente può accorgersi che la chiave non è quella giusta.
const fingerprintVisible = ref(false)
const fingerprintEmail = ref('')
const fingerprintHex = ref('')
const fingerprintState = ref<VerificationState>('new')
const fingerprintVerifiedAt = ref<string | null>(null)
let resolveVerification: ((approved: boolean) => void) | null = null

const askFingerprintApproval = async (publicKey: CryptoKey, targetEmail: string): Promise<boolean> => {
  const thumbprint = await keyThumbprint(publicKey)
  fingerprintEmail.value = targetEmail
  fingerprintHex.value = thumbprint
  fingerprintState.value = await checkRecipient(targetEmail, thumbprint)
  fingerprintVerifiedAt.value = (await getVerified(targetEmail))?.verifiedAt ?? null
  fingerprintVisible.value = true
  return new Promise<boolean>((resolve) => { resolveVerification = resolve })
}

const settleVerification = (approved: boolean) => {
  fingerprintVisible.value = false
  resolveVerification?.(approved)
  resolveVerification = null
}

const handleEmailSubmit = async () => {
  if (!props.file || !validateEmail(email.value)) return
  await shareFile(props.file.s3Key, email.value.trim(), {
    verifyRecipient: askFingerprintApproval,
    onSuccess: () => {
      props.onClose()
      props.onSuccess?.()
    },
  })
}

const formatFileSize = (size: string | number): string => {
  if (typeof size === 'string') return size
  if (size === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(size) / Math.log(k))
  return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const handleGenerateLink = async () => {
  if (!props.file) return

  const encryptionData = await encryptionStore.getKey(props.file.s3Key)

  if (props.file.isEncrypted && !encryptionData) {
    const confirmed = await new Promise<boolean>(resolve => {
      confirm.require({
        header: 'Chiave di cifratura mancante',
        message: 'Questo file è cifrato (E2E) ma la chiave non è stata trovata. Il link permetterà di scaricare il file solo in formato cifrato. Vuoi procedere?',
        icon: 'pi pi-exclamation-triangle',
        acceptProps: { label: 'Genera comunque', severity: 'danger' },
        rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
        accept: () => resolve(true),
        reject: () => resolve(false),
        onHide: () => resolve(false),
      })
    })
    if (!confirmed) return
  }

  const link = await createLink(
    props.file.s3Key,
    props.file.fileName || props.file.originalName,
    typeof props.file.fileSize === 'string' ? props.file.fileSize : formatFileSize(props.file.fileSize),
    props.file.fileType,
    {
      password: usePassword.value ? password.value : undefined,
      expiresInHours: expiresInHours.value,
      maxDownloads: useMaxDownloads.value ? maxDownloads.value || undefined : undefined,
      encryptionKey: encryptionData?.key,
      encryptionIV: encryptionData?.iv,
    }
  )

  if (link) {
    const fullUrl = link.encryptedUrl || `${FRONTEND_URL}/share/${link.publicToken}`
    generatedLink.value = fullUrl
    if (encryptionData) notify.success('Link E2E cifrato generato!')
    else notify.warning('Link generato senza chiavi.')
    props.onLinkGenerated?.()
  }
}

const handleCopyLink = () => {
  if (!generatedLink.value) return
  navigator.clipboard.writeText(generatedLink.value)
  linkCopied.value = true
  notify.success('Link copiato negli appunti!')
  setTimeout(() => { linkCopied.value = false }, 2000)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :style="{ width: '520px' }"
    :pt="{ content: '!p-6' }"
    @update:visible="(v) => { if (!v) onClose() }"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-300 flex items-center justify-center">
          <i class="pi pi-share-alt text-white text-lg" />
        </div>
        <div>
          <h3 class="text-white text-lg font-semibold m-0">Condividi File</h3>
          <p class="text-haze-400 text-xs m-0">Invia o genera un link condivisibile</p>
        </div>
      </div>
    </template>

    <div v-if="file" class="space-y-6">
      <!-- File preview -->
      <div class="bg-gradient-to-r from-black/25 to-transparent border border-white/10 rounded-xl p-4">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
            <i class="pi pi-file text-white text-xl" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white font-medium truncate mb-1">{{ decodeURIComponent(file.fileName || file.originalName) }}</p>
            <div class="flex items-center gap-3 text-sm text-haze-400">
              <span>{{ formatFileSize(file.fileSize || file.formattedSize) }}</span>
              <span class="w-1 h-1 rounded-full bg-white/15" />
              <span class="truncate">{{ file.fileType }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Email form -->
      <div class="space-y-4">
        <div>
          <label class="text-haze-200 font-medium text-sm mb-2 block">Email del destinatario</label>
          <div class="relative">
            <i class="pi pi-envelope absolute left-3 top-1/2 -translate-y-1/2 text-primary z-10" />
            <InputText
              v-model="email"
              type="email"
              placeholder="esempio@email.com"
              :disabled="isSharing"
              :invalid="!!emailError"
              fluid
              class="!pl-10"
              @blur="validateEmail(email)"
            />
          </div>
          <p v-if="emailError" class="text-[#F4743B] mt-1 text-sm">{{ emailError }}</p>
        </div>
        <div class="bg-black/25 border border-white/10 rounded-xl p-4">
          <p class="text-haze-400 text-sm m-0">
            <span class="text-brand-400 font-medium">ℹ️ Nota:</span> Il destinatario deve essere un utente registrato sulla piattaforma.
          </p>
        </div>
        <div class="flex justify-end">
          <Button
            :label="isSharing ? 'Invio...' : 'Invia al destinatario'"
            :icon="isSharing ? undefined : 'pi pi-send'"
            :loading="isSharing"
            :disabled="!email.trim() || !!emailError || isSharing"
            size="large"
            @click="handleEmailSubmit"
          />
        </div>
      </div>

      <!-- Divider -->
      <div class="flex items-center gap-2">
        <div class="h-px bg-white/15 flex-1" />
        <span class="text-haze-400 text-xs uppercase tracking-wider">Oppure genera un link</span>
        <div class="h-px bg-white/15 flex-1" />
      </div>

      <!-- Link generation -->
      <div class="space-y-4">
        <div class="bg-black/25 border border-white/10 rounded-xl p-4 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="pi pi-lock text-primary" />
              <span class="text-haze-200 text-sm">Proteggi con password</span>
            </div>
            <ToggleSwitch v-model="usePassword" />
          </div>
          <Password v-if="usePassword" v-model="password" placeholder="Inserisci password" :feedback="false" toggle-mask fluid />

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="pi pi-clock text-primary" />
              <span class="text-haze-200 text-sm">Scadenza (ore)</span>
            </div>
            <InputNumber v-model="expiresInHours" :min="1" :max="720" :input-class="'w-20 text-center'" />
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-brand-400">📥</span>
              <span class="text-haze-200 text-sm">Limite download</span>
            </div>
            <ToggleSwitch v-model="useMaxDownloads" />
          </div>
          <InputNumber v-if="useMaxDownloads" v-model="maxDownloads" :min="1" :max="1000" placeholder="Max download" fluid />
        </div>

        <div v-if="generatedLink" class="flex gap-2">
          <div class="relative flex-1">
            <i class="pi pi-link absolute left-3 top-1/2 -translate-y-1/2 text-primary z-10" />
            <InputText
              :model-value="generatedLink"
              readonly
              type="text"
              fluid
              class="!pl-10 cursor-text text-sm"
              @click="($event.target as HTMLInputElement).select()"
            />
          </div>
          <Button
            :label="linkCopied ? 'Copiato!' : 'Copia'"
            :icon="linkCopied ? 'pi pi-check' : 'pi pi-copy'"
            :severity="linkCopied ? 'success' : undefined"
            @click="handleCopyLink"
          />
        </div>

        <Button
          :label="generatedLink ? 'Rigenera Link' : 'Genera Link Condivisibile'"
          icon="pi pi-link"
          :loading="isCreating"
          :disabled="isCreating || (usePassword && !password)"
          outlined
          size="large"
          class="w-full"
          @click="handleGenerateLink"
        />
      </div>

      <div class="flex justify-end pt-2">
        <Button
          label="Chiudi"
          severity="secondary"
          outlined
          size="large"
          :disabled="isSharing || isCreating"
          @click="onClose"
        />
      </div>
    </div>
  </Dialog>

  <!-- Si apre sopra il modale, tra "chiave pubblica scaricata" e "chiave del file consegnata" -->
  <RecipientFingerprintDialog
    :visible="fingerprintVisible"
    :email="fingerprintEmail"
    :thumbprint="fingerprintHex"
    :state="fingerprintState"
    :verified-at="fingerprintVerifiedAt"
    @confirm="settleVerification(true)"
    @cancel="settleVerification(false)"
  />
</template>
