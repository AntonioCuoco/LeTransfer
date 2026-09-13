<script setup lang="ts">
import { computed, ref } from 'vue'
import { notify } from '@/src/utils/notify'
import { generateRecoveryKey, deriveMasterKeyFromMnemonic, createVerificationHash } from '@/src/crypto/recovery-key'
import { rememberMasterKey, REMEMBER_DAYS } from '@/src/crypto/rememberedDevice'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { generateSalt, arrayBufferToBase64 } from '@/src/crypto/crypto'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import { useEncryptionStore } from '@/src/stores/encryption'
import novrenIcon from '@/src/assets/novren-icon.png'

/**
 * Creazione della chiave di recupero — 24 parole (roadmap F5).
 *
 * ⚠️ Da non confondere con AppSecurityPrompt: LÌ le 24 parole sono materiale
 * crittografico (si incollano tutte e si deriva la master key per sbloccare i file).
 * QUI non si decifra nulla: le parole sono appena state generate e stanno già in
 * memoria, e `performSetup()` deriva la chiave da `mnemonic.value` — non da ciò che
 * l'utente digita. Il passo di verifica è quindi un controllo sull'UMANO, non sulla chiave.
 *
 * Tre scelte di progetto che non sono estetiche:
 *
 * 1. **La verifica chiede parole singole a caso, digitate.** Prima si incollavano
 *    tutte e 24: chi aveva appena premuto "copia tutto" superava il controllo con un
 *    Ctrl+V, dimostrando solo che gli appunti contenevano ancora ciò che ci avevamo
 *    messo noi. Il quiz passava proprio nel caso che doveva bloccare. Chiedere tre
 *    indici casuali costringe ad andare a leggere dove le parole sono state salvate.
 * 2. **Le parole nascono coperte**, si scoprono con un gesto esplicito: evita che
 *    finiscano in una condivisione schermo o sotto gli occhi di chi passa.
 * 3. **Il download del file è l'azione principale, la copia negli appunti è
 *    secondaria e avvisata**: gli appunti sono il posto meno sicuro dove parcheggiare
 *    un segreto (li leggono i gestori di clipboard e altre applicazioni).
 *
 * La mnemonica vive solo in memoria: mai in storage, mai nei log, mai al server
 * (al backend vanno soltanto `salt` e un blob di verifica).
 */

const emit = defineEmits<{ complete: []; cancel: [] }>()

const { setupRecoveryKey, isLoading } = useRecoveryKeyAPI()
const encryptionStore = useEncryptionStore()

const currentStep = ref(0)
const mnemonic = ref('')
const revealed = ref(false)
const isVerifying = ref(false)
const acknowledged = ref(false)
// Non spuntata di default: ricordare il dispositivo è una scelta. Vedi rememberedDevice.ts.
const rememberDevice = ref(false)

// Indici (0-based) delle parole da ridigitare, estratti a caso alla generazione.
const challengeIndexes = ref<number[]>([])
const answers = ref<string[]>(['', '', ''])

const steps = ['Come funziona', 'Le tue parole', 'Verifica']

const words = computed(() => (mnemonic.value ? mnemonic.value.split(' ') : []))

const allAnswersCorrect = computed(() =>
  challengeIndexes.value.length > 0 &&
  challengeIndexes.value.every(
    (wordIndex, slot) => answers.value[slot].trim().toLowerCase() === words.value[wordIndex],
  ),
)

function pickChallenge(total: number): number[] {
  const chosen = new Set<number>()
  while (chosen.size < Math.min(3, total)) {
    chosen.add(crypto.getRandomValues(new Uint32Array(1))[0] % total)
  }
  return [...chosen].sort((a, b) => a - b)
}

const handleGenerate = async () => {
  mnemonic.value = await generateRecoveryKey()
  challengeIndexes.value = pickChallenge(words.value.length)
  answers.value = ['', '', '']
  revealed.value = false
  currentStep.value = 1
}

