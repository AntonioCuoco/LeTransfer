<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { useTurnstile } from '@/src/composables/useTurnstile'
import { REGISTRATION_OPEN } from '@/src/utils/registration'
import type { CliKind } from '@/src/composables/useCliAuthorization'

/**
 * La scelta che la persona fa per la CLI: collegarla al proprio account, oppure usarla senza
 * account dopo una verifica Turnstile. Condivisa dalle due pagine (/cli/authorize e
 * /cli/device), che differiscono solo in come il codice arriva al terminale.
 *
 * ── Perché chiediamo una conferma esplicita ─────────────────────────────────────
 * Il pulsante rilascia un accesso che vive 90 giorni su un altro computer. Non deve bastare
 * aprire un link ricevuto da qualcuno: la pagina mostra quale dispositivo sta chiedendo, e —
 * nel flusso con il browser — un codice da confrontare con quello stampato nel terminale.
 * Se non coincidono, questa pagina non l'ha aperta la tua CLI.
 */

const props = defineProps<{
  deviceName: string
  /** Il codice da confrontare con il terminale (solo nel flusso con il browser). */
  verification?: string
  busy: boolean
  error: string | null
}>()

const emit = defineEmits<{ authorize: [kind: CliKind, turnstileToken?: string] }>()

const router = useRouter()
// La sessione del sito c'è? È la stessa verifica che fanno login e registrazione.
const signedIn = Boolean(Cookies.get('accessToken'))

const { enabled: turnstileEnabled, mount: mountTurnstile, getToken, refresh } = useTurnstile()
const turnstileEl = ref<HTMLElement | null>(null)
const localError = ref<string | null>(null)

onMounted(() => {
  if (turnstileEnabled) mountTurnstile(turnstileEl.value)
})

async function withoutAccount() {
  localError.value = null
  const token = turnstileEnabled ? await getToken() : undefined
  if (turnstileEnabled && !token) {
    localError.value = 'La verifica non è riuscita: aspetta che si completi e riprova.'
    return
  }
  emit('authorize', 'device', token)
  // Il token di Turnstile è monouso: se l'autorizzazione fallisce, se ne prepara un altro.
  if (turnstileEnabled) refresh()
}
</script>

<template>
  <div class="lt-card p-6" data-testid="cli-consent">
    <p class="m-0 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[#724cf9]">Novren da terminale</p>
    <h1 class="mt-1.5 text-[1.35rem] font-bold tracking-[-0.02em]">
      Autorizzi la CLI su «{{ props.deviceName }}»?
    </h1>
    <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
      Quel computer potrà inviare file cifrati con Novren per i prossimi 90 giorni, senza
      riaprire il browser. La cifratura avviene sempre lì: la chiave di ogni invio non passa
      mai dai nostri server.
    </p>

    <div v-if="props.verification" class="mt-4 rounded-[12px] border border-[#e9e3f6] bg-white p-3">
      <p class="m-0 lt-label">Codice di controllo</p>
      <p class="m-0 mt-1 font-mono text-[1.25rem] tracking-[0.12em]" data-testid="cli-verification">
        {{ props.verification }}
      </p>
      <p class="m-0 mt-1 text-[0.78rem] text-[#8a7fae]">
        Deve essere uguale a quello mostrato nel terminale. Se è diverso, chiudi questa pagina.
      </p>
    </div>

    <div class="mt-5 flex flex-col gap-3">
      <template v-if="signedIn">
        <button type="button" class="lt-btn" :disabled="props.busy" data-testid="cli-account" @click="emit('authorize', 'account')">
          Collega al mio account
        </button>
        <p class="m-0 text-[0.78rem] text-[#8a7fae]">
          Gli invii fatti dalla CLI compariranno fra i tuoi file. Potrai scollegare il computer
          dalle impostazioni in qualunque momento.
        </p>
      </template>
      <template v-else>
        <button type="button" class="lt-btn" :disabled="props.busy" data-testid="cli-login" @click="router.push('/login')">
          Accedi per collegare il tuo account
        </button>
        <button
          v-if="REGISTRATION_OPEN"
          type="button"
          class="lt-btn-ghost"
          :disabled="props.busy"
          data-testid="cli-register"
          @click="router.push('/register')"
        >
          Crea un account
        </button>
      </template>

      <div class="lt-rule my-1" />

      <div v-if="turnstileEnabled" ref="turnstileEl" class="flex justify-center"></div>
      <button type="button" class="lt-btn-ghost" :disabled="props.busy" data-testid="cli-device" @click="withoutAccount">
        Continua senza account
      </button>
      <p class="m-0 text-[0.78rem] text-[#8a7fae]">
        Senza account: fino a 20 invii al giorno da quel computer, con gli stessi limiti degli
        invii dal sito.
      </p>

      <p v-if="props.error || localError" class="m-0 text-[0.86rem] text-[#b4442f]" role="alert">
        {{ props.error || localError }}
      </p>
    </div>
  </div>
</template>
