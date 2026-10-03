<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { notify } from '@/src/utils/notify'
import { withDetail } from '@/src/utils/errorDetail'
import { generateRecoveryKey } from '@/src/crypto/recovery-key'
import { downloadRecoveryKeyFile } from '@/src/utils/recoveryKeyFile'
import { useRecoveryKeyRotation } from '@/src/composables/useRecoveryKeyRotation'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'

/**
 * Cambio delle 24 parole (stesso flusso del client desktop, `RotationDialog.vue`).
 *
 * Niente cambia sul server finché l'utente non ha salvato e confermato le parole nuove: dopo il
 * commit valgono solo quelle, e le vecchie non aprono più niente. Per questo la password si
 * chiede **all'ultimo passo**, insieme alla verifica: se è sbagliata si riprova con le stesse
 * parole, senza doverne trascrivere altre 24.
 *
 * Le parole vivono solo in memoria e si cancellano alla chiusura (mai storage, log o server).
 */

const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{ rotated: [] }>()

type Step = 'intro' | 'phrase' | 'confirm' | 'running' | 'done'

const encryptionStore = useEncryptionStore()
const { requestUnlock } = useSecurityPrompt()
const { rotate, progress } = useRecoveryKeyRotation()

const step = ref<Step>('intro')
const mnemonic = ref('')
const revealed = ref(false)
const challengeIndexes = ref<number[]>([])
const answers = ref<string[]>(['', '', ''])
const password = ref('')
const error = ref<string | null>(null)

const words = computed(() => (mnemonic.value ? mnemonic.value.split(' ') : []))
const allAnswersCorrect = computed(() =>
  challengeIndexes.value.length > 0 &&
  challengeIndexes.value.every((wordIndex, slot) => answers.value[slot].trim().toLowerCase() === words.value[wordIndex]),
)
const canRun = computed(() => allAnswersCorrect.value && password.value.length > 0)

function reset() {
  step.value = 'intro'
  mnemonic.value = ''
  revealed.value = false
  challengeIndexes.value = []
  answers.value = ['', '', '']
  password.value = ''
  error.value = null
}

// Ogni apertura riparte da capo; ogni chiusura cancella le parole dalla memoria.
watch(visible, () => {
  if (step.value !== 'running') reset()
})

function pickChallenge(total: number): number[] {
  const chosen = new Set<number>()
  while (chosen.size < Math.min(3, total)) chosen.add(crypto.getRandomValues(new Uint32Array(1))[0] % total)
  return [...chosen].sort((a, b) => a - b)
}

async function generate() {
  error.value = null
  try {
    mnemonic.value = await generateRecoveryKey()
    challengeIndexes.value = pickChallenge(words.value.length)
    answers.value = ['', '', '']
    revealed.value = false
    step.value = 'phrase'
  } catch (err) {
    error.value = withDetail('Non siamo riusciti a generare le parole nuove.', err)
  }
}

function unlockFirst() {
  visible.value = false
  requestUnlock()
}

function downloadAsFile() {
  downloadRecoveryKeyFile(words.value)
  notify.info('File scaricato. Spostalo in un posto sicuro e offline.')
}

async function copyWords() {
  try {
    await navigator.clipboard.writeText(mnemonic.value)
    notify.warning("Copiate. Svuota gli appunti appena le hai incollate nel gestore password.")
  } catch (err) {
    notify.error(withDetail('Impossibile copiare: usa il download oppure trascrivile a mano.', err), 'Copia non riuscita')
  }
}

async function run() {
  if (!canRun.value) return
  error.value = null
  step.value = 'running'
  const outcome = await rotate(password.value, mnemonic.value)
  if (outcome.ok) {
    mnemonic.value = ''
    password.value = ''
    answers.value = ['', '', '']
    step.value = 'done'
    emit('rotated')
    return
  }
  // Prima del commit la rotazione si annulla da sola: valgono ancora le parole di sempre, e
  // queste nuove si possono riprovare così come sono.
  error.value = outcome.message
  if (outcome.wrongPassword) password.value = ''
  step.value = 'confirm'
}