const downloadAsFile = () => {
  const content = [
    'Novren — chiave di recupero',
    '',
    "Queste 24 parole sono l'unico modo per riaprire i tuoi file se perdi",
    "l'accesso a questo dispositivo. Chi le possiede può leggere i tuoi file.",
    'Conservale offline. Non inviarle via email o chat.',
    '',
    `Generate il ${new Date().toLocaleString('it-IT')}`,
    '',
    ...words.value.map((word, index) => `${String(index + 1).padStart(2, '0')}. ${word}`),
  ].join('\n')

  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  // Il nome del file finisce sul disco dell'utente: è UI a tutti gli effetti.
  anchor.download = 'novren-chiave-di-recupero.txt'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  notify.info('File scaricato. Spostalo in un posto sicuro e offline.')
}

const copyMnemonic = async () => {
  try {
    await navigator.clipboard.writeText(mnemonic.value)
    notify.warning("Copiata. Svuota gli appunti appena l'hai incollata nel gestore password.")
  } catch {
    notify.error('Impossibile copiare: usa il download oppure trascrivile a mano.')
  }
}

const performSetup = async () => {
  isVerifying.value = true
  try {
    const salt = generateSalt()
    const masterKey = await deriveMasterKeyFromMnemonic(mnemonic.value, salt)

    const verificationHash = await createVerificationHash(masterKey)
    const saltBase64 = arrayBufferToBase64(salt.slice().buffer)

    const success = await setupRecoveryKey({ salt: saltBase64, verificationHash })
    if (success) {
      encryptionStore.setMasterKey(masterKey)
      if (rememberDevice.value) {
        try {
          await rememberMasterKey(masterKey, { sub: getCurrentUser()?.sub })
        } catch {
          notify.warning(
            'La chiave è attiva, ma questo browser non ci permette di ricordarlo: alla prossima sessione ti chiederemo le 24 parole.',
            'Dispositivo non ricordato',
          )
        }
      }
      // La mnemonica esce dalla memoria appena non serve più.
      mnemonic.value = ''
      answers.value = ['', '', '']
      notify.success('Chiave di recupero attiva.')
      emit('complete')
    }
  } catch {
    notify.error('Errore durante la configurazione.')
  } finally {
    isVerifying.value = false
  }
}

const handleConfirm = async () => {
  if (!allAnswersCorrect.value) {
    notify.error('Almeno una parola non corrisponde. Ricontrolla dove le hai salvate.')
    return
  }
  await performSetup()
}
</script>

