<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PlanBadge from './PlanBadge.vue'
import BillingIntervalChoice from './BillingIntervalChoice.vue'
import { usePlan } from '@/src/composables/usePlan'
import { useBilling, type BillingInterval } from '@/src/composables/useBilling'
import {
  PLAN_CATALOG,
  PLAN_PRICES_PROVISIONAL,
  formatBytes,
  formatRetention,
  nextPlanAfter,
} from '@/src/types/plan'

/**
 * Il pannello "il tuo piano" (roadmap E3/F3).
 *
 * Esiste perché i limiti erano applicati e mai mostrati: il server rifiutava un upload
 * con `413` e l'utente scopriva solo in quel momento quanto poteva caricare. Qui i due
 * numeri che contano — quanto può pesare un file, quanto dura un link — stanno scritti
 * *prima* di sbatterci contro.
 */

const router = useRouter()
const { plan, limits, subscription, isAuthoritative, isLoading, load } = usePlan()
const { isStarting, availability, startCheckout, openPortal } = useBilling()

onMounted(() => { void load() })

const upgrade = computed(() => nextPlanAfter(plan.value))
const billing = computed(() => availability())
const interval = ref<BillingInterval>('month')

const periodEnd = computed(() => {
  const iso = subscription.value?.currentPeriodEnd
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })
})

function goToUpgrade() {
  const target = upgrade.value
  if (!target || target === 'free') return
  if (!billing.value.ready) {
    // Niente checkout: si manda al listino, dove il perché è scritto.
    router.push('/prezzi')
    return
  }
  void startCheckout(target, interval.value)
}
</script>

<template>
  <div class="rounded-panel border border-white/10 bg-white/[0.03] p-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2.5">
          <h3 class="m-0 text-lg font-semibold text-white">Il tuo piano</h3>
          <PlanBadge :plan="plan" :presumed="!isAuthoritative" />
        </div>
        <p class="m-0 mt-1 max-w-[62ch] text-sm leading-relaxed text-haze-300">
          {{ PLAN_CATALOG[plan].tagline }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          v-if="subscription && subscription.status !== 'none'"
          label="Gestisci"
          icon="pi pi-external-link"
          severity="secondary"
          outlined
          :loading="isStarting"
          @click="openPortal"
        />
        <Button
          v-if="upgrade"
          :label="`Passa a ${PLAN_CATALOG[upgrade].name}`"
          icon="pi pi-arrow-up-right"
          :loading="isStarting"
          @click="goToUpgrade"
        />
      </div>
    </div>

    <div v-if="upgrade && upgrade !== 'free' && billing.ready" class="mt-4 max-w-[420px]">
      <BillingIntervalChoice v-model="interval" :plan="upgrade" />
    </div>

    <!-- I due limiti veri, negli stessi termini in cui il server li applica. -->
    <dl class="mt-5 grid gap-3 sm:grid-cols-2">
      <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <dt class="lt-label !text-haze-400">file più grande</dt>
        <dd class="m-0 mt-1.5 font-mono text-xl font-bold text-haze-100">
          {{ isLoading ? '—' : formatBytes(limits.maxFileBytes) }}
        </dd>
      </div>
      <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
        <dt class="lt-label !text-haze-400">i tuoi link durano fino a</dt>
        <dd class="m-0 mt-1.5 font-mono text-xl font-bold text-haze-100">
          {{ isLoading ? '—' : formatRetention(limits.maxExpiryHours) }}
        </dd>
      </div>
    </dl>

    <!-- Stato abbonamento, quando ce n'è uno. -->
    <p v-if="subscription?.cancelAtPeriodEnd && periodEnd" class="m-0 mt-4 text-sm text-warn-400">
      Abbonamento disdetto: resta attivo fino al {{ periodEnd }}, poi torni a Free.
    </p>
    <p v-else-if="subscription?.status === 'past_due'" class="m-0 mt-4 text-sm text-crit-400">
      L’ultimo pagamento non è andato a buon fine. Aggiorna il metodo di pagamento da «Gestisci».
    </p>
    <p v-else-if="periodEnd" class="m-0 mt-4 font-mono text-xs text-haze-400">
      prossimo rinnovo · {{ periodEnd }}
    </p>

    <!-- Non nascondiamo che il piano è dedotto e che i pagamenti non sono accesi. -->
    <p v-if="!isAuthoritative && !isLoading" class="m-0 mt-4 text-xs leading-relaxed text-haze-400">
      Il piano non è ancora confermato dal server, quindi mostriamo i limiti del piano Free —
      che sono quelli davvero applicati finché la fatturazione non è attiva.
    </p>
    <p v-if="PLAN_PRICES_PROVISIONAL" class="m-0 mt-2 text-xs leading-relaxed text-haze-400">
      I prezzi sono ancora provvisori: il pagamento si attiva quando saranno definitivi.
    </p>
  </div>
</template>
