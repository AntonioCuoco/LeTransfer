<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useConfirm } from 'primevue/useconfirm'
import { useAdminModeration, type ModerationReport } from '@/src/composables/useAdminModeration'
import { formatBytes } from '@/src/types/plan'

/**
 * Moderazione — la parte che sblocca l'apertura al pubblico.
 *
 * Due code, non una: **segnalazioni** (link con report o già in quarantena) e **appelli**
 * (chi contesta una quarantena). Sono liste diverse per un motivo, non per comodità di
 * layout: le segnalazioni aspettano una decisione, gli appelli aspettano una revisione di
 * una decisione già presa — mescolarle costringerebbe a rileggere lo stato di ognuna per
 * capire in quale coda si è davvero.
 *
 * ⚠️ Non c'è colonna "nome file": il backend non lo manda mai. `nameEncrypted` dice se
 * aspettarsi un ciphertext — qui si mostra come etichetta, mai come tentativo di decifrare
 * (un admin non ha la chiave, e non deve averla).
 */

const { reports, appeals, isLoading, isActing, loadReports, loadAppeals, revoke, restore } =
  useAdminModeration()
const confirm = useConfirm()

const tab = ref<'reports' | 'appeals'>('reports')
const stateFilter = ref<'all' | 'quarantined' | 'open'>('all')

async function refresh() {
  if (tab.value === 'reports') await loadReports(stateFilter.value)
  else await loadAppeals()
}

onMounted(refresh)

const visible = computed(() => (tab.value === 'reports' ? reports.value : appeals.value))

const stateLabel: Record<ModerationReport['state'], string> = {
  active: 'attivo',
  revoked: 'revocato',
  expired: 'scaduto',
  quarantined: 'in quarantena',
}
const stateSeverity: Record<ModerationReport['state'], string> = {
  active: 'success',
  revoked: 'secondary',
  expired: 'secondary',
  quarantined: 'danger',
}

const reasonDialogOpen = ref(false)
const reasonDialogAction = ref<'revoke' | 'restore' | null>(null)
const reasonDialogTarget = ref<ModerationReport | null>(null)
const reasonText = ref('')

function openRevoke(item: ModerationReport) {
  reasonDialogAction.value = 'revoke'
  reasonDialogTarget.value = item
  reasonText.value = ''
  reasonDialogOpen.value = true
}

function openRestore(item: ModerationReport) {
  reasonDialogAction.value = 'restore'
  reasonDialogTarget.value = item
  reasonText.value = ''
  reasonDialogOpen.value = true
}