<template>
  <div class="w-full px-2 pb-2 text-haze-100">
    <!-- Avanzamento -->
    <div class="mb-9 flex items-center justify-center gap-2">
      <template v-for="(title, index) in steps" :key="title">
        <div class="flex items-center gap-2">
          <span
            class="grid h-7 w-7 place-items-center rounded-full font-mono text-[0.72rem] font-bold"
            :class="index <= currentStep ? 'bg-brand-500 text-white' : 'bg-white/10 text-haze-400'"
          >
            {{ index + 1 }}
          </span>
          <span class="hidden text-[0.82rem] sm:inline" :class="index <= currentStep ? 'text-haze-100' : 'text-haze-400'">
            {{ title }}
          </span>
        </div>
        <span v-if="index < steps.length - 1" class="h-px w-8 bg-white/15" />
      </template>
    </div>

    <!-- 0 · Come funziona -->
    <div v-if="currentStep === 0" class="flex flex-col items-center gap-7 text-center">
      <img :src="novrenIcon" alt="Novren" width="108" height="56" />

      <div>
        <h3 class="m-0 text-2xl font-bold tracking-[-0.02em]">
          Se perdi questo dispositivo,<br />questa è l'unica via di ritorno.
        </h3>
        <p class="mx-auto mt-3 max-w-[52ch] leading-relaxed text-haze-300">
          I tuoi file si aprono con una chiave che vive in questo browser. Stiamo per generare
          <b class="text-haze-100">24 parole</b> che permettono di ricrearla altrove.
        </p>
      </div>

      <div class="w-full rounded-panel border border-warn-400/30 bg-warn-400/[0.07] p-5 text-left">
        <p class="lt-label mb-2 !text-warn-400">Da capire prima di continuare</p>
        <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[0.92rem] leading-relaxed text-haze-200">
          <li>· Se le perdi, <b class="text-haze-100">i tuoi file non li recupera nessuno — nemmeno noi.</b> Non è una politica: non abbiamo la chiave.</li>
          <li>· Chi le ottiene può leggere i tuoi file. Valgono quanto i file stessi.</li>
          <li>· Non te le chiederemo mai via email, chat o telefono.</li>
        </ul>
      </div>

      <label class="flex cursor-pointer items-start gap-2.5 text-left text-[0.9rem] text-haze-200">
        <input v-model="acknowledged" type="checkbox" class="mt-0.5 h-4 w-4 flex-none accent-[var(--color-brand-500)]" />
        Ho capito che siamo gli unici a non poter recuperare i miei file.
      </label>

      <div class="flex justify-center gap-3 pt-1">
        <Button label="Più tardi" severity="secondary" outlined size="large" @click="emit('cancel')" />
        <Button label="Genera le 24 parole" size="large" :disabled="!acknowledged" @click="handleGenerate" />
      </div>
    </div>

    <!-- 1 · Le parole -->
    <div v-else-if="currentStep === 1">
      <div class="mb-5 text-center">
        <h4 class="m-0 text-xl font-semibold">Mettile al sicuro, adesso</h4>
        <p class="m-0 mt-1.5 text-haze-300">Un file offline, oppure carta e penna. Tra un momento te ne chiedo tre a caso.</p>
      </div>

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

      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          <Button label="Scarica come file" icon="pi pi-download" :disabled="!revealed" @click="downloadAsFile" />
          <Button label="Copia" icon="pi pi-copy" severity="secondary" outlined :disabled="!revealed" @click="copyMnemonic" />
        </div>
        <Button label="Le ho salvate →" :disabled="!revealed" @click="currentStep = 2" />
      </div>

      <p class="mt-3 text-center font-mono text-[0.72rem] text-haze-400">
        gli appunti sono il posto meno sicuro: svuotali appena hai finito
      </p>
    </div>

    <!-- 2 · Verifica -->
    <div v-else-if="currentStep === 2" class="flex flex-col gap-6">
      <div class="text-center">
        <h4 class="m-0 text-xl font-semibold">Controlliamo che tu le abbia davvero</h4>
        <p class="m-0 mt-1.5 text-haze-300">
          Scrivi le tre parole che ti chiedo, prendendole da dove le hai salvate.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <div v-for="(wordIndex, slot) in challengeIndexes" :key="wordIndex">
          <label class="lt-label mb-1.5 block !text-haze-400">Parola numero {{ wordIndex + 1 }}</label>
          <input
            v-model="answers[slot]"
            type="text"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            class="w-full rounded-field border bg-black/20 px-3 py-2.5 font-mono text-[0.9rem] outline-none transition-colors focus:border-brand-500"
            :class="answers[slot] && answers[slot].trim().toLowerCase() !== words[wordIndex]
              ? 'border-crit-400/50'
              : 'border-white/15'"
          />
        </div>
      </div>

      <label class="flex cursor-pointer items-start gap-2.5 text-[0.9rem] text-haze-200">
        <input v-model="rememberDevice" type="checkbox" class="mt-0.5 h-4 w-4 flex-none accent-[var(--color-brand-500)]" />
        <span>
          Ricorda su questo dispositivo per {{ REMEMBER_DAYS }} giorni
          <span class="mt-0.5 block text-[0.78rem] leading-relaxed text-haze-400">
            Così non ti chiediamo le 24 parole a ogni accesso. Non spuntarla su un computer condiviso:
            chi lo usa con il tuo account aperto potrebbe aprire i tuoi file.
          </span>
        </span>
      </label>

      <div class="flex justify-between gap-2">
        <Button label="Rivedile" severity="secondary" outlined @click="currentStep = 1" />
        <Button
          label="Attiva la chiave"
          :loading="isVerifying || isLoading"
          :disabled="!allAnswersCorrect"
          @click="handleConfirm"
        />
      </div>
    </div>
  </div>
</template>
