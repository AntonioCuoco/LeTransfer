<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import CliConsentCard from '@/src/components/cli/CliConsentCard.vue'
import { CliUnavailable, useCliAuthorization, type CliKind } from '@/src/composables/useCliAuthorization'
import {
  clearPendingCliRequest,
  loadPendingCliRequest,
  normalizeUserCode,
  savePendingCliRequest,
} from '@/src/utils/cliAuthorization'

/**
 * /cli/device — autorizzare una CLI che gira dove non c'è un browser (un server via SSH).
 *
 * La CLI mostra un codice breve e questo indirizzo; qui la persona lo inserisce da un altro
 * dispositivo, vede quale computer sta chiedendo, e sceglie. La CLI se ne accorge da sola:
 * sta interrogando il backend e riceve il token appena il codice è approvato (RFC 8628).
 */

type View = 'enter' | 'consent' | 'unavailable' | 'done'

const route = useRoute()
const { describeDevice, approveDevice } = useCliAuthorization()

const view = ref<View>('enter')
const codeInput = ref('')
const userCode = ref<string | null>(null)
const deviceName = ref('')
const busy = ref(false)
const error = ref<string | null>(null)

async function lookUp(raw: string) {
  error.value = null
  const code = normalizeUserCode(raw)
  if (!code) {
    error.value = 'Il codice è di otto caratteri, come «BCDF-GHJK».'
    return
  }
  busy.value = true
  try {
    const device = await describeDevice(code)
    if (!device) {
      error.value = 'Codice non valido o scaduto. Rilancia il comando nel terminale per averne uno nuovo.'
      return
    }
    userCode.value = code
    deviceName.value = device.deviceName
    // Per ritrovarlo dopo un eventuale login.
    savePendingCliRequest({ mode: 'device', userCode: code })
    view.value = 'consent'
  } catch (e) {
    if (e instanceof CliUnavailable) view.value = 'unavailable'
    else error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  const fromQuery = typeof route.query.code === 'string' ? route.query.code : null
  const pending = loadPendingCliRequest()
  const initial = fromQuery ?? (pending?.mode === 'device' ? pending.userCode : null)
  if (initial) {
    codeInput.value = initial
    void lookUp(initial)
  }
})

async function authorize(kind: CliKind, turnstileToken?: string) {
  if (!userCode.value) return
  busy.value = true
  error.value = null
  try {
    const approved = await approveDevice(userCode.value, kind, turnstileToken)
    if (!approved) {
      error.value = 'Il codice è scaduto o è già stato usato. Rilancia il comando nel terminale.'
      return
    }
    clearPendingCliRequest()
    view.value = 'done'
  } catch (e) {
    if (e instanceof CliUnavailable) view.value = 'unavailable'
    else error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PublicShell>
    <div class="mx-auto w-[min(560px,100%)] px-4 py-[clamp(32px,8vh,72px)]">
      <div v-if="view === 'enter'" class="lt-card p-6" data-testid="cli-device-enter">
        <p class="m-0 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[#724cf9]">Novren da terminale</p>
        <h1 class="mt-1.5 text-[1.35rem] font-bold tracking-[-0.02em]">Inserisci il codice</h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
          È quello mostrato nel terminale dopo <code class="font-mono">novren login</code>.
        </p>
        <form class="mt-5 flex flex-col gap-3" @submit.prevent="lookUp(codeInput)">
          <input
            v-model="codeInput"
            class="lt-field font-mono text-[1.1rem] uppercase tracking-[0.12em]"
            type="text"
            placeholder="BCDF-GHJK"
            autocomplete="one-time-code"
            autocapitalize="characters"
            spellcheck="false"
            :disabled="busy"
            data-testid="cli-device-code"
          />
          <button type="submit" class="lt-btn" :disabled="busy">Continua</button>
          <p v-if="error" class="m-0 text-[0.86rem] text-[#b4442f]" role="alert">{{ error }}</p>
        </form>
      </div>

      <div v-else-if="view === 'unavailable'" class="lt-card p-6" data-testid="cli-unavailable">
        <h1 class="m-0 text-[1.3rem] font-bold tracking-[-0.02em]">Non ancora disponibile</h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">L’accesso dalla CLI non è ancora attivo.</p>
      </div>

      <div v-else-if="view === 'done'" class="lt-card p-6" data-testid="cli-done">
        <h1 class="m-0 text-[1.3rem] font-bold tracking-[-0.02em]">Fatto. Torna al terminale.</h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
          La CLI su «{{ deviceName }}» si collega da sola entro qualche secondo.
        </p>
      </div>

      <CliConsentCard v-else :device-name="deviceName" :busy="busy" :error="error" @authorize="authorize" />
    </div>
  </PublicShell>
</template>
