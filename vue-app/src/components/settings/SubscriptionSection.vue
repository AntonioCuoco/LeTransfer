<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import SettingsSection from './SettingsSection.vue'
import PlanLimitsPanel from '@/src/components/billing/PlanLimitsPanel.vue'
import StorageUsagePanel from '@/src/components/billing/StorageUsagePanel.vue'
import { usePlan } from '@/src/composables/usePlan'
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  PLAN_PRICES_PROVISIONAL,
  formatBytes,
  formatRetention,
} from '@/src/types/plan'

/**
 * La scheda «Abbonamento» delle impostazioni (roadmap E3/F3).
 *
 * Due blocchi, in quest'ordine per un motivo: prima **il tuo piano e i tuoi limiti**
 * (informazione che serve a chiunque, anche a chi non comprerà mai), poi il confronto
 * con gli altri piani (che serve solo a chi sta valutando). L'ordine inverso sarebbe
 * un listino travestito da impostazioni.
 */

const router = useRouter()
const { plan } = usePlan()

const others = computed(() => PLAN_ORDER.filter((id) => id !== plan.value))
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection
      title="Abbonamento"
      description="Il tuo piano, i limiti che il server applica davvero e la fatturazione"
      icon="pi pi-credit-card"
    >
      <PlanLimitsPanel />
      <StorageUsagePanel />
    </SettingsSection>

    <SettingsSection
      title="Gli altri piani"
      description="Cosa cambierebbe"
      icon="pi pi-arrow-up-right"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <div
          v-for="id in others"
          :key="id"
          class="rounded-well border border-white/10 bg-white/[0.03] p-4"
        >
          <div class="flex items-baseline justify-between gap-3">
            <h4 class="m-0 font-semibold text-haze-100">{{ PLAN_CATALOG[id].name }}</h4>
            <span class="font-mono text-xs text-haze-400">
              {{ PLAN_CATALOG[id].monthlyEur === 0 ? 'gratis' : `€${PLAN_CATALOG[id].monthlyEur}/mese` }}
            </span>
          </div>
          <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[0.72rem]">
            <dt class="text-haze-400">file max</dt>
            <dd class="m-0 text-right font-bold text-haze-100">{{ formatBytes(PLAN_CATALOG[id].limits.maxFileBytes) }}</dd>
            <dt class="text-haze-400">i link durano</dt>
            <dd class="m-0 text-right font-bold text-haze-100">{{ formatRetention(PLAN_CATALOG[id].limits.maxExpiryHours) }}</dd>
          </dl>
        </div>
      </div>

      <p class="m-0 mt-4 text-xs leading-relaxed text-haze-400">
        La cifratura è identica in tutti i piani, incluso quello gratuito: si compra capienza,
        non sicurezza.
        <span v-if="PLAN_PRICES_PROVISIONAL"> Gli importi qui sopra sono provvisori.</span>
      </p>

      <div class="mt-4">
        <Button label="Confronta i piani" icon="pi pi-external-link" severity="secondary" outlined @click="router.push('/prezzi')" />
      </div>
    </SettingsSection>
  </div>
</template>
