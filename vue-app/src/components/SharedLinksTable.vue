<script setup lang="ts">
import { ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { notify } from '@/src/utils/notify'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useShareLink } from '@/src/composables/useShareLink'
import QrCode from '@/src/components/ui/QrCode.vue'
import type { SharedLink } from '@/src/types'

/**
 * Gestione dei link generati (roadmap F5).
 *
 * ⚠️ CORREZIONE IMPORTANTE — "Copia link" consegnava link rotti.
 * Per un file cifrato, la chiave vive nel frammento `#key=…&iv=…` dell'URL. Quel
 * frammento viene costruito lato client SOLO nell'istante in cui il link nasce
 * (`useSharedLinks.createLink` → `encryptedUrl`); il record salvato dal server ha un
 * `url` senza frammento, ed è corretto che sia così: il server la chiave non la vede
 * mai. Ma dopo un ricaricamento `fetchLinks()` ripopola la tabella da quel record, e
 * il vecchio `handleCopyLink(data.url)` copiava l'URL monco: il destinatario apriva
 * il link, non vedeva nessun badge E2E e si scaricava ciphertext inservibile.
 *
 * Il frammento va quindi RICOSTRUITO, prendendo la chiave del file dal vault locale.
 * Se il vault è chiuso o la chiave non è su questo dispositivo, ci si rifiuta di
 * consegnare il link e si spiega perché — meglio un errore chiaro che un link rotto
 * in giro. Quella regola vive ora in [useShareLink.ts](../composables/useShareLink.ts),
 * perché qui i modi di consegnare un link sono due: copia e **QR**.
 */

dayjs.extend(relativeTime)

const props = defineProps<{
  links: SharedLink[]
  onRevoke: (id: string) => Promise<boolean>
  onRegenerate: (id: string) => Promise<boolean>
  onUpdate: (id: string, updates: Partial<SharedLink>) => Promise<boolean>
  onDelete?: (id: string) => Promise<boolean>
}>()

const confirm = useConfirm()
const { resolveShareUrl } = useShareLink()

const settingsModalVisible = ref(false)
const currentLink = ref<SharedLink | null>(null)
const newPassword = ref('')
const newExpiry = ref<Date | null>(null)
const updating = ref(false)

const qrModalVisible = ref(false)
const qrUrl = ref('')
const qrFileName = ref('')
const qrIsEncrypted = ref(false)

const isLinkActive = (link: SharedLink) => !link.revokedAt && !dayjs(link.expiresAt).isBefore(dayjs())

const STATUS = {
  revoked: { dot: 'bg-crit-400', text: 'Revocato' },
  expired: { dot: 'bg-warn-400', text: 'Scaduto' },
  active: { dot: 'bg-verified-400', text: 'Attivo' },
}

const renderStatus = (link: SharedLink) => {
  if (link.revokedAt) return STATUS.revoked
  if (dayjs(link.expiresAt).isBefore(dayjs())) return STATUS.expired
  return STATUS.active
}

const openSettings = (link: SharedLink) => {
  currentLink.value = link
  newPassword.value = ''
  newExpiry.value = link.expiresAt ? new Date(link.expiresAt) : null
  settingsModalVisible.value = true
}

/** Ricostruisce il link completo di chiave. Vedi la nota in testa al file. */
const handleCopyLink = async (link: SharedLink) => {
  const resolved = await resolveShareUrl(link)
  if (!resolved.ok) {
    if (resolved.reason === 'locked') notify.warning(resolved.message)
    else notify.error(resolved.message)
    return
  }

  try {
    await navigator.clipboard.writeText(resolved.url)
    notify.success(link.isEncrypted ? 'Link copiato — chiave inclusa nel frammento #' : 'Link copiato negli appunti')
  } catch {
    notify.error('Impossibile copiare negli appunti')
  }
}

/**
 * QR dello stesso link, dalla stessa fonte: se la chiave non è ricostruibile il
 * codice non si apre proprio, invece di mostrare un quadrato che porta a un file
 * illeggibile.
 */
