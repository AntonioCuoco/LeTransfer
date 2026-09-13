<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { notify } from '@/src/utils/notify'
import { useFileDragAndDrop } from '@/src/composables/useFileDragAndDrop'
import { useFileFromDynamoDB } from '@/src/composables/useFileFromDynamoDB'
import { useRecipientVerification } from '@/src/composables/useRecipientVerification'
import { useSendFiles, type SendItem } from '@/src/composables/useSendFiles'
import { useEncryptionStore } from '@/src/stores/encryption'
import { importKeyFromBase64 } from '@/src/crypto/crypto'
import { resolveFileName } from '@/src/utils/fileNames'
import RecipientFingerprintDialog from '@/src/components/RecipientFingerprintDialog.vue'
import type { DynamoDBFile } from '@/src/types'

/**
 * «Manda a una persona» — il riquadro 02 della Homepage.
 *
 * Riscritto sopra la condivisione che funziona. Il componente di prima chiamava un endpoint
 * inesistente (`POST /share/send`), non caricava i file dal computer, non cifrava la chiave per
 * il destinatario e aveva un campo «messaggio» che il server non ha mai ricevuto. Ora:
 *  - l'invio vero sta in useSendFiles (testato), gli stessi passi di «Condividi»;
 *  - la verifica dell'impronta è quella di «Condividi» (useRecipientVerification);
 *  - niente messaggio: il server lo conserverebbe in chiaro, e qui non si scrive nulla in chiaro.
 */

const emit = defineEmits<{ fileSent: [] }>()

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const encryptionStore = useEncryptionStore()
const verification = useRecipientVerification()
const { isSending, send } = useSendFiles({ verifyRecipient: verification.askApproval })
const { files: ownFiles, isLoading: isLoadingOwnFiles, loadFiles } = useFileFromDynamoDB()

const recipientEmails = ref<string[]>([])
const currentEmail = ref('')
const items = ref<SendItem[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// ── I tuoi file, con il nome vero ────────────────────────────────────────────────
// Con `nameVersion: 2` il nome che arriva dal server è ciphertext: si apre con la chiave del
// file, quindi solo a vault sbloccato. Stessa logica della tabella in «I tuoi file».
const selectableOwnFiles = computed(() => ownFiles.value.filter((file) => !file.isReceived))
const ownFileNames = ref<Record<string, string>>({})

async function resolveOwnFileNames() {
  const names: Record<string, string> = {}
  for (const file of selectableOwnFiles.value) {
    const keyData = encryptionStore.isUnlocked ? await encryptionStore.getKey(file.s3Key) : null
    names[file.s3Key] = await resolveFileName(file, keyData ? await importKeyFromBase64(keyData.key) : null)
  }
  ownFileNames.value = names
}

watch([ownFiles, () => encryptionStore.isUnlocked], () => { void resolveOwnFileNames() })
onMounted(() => { void loadFiles({ limit: 100, onlyOwned: true }) })

// ── Destinatari ──────────────────────────────────────────────────────────────────
function addEmail() {
  const email = currentEmail.value.trim()
  if (!EMAIL_PATTERN.test(email)) {
    notify.error('Scrivi un indirizzo email valido.', 'Email non valida')
    return
  }
  if (recipientEmails.value.some((existing) => existing.toLowerCase() === email.toLowerCase())) {
    notify.warning(`${email} è già fra i destinatari.`, 'Già aggiunto')
    return
  }
  recipientEmails.value = [...recipientEmails.value, email]
  currentEmail.value = ''
}

function removeEmail(email: string) {
  recipientEmails.value = recipientEmails.value.filter((existing) => existing !== email)
}

// ── File ─────────────────────────────────────────────────────────────────────────
function addLocalFiles(files: File[]) {
  items.value = [
    ...items.value,
    ...files.map((file): SendItem => ({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      source: 'local',
      file,
      status: 'pending',
    })),
  ]
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) addLocalFiles(Array.from(input.files))
  // Senza azzerarlo, scegliere di nuovo lo stesso file non farebbe scattare `change`.
  input.value = ''
}

