<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAdminMetrics, type TimeseriesResult } from '@/src/composables/useAdminMetrics'
import { formatBytes } from '@/src/types/plan'

/**
 * Metriche — solo aggregati, mai il comportamento di un singolo utente (vedi il
 * composable). `storedBytes` nel tempo è quella che conta di più: è l'indicatore
 * anticipato della bolletta, il motivo per cui esistono i tetti di piano.
 *
 * `overview` scansiona quattro tabelle al server: la si chiama qui, all'apertura della
 * pagina — **mai** in un polling, come dice il commento sulla rotta.
 */

const { overview, isLoadingOverview, loadOverview, loadTimeseries } = useAdminMetrics()
const storedSeries = ref<TimeseriesResult | null>(null)

onMounted(async () => {
  await loadOverview()
  storedSeries.value = await loadTimeseries('storedBytes')
})

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('it-IT'))
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="m-0 text-xl font-semibold text-haze-100">Metriche</h1>
      <p class="m-0 mt-1 text-sm text-haze-400">
        Solo aggregati. I dati del singolo utente sono nella sua scheda.
      </p>
    </header>

    <div v-if="isLoadingOverview" class="text-sm text-haze-400">Carico…</div>

    <template v-else-if="overview">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
          <p class="m-0 text-xs text-haze-500">Utenti</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">{{ fmt(overview.users) }}</p>
        </div>
        <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
          <p class="m-0 text-xs text-haze-500">Attivi (30gg)</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">{{ fmt(overview.activeUsers30d) }}</p>
        </div>
        <div class="rounded-well border border-brand-500/30 bg-brand-500/10 p-4">
          <p class="m-0 text-xs text-haze-500">⭐ Storage totale</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">
            {{ overview.storedBytes !== null ? formatBytes(overview.storedBytes) : '—' }}
          </p>
        </div>
        <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
          <p class="m-0 text-xs text-haze-500">Volume/mese</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">
            {{ overview.monthlyBytes !== null ? formatBytes(overview.monthlyBytes) : '—' }}
          </p>
        </div>
        <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
          <p class="m-0 text-xs text-haze-500">Piani pagati</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">{{ fmt(overview.paidPlans) }}</p>
        </div>
        <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
          <p class="m-0 text-xs text-haze-500">Piani regalati</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">{{ fmt(overview.grantedPlans) }}</p>
        </div>
        <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
          <p class="m-0 text-xs text-haze-500">Link guest → account</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">
            {{ overview.claimRate !== null ? `${overview.claimRate}%` : '—' }}
          </p>
        </div>
        <div class="rounded-well border p-4" :class="overview.openReports ? 'border-warn-400/30 bg-warn-400/10' : 'border-white/10 bg-white/[0.03]'">
          <p class="m-0 text-xs text-haze-500">Segnalazioni aperte</p>
          <p class="m-0 mt-1 text-xl font-semibold text-haze-100">{{ fmt(overview.openReports) }}</p>
        </div>
      </div>

      <section>
        <h2 class="m-0 mb-2 text-sm font-semibold text-haze-200">Distribuzione piani</h2>
        <div class="flex gap-4 text-sm text-haze-300">
          <span v-for="(count, plan) in overview.plans" :key="plan">{{ plan }}: {{ count }}</span>
        </div>
      </section>

      <section>
        <h2 class="m-0 mb-2 text-sm font-semibold text-haze-200">Storage nel tempo (30 giorni)</h2>
        <p v-if="storedSeries && !storedSeries.available" class="text-sm text-haze-500">
          {{ storedSeries.note }}
        </p>
        <ul v-else-if="storedSeries" class="m-0 flex flex-col gap-1 p-0 font-mono text-xs text-haze-400">
          <li v-for="p in storedSeries.points" :key="p.day" class="flex justify-between">
            <span>{{ p.day }}</span>
            <span>{{ p.value !== null ? formatBytes(p.value) : '—' }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
