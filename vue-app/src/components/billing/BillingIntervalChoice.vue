<script setup lang="ts">
import { computed } from 'vue'
import { PLAN_CATALOG, type PlanId } from '@/src/types/plan'
import type { BillingInterval } from '@/src/composables/useBilling'

/**
 * Mensile o annuale, prima di andare su Stripe (O1.5). Si mostra solo per un piano che ha
 * davvero un prezzo annuale: per gli altri non c'è niente da scegliere.
 *
 * L'annuale conviene anche a noi: la quota fissa di Stripe (€0,25) si paga una volta invece
 * di dodici. Per questo è la scelta mostrata per seconda ma con il risparmio scritto accanto,
 * non nascosta.
 */

const props = defineProps<{ plan: Exclude<PlanId, 'free'> }>()
const interval = defineModel<BillingInterval>({ default: 'month' })

const entry = computed(() => PLAN_CATALOG[props.plan])
const savedMonths = computed(() => {
  const { monthlyEur, yearlyEur } = entry.value
  return monthlyEur && yearlyEur ? Math.round(12 - yearlyEur / monthlyEur) : 0
})
</script>

<template>
  <div v-if="entry.monthlyEur && entry.yearlyEur" class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Frequenza di pagamento">
    <button
      type="button"
      role="radio"
      :aria-checked="interval === 'month'"
      class="rounded-field border px-3 py-2.5 text-left transition-colors"
      :class="interval === 'month' ? 'border-brand-500 bg-brand-500/10' : 'border-white/15 bg-white/[0.03] hover:border-white/30'"
      @click="interval = 'month'"
    >
      <span class="block text-sm font-semibold text-haze-100">Mensile</span>
      <span class="block font-mono text-xs text-haze-400">€{{ entry.monthlyEur }} al mese</span>
    </button>
    <button
      type="button"
      role="radio"
      :aria-checked="interval === 'year'"
      class="rounded-field border px-3 py-2.5 text-left transition-colors"
      :class="interval === 'year' ? 'border-brand-500 bg-brand-500/10' : 'border-white/15 bg-white/[0.03] hover:border-white/30'"
      @click="interval = 'year'"
    >
      <span class="block text-sm font-semibold text-haze-100">
        Annuale <span v-if="savedMonths > 0" class="text-verified-400">−{{ savedMonths }} mesi</span>
      </span>
      <span class="block font-mono text-xs text-haze-400">€{{ entry.yearlyEur }} all'anno</span>
    </button>
  </div>
</template>
