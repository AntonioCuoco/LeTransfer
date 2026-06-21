<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  CopyOutlined, ReloadOutlined, DeleteOutlined, LinkOutlined,
  SettingOutlined, LockOutlined, UnlockOutlined, ClockCircleOutlined, DownloadOutlined,
} from '@ant-design/icons-vue'
import type { SharedLink } from '@/src/types'

dayjs.extend(relativeTime)

const props = defineProps<{
  links: SharedLink[]
  onRevoke: (id: string) => Promise<boolean>
  onRegenerate: (id: string) => Promise<boolean>
  onUpdate: (id: string, updates: Partial<SharedLink>) => Promise<boolean>
  onDelete?: (id: string) => Promise<boolean>
}>()

const settingsModalVisible = ref(false)
const currentLink = ref<SharedLink | null>(null)
const newPassword = ref('')
const newExpiry = ref<dayjs.Dayjs | null>(null)
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
  newExpiry.value = link.expiresAt ? dayjs(link.expiresAt) : null
  settingsModalVisible.value = true
}

const handleCopyLink = (url: string) => {
  navigator.clipboard.writeText(url)
  message.success('Link copiato negli appunti!')
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
  if (success) { message.success('Impostazioni aggiornate'); settingsModalVisible.value = false }
  else message.error("Errore durante l'aggiornamento")
}

const columns = [
  { title: 'File', key: 'fileName' },
  { title: 'Sicurezza', key: 'security', align: 'center' },
  { title: 'Download', key: 'downloads', align: 'center' },
  { title: 'Scadenza', key: 'expiry' },
  { title: 'Stato', key: 'status' },
  { title: 'Creato il', key: 'createdAt' },
  { title: 'Azioni', key: 'actions' },
]
</script>

<template>
  <a-table :data-source="links" :columns="columns" row-key="id" :pagination="false" size="small">
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'fileName'">
        <div class="flex items-center gap-2">
          <LinkOutlined class="!text-white" />
          <a-tooltip :title="record.url">
            <span class="font-medium text-white truncate cursor-help max-w-[180px]">{{ record.fileName }}</span>
          </a-tooltip>
        </div>
      </template>

      <template v-else-if="column.key === 'security'">
        <a-tooltip :title="record.isPasswordProtected ? 'Protetto da password' : 'Nessuna password'">
          <LockOutlined v-if="record.isPasswordProtected" class="!text-white" />
          <UnlockOutlined v-else class="!text-white" />
        </a-tooltip>
      </template>

      <template v-else-if="column.key === 'downloads'">
        <div class="flex items-center justify-center gap-1 text-[#DBD4D3]">
          <DownloadOutlined /> {{ record.downloadCount }}{{ record.maxDownloads ? ` / ${record.maxDownloads}` : '' }}
        </div>
      </template>

      <template v-else-if="column.key === 'expiry'">
        <a-tooltip :title="dayjs(record.expiresAt).format('DD/MM/YYYY HH:mm')">
          <span class="flex items-center gap-1 text-[#DBD4D3] cursor-help">
            <ClockCircleOutlined /> {{ dayjs(record.expiresAt).fromNow() }}
          </span>
        </a-tooltip>
      </template>

      <template v-else-if="column.key === 'status'">
        <a-badge :color="renderStatus(record).color" :text="renderStatus(record).text" />
      </template>

      <template v-else-if="column.key === 'createdAt'">
        <span class="text-[#DBD4D3]">{{ dayjs(record.createdAt).format('DD/MM/YYYY') }}</span>
      </template>

      <template v-else-if="column.key === 'actions'">
        <div class="flex items-center gap-1">
          <template v-if="isLinkActive(record)">
            <a-tooltip title="Copia Link">
              <a-button type="text" class="!text-[#DBD4D3]" @click="handleCopyLink(record.url)"><CopyOutlined /></a-button>
            </a-tooltip>
            <a-tooltip title="Impostazioni">
              <a-button type="text" class="!text-[#DBD4D3]" @click="openSettings(record)"><SettingOutlined /></a-button>
            </a-tooltip>
            <a-popconfirm title="Rigenera Link" description="Il vecchio link smetterà di funzionare." @confirm="props.onRegenerate(record.id)">
              <a-tooltip title="Rigenera">
                <a-button type="text" class="!text-[#DBD4D3]"><ReloadOutlined /></a-button>
              </a-tooltip>
            </a-popconfirm>
            <a-popconfirm title="Revoca Link" description="Il link non sarà più accessibile." ok-type="danger" @confirm="props.onRevoke(record.id)">
              <a-tooltip title="Revoca">
                <a-button type="text" danger><DeleteOutlined /></a-button>
              </a-tooltip>
            </a-popconfirm>
          </template>
          <template v-else>
            <a-popconfirm title="Rigenera Link" description="Verrà creato un nuovo link valido." @confirm="props.onRegenerate(record.id)">
              <a-tooltip title="Rigenera"><a-button type="text" class="!text-[#DBD4D3]"><ReloadOutlined /></a-button></a-tooltip>
            </a-popconfirm>
            <a-popconfirm v-if="props.onDelete" title="Elimina dalla lista" ok-type="danger" @confirm="props.onDelete!(record.id)">
              <a-tooltip title="Elimina"><a-button type="text" danger><DeleteOutlined /></a-button></a-tooltip>
            </a-popconfirm>
          </template>
        </div>
      </template>
    </template>

    <template #emptyText>
      <div class="text-center py-8 text-[#9ca3af]">Nessun link generato trovato</div>
    </template>
  </a-table>

  <a-modal title="Impostazioni Link" :open="settingsModalVisible" ok-text="Salva" cancel-text="Annulla" :confirm-loading="updating" centered @ok="handleSaveSettings" @cancel="settingsModalVisible = false">
    <div class="space-y-4 py-4">
      <div>
        <label class="block text-sm font-medium text-[#DBD4D3] mb-1">Nuova Password (vuoto = invariata)</label>
        <a-input-password v-model:value="newPassword" placeholder="Inserisci nuova password" />
      </div>
      <div>
        <label class="block text-sm font-medium text-[#DBD4D3] mb-1">Data di Scadenza</label>
        <a-date-picker v-model:value="newExpiry" class="w-full" show-time :disabled-date="(d: dayjs.Dayjs) => d.isBefore(dayjs())" />
      </div>
    </div>
  </a-modal>
</template>
