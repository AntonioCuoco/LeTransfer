<script setup lang="ts">
import { computed } from 'vue'
import { PLAN_CATALOG, type PlanId } from '@/src/types/plan'

/**
 * L'etichetta del piano. Piccola di proposito: dice a che piano sei, non ti vende nulla.
 *
 * `presumed` copre il caso in cui il piano non è stato confermato dal server (endpoint
 * `GET /api/user/plan` non ancora esistente): l'etichetta resta ma perde l'accento, così
 * non affermiamo con sicurezza qualcosa che abbiamo dedotto.
 */
const props = defineProps<{
  plan: PlanId
  presumed?: boolean
}>()

const label = computed(() => PLAN_CATALOG[props.plan].name)
</script>

<template>
  <span
    class="inline-flex items-center rounded-badge px-2 py-0.5 font-mono text-[0.62rem] uppercase tracking-[0.14em]"
    :class="presumed
      ? 'border border-white/10 text-haze-400'
      : plan === 'free'
        ? 'border border-white/15 text-haze-200'
        : 'bg-brand-500 text-white'"
    :title="presumed ? 'Piano non confermato dal server' : undefined"
  >
    {{ label }}
  </span>
</template>
