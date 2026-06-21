<script setup lang="ts">
import {
  FileTextOutlined, FileOutlined, VideoCameraOutlined, AudioOutlined,
  DeleteOutlined, DownloadOutlined, ShareAltOutlined, TeamOutlined, UserOutlined,
} from '@ant-design/icons-vue'
import type { DynamoDBFile, TableFile, SharedRecipient } from '@/src/types'

const props = defineProps<{
  files: TableFile[]
  hideHeader?: boolean
  onDeleteFile?: (fileId: string) => void
  onDownloadFile?: (file: DynamoDBFile) => void
  onShareFile?: (file: DynamoDBFile) => void
}>()

const getFileIcon = (type: string) => {
  if (type.includes('image')) return FileOutlined
  if (type.includes('video')) return VideoCameraOutlined
  if (type.includes('audio')) return AudioOutlined
  if (type.includes('text') || type.includes('document')) return FileTextOutlined
  return FileOutlined
}

const statusMap: Record<string, { label: string; color: string }> = {
  uploaded: { label: 'Caricato', color: '#aaa' },
  downloaded: { label: 'Scaricato', color: '#aaa' },
  sent: { label: 'Inviato', color: '#aaa' },
  received: { label: 'Ricevuto', color: '#52c41a' },
  archived: { label: 'Archiviato', color: '#aaa' },
  deleted: { label: 'Eliminato', color: '#aaa' },
}

const columns = [
  { title: 'File', key: 'name', dataIndex: 'name' },
  { title: 'Tipo', key: 'type', dataIndex: 'type' },
  { title: 'Dimensione', key: 'size', dataIndex: 'size' },
  { title: 'Stato', key: 'status', dataIndex: 'status' },
  { title: 'Data', key: 'date', dataIndex: 'date' },
  { title: 'Destinatario/Mittente', key: 'recipient' },
  { title: 'Azioni', key: 'actions' },
]
</script>

<template>
  <a-table
    :data-source="files"
    :columns="columns"
    row-key="id"
    :pagination="false"
    size="small"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <div class="flex items-center gap-2 overflow-hidden">
          <component :is="getFileIcon(record.type)" class="!text-white flex-shrink-0" />
          <a-tooltip :title="decodeURIComponent(record.name)">
            <span class="font-medium text-white truncate cursor-help max-w-[180px]">{{ decodeURIComponent(record.name) }}</span>
          </a-tooltip>
          <a-tooltip v-if="record.isShared && record.sharedWith?.length" :title="record.sharedWith.map((r: SharedRecipient) => r.email).join(', ')">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#724CF9]/20 text-[#a78bfa] text-xs cursor-help ml-1">
              <TeamOutlined class="!text-[#724CF9]" /> {{ record.sharedWith.length }}
            </span>
          </a-tooltip>
          <span v-if="record.isReceived" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs ml-1">
            <UserOutlined class="!text-green-500" /> Ricevuto
          </span>
        </div>
      </template>

      <template v-else-if="column.key === 'type'">
        <a-tooltip :title="record.type">
          <span class="text-[#DBD4D3] cursor-help truncate">{{ record.type }}</span>
        </a-tooltip>
      </template>

      <template v-else-if="column.key === 'size'">
        <span class="text-[#DBD4D3]">{{ record.originalFile?.formattedSize || record.size }}</span>
      </template>

      <template v-else-if="column.key === 'status'">
        <a-badge :color="statusMap[record.status]?.color" :text="statusMap[record.status]?.label" />
      </template>

      <template v-else-if="column.key === 'recipient'">
        <span class="text-[#DBD4D3]">{{ record.isReceived ? (record.senderEmail || '-') : (record.recipient || '-') }}</span>
      </template>

      <template v-else-if="column.key === 'actions'">
        <div class="flex items-center gap-1">
          <a-tooltip v-if="props.onDownloadFile && record.originalFile" title="Scarica file">
            <a-button type="text" class="!text-blue-400" @click="props.onDownloadFile!(record.originalFile)">
              <DownloadOutlined />
            </a-button>
          </a-tooltip>
          <a-tooltip v-if="props.onShareFile && record.originalFile && !record.isReceived" title="Condividi">
            <a-button type="text" class="!text-[#724CF9]" @click="props.onShareFile!(record.originalFile)">
              <ShareAltOutlined />
            </a-button>
          </a-tooltip>
          <a-popconfirm v-if="props.onDeleteFile && !record.isReceived" title="Elimina file?" ok-text="Sì" cancel-text="No" @confirm="props.onDeleteFile!(record.id)">
            <a-tooltip title="Elimina file">
              <a-button type="text" danger><DeleteOutlined /></a-button>
            </a-tooltip>
          </a-popconfirm>
        </div>
      </template>
    </template>
  </a-table>
</template>
