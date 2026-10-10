<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePlanUpgrade, type FreeFile } from '@/src/composables/usePlanUpgrade'
import { formatBinaryBytes } from '@/src/composables/usePlanDowngrade'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'
import { importKeyFromBase64 } from '@/src/crypto/crypto'
import { resolveFileName, hasEncryptedName } from '@/src/utils/fileNames'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { notify } from '@/src/utils/notify'

/**
 * Da Free a Pro: «vuoi che i file caricati da Free diventino permanenti?» (deciso il 2026-10-07).
 *
 * Si apre da sola quando l'utente è Pro e ha file free ancora vivi, finché non ha deciso. La
 * decisione «lasciali scadere» si ricorda su questo browser: su un altro dispositivo la domanda
 * può tornare, ed è innocuo — al massimo per i 7 giorni in cui quei file esistono ancora.
 *
 * Tre risposte: tutti permanenti (consigliata), scelgo io, lasciali scadere.
 */

const { plan, files, isMoving, progress, load, promote } = usePlanUpgrade()
const encryptionStore = useEncryptionStore()
const { requestUnlock } = useSecurityPrompt()

const open = ref(false)
const choosing = ref(false)
const selected = ref<Set<string>>(new Set())
const names = ref<Record<string, string>>({})

const decisionKey = () => `novren.upgradeFreeFiles.${getCurrentUser()?.sub ?? 'anon'}`

function decided(): boolean {
  try { return localStorage.getItem(decisionKey()) === 'expire' } catch { return false }
}

onMounted(async () => {
  await load()
  if (plan.value !== 'free' && files.value.length > 0 && !decided()) {
    selected.value = new Set(files.value.map((f) => f.s3Key))
    open.value = true
  }
})

watch(
  () => [files.value, encryptionStore.isUnlocked] as const,
  async ([current]) => {
    const next: Record<string, string> = {}
    for (const file of current) {
      const record = { fileName: file.fileName ?? undefined, nameVersion: file.nameVersion ?? undefined }
      const keyData = hasEncryptedName(record) && encryptionStore.isUnlocked ? await encryptionStore.getKey(file.s3Key) : null
      next[file.s3Key] = (await resolveFileName(record, keyData ? await importKeyFromBase64(keyData.key) : null)) || 'File'
    }
    names.value = next
  },
  { immediate: true },
)

const totalBytes = computed(() => files.value.reduce((sum, f) => sum + f.bytes, 0))
const chosenFiles = computed(() => (choosing.value ? files.value.filter((f) => selected.value.has(f.s3Key)) : files.value))
const percent = computed(() => (progress.value.total ? Math.round((progress.value.done / progress.value.total) * 100) : 0))

function toggle(file: FreeFile) {
  const next = new Set(selected.value)
  if (next.has(file.s3Key)) next.delete(file.s3Key)
  else next.add(file.s3Key)
  selected.value = next
}

async function makePermanent() {
  if (!encryptionStore.isUnlocked) {
    requestUnlock()
    return
  }
  const { moved, failed } = await promote(chosenFiles.value)
  if (failed === 0) {
    open.value = false
    notify.success(`${moved} ${moved === 1 ? 'file è diventato permanente' : 'file sono diventati permanenti'}.`, 'Fatto')
  } else {
    notify.warning(`${moved} spostati, ${failed} no: riprova, quelli rimasti sono ancora al loro posto.`, 'Spostamento incompleto')
  }
}

function letExpire() {
  try { localStorage.setItem(decisionKey(), 'expire') } catch { /* storage non disponibile: la domanda tornerà */ }
  open.value = false
}

const expiry = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : '')
</script>

<template>
  <Dialog v-model:visible="open" modal header="Benvenuto in Pro" :closable="!isMoving" :style="{ width: 'min(640px, 94vw)' }" :draggable="false">
    <div class="flex flex-col gap-4" data-testid="upgrade-dialog">
      <p class="m-0 text-sm leading-relaxed text-haze-200">
        Hai <strong class="text-haze-100">{{ files.length }} {{ files.length === 1 ? 'file caricato' : 'file caricati' }} da Free</strong>
        ({{ formatBinaryBytes(totalBytes) }}) che {{ files.length === 1 ? 'scade' : 'scadono' }} nei prossimi giorni.
        Con Pro possono restare finché vuoi: i link già condivisi continuano a funzionare.
      </p>

      <div v-if="!encryptionStore.isUnlocked" class="flex flex-wrap items-center justify-between gap-2 rounded-well border border-warn-400/30 bg-warn-400/[0.07] p-3 text-xs text-haze-200">
        <span>Per spostarli servono le chiavi dei file: sblocca con le 24 parole.</span>
        <Button label="Sblocca" size="small" severity="secondary" outlined @click="requestUnlock" />
      </div>

      <ul v-if="choosing" class="m-0 flex max-h-[300px] flex-col gap-1 overflow-y-auto p-0">
        <li v-for="file in files" :key="file.s3Key">
          <label class="flex cursor-pointer items-center gap-3 rounded-field px-2.5 py-2 hover:bg-white/[0.04]">
            <input type="checkbox" class="h-4 w-4 flex-none accent-[var(--color-brand-500)]" :checked="selected.has(file.s3Key)" @change="toggle(file)" />
            <span class="min-w-0 flex-1 truncate text-sm text-haze-100">{{ names[file.s3Key] || 'File' }}</span>
            <span class="flex-none font-mono text-xs text-haze-400">scade il {{ expiry(file.expiresAt) }}</span>
            <span class="w-[72px] flex-none text-right font-mono text-xs text-haze-300">{{ formatBinaryBytes(file.bytes) }}</span>
          </label>
        </li>
      </ul>

      <div v-if="isMoving" class="flex flex-col gap-1.5" data-testid="upgrade-progress">
        <div class="h-2 overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-brand-500 transition-[width] duration-300" :style="{ width: `${percent}%` }" />
        </div>
        <p class="m-0 font-mono text-xs text-haze-400">Sposto {{ progress.done }} di {{ progress.total }}…</p>
      </div>
    </div>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <Button label="Lasciali scadere" severity="secondary" text size="small" :disabled="isMoving" @click="letExpire" />
        <div class="flex gap-2">
          <Button v-if="!choosing" label="Scelgo io quali" severity="secondary" outlined size="small" :disabled="isMoving" @click="choosing = true" />
          <Button
            :label="choosing ? `Rendi permanenti (${chosenFiles.length})` : 'Rendili tutti permanenti'"
            :loading="isMoving"
            :disabled="choosing && chosenFiles.length === 0"
            @click="makePermanent"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