const handleShowQr = async (link: SharedLink) => {
  const resolved = await resolveShareUrl(link)
  if (!resolved.ok) {
    if (resolved.reason === 'locked') notify.warning(resolved.message)
    else notify.error(resolved.message)
    return
  }
  qrUrl.value = resolved.url
  qrFileName.value = link.fileName
  qrIsEncrypted.value = link.isEncrypted
  qrModalVisible.value = true
}

const handleSaveSettings = async () => {
  if (!currentLink.value) return
  updating.value = true
  const updates: Partial<SharedLink> & { password?: string } = {}
  if (newPassword.value) {
    updates.isPasswordProtected = true
    updates.password = newPassword.value
  }
  if (newExpiry.value) updates.expiresAt = newExpiry.value.toISOString()
  const success = await props.onUpdate(currentLink.value.id, updates)
  updating.value = false
  // Sull'errore niente toast qui: lo mostra già updateLink, con il messaggio del server.
  if (success) { notify.success('Impostazioni aggiornate'); settingsModalVisible.value = false }
}

// Conferma ancorata al pulsante cliccato (ConfirmPopup group="popup")
const askConfirm = (event: Event, message: string, danger: boolean, accept: () => void) => {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    group: 'popup',
    message,
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: 'Conferma', severity: danger ? 'danger' : 'primary', size: 'small' },
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true, size: 'small' },
    accept,
  })
}
</script>

