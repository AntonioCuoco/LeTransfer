<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { usePlanDowngrade, formatBinaryBytes, type DowngradeFile } from '@/src/composables/usePlanDowngrade'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'
import { useBilling } from '@/src/composables/useBilling'
import { importKeyFromBase64 } from '@/src/crypto/crypto'
import { resolveFileName, hasEncryptedName } from '@/src/utils/fileNames'
import { notify } from '@/src/utils/notify'

/**
 * Da Pro a Free: avviso fisso + modale per scegliere i file da tenere (deciso il 2026-10-07).
 *
 * L'avviso resta finché dura la grazia: è il promemoria per chi ha spento le email. La modale
 * si apre da sola una volta per sessione **finché l'utente non ha scelto**; dopo, si riapre
 * dall'avviso per cambiare idea.
 *
 * Le caselle partono dalla scelta salvata o, se non c'è, dalla proposta del server (i più
 * recenti che stanno nello spazio del Free): confermare senza toccare niente è la scelta
 * di chi non vuole pensarci, ed è la stessa che il server applicherebbe comunque.
 */

const DISMISS_KEY = 'novren.downgradeDialogSeen'

const router = useRouter()
const { state, isSaving, dialogOpen, load, saveKeep } = usePlanDowngrade()
const encryptionStore = useEncryptionStore()
const { requestUnlock } = useSecurityPrompt()
const { startCheckout } = useBilling()

const selected = ref<Set<string>>(new Set())
const names = ref<Record<string, string>>({})

onMounted(async () => {
  await load()
  if (state.value && !state.value.chosen && !alreadySeen()) openDialog()
})

function alreadySeen(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

function openDialog() {
  selected.value = new Set(state.value?.keep ?? [])
  dialogOpen.value = true
  try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* storage non disponibile: pazienza */ }
}

// Nomi: in chiaro se lo sono, altrimenti si decifrano con la chiave del file (serve lo sblocco).
watch(
  () => [state.value, encryptionStore.isUnlocked] as const,
  async ([current]) => {
    if (!current) return
    const next: Record<string, string> = {}
    for (const file of current.files) {
      const record = { fileName: file.fileName ?? undefined, nameVersion: file.nameVersion ?? undefined }
      const keyData = hasEncryptedName(record) && encryptionStore.isUnlocked ? await encryptionStore.getKey(file.s3Key) : null
      next[file.s3Key] = (await resolveFileName(record, keyData ? await importKeyFromBase64(keyData.key) : null)) || 'File'
    }
    names.value = next
  },
  { immediate: true },
)

const someNamesLocked = computed(() => !encryptionStore.isUnlocked && (state.value?.files ?? []).some((f) => f.nameVersion === 2))
const selectedBytes = computed(() => (state.value?.files ?? []).filter((f) => selected.value.has(f.s3Key)).reduce((sum, f) => sum + f.bytes, 0))
const limit = computed(() => state.value?.keepLimitBytes ?? 0)
const overLimit = computed(() => selectedBytes.value > limit.value)
const percent = computed(() => (limit.value ? Math.min(100, Math.round((selectedBytes.value / limit.value) * 100)) : 0))
const deleting = computed(() => (state.value?.files.length ?? 0) - selected.value.size)

