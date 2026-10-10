<script setup lang="ts">
/**
 * Il form dei feedback e delle richieste di aiuto, uguale sulla landing (senza account, con
 * captcha) e nell'area autenticata. Ogni messaggio lo legge una persona: lo diciamo, ed è vero.
 *
 * È testo in chiaro (non cifrato end-to-end, a differenza dei file): il form lo dice, perché
 * nessuno ci scriva le 24 parole o una password.
 */
import { computed, onMounted, ref } from 'vue'
import { useTurnstile } from '@/src/composables/useTurnstile'
import { FEEDBACK_KINDS, FEEDBACK_MAX, sendFeedback, type FeedbackKind, type FeedbackSource } from '@/src/composables/useFeedback'
import { withDetail } from '@/src/utils/errorDetail'

const props = defineProps<{
  source: FeedbackSource
  authenticated: boolean
  /** L'email dell'account, per dire dove arriverà la risposta. */
  accountEmail?: string | null
}>()

const kind = ref<FeedbackKind>('idea')
const message = ref('')
const contactEmail = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref<string | null>(null)

const { enabled: turnstileEnabled, mount: mountTurnstile, getToken, refresh } = useTurnstile()
const turnstileEl = ref<HTMLElement | null>(null)
const needsCaptcha = computed(() => !props.authenticated && turnstileEnabled)

onMounted(() => {
  if (needsCaptcha.value && turnstileEl.value) mountTurnstile(turnstileEl.value)
})

const tooShort = computed(() => message.value.trim().length < 5)
const left = computed(() => FEEDBACK_MAX - message.value.length)

async function submit() {
  if (tooShort.value || sending.value) return
  sending.value = true
  error.value = null
  try {
    const turnstileToken = needsCaptcha.value ? await getToken() : null
    await sendFeedback(
      {
        kind: kind.value,
        message: message.value.trim(),
        contactEmail: props.authenticated ? undefined : contactEmail.value.trim() || undefined,
        source: props.source,
        page: window.location.pathname,
        turnstileToken,
      },
      props.authenticated,
    )
    sent.value = true
  } catch (e) {
    const code = (e as { response?: { data?: { errorCode?: string; error?: string } } }).response?.data
    error.value = code?.errorCode === 'RATE_LIMITED'
      ? 'Hai mandato molti messaggi di seguito: riprova fra un po\'.'
      : code?.error ?? withDetail('Il messaggio non è partito.', e)
    if (needsCaptcha.value) refresh()
  } finally {
    sending.value = false
  }
}

function again() {
  sent.value = false
  message.value = ''
  if (needsCaptcha.value) refresh()
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div v-if="sent" class="rounded-well border border-[#37e7c4]/30 bg-[#37e7c4]/[0.06] p-5">
      <p class="m-0 text-base font-semibold text-haze-100">Grazie, è arrivato.</p>
      <p class="m-0 mt-2 text-sm leading-relaxed text-haze-300">
        Lo leggiamo davvero, uno per uno.
        <template v-if="authenticated && accountEmail">Se serve una risposta, ti scriviamo a <span class="font-mono">{{ accountEmail }}</span>.</template>
        <template v-else-if="contactEmail.trim()">Se serve una risposta, ti scriviamo a <span class="font-mono">{{ contactEmail.trim() }}</span>.</template>
      </p>
      <button type="button" class="mt-4 text-sm font-semibold text-[#37e7c4] underline-offset-4 hover:underline" @click="again">Scrivi un altro messaggio</button>
    </div>

    <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
      <fieldset class="m-0 flex flex-col gap-2 border-0 p-0">
        <legend class="mb-2 text-sm font-semibold text-haze-100">Di cosa si tratta?</legend>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            v-for="k in FEEDBACK_KINDS"
            :key="k.value"
            type="button"
            class="rounded-well border px-3 py-2.5 text-left transition-colors"
            :class="kind === k.value ? 'border-[#8b6bff] bg-[#724cf9]/20 text-haze-100' : 'border-white/10 bg-white/[0.03] text-haze-300 hover:border-white/25'"
            :aria-pressed="kind === k.value"
            @click="kind = k.value"
          >
            <span class="block text-sm font-semibold">{{ k.label }}</span>
            <span class="mt-0.5 block text-[0.72rem] leading-snug text-haze-400">{{ k.hint }}</span>
          </button>
        </div>
      </fieldset>

      <label class="flex flex-col gap-2 text-sm font-semibold text-haze-100">
        Il tuo messaggio
        <textarea
          v-model="message"
          :maxlength="FEEDBACK_MAX"
          rows="6"
          required
          class="w-full resize-y rounded-well border border-white/10 bg-white/[0.04] px-3.5 py-3 text-[0.95rem] font-normal leading-relaxed text-haze-100 outline-none transition-colors placeholder:text-haze-500 focus:border-[#8b6bff]"
          :placeholder="kind === 'problema' ? 'Cosa stavi facendo, cosa ti aspettavi e cosa è successo invece.' : 'Scrivi pure come ti viene.'"
        />
        <span class="self-end font-mono text-[0.7rem] font-normal" :class="left < 200 ? 'text-[#f5b14c]' : 'text-haze-500'">{{ left }}</span>
      </label>

      <label v-if="!authenticated" class="flex flex-col gap-2 text-sm font-semibold text-haze-100">
        <span>La tua email <span class="font-normal text-haze-400">— facoltativa, solo se vuoi una risposta</span></span>
        <input
          v-model="contactEmail"
          type="email"
          maxlength="200"
          autocomplete="email"
          class="w-full rounded-well border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[0.95rem] font-normal text-haze-100 outline-none transition-colors placeholder:text-haze-500 focus:border-[#8b6bff]"
          placeholder="nome@esempio.it"
        />
      </label>

      <p class="m-0 flex gap-2 text-xs leading-relaxed text-haze-400">
        <i class="pi pi-info-circle mt-0.5 text-[0.75rem]" aria-hidden="true" />
        <span>Questo messaggio non è cifrato end-to-end come i tuoi file: non scriverci password, le 24 parole o dati che non vuoi farci leggere.</span>
      </p>

      <div v-if="needsCaptcha" ref="turnstileEl" class="flex justify-center"></div>
      <p v-if="error" class="m-0 text-sm text-[#ff8a9b]">{{ error }}</p>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          class="rounded-full bg-[#724cf9] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#5a30eb] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="tooShort || sending"
        >
          {{ sending ? 'Invio…' : 'Manda il messaggio' }}
        </button>
        <a href="/aiuto" class="text-sm text-haze-300 underline-offset-4 hover:text-haze-100 hover:underline">Prima, cerca una risposta nelle guide →</a>
      </div>
    </form>
  </div>
</template>
