<script setup lang="ts">
import { useConfirm } from 'primevue/useconfirm'
import { fileBadge } from '@/src/utils/fileBadge'
import type { DynamoDBFile, TableFile, SharedRecipient } from '@/src/types'

/**
 * Elenco dei file (roadmap F5).
 *
 * Due cose oltre al vestito:
 *  • La vecchia mappa degli stati aveva sei voci — `downloaded`, `archived` e
 *    `deleted` non vengono prodotte da nessun punto del codice: erano rami morti
 *    che suggerivano funzioni inesistenti. Restano i tre stati reali.
 *  • Compare la colonna **Cifrato**: `isEncrypted` era già nei dati ma non si vedeva
 *    da nessuna parte. In un prodotto che vende E2E, sapere a colpo d'occhio quali
 *    file sono protetti è informazione primaria, non un dettaglio.
 */

const props = defineProps<{
  files: TableFile[]
  hideHeader?: boolean
  onDeleteFile?: (fileId: string) => void
  onDownloadFile?: (file: DynamoDBFile) => void
  onShareFile?: (file: DynamoDBFile) => void
}>()

const confirm = useConfirm()

// Solo gli stati che il codice genera davvero (vedi Profile.vue → convertFiles*).
const STATUS: Record<string, { label: string; dot: string }> = {
  uploaded: { label: 'Caricato', dot: 'bg-haze-400' },
  sent: { label: 'Inviato', dot: 'bg-brand-400' },
  received: { label: 'Ricevuto', dot: 'bg-verified-400' },
}

const confirmDelete = (event: Event, id: string) => {
  confirm.require({
    target: event.currentTarget as HTMLElement,
    group: 'popup',
    message: 'Eliminare questo file?',
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: 'Elimina', severity: 'danger', size: 'small' },
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true, size: 'small' },
    accept: () => props.onDeleteFile!(id),
  })
}
</script>

<template>
  <DataTable :value="files" data-key="id" size="small">
    <Column header="File">
      <template #body="{ data }">
        <div class="flex items-center gap-2.5 overflow-hidden">
          <span
            class="flex-none rounded-badge px-1.5 py-1 font-mono text-[0.58rem] font-extrabold tracking-[0.03em] text-white"
            :style="{ background: fileBadge(decodeURIComponent(data.name), data.type).color }"
          >
            {{ fileBadge(decodeURIComponent(data.name), data.type).label }}
          </span>
          <span
            v-tooltip.top="decodeURIComponent(data.name)"
            class="max-w-[220px] cursor-help truncate font-medium text-haze-100"
          >
            {{ decodeURIComponent(data.name) }}
          </span>
          <span
            v-if="data.isShared && data.sharedWith?.length"
            v-tooltip.top="data.sharedWith.map((r: SharedRecipient) => r.email).join(', ')"
            class="inline-flex flex-none cursor-help items-center gap-1 rounded-full bg-brand-500/20 px-2 py-0.5 font-mono text-[0.68rem] text-brand-300"
          >
            <i class="pi pi-users text-[0.7rem]" /> {{ data.sharedWith.length }}
          </span>
        </div>
      </template>
    </Column>

    <Column header="Peso">
      <template #body="{ data }">
        <span class="font-mono text-[0.8rem] text-haze-300">{{ data.originalFile?.formattedSize || data.size }}</span>
      </template>
    </Column>

    <!-- La proprietà centrale del prodotto, finalmente visibile riga per riga -->
    <Column header="Cifrato">
      <template #body="{ data }">
        <span
          v-if="data.originalFile?.isEncrypted"
          v-tooltip.top="'Cifrato end-to-end: il server ne ha solo il ciphertext'"
          class="inline-flex cursor-help items-center gap-1.5 font-mono text-[0.74rem] text-verified-400"
        >
          <i class="pi pi-lock text-[0.72rem]" /> E2E
        </span>
        <span v-else class="font-mono text-[0.74rem] text-haze-400">—</span>
      </template>
    </Column>

    <Column header="Stato">
      <template #body="{ data }">
        <span class="inline-flex items-center gap-1.5 text-[0.86rem] text-haze-300">
          <span class="h-2 w-2 rounded-full" :class="STATUS[data.status]?.dot || 'bg-haze-400'" />
          {{ STATUS[data.status]?.label || data.status }}
        </span>
      </template>
    </Column>

    <Column field="date" header="Data">
      <template #body="{ data }">
        <span class="font-mono text-[0.8rem] text-haze-300">{{ data.date }}</span>
      </template>
    </Column>

    <Column header="Con chi">
      <template #body="{ data }">
        <span class="text-[0.86rem] text-haze-300">
          {{ data.isReceived ? (data.senderEmail || '—') : (data.recipient || '—') }}
        </span>
      </template>
    </Column>

    <Column header="">
      <template #body="{ data }">
        <div class="flex items-center justify-end gap-1">
          <Button
            v-if="props.onDownloadFile && data.originalFile"
            v-tooltip.top="'Scarica'"
            icon="pi pi-download"
            text
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
            v-tooltip.top="'Elimina'"
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