const { isDragOver, dragProps, dropZoneRef } = useFileDragAndDrop({ onFilesDropped: addLocalFiles })

const isSelected = (s3Key: string) => items.value.some((item) => item.s3Key === s3Key)

function addOwnFile(file: DynamoDBFile) {
  if (isSelected(file.s3Key)) return
  items.value = [
    ...items.value,
    {
      id: `space-${file.s3Key}`,
      name: ownFileNames.value[file.s3Key] || file.fileName || 'File',
      size: file.formattedSize || file.fileSize || '',
      source: 'space',
      s3Key: file.s3Key,
      status: 'pending',
    },
  ]
}

function removeItem(id: string) {
  items.value = items.value.filter((item) => item.id !== id)
}

function sizeLabel(size: number | string): string {
  if (typeof size === 'string') return size
  if (size === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)))
  return `${parseFloat((size / Math.pow(1024, index)).toFixed(1))} ${units[index]}`
}

const STATUS_LABEL: Record<SendItem['status'], string> = {
  pending: '',
  uploading: 'cifro e carico…',
  sent: 'consegnato ✓',
  partial: 'solo in parte',
  error: 'non inviato',
}

const statusClass = (item: SendItem) =>
  item.status === 'sent' ? 'text-verified-400'
    : item.status === 'error' || item.status === 'partial' ? 'text-crit-400'
      : 'text-haze-400'

// ── Invio ────────────────────────────────────────────────────────────────────────
const hasTypedValidEmail = computed(() => EMAIL_PATTERN.test(currentEmail.value.trim()))
const canSend = computed(
  () => !isSending.value && items.value.length > 0 && (recipientEmails.value.length > 0 || hasTypedValidEmail.value),
)
const sendLabel = computed(() => {
  if (isSending.value) return 'Invio in corso…'
  return items.value.length > 1 ? `Invia ${items.value.length} file cifrati` : 'Invia cifrato'
})

