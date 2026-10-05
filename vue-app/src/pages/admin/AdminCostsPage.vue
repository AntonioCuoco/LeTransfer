<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAdminMetrics, type TimeseriesResult } from '@/src/composables/useAdminMetrics'
import { useAdminCosts, formatLimit } from '@/src/composables/useAdminCosts'
import { formatBytes } from '@/src/types/plan'

/**
 * Costi e limiti (roadmap O1.5 «Bolletta sotto controllo»).
 *
 * La domanda a cui risponde: **dove sta andando la bolletta di questo mese, e perché**.
 * Una stima, non la fattura: si calcola dagli aggregati del pannello e dai listini scritti nel
 * backend (`services/costEstimate.js`). Le fatture vere restano nelle console.
 *
 * Solo aggregati, come il resto del pannello: «quanti utenti sono vicini alla quota», mai «chi».
 */

const { overview, isLoadingOverview, loadOverview, loadTimeseries } = useAdminMetrics()
const { limits, guest, isSwitching, loadLimits, loadGuestChannel, setGuestChannel } = useAdminCosts()
const costSeries = ref<TimeseriesResult | null>(null)
const closeReason = ref('')

onMounted(async () => {
  await Promise.all([loadOverview(), loadLimits(), loadGuestChannel()])
  costSeries.value = await loadTimeseries('estimatedCostUsd')
})

