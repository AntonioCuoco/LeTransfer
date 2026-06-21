<script setup lang="ts">
import { useConfirm } from 'primevue/useconfirm'
import type { DynamoDBFile, TableFile, SharedRecipient } from '@/src/types'

const props = defineProps<{
  files: TableFile[]
  hideHeader?: boolean
  onDeleteFile?: (fileId: string) => void
  onDownloadFile?: (file: DynamoDBFile) => void
  onShareFile?: (file: DynamoDBFile) => void
}>()

const confirm = useConfirm()

const getFileIcon = (type: string) => {
  if (type.includes('image')) return 'pi pi-image'
  if (type.includes('video')) return 'pi pi-video'
  if (type.includes('audio')) return 'pi pi-volume-up'
  if (type.includes('text') || type.includes('document')) return 'pi pi-file-edit'
  return 'pi pi-file'
}

const statusMap: Record<string, { label: string; color: string }> = {
  uploaded: { label: 'Caricato', color: '#aaa' },
  downloaded: { label: 'Scaricato', color: '#aaa' },
  sent: { label: 'Inviato', color: '#aaa' },
  received: { label: 'Ricevuto', color: '#52c41a' },
  archived: { label: 'Archiviato', color: '#aaa' },
  deleted: { label: 'Eliminato', color: '#aaa' },
}

const confirmDelete = (event: Event, id: string) => {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    group: 'popup',
    message: 'Elimina file?',
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: 'Sì', severity: 'danger', size: 'small' },
    rejectProps: { label: 'No', severity: 'secondary', outlined: true, size: 'small' },
    accept: () => props.onDeleteFile!(id),
  })
}
</script>

<template>
  <DataTable :value="files" data-key="id" size="small">
    <Column header="File">
      <template #body="{ data }">
        <div class="flex items-center gap-2 overflow-hidden">
          <i :class="getFileIcon(data.type)" class="text-white flex-shrink-0" />
          <span v-tooltip.top="decodeURIComponent(data.name)" class="font-medium text-white truncate cursor-help max-w-[180px]">{{ decodeURIComponent(data.name) }}</span>
          <span
            v-if="data.isShared && data.sharedWith?.length"
            v-tooltip.top="data.sharedWith.map((r: SharedRecipient) => r.email).join(', ')"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#724CF9]/20 text-[#a78bfa] text-xs cursor-help ml-1"
          >
            <i class="pi pi-users text-primary" /> {{ data.sharedWith.length }}
          </span>
          <span v-if="data.isReceived" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs ml-1">
            <i class="pi pi-user text-green-500" /> Ricevuto
          </span>
        </div>
      </template>
    </Column>

    <Column header="Tipo">
      <template #body="{ data }">
        <span v-tooltip.top="data.type" class="text-[#DBD4D3] cursor-help truncate">{{ data.type }}</span>
      </template>
    </Column>

    <Column header="Dimensione">
      <template #body="{ data }">
        <span class="text-[#DBD4D3]">{{ data.originalFile?.formattedSize || data.size }}</span>
      </template>
    </Column>

    <Column header="Stato">
      <template #body="{ data }">
        <span class="inline-flex items-center gap-1.5 text-[#DBD4D3]">
          <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: statusMap[data.status]?.color }" />
          {{ statusMap[data.status]?.label }}
        </span>
      </template>
    </Column>

    <Column field="date" header="Data">
      <template #body="{ data }">
        <span class="text-[#DBD4D3]">{{ data.date }}</span>
      </template>
    </Column>

    <Column header="Destinatario/Mittente">
      <template #body="{ data }">
        <span class="text-[#DBD4D3]">{{ data.isReceived ? (data.senderEmail || '-') : (data.recipient || '-') }}</span>
      </template>
    </Column>

    <Column header="Azioni">
      <template #body="{ data }">
        <div class="flex items-center gap-1">
          <Button
            v-if="props.onDownloadFile && data.originalFile"
            v-tooltip.top="'Scarica file'"
            icon="pi pi-download"
            text
            class="!text-blue-400"
            @click="props.onDownloadFile!(data.originalFile)"
          />
          <Button
            v-if="props.onShareFile && data.originalFile && !data.isReceived"
            v-tooltip.top="'Condividi'"
            icon="pi pi-share-alt"
            text
            @click="props.onShareFile!(data.originalFile)"
          />
          <Button
            v-if="props.onDeleteFile && !data.isReceived"
            v-tooltip.top="'Elimina file'"
            icon="pi pi-trash"
            text
            severity="danger"
            @click="confirmDelete($event, data.id)"
          />
        </div>
      </template>
    </Column>
  </DataTable>
</template>
