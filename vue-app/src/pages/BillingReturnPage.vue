<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlan } from '@/src/composables/usePlan'
import { PLAN_CATALOG } from '@/src/types/plan'

/**
 * Il ritorno da Stripe (roadmap E3/F3).
 *
 * **Perché una pagina e non una notifica.** Al ritorno dal pagamento il piano nuovo non
 * è ancora visibile: Stripe conferma al *nostro backend* via webhook, che è asincrono.
 * Rimandare l'utente in dashboard con un "fatto!" e i limiti vecchi ancora scritti è il
 * modo più rapido di far sembrare rotto un pagamento riuscito. Qui invece si aspetta la
 * conferma, si ricontrolla qualche volta, e si dice la verità in ogni fase.
 *
 * Stripe torna su `/app/abbonamento/esito?stato=successo|annullato`.
 */

const route = useRoute()
const router = useRouter()
const { plan, isAuthoritative, load } = usePlan()

type Phase = 'verifica' | 'confermato' | 'in-attesa' | 'annullato'
const phase = ref<Phase>('verifica')

// Il webhook di Stripe può metterci qualche secondo: si ricontrolla a intervalli
// crescenti invece di dichiarare subito un fallimento che probabilmente non c'è.
const RETRY_DELAYS_MS = [1200, 2500, 4000, 6000]

onMounted(async () => {
  if (route.query.stato === 'annullato') {
    phase.value = 'annullato'
    return
  }

  const before = plan.value
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    await load(true)
    if (isAuthoritative.value && plan.value !== before && plan.value !== 'free') {
      phase.value = 'confermato'
      return
    }
  }
  // Nessun cambiamento entro ~14s: non è detto che sia andata male, ma non possiamo dire di sì.
  phase.value = 'in-attesa'
})
</script>

<template>
  <div class="lt-page">
    <div class="mx-auto max-w-[62ch] rounded-panel border border-white/10 bg-white/[0.03] p-8 text-center">
      <template v-if="phase === 'verifica'">
        <ProgressSpinner style="width: 42px; height: 42px" />
        <h1 class="mt-5 mb-2 text-2xl font-bold tracking-[-0.02em] text-haze-100">Stiamo confermando il pagamento</h1>
        <p class="m-0 text-sm leading-relaxed text-haze-300">
          Un attimo: la conferma passa dal nostro server, non dal tuo browser.
        </p>
      </template>

      <template v-else-if="phase === 'confermato'">
        <i class="pi pi-check-circle text-4xl text-verified-400" />
        <h1 class="mt-4 mb-2 text-2xl font-bold tracking-[-0.02em] text-haze-100">
          Sei su {{ PLAN_CATALOG[plan].name }}
        </h1>
        <p class="m-0 text-sm leading-relaxed text-haze-300">
          I nuovi limiti valgono da subito. La cifratura non cambia: era già la stessa.
        </p>
        <div class="mt-6 flex justify-center gap-2">
          <Button label="Vai alla dashboard" @click="router.push('/app')" />
          <Button label="Vedi il piano" severity="secondary" outlined @click="router.push('/app/settings')" />
        </div>
      </template>

      <template v-else-if="phase === 'in-attesa'">
        <i class="pi pi-clock text-4xl text-warn-400" />
        <h1 class="mt-4 mb-2 text-2xl font-bold tracking-[-0.02em] text-haze-100">Ci stiamo ancora lavorando</h1>
        <p class="m-0 text-sm leading-relaxed text-haze-300">
          Il pagamento potrebbe essere andato a buon fine: la conferma a volte tarda di qualche
          minuto. Se tra poco il piano non risulta aggiornato nelle impostazioni, scrivici — non
          rifare il pagamento.
        </p>
        <div class="mt-6 flex justify-center gap-2">
          <Button label="Apri le impostazioni" @click="router.push('/app/settings')" />
        </div>
      </template>

      <template v-else>
        <i class="pi pi-times-circle text-4xl text-haze-400" />
        <h1 class="mt-4 mb-2 text-2xl font-bold tracking-[-0.02em] text-haze-100">Pagamento annullato</h1>
        <p class="m-0 text-sm leading-relaxed text-haze-300">
          Non è stato addebitato nulla. Il tuo piano resta quello di prima.
        </p>
        <div class="mt-6 flex justify-center gap-2">
          <Button label="Torna alla dashboard" severity="secondary" outlined @click="router.push('/app')" />
          <Button label="Rivedi i piani" @click="router.push('/prezzi')" />
        </div>
      </template>
    </div>
  </div>
</template>