const usd = (n: number) => `$${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const eur = (n: number) => `€${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const bytes = (n: number | null | undefined) => (n === null || n === undefined ? '—' : formatBytes(n))

const costs = computed(() => overview.value?.costs ?? null)

const alertCopy = computed(() => {
  const c = costs.value
  if (!c) return null
  const pct = Math.round(c.alert.ratio * 100)
  if (c.alert.level === 'over') return { tone: 'crit', text: `La stima del mese supera la soglia di ${usd(c.alert.thresholdUsd)} (${pct}%). Guarda qui sotto quale voce corre.` }
  if (c.alert.level === 'warn') return { tone: 'warn', text: `La stima del mese è al ${pct}% della soglia di ${usd(c.alert.thresholdUsd)}.` }
  return { tone: 'ok', text: `Sotto la soglia di ${usd(c.alert.thresholdUsd)} (${pct}%).` }
})

/** Lo spazio su R2, diviso per chi lo occupa: cosa resta, cosa se ne va da solo. */
const storage = computed(() => {
  const o = overview.value
  if (!o || o.storedBytes === null) return null
  const free = o.freeBytes ?? 0
  const guestBytes = o.guestBytes ?? 0
  const permanent = Math.max(0, o.storedBytes - free)
  const total = permanent + free + guestBytes
  const share = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  return [
    { key: 'permanent', label: 'File permanenti (Pro)', bytes: permanent, share: share(permanent), hint: 'restano finché l\'utente non li cancella' },
    { key: 'free', label: 'File free', bytes: free, share: share(free), hint: 'si cancellano da soli alla scadenza' },
    { key: 'guest', label: 'Invii da ospite', bytes: guestBytes, share: share(guestBytes), hint: 'si cancellano da soli dopo 7 giorni' },
  ]
})

const guestUsage = computed(() => {
  const g = guest.value
  if (!g || g.usedBytesToday === null) return null
  return { used: g.usedBytesToday, max: g.maxBytesPerDay, pct: Math.min(100, Math.round((g.usedBytesToday / g.maxBytesPerDay) * 100)) }
})

async function closeChannel() {
  if (!closeReason.value.trim()) return
  if (await setGuestChannel(true, closeReason.value.trim())) closeReason.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <header>
      <h1 class="m-0 text-xl font-semibold text-haze-100">Costi e limiti</h1>
      <p class="m-0 mt-1 text-sm text-haze-400">
        Una stima del mese dagli aggregati e dai listini: anticipa la fattura, non la sostituisce.
      </p>
    </header>

    <div v-if="isLoadingOverview" class="text-sm text-haze-400">Carico…</div>

    <template v-else-if="overview && costs">
      <!-- ── Il mese ─────────────────────────────────────────────────────────── -->
      <section class="flex flex-col gap-3" data-testid="costs-month">
        <div
          v-if="alertCopy"
          class="rounded-well border p-4 text-sm"
          :class="{
            'border-crit-400/40 bg-crit-400/10 text-haze-100': alertCopy.tone === 'crit',
            'border-warn-400/30 bg-warn-400/10 text-haze-100': alertCopy.tone === 'warn',
            'border-white/10 bg-white/[0.03] text-haze-300': alertCopy.tone === 'ok',
          }"
          data-testid="cost-alert"
        >
          {{ alertCopy.text }}
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div class="rounded-well border border-brand-500/30 bg-brand-500/10 p-4">
            <p class="m-0 text-xs text-haze-500">Costi stimati del mese</p>
            <p class="m-0 mt-1 text-2xl font-semibold text-haze-100">{{ usd(costs.totalUsd) }}</p>
            <p class="m-0 mt-1 text-xs text-haze-500">mese al {{ Math.round(costs.monthProgress * 100) }}%, volumi proiettati a fine mese</p>
          </div>
          <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
            <p class="m-0 text-xs text-haze-500">Ricavi stimati del mese</p>
            <p class="m-0 mt-1 text-2xl font-semibold text-haze-100">{{ eur(costs.revenue.revenueEur) }}</p>
            <p class="m-0 mt-1 text-xs text-haze-500">
              {{ overview.monthlyPayers ?? 0 }} mensili · {{ overview.yearlyPayers ?? 0 }} annuali · commissioni Stripe {{ eur(costs.revenue.stripeFeesEur) }}
            </p>
          </div>
          <div class="rounded-well border border-white/10 bg-white/[0.03] p-4">
            <p class="m-0 text-xs text-haze-500">Margine stimato</p>
            <p class="m-0 mt-1 text-2xl font-semibold" :class="costs.revenue.marginEur < 0 ? 'text-crit-400' : 'text-verified-400'">
              {{ eur(costs.revenue.marginEur) }}
            </p>
            <p class="m-0 mt-1 text-xs text-haze-500">ricavi − commissioni − costi</p>
          </div>
        </div>

        <table class="w-full border-collapse text-sm">
          <tbody>
            <tr v-for="line in costs.lines" :key="line.key" class="border-b border-white/5">
              <td class="py-2 pr-4 text-haze-200">{{ line.label }}</td>
              <td class="py-2 pr-4 font-mono text-haze-100">{{ usd(line.usd) }}</td>
              <td class="py-2 text-xs text-haze-500">{{ line.note }}</td>
            </tr>
          </tbody>
        </table>
        <p class="m-0 text-xs text-haze-500">Listini verificati il {{ costs.pricesCheckedOn }}. Le fatture vere: Cloudflare, AWS, Fly, Stripe.</p>

        <div v-if="costSeries && costSeries.available" class="flex flex-col gap-1">
          <h3 class="m-0 text-xs font-semibold text-haze-300">Stima nel tempo</h3>
          <ul class="m-0 flex flex-col gap-1 p-0 font-mono text-xs text-haze-400">
            <li v-for="p in costSeries.points" :key="p.day" class="flex justify-between">
              <span>{{ p.day }}</span><span>{{ p.value !== null ? usd(p.value) : '—' }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Lo spazio ───────────────────────────────────────────────────────── -->
      <section v-if="storage" class="flex flex-col gap-3">
        <h2 class="m-0 text-sm font-semibold text-haze-200">Dove sta lo spazio su R2</h2>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div v-for="part in storage" :key="part.key" class="rounded-well border border-white/10 bg-white/[0.03] p-4">
            <p class="m-0 text-xs text-haze-500">{{ part.label }}</p>
            <p class="m-0 mt-1 text-xl font-semibold text-haze-100">{{ bytes(part.bytes) }} <span class="text-sm font-normal text-haze-500">{{ part.share }}%</span></p>
            <p class="m-0 mt-1 text-xs text-haze-500">{{ part.hint }}</p>
          </div>
        </div>
        <div v-if="overview.freeExpiring.length" class="flex flex-col gap-1">
          <h3 class="m-0 text-xs font-semibold text-haze-300">Spazio free che si libera da solo</h3>
          <ul class="m-0 flex flex-col gap-1 p-0 font-mono text-xs text-haze-400">
            <li v-for="d in overview.freeExpiring" :key="d.day" class="flex justify-between">
              <span>{{ d.day }}</span><span>{{ bytes(d.bytes) }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Chi occupa quanto ───────────────────────────────────────────────── -->
      <section v-if="overview.storageBands.length" class="flex flex-col gap-2">
        <h2 class="m-0 text-sm font-semibold text-haze-200">Spazio per utente</h2>
        <div class="flex flex-wrap gap-2">
          <span v-for="band in overview.storageBands" :key="band.label" class="rounded-field border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-haze-300">
            {{ band.label }} · {{ band.users }}
          </span>
        </div>
        <p class="m-0 text-xs" :class="overview.nearQuota ? 'text-warn-400' : 'text-haze-500'">
          {{ overview.nearQuota ?? 0 }} utenti oltre l'80% della quota del loro piano.
        </p>
      </section>

      <!-- ── Canale ospiti ───────────────────────────────────────────────────── -->
      <section v-if="guest" class="flex flex-col gap-3" data-testid="guest-channel">
        <h2 class="m-0 text-sm font-semibold text-haze-200">Invii senza account</h2>
        <p v-if="!guest.persistent" class="m-0 rounded-well border border-warn-400/30 bg-warn-400/10 p-3 text-xs text-haze-200">
          I contatori stanno in memoria (manca <code>GUEST_QUOTA_TABLE</code>): si azzerano a ogni deploy, quindi i tetti non sono veri.
        </p>
        <div v-if="guestUsage" class="flex flex-col gap-1.5">
          <div class="flex justify-between text-xs text-haze-400">
            <span>Oggi: {{ bytes(guestUsage.used) }} di {{ bytes(guestUsage.max) }}</span>
            <span>per IP: {{ bytes(guest.maxBytesPerIpPerDay) }} al giorno</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white/10">
            <div class="h-full rounded-full" :class="guestUsage.pct >= 80 ? 'bg-warn-400' : 'bg-brand-500'" :style="{ width: `${guestUsage.pct}%` }" />
          </div>
        </div>

        <div v-if="guest.channel?.closed" class="flex flex-wrap items-center justify-between gap-3 rounded-well border border-crit-400/40 bg-crit-400/10 p-4">
          <p class="m-0 text-sm text-haze-100">
            Chiuso<span v-if="guest.channel.at"> dal {{ new Date(guest.channel.at).toLocaleString('it-IT') }}</span>: {{ guest.channel.reason }}
          </p>
          <Button label="Riapri" size="small" :loading="isSwitching" @click="setGuestChannel(false)" />
        </div>
        <div v-else class="flex flex-wrap items-center gap-2">
          <InputText v-model="closeReason" placeholder="Motivo della chiusura (resta nel registro)" class="min-w-[280px] flex-1" />
          <Button label="Chiudi gli invii senza account" severity="danger" outlined size="small" :disabled="!closeReason.trim()" :loading="isSwitching" @click="closeChannel" />
        </div>
        <p class="m-0 text-xs text-haze-500">Chiudere ferma i nuovi invii; i link già creati restano scaricabili.</p>
      </section>

      <!-- ── Indici ──────────────────────────────────────────────────────────── -->
      <section class="flex flex-col gap-2" data-testid="index-fallbacks">
        <h2 class="m-0 text-sm font-semibold text-haze-200">Indici del database</h2>
        <p v-if="!overview.indexFallbacks.length" class="m-0 text-xs text-haze-500">
          Nessun ripiego su scan da quando il server è partito.
        </p>
        <div v-else class="rounded-well border border-crit-400/40 bg-crit-400/10 p-4 text-sm text-haze-100">
          <p class="m-0 mb-2">Questi indici non rispondono: ogni richiesta legge la tabella intera.</p>
          <ul class="m-0 flex flex-col gap-1 p-0 font-mono text-xs">
            <li v-for="f in overview.indexFallbacks" :key="`${f.index}@${f.table}`">
              {{ f.index }} su {{ f.table }} · {{ f.count }} volte · ultima {{ new Date(f.lastAt).toLocaleString('it-IT') }}
            </li>
          </ul>
        </div>
      </section>
    </template>

    <!-- ── Limiti ─────────────────────────────────────────────────────────────── -->
    <section v-if="limits.length" class="flex flex-col gap-4" data-testid="limits">
      <div>
        <h2 class="m-0 text-sm font-semibold text-haze-200">Limiti in vigore</h2>
        <p class="m-0 mt-1 text-xs text-haze-500">Sola lettura: si cambiano con la variabile d'ambiente indicata e un deploy.</p>
      </div>
      <div v-for="group in limits" :key="group.key" class="flex flex-col gap-1">
        <h3 class="m-0 text-xs font-semibold uppercase tracking-wide text-haze-400">{{ group.label }}</h3>
        <table class="w-full border-collapse text-sm">
          <tbody>
            <tr v-for="item in group.items" :key="item.key" class="border-b border-white/5 align-top">
              <td class="w-1/3 py-1.5 pr-4 text-haze-200">{{ item.label }}</td>
              <td class="w-1/6 py-1.5 pr-4 font-mono text-haze-100">{{ formatLimit(item, formatBytes) }}</td>
              <td class="py-1.5 text-xs text-haze-500">
                <code v-if="item.env" class="text-haze-400">{{ item.env }}</code>
                <span v-if="item.note" class="block">{{ item.note }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