<template>
  <DataTable :value="links" data-key="id" size="small">
    <template #empty>
      <div class="py-10 text-center">
        <p class="m-0 text-haze-200">Nessun link generato</p>
        <p class="m-0 mt-1.5 text-sm text-haze-400">I link che crei dai tuoi file compaiono qui.</p>
      </div>
    </template>

    <Column header="File">
      <template #body="{ data }">
        <div class="flex items-center gap-2">
          <i class="pi pi-link flex-none text-haze-400" />
          <span v-tooltip.top="data.fileName" class="max-w-[200px] cursor-help truncate font-medium text-haze-100">
            {{ data.fileName }}
          </span>
        </div>
      </template>
    </Column>

    <Column header="Protezione">
      <template #body="{ data }">
        <div class="flex items-center gap-2.5 font-mono text-[0.74rem]">
          <span
            v-tooltip.top="data.isEncrypted ? 'Cifrato end-to-end: la chiave viaggia nel frammento # del link' : 'Non cifrato'"
            class="cursor-help"
            :class="data.isEncrypted ? 'text-verified-400' : 'text-haze-400'"
          >
            {{ data.isEncrypted ? 'E2E' : '—' }}
          </span>
          <span
            v-tooltip.top="data.isPasswordProtected ? 'Protetto da password' : 'Senza password'"
            class="cursor-help"
            :class="data.isPasswordProtected ? 'text-haze-200' : 'text-haze-400'"
          >
            <i :class="data.isPasswordProtected ? 'pi pi-lock' : 'pi pi-lock-open'" />
          </span>
        </div>
      </template>
    </Column>

    <Column header="Download">
      <template #body="{ data }">
        <span class="font-mono text-[0.8rem] text-haze-300">
          {{ data.downloadCount }}{{ data.maxDownloads ? ` / ${data.maxDownloads}` : '' }}
        </span>
      </template>
    </Column>

    <Column header="Scadenza">
      <template #body="{ data }">
        <span
          v-tooltip.top="dayjs(data.expiresAt).format('DD/MM/YYYY HH:mm')"
          class="cursor-help font-mono text-[0.8rem] text-haze-300"
        >
          {{ dayjs(data.expiresAt).fromNow() }}
        </span>
      </template>
    </Column>

    <Column header="Stato">
      <template #body="{ data }">
        <span class="inline-flex items-center gap-1.5 text-[0.86rem] text-haze-300">
          <span class="h-2 w-2 rounded-full" :class="renderStatus(data).dot" />
          {{ renderStatus(data).text }}
        </span>
      </template>
    </Column>

    <Column header="Creato">
      <template #body="{ data }">
        <span class="font-mono text-[0.8rem] text-haze-300">{{ dayjs(data.createdAt).format('DD/MM/YYYY') }}</span>
      </template>
    </Column>

    <Column header="">
      <template #body="{ data }">
        <div class="flex items-center justify-end gap-1">
          <template v-if="isLinkActive(data)">
            <Button v-tooltip.top="'Copia link'" icon="pi pi-copy" text @click="handleCopyLink(data)" />
            <Button v-tooltip.top="'Codice QR'" icon="pi pi-qrcode" text @click="handleShowQr(data)" />
            <Button v-tooltip.top="'Impostazioni'" icon="pi pi-cog" text @click="openSettings(data)" />
            <Button
              v-tooltip.top="'Rigenera'"
              icon="pi pi-refresh"
              text
              @click="askConfirm($event, 'Rigenerare il link? Quello vecchio smetterà di funzionare.', false, () => props.onRegenerate(data.id))"
            />
            <Button
              v-tooltip.top="'Revoca'"
              icon="pi pi-ban"
              text
              severity="danger"
              @click="askConfirm($event, 'Revocare il link? Non sarà più accessibile a nessuno.', true, () => props.onRevoke(data.id))"
            />
          </template>
          <template v-else>
            <Button
              v-tooltip.top="'Rigenera'"
              icon="pi pi-refresh"
              text
              @click="askConfirm($event, 'Rigenerare il link? Ne verrà creato uno nuovo valido.', false, () => props.onRegenerate(data.id))"
            />
            <Button
              v-if="props.onDelete"
              v-tooltip.top="'Elimina dalla lista'"
              icon="pi pi-trash"
              text
              severity="danger"
              @click="askConfirm($event, 'Eliminare il link dalla lista?', true, () => props.onDelete!(data.id))"
            />
          </template>
        </div>
      </template>
    </Column>
  </DataTable>

  <Dialog v-model:visible="settingsModalVisible" modal header="Impostazioni del link" :style="{ width: 'min(450px, 94vw)' }">
    <div class="space-y-4 py-2">
      <div>
        <label class="lt-label mb-1.5 block !text-haze-400">Nuova password</label>
        <Password v-model="newPassword" placeholder="Lascia vuoto per non cambiarla" :feedback="false" toggle-mask fluid />
      </div>
      <div>
        <label class="lt-label mb-1.5 block !text-haze-400">Scadenza</label>
        <DatePicker v-model="newExpiry" show-time hour-format="24" :min-date="new Date()" date-format="dd/mm/yy" fluid />
      </div>
    </div>
    <template #footer>
      <Button label="Annulla" severity="secondary" outlined @click="settingsModalVisible = false" />
      <Button label="Salva" :loading="updating" @click="handleSaveSettings" />
    </template>
  </Dialog>

  <!-- QR del link: il modo diretto per aprire un file sul telefono che hai in mano.
       Sfondo bianco sempre, anche in tema scuro: un QR si legge per contrasto. -->
  <Dialog v-model:visible="qrModalVisible" modal header="Codice QR del link" :style="{ width: 'min(360px, 94vw)' }">
    <div class="flex flex-col items-center gap-3 py-1">
      <div class="rounded-well bg-white p-3">
        <QrCode :value="qrUrl" :size="200" label="Codice QR del link di condivisione" />
      </div>
      <p class="max-w-[30ch] text-center text-[0.84rem] font-semibold text-haze-100">{{ qrFileName }}</p>
      <p v-if="qrIsEncrypted" class="max-w-[32ch] text-center font-mono text-[0.68rem] leading-normal text-haze-400">
        contiene la chiave: chi lo inquadra scarica il file
      </p>
    </div>
    <template #footer>
      <Button label="Chiudi" severity="secondary" outlined @click="qrModalVisible = false" />
    </template>
  </Dialog>
</template>
