<script setup lang="ts">
import { ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { notify } from '@/src/utils/notify'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import type { SharedLink } from '@/src/types'

dayjs.extend(relativeTime)

const props = defineProps<{
  links: SharedLink[]
  onRevoke: (id: string) => Promise<boolean>
  onRegenerate: (id: string) => Promise<boolean>
  onUpdate: (id: string, updates: Partial<SharedLink>) => Promise<boolean>
  onDelete?: (id: string) => Promise<boolean>
}>()

const confirm = useConfirm()

const settingsModalVisible = ref(false)
const currentLink = ref<SharedLink | null>(null)
const newPassword = ref('')
const newExpiry = ref<Date | null>(null)
const updating = ref(false)

const isLinkActive = (link: SharedLink) => !link.revokedAt && !dayjs(link.expiresAt).isBefore(dayjs())

const renderStatus = (link: SharedLink) => {
  if (link.revokedAt) return { color: '#ff4d4f', text: 'Revocato' }
  if (dayjs(link.expiresAt).isBefore(dayjs())) return { color: '#eab308', text: 'Scaduto' }
  return { color: '#52c41a', text: 'Attivo' }
}

const openSettings = (link: SharedLink) => {
  currentLink.value = link
  newPassword.value = ''
  newExpiry.value = link.expiresAt ? new Date(link.expiresAt) : null
  settingsModalVisible.value = true
}

const handleCopyLink = (url: string) => {
  navigator.clipboard.writeText(url)
  notify.success('Link copiato negli appunti!')
}

const handleSaveSettings = async () => {
  if (!currentLink.value) return
  updating.value = true
  const updates: Partial<SharedLink> & { password?: string } = {}
  if (newPassword.value) updates.isPasswordProtected = true
  if (newExpiry.value) updates.expiresAt = newExpiry.value.toISOString()
  if (newPassword.value) updates.password = newPassword.value
  const success = await props.onUpdate(currentLink.value.id, updates)
  updating.value = false
  if (success) { notify.success('Impostazioni aggiornate'); settingsModalVisible.value = false }
  else notify.error("Errore durante l'aggiornamento")
}

// Inline confirmation anchored to the clicked button (ConfirmPopup group="popup")
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
      <div class="text-center py-8 text-[#9ca3af]">Nessun link generato trovato</div>
    </template>

    <Column header="File">
      <template #body="{ data }">
        <div class="flex items-center gap-2">
          <i class="pi pi-link text-white" />
          <span v-tooltip.top="data.url" class="font-medium text-white truncate cursor-help max-w-[180px]">{{ data.fileName }}</span>
        </div>
      </template>
    </Column>

    <Column header="Sicurezza">
      <template #body="{ data }">
        <span v-tooltip.top="data.isPasswordProtected ? 'Protetto da password' : 'Nessuna password'">
          <i :class="data.isPasswordProtected ? 'pi pi-lock' : 'pi pi-lock-open'" class="text-white" />
        </span>
      </template>
    </Column>

    <Column header="Download">
      <template #body="{ data }">
        <div class="flex items-center gap-1 text-[#DBD4D3]">
          <i class="pi pi-download" /> {{ data.downloadCount }}{{ data.maxDownloads ? ` / ${data.maxDownloads}` : '' }}
        </div>
      </template>
    </Column>

    <Column header="Scadenza">
      <template #body="{ data }">
        <span v-tooltip.top="dayjs(data.expiresAt).format('DD/MM/YYYY HH:mm')" class="flex items-center gap-1 text-[#DBD4D3] cursor-help">
          <i class="pi pi-clock" /> {{ dayjs(data.expiresAt).fromNow() }}
        </span>
      </template>
    </Column>

    <Column header="Stato">
      <template #body="{ data }">
        <span class="inline-flex items-center gap-1.5 text-[#DBD4D3]">
          <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: renderStatus(data).color }" />
          {{ renderStatus(data).text }}
        </span>
      </template>
    </Column>

    <Column header="Creato il">
      <template #body="{ data }">
        <span class="text-[#DBD4D3]">{{ dayjs(data.createdAt).format('DD/MM/YYYY') }}</span>
      </template>
    </Column>

    <Column header="Azioni">
      <template #body="{ data }">
        <div class="flex items-center gap-1">
          <template v-if="isLinkActive(data)">
            <Button v-tooltip.top="'Copia Link'" icon="pi pi-copy" text class="!text-[#DBD4D3]" @click="handleCopyLink(data.url)" />
            <Button v-tooltip.top="'Impostazioni'" icon="pi pi-cog" text class="!text-[#DBD4D3]" @click="openSettings(data)" />
            <Button
              v-tooltip.top="'Rigenera'"
              icon="pi pi-refresh"
              text
              class="!text-[#DBD4D3]"
              @click="askConfirm($event, 'Rigenera link? Il vecchio link smetterà di funzionare.', false, () => props.onRegenerate(data.id))"
            />
            <Button
              v-tooltip.top="'Revoca'"
              icon="pi pi-trash"
              text
              severity="danger"
              @click="askConfirm($event, 'Revoca link? Non sarà più accessibile.', true, () => props.onRevoke(data.id))"
            />
          </template>
          <template v-else>
            <Button
              v-tooltip.top="'Rigenera'"
              icon="pi pi-refresh"
              text
              class="!text-[#DBD4D3]"
              @click="askConfirm($event, 'Rigenera link? Verrà creato un nuovo link valido.', false, () => props.onRegenerate(data.id))"
            />
            <Button
              v-if="props.onDelete"
              v-tooltip.top="'Elimina'"
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

  <Dialog v-model:visible="settingsModalVisible" modal header="Impostazioni Link" :style="{ width: '450px' }">
    <div class="space-y-4 py-2">
      <div>
        <label class="block text-sm font-medium text-[#DBD4D3] mb-1">Nuova Password (vuoto = invariata)</label>
        <Password v-model="newPassword" placeholder="Inserisci nuova password" :feedback="false" toggle-mask fluid />
      </div>
      <div>
        <label class="block text-sm font-medium text-[#DBD4D3] mb-1">Data di Scadenza</label>
        <DatePicker v-model="newExpiry" show-time hour-format="24" :min-date="new Date()" date-format="dd/mm/yy" fluid />
      </div>
    </div>
    <template #footer>
      <Button label="Annulla" severity="secondary" outlined @click="settingsModalVisible = false" />
      <Button label="Salva" :loading="updating" @click="handleSaveSettings" />
    </template>
  </Dialog>
</template>