async function handleSend() {
  // Un'email scritta ma non ancora aggiunta con «+» è chiaramente un destinatario.
  if (hasTypedValidEmail.value) addEmail()
  if (!canSend.value) return

  const fileCount = items.value.length
  const recipients = [...recipientEmails.value]
  const outcome = await send(items.value, recipients)
  if (outcome.aborted) return

  // Gli upload dal computer finiscono comunque nel tuo spazio: le statistiche vanno aggiornate.
  emit('fileSent')

  if (outcome.failed === 0) {
    const what = fileCount === 1 ? 'Il file è stato consegnato' : `${fileCount} file consegnati`
    const who = recipients.length === 1 ? recipients[0] : `${recipients.length} destinatari`
    notify.success(`${what} a ${who}. Solo loro possono aprirli.`, 'Inviato')
    items.value = []
    recipientEmails.value = []
    return
  }

  // Parziale: restano in lista solo i file da riprovare; quelli dal computer già caricati non
  // si ricaricano (useSendFiles li ha già segnati come «nel tuo spazio»).
  items.value = items.value.filter((item) => item.status !== 'sent')
  if (outcome.delivered > 0) {
    notify.warning(
      `${outcome.delivered} consegne riuscite, ${outcome.failed} no. I file rimasti in lista non sono arrivati a tutti: puoi riprovare.`,
      'Invio parziale',
    )
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Destinatari -->
    <div>
      <label for="send-recipient" class="lt-label mb-2 block !text-haze-400">Destinatari</label>
      <div class="flex gap-2">
        <InputText
          id="send-recipient"
          v-model="currentEmail"
          type="email"
          placeholder="email@esempio.it"
          fluid
          class="flex-1"
          :disabled="isSending"
          @keydown.enter.prevent="addEmail"
        />
        <Button icon="pi pi-plus" aria-label="Aggiungi destinatario" :disabled="isSending" @click="addEmail" />
      </div>
      <div v-if="recipientEmails.length" class="mt-2 flex flex-wrap gap-2">
        <Chip v-for="email in recipientEmails" :key="email" :label="email" :removable="!isSending" @remove="removeEmail(email)" />
      </div>
      <p class="m-0 mt-2 font-mono text-[0.7rem] text-haze-400">serve un account Novren con la cifratura attiva</p>
    </div>

    <!-- File dal computer -->
    <div>
      <p class="lt-label mb-2 !text-haze-400">File</p>
      <div
        ref="dropZoneRef"
        v-bind="dragProps"
        class="cursor-pointer rounded-well border-2 border-dashed p-5 text-center transition-colors"
        :class="isDragOver ? 'border-brand-400 bg-brand-500/10' : 'border-white/15 hover:border-brand-400 hover:bg-white/[0.04]'"
        @click="fileInputRef?.click()"
      >
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileInput" />
        <i class="pi pi-inbox mb-2 block text-2xl text-brand-400" />
        <p class="m-0 text-[0.9rem] font-semibold text-haze-100">
          {{ isDragOver ? 'Rilascia qui' : 'Trascina file o clicca per sceglierli' }}
        </p>
        <p class="m-0 mt-1 font-mono text-[0.7rem] text-haze-400">dal computer: prima si caricano, cifrati, nel tuo spazio</p>
      </div>
    </div>

    <!-- Dal tuo spazio -->
    <details v-if="selectableOwnFiles.length" class="rounded-well border border-white/10 bg-white/[0.02]">
      <summary class="cursor-pointer list-none px-4 py-3 text-[0.88rem] font-semibold text-haze-200 hover:text-haze-100">
        Scegli dai tuoi file ({{ selectableOwnFiles.length }}) →
      </summary>
      <ul class="m-0 flex max-h-44 list-none flex-col gap-1 overflow-y-auto border-t border-white/10 p-2">
        <li v-for="file in selectableOwnFiles" :key="file.s3Key">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-chip px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] disabled:cursor-default disabled:opacity-40"
            :disabled="isSending || isSelected(file.s3Key)"
            @click="addOwnFile(file)"
          >
            <span class="truncate text-[0.86rem] text-haze-100">{{ ownFileNames[file.s3Key] || '…' }}</span>
            <span class="flex-none font-mono text-[0.7rem] text-haze-400">
              {{ isSelected(file.s3Key) ? 'aggiunto' : sizeLabel(file.formattedSize || file.fileSize || '') }}
            </span>
          </button>
        </li>
      </ul>
    </details>
    <p v-else-if="isLoadingOwnFiles" class="m-0 font-mono text-[0.72rem] text-haze-400">carico i tuoi file…</p>

    <!-- Selezionati -->
    <ul v-if="items.length" class="m-0 flex list-none flex-col gap-1.5 p-0">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-center gap-2.5 rounded-chip border border-white/5 bg-white/[0.02] px-3 py-1.5"
      >
        <i :class="item.source === 'local' ? 'pi pi-upload' : 'pi pi-folder'" class="flex-none text-[0.8rem] text-brand-400" />
        <span class="flex-1 truncate text-[0.86rem] text-haze-100" :title="item.name">{{ item.name }}</span>
        <span class="flex-none font-mono text-[0.7rem]" :class="statusClass(item)">
          {{ STATUS_LABEL[item.status] || sizeLabel(item.size) }}
        </span>
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="`Togli ${item.name}`"
          :disabled="isSending"
          @click="removeItem(item.id)"
        />
      </li>
    </ul>

    <div class="flex justify-end">
      <Button
        :label="sendLabel"
        :icon="isSending ? undefined : 'pi pi-send'"
        :loading="isSending"
        :disabled="!canSend"
        @click="handleSend"
      />
    </div>

    <!-- Tra «chiave pubblica scaricata» e «chiave del file consegnata», per ogni destinatario -->
    <RecipientFingerprintDialog
      :visible="verification.dialog.visible"
      :email="verification.dialog.email"
      :thumbprint="verification.dialog.thumbprint"
      :state="verification.dialog.state"
      :verified-at="verification.dialog.verifiedAt"
      @confirm="verification.settle(true)"
      @cancel="verification.settle(false)"
    />
  </div>
</template>