const stageText = computed(() => {
  const p = progress.value
  if (!p) return 'Preparo…'
  switch (p.stage) {
    case 'preparing':
      return 'Verifico le chiavi attuali…'
    case 'fileKeys':
      return p.total ? `Ricifro le chiavi dei file · ${p.done} di ${p.total}` : 'Ricifro le chiavi dei file…'
    case 'backups':
      return 'Ricifro i backup delle chiavi di identità…'
    case 'activating':
      return 'Attivo le parole nuove…'
  }
  return ''
})

const percent = computed(() => {
  const p = progress.value
  if (!p) return 4
  const base = { preparing: 0, fileKeys: 10, backups: 80, activating: 92 }[p.stage]
  const span = { preparing: 10, fileKeys: 70, backups: 12, activating: 8 }[p.stage]
  return base + (p.total ? (p.done / p.total) * span : span / 2)
})
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    header="Cambia le 24 parole"
    :closable="step !== 'running'"
    :close-on-escape="step !== 'running'"
    :style="{ width: 'min(640px, 94vw)' }"
    :draggable="false"
  >
    <!-- ── Introduzione ─────────────────────────────────────────────────────── -->
    <div v-if="step === 'intro'" class="flex flex-col gap-4">
      <p class="m-0 text-sm leading-relaxed text-haze-200">
        Ti diamo 24 parole nuove. Le chiavi dei tuoi file si ricifrano <strong class="text-haze-100">in questo
        browser</strong> e, solo quando sono tutte pronte, le parole nuove diventano le uniche valide.
      </p>

      <ul class="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-haze-200">
        <li>Le parole vecchie smettono di funzionare, qui, nell'app desktop e su ogni dispositivo.</li>
        <li>I tuoi file e i link già condivisi restano come sono.</li>
        <li>Se qualcosa si interrompe prima della fine, non cambia niente.</li>
      </ul>

      <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <p class="m-0 text-xs leading-relaxed text-haze-300">
          Le chiavi di identità (con cui altri utenti ti mandano file) restano le stesse: se pensi che
          qualcuno abbia avuto anche la tua password, scrivici.
        </p>
      </div>

      <div v-if="!encryptionStore.isUnlocked" class="rounded-well border border-warn-400/30 bg-warn-400/[0.07] p-4">
        <p class="m-0 text-sm leading-relaxed text-haze-200">
          I tuoi file sono bloccati in questo browser: per ricifrarli servono le 24 parole attuali.
        </p>
      </div>

      <p v-if="error" class="m-0 text-sm text-crit-400">{{ error }}</p>
    </div>

    <!-- ── Le parole nuove ──────────────────────────────────────────────────── -->
    <div v-else-if="step === 'phrase'" class="flex flex-col gap-4">
      <p class="m-0 text-sm leading-relaxed text-haze-200">
        Mettile al sicuro adesso: un file offline, il gestore di password, oppure carta e penna. Tra un
        momento te ne chiedo tre a caso.
      </p>

      <div class="relative">
        <div
          class="grid grid-cols-2 gap-x-6 gap-y-2 rounded-panel border border-white/10 bg-black/20 p-5 sm:grid-cols-3 lg:grid-cols-4"
          :class="revealed ? '' : 'select-none blur-sm'"
        >
          <div v-for="(word, index) in words" :key="index" class="flex items-baseline gap-2">
            <span class="w-5 flex-none text-right font-mono text-[0.7rem] text-haze-400">{{ index + 1 }}</span>
            <span class="font-mono text-[0.92rem] font-medium">{{ word }}</span>
          </div>
        </div>

        <!-- Coperte all'apertura: evita che finiscano in una condivisione schermo -->
        <button
          v-if="!revealed"
          type="button"
          class="absolute inset-0 grid place-items-center rounded-panel bg-deep-900/40"
          @click="revealed = true"
        >
          <span class="rounded-control bg-white/10 px-4 py-2.5 text-[0.9rem] font-semibold backdrop-blur">
            Mostra le parole
          </span>
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button label="Scarica come file" icon="pi pi-download" :disabled="!revealed" @click="downloadAsFile" />
        <Button label="Copia" icon="pi pi-copy" severity="secondary" outlined :disabled="!revealed" @click="copyWords" />
      </div>

      <p class="m-0 font-mono text-[0.72rem] text-haze-400">
        gli appunti sono il posto meno sicuro: svuotali appena hai finito
      </p>
    </div>

    <!-- ── Verifica e password ──────────────────────────────────────────────── -->
    <div v-else-if="step === 'confirm'" class="flex flex-col gap-5">
      <p class="m-0 text-sm leading-relaxed text-haze-200">
        Scrivi le tre parole che ti chiedo, prendendole da dove le hai salvate. Poi la password del tuo
        account: senza, nessuno può cambiare le tue parole.
      </p>

      <div class="grid gap-4 sm:grid-cols-3">
        <div v-for="(wordIndex, slot) in challengeIndexes" :key="wordIndex">
          <label :for="`rot-word-${slot}`" class="lt-label mb-1.5 block !text-haze-400">Parola numero {{ wordIndex + 1 }}</label>
          <input
            :id="`rot-word-${slot}`"
            v-model="answers[slot]"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            data-gramm="false"
            data-enable-grammarly="false"
            class="w-full rounded-field border bg-black/20 px-3 py-2.5 font-mono text-[0.9rem] outline-none transition-colors focus:border-brand-500"
            :class="answers[slot] && answers[slot].trim().toLowerCase() !== words[wordIndex]
              ? 'border-crit-400/50'
              : 'border-white/15'"
          />
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="rot-pwd" class="text-xs font-medium text-haze-300">La password del tuo account</label>
        <Password
          v-model="password"
          input-id="rot-pwd"
          :feedback="false"
          toggle-mask
          fluid
          autocomplete="current-password"
          @keyup.enter="run"
        />
      </div>

      <p v-if="error" class="m-0 text-sm text-crit-400">{{ error }}</p>
    </div>

    <!-- ── In corso ─────────────────────────────────────────────────────────── -->
    <div v-else-if="step === 'running'" class="flex flex-col gap-4 py-2">
      <p class="m-0 text-sm text-haze-200">Non chiudere questa pagina: ci vuole poco.</p>
      <div class="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div class="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out" :style="{ width: `${percent}%` }" />
      </div>
      <p class="m-0 font-mono text-[0.78rem] text-haze-400">{{ stageText }}</p>
    </div>

    <!-- ── Fatto ────────────────────────────────────────────────────────────── -->
    <div v-else class="flex flex-col items-center gap-3 py-2 text-center">
      <span class="grid h-14 w-14 place-items-center rounded-full bg-verified-400/15 text-verified-400">
        <i class="pi pi-check text-2xl" />
      </span>
      <h3 class="m-0 text-xl font-semibold">Fatto</h3>
      <p class="m-0 max-w-[52ch] text-sm leading-relaxed text-haze-300">
        Da adesso valgono solo le parole nuove. Distruggi il foglio o il file con quelle vecchie. Nell'app
        desktop e sugli altri dispositivi te le chiederemo al prossimo sblocco.
      </p>
    </div>

    <template #footer>
      <div v-if="step !== 'running'" class="flex w-full items-center justify-between gap-3">
        <Button v-if="step === 'phrase'" label="Indietro" text severity="secondary" @click="step = 'intro'" />
        <Button v-else-if="step === 'confirm'" label="Rivedi le parole" text severity="secondary" @click="step = 'phrase'" />
        <span v-else />

        <div class="flex items-center gap-2">
          <template v-if="step === 'intro'">
            <Button label="Annulla" text @click="visible = false" />
            <Button v-if="!encryptionStore.isUnlocked" label="Sblocca i file" @click="unlockFirst" />
            <Button v-else label="Genera le parole nuove" @click="generate" />
          </template>
          <Button v-else-if="step === 'phrase'" label="Le ho salvate →" :disabled="!revealed" @click="step = 'confirm'" />
          <Button v-else-if="step === 'confirm'" label="Cambia le parole" :disabled="!canRun" @click="run" />
          <Button v-else label="Chiudi" @click="visible = false" />
        </div>
      </div>
    </template>
  </Dialog>
</template>
