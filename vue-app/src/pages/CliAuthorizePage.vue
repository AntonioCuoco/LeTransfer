<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import CliConsentCard from '@/src/components/cli/CliConsentCard.vue'
import { CliUnavailable, useCliAuthorization, type CliKind } from '@/src/composables/useCliAuthorization'
import {
  clearPendingCliRequest,
  loadPendingCliRequest,
  loopbackCallbackUrl,
  parseLoopbackRequest,
  savePendingCliRequest,
  verificationCode,
  type LoopbackRequest,
} from '@/src/utils/cliAuthorization'

/**
 * /cli/authorize — la pagina che la CLI apre nel browser (RFC 8252).
 *
 * Arriva con `?port&state&challenge&device`. Dopo la scelta chiede al backend un codice
 * monouso e rimanda il browser a http://127.0.0.1:<port>/callback, dove la CLI lo aspetta.
 * La richiesta si salva in sessionStorage, così chi deve prima fare il login ci ritorna
 * senza ricominciare dal terminale.
 */

type View = 'ready' | 'invalid' | 'unavailable' | 'done'

const route = useRoute()
const { requestGrant } = useCliAuthorization()

const view = ref<View>('ready')
const request = ref<LoopbackRequest | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)

onMounted(() => {
  const fromQuery = parseLoopbackRequest(route.query as Record<string, unknown>)
  if (fromQuery) {
    savePendingCliRequest(fromQuery)
    request.value = fromQuery
    return
  }
  // Di ritorno dal login: la richiesta è in sessione.
  const pending = loadPendingCliRequest()
  if (pending?.mode === 'loopback') {
    request.value = pending
    return
  }
  view.value = 'invalid'
})

async function authorize(kind: CliKind, turnstileToken?: string) {
  if (!request.value) return
  busy.value = true
  error.value = null
  try {
    const code = await requestGrant(request.value, kind, turnstileToken)
    clearPendingCliRequest()
    view.value = 'done'
    // Host fisso 127.0.0.1, porta validata: il codice torna solo al computer da cui è partita
    // la richiesta.
    window.location.assign(loopbackCallbackUrl(request.value, code))
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
      <div v-if="view === 'invalid'" class="lt-card p-6" data-testid="cli-invalid">
        <h1 class="m-0 text-[1.3rem] font-bold tracking-[-0.02em]">Richiesta non valida o scaduta</h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
          Questa pagina si apre dal terminale. Rilancia <code class="font-mono">novren login</code> e
          usa il link che ti mostra.
        </p>
      </div>

      <div v-else-if="view === 'unavailable'" class="lt-card p-6" data-testid="cli-unavailable">
        <h1 class="m-0 text-[1.3rem] font-bold tracking-[-0.02em]">Non ancora disponibile</h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">
          L’accesso dalla CLI non è ancora attivo. Nel frattempo puoi scaricare i file che ricevi con
          <code class="font-mono">novren get</code>, che non richiede un account.
        </p>
      </div>

      <div v-else-if="view === 'done'" class="lt-card p-6" data-testid="cli-done">
        <h1 class="m-0 text-[1.3rem] font-bold tracking-[-0.02em]">Fatto. Torna al terminale.</h1>
        <p class="mt-2 text-[0.92rem] leading-relaxed text-[#6a5f8c]">Puoi chiudere questa pagina.</p>
      </div>

      <CliConsentCard
        v-else-if="request"
        :device-name="request.deviceName"
        :verification="verificationCode(request.codeChallenge)"
        :busy="busy"
        :error="error"
        @authorize="authorize"
      />
    </div>
  </PublicShell>
</template>