const graceDay = computed(() => state.value ? new Date(state.value.graceEndsAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : '')
const daysLeft = computed(() => state.value ? Math.max(0, Math.ceil((Date.parse(state.value.graceEndsAt) - Date.now()) / 86_400_000)) : 0)

function toggle(file: DowngradeFile) {
  const next = new Set(selected.value)
  if (next.has(file.s3Key)) next.delete(file.s3Key)
  else next.add(file.s3Key)
  selected.value = next
}

function useSuggestion() {
  // La proposta automatica è quella che il server applica se non si sceglie: i più recenti.
  const files = state.value?.files ?? []
  const keep = new Set<string>()
  let total = 0
  for (const file of files) {
    if (total + file.bytes > limit.value) continue
    keep.add(file.s3Key)
    total += file.bytes
  }
  selected.value = keep
}

async function save() {
  if (overLimit.value) return
  if (await saveKeep([...selected.value])) {
    dialogOpen.value = false
    notify.success(`Terremo ${selected.value.size} file. Gli altri verranno cancellati il ${graceDay.value}.`, 'Scelta salvata')
  }
}

function backToPro() {
  dialogOpen.value = false
  void startCheckout('pro')
}

function goExport() {
  dialogOpen.value = false
  router.push('/app/settings')
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '')
</script>

<template>
  <template v-if="state">
    <!-- L'avviso: resta per tutta la grazia -->
    <div class="fixed bottom-5 left-[88px] z-40 max-w-[380px] rounded-panel border border-warn-400/30 bg-deep-800/95 p-4 shadow-xl backdrop-blur" data-testid="downgrade-banner">
      <p class="m-0 text-sm font-semibold text-haze-100">Sei tornato al piano Free</p>
      <p class="m-0 mt-1 text-xs leading-relaxed text-haze-300">
        <template v-if="state.chosen">Hai scelto i file da tenere. Gli altri verranno cancellati il {{ graceDay }}.</template>
        <template v-else>Scegli i file da tenere entro il {{ graceDay }} ({{ daysLeft }} {{ daysLeft === 1 ? 'giorno' : 'giorni' }}).</template>
      </p>
      <Button :label="state.chosen ? 'Rivedi la scelta' : 'Scegli i file'" size="small" class="mt-3" @click="openDialog" />
    </div>

    <Dialog v-model:visible="dialogOpen" modal header="Scegli i file da tenere" :style="{ width: 'min(720px, 94vw)' }" :draggable="false">
      <div class="flex flex-col gap-4" data-testid="downgrade-dialog">
        <p class="m-0 text-sm leading-relaxed text-haze-200">
          Il tuo abbonamento è finito. I file caricati da Pro non scadono, ma il piano Free ha
          <strong class="text-haze-100">{{ formatBinaryBytes(limit) }}</strong> di spazio: scegli quali tenere.
          Gli altri verranno cancellati il <strong class="text-haze-100">{{ graceDay }}</strong>. Fino ad allora puoi scaricare tutto,
          e se torni Pro non viene cancellato niente.
        </p>

        <div class="rounded-well border border-white/10 bg-white/[0.03] p-3">
          <div class="flex justify-between text-xs" :class="overLimit ? 'text-crit-400' : 'text-haze-300'">
            <span>Tieni {{ selected.size }} file · {{ formatBinaryBytes(selectedBytes) }} di {{ formatBinaryBytes(limit) }}</span>
            <span>{{ deleting }} da cancellare</span>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div class="h-full rounded-full" :class="overLimit ? 'bg-crit-400' : 'bg-brand-500'" :style="{ width: `${percent}%` }" />
          </div>
          <p class="m-0 mt-2 text-xs text-haze-500">
            I file che tieni contano nello spazio del Free: più ne tieni, meno spazio resta per i nuovi invii.
          </p>
          <p v-if="overLimit" class="m-0 mt-1 text-xs text-crit-400">Hai scelto più dello spazio del Free: togli qualche file.</p>
        </div>

        <div v-if="someNamesLocked" class="flex flex-wrap items-center justify-between gap-2 rounded-well border border-warn-400/30 bg-warn-400/[0.07] p-3 text-xs text-haze-200">
          <span>I nomi dei file sono cifrati: sblocca con le 24 parole per vederli.</span>
          <Button label="Sblocca" size="small" severity="secondary" outlined @click="requestUnlock" />
        </div>

        <ul class="m-0 flex max-h-[340px] flex-col gap-1 overflow-y-auto p-0">
          <li v-for="file in state.files" :key="file.s3Key">
            <label class="flex cursor-pointer items-center gap-3 rounded-field px-2.5 py-2 hover:bg-white/[0.04]">
              <input type="checkbox" class="h-4 w-4 flex-none accent-[var(--color-brand-500)]" :checked="selected.has(file.s3Key)" @change="toggle(file)" />
              <span class="min-w-0 flex-1 truncate text-sm text-haze-100">{{ names[file.s3Key] || 'File' }}</span>
              <span class="flex-none font-mono text-xs text-haze-400">{{ fmtDate(file.uploadedAt) }}</span>
              <span class="w-[72px] flex-none text-right font-mono text-xs text-haze-300">{{ formatBinaryBytes(file.bytes) }}</span>
            </label>
          </li>
        </ul>

        <button type="button" class="self-start text-xs text-haze-400 underline underline-offset-2 hover:text-haze-200" @click="useSuggestion">
          Seleziona i più recenti che stanno nello spazio
        </button>
      </div>

      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <div class="flex gap-2">
            <Button label="Torna Pro" severity="secondary" outlined size="small" @click="backToPro" />
            <Button label="Scarica tutto" severity="secondary" text size="small" @click="goExport" />
          </div>
          <Button label="Salva la scelta" :loading="isSaving" :disabled="overLimit" @click="save" />
        </div>
      </template>
    </Dialog>
  </template>
</template>