async function confirmAction() {
  const target = reasonDialogTarget.value
  const action = reasonDialogAction.value
  if (!target || !action || !reasonText.value.trim()) return

  // La revoca cancella l'oggetto: è irreversibile, e va confermata due volte — una per il
  // motivo (già scritto), una per l'irreversibilità.
  if (action === 'revoke') {
    confirm.require({
      message: `Il link ${target.publicToken} verrà revocato e l'oggetto cancellato definitivamente. Non è recuperabile.`,
      header: 'Conferma revoca definitiva',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Revoca definitivamente',
      rejectLabel: 'Annulla',
      acceptClass: 'p-button-danger',
      accept: async () => {
        if (await revoke(target.publicToken, reasonText.value.trim())) reasonDialogOpen.value = false
      },
    })
    return
  }

  if (await restore(target.publicToken, reasonText.value.trim())) reasonDialogOpen.value = false
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <header>
      <h1 class="m-0 text-xl font-semibold text-haze-100">Moderazione</h1>
      <p class="m-0 mt-1 text-sm text-haze-400">
        Link segnalati sul canale senza account, e chi ne contesta la quarantena.
      </p>
    </header>

    <div class="flex items-center gap-4 border-b border-white/10">
      <button
        type="button"
        class="border-b-2 px-1 pb-2 text-sm"
        :class="tab === 'reports' ? 'border-brand-400 text-haze-100' : 'border-transparent text-haze-500'"
        @click="tab = 'reports'; refresh()"
      >
        Segnalazioni
      </button>
      <button
        type="button"
        class="border-b-2 px-1 pb-2 text-sm"
        :class="tab === 'appeals' ? 'border-brand-400 text-haze-100' : 'border-transparent text-haze-500'"
        @click="tab = 'appeals'; refresh()"
      >
        Appelli
        <span v-if="appeals.length" class="ml-1 rounded-full bg-warn-400/20 px-1.5 py-0.5 text-[0.7rem] text-warn-400">
          {{ appeals.length }}
        </span>
      </button>

      <div v-if="tab === 'reports'" class="ml-auto flex items-center gap-2 pb-2">
        <Select
          v-model="stateFilter"
          :options="[
            { label: 'Tutti', value: 'all' },
            { label: 'Da decidere', value: 'open' },
            { label: 'In quarantena', value: 'quarantined' },
          ]"
          option-label="label"
          option-value="value"
          size="small"
          @change="refresh"
        />
        <Button icon="pi pi-refresh" text size="small" :loading="isLoading" @click="refresh" />
      </div>
    </div>

    <p v-if="!isLoading && visible.length === 0" class="text-sm text-haze-500">
      {{ tab === 'reports' ? 'Nessuna segnalazione in questo stato.' : 'Nessun appello in attesa.' }}
    </p>

    <div v-else class="flex flex-col gap-3">
      <article
        v-for="item in visible"
        :key="item.publicToken"
        class="rounded-well border border-white/10 bg-white/[0.03] p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-mono text-sm text-haze-200">{{ item.publicToken }}</span>
              <Tag :value="stateLabel[item.state]" :severity="stateSeverity[item.state] as never" />
              <span v-if="item.nameEncrypted" class="font-mono text-[0.68rem] text-haze-500">
                nome cifrato
              </span>
            </div>
            <p class="m-0 mt-1.5 font-mono text-[0.76rem] text-haze-400">
              {{ item.fileType || 'tipo sconosciuto' }} ·
              {{ item.fileSize ? formatBytes(Number(item.fileSize)) : 'dimensione sconosciuta' }} ·
              {{ item.downloadCount }} download
            </p>
            <p class="m-0 mt-1 text-xs text-haze-500">
              {{ item.abuseReports }} segnalazioni
              <template v-if="item.reports.length">
                — ultimo motivo: «{{ item.reports[item.reports.length - 1].reason || 'non specificato' }}»
              </template>
            </p>
            <p v-if="item.appealStatus === 'pending'" class="m-0 mt-1 text-xs text-warn-400">
              Appello in attesa dal {{ item.appealRequestedAt ? new Date(item.appealRequestedAt).toLocaleString('it-IT') : '—' }}
            </p>
          </div>

          <div class="flex shrink-0 gap-2">
            <Button
              v-if="item.state !== 'revoked'"
              label="Revoca definitivamente"
              icon="pi pi-trash"
              size="small"
              severity="danger"
              outlined
              :disabled="isActing"
              @click="openRevoke(item)"
            />
            <Button
              v-if="item.state === 'quarantined' || item.appealStatus === 'pending'"
              label="Ripristina"
              icon="pi pi-check"
              size="small"
              outlined
              :disabled="isActing"
              @click="openRestore(item)"
            />
          </div>
        </div>
      </article>
    </div>

    <Dialog v-model:visible="reasonDialogOpen" modal :header="reasonDialogAction === 'revoke' ? 'Revoca il link' : 'Ripristina il link'" :style="{ width: 'min(480px, 94vw)' }">
      <div class="flex flex-col gap-3">
        <p class="m-0 text-sm text-haze-300">
          Il motivo finisce nel registro delle azioni: sarà l'unica cosa che spiega questa decisione fra un mese.
        </p>
        <Textarea v-model="reasonText" rows="3" auto-resize placeholder="Motivo…" fluid />
      </div>
      <template #footer>
        <Button label="Annulla" text @click="reasonDialogOpen = false" />
        <Button
          :label="reasonDialogAction === 'revoke' ? 'Continua' : 'Ripristina'"
          :severity="reasonDialogAction === 'revoke' ? 'danger' : undefined"
          :disabled="!reasonText.trim()"
          :loading="isActing"
          @click="confirmAction"
        />
      </template>
    </Dialog>

  </div>
</template>
