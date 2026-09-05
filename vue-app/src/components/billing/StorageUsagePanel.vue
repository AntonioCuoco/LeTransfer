<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { usePlan } from '@/src/composables/usePlan'
import { formatBytes } from '@/src/types/plan'

/**
 * Lo spazio usato e il volume del mese.
 *
 * **Perché esiste.** I tre limiti del piano si scoprivano tutti sbattendoci contro: carichi,
 * aspetti, e arriva un `413`. Per il cap sul singolo file c'era già un avviso preventivo;
 * per la quota e per il tetto mensile no. Qui i due numeri stanno scritti *prima*.
 *
 * ⚠️ **Dove serve di più: le richieste file.** Chi apre una richiesta consuma la *propria*
 * quota con i file che gli arrivano. Un utente pieno smette di poter ricevere, e i suoi
 * clienti vedono fallire i caricamenti — lui lo scoprirebbe da una telefonata. Per questo
 * l'avviso di "quasi pieno" nomina esplicitamente quel caso.
 *
 * ⚠️ **`tracked: false` significa "non lo sappiamo", non "zero".** Se il conteggio non è
 * leggibile si dice che non è disponibile, invece di disegnare una barra vuota — che
 * direbbe «hai tutto libero» proprio quando potrebbe essere il contrario.
 */

const {
  limits,
  usage,
  isLoading,
  storedRemaining,
  storedPercent,
  monthlyPercent,
  monthlyRemaining,
  load,
} = usePlan()

onMounted(() => { void load() })

/** Sopra questa soglia si passa dal tono neutro all'avviso. */
const WARN_AT = 80

const storedWarning = computed(() => (storedPercent.value ?? 0) >= WARN_AT)
const monthlyWarning = computed(() => (monthlyPercent.value ?? 0) >= WARN_AT)

const resetLabel = computed(() => {
  const iso = usage.value?.monthlyResetsAt
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
})

const barClass = (warn: boolean) => (warn ? 'bg-warn-400' : 'bg-brand-500')
</script>

<template>
  <section class="rounded-well border border-white/10 bg-white/[0.03] p-5">
    <h3 class="m-0 text-base font-semibold text-haze-100">Spazio e volume</h3>

    <p v-if="isLoading" class="m-0 mt-3 text-sm text-haze-400">Carico…</p>

    <!-- Il conteggio non è disponibile: dirlo, non disegnare una barra vuota. -->
    <p v-else-if="!usage?.tracked" class="m-0 mt-3 max-w-[64ch] text-sm leading-relaxed text-haze-400">
      Il conteggio dello spazio non è disponibile in questo momento. I limiti del piano
      restano attivi: è la misura che manca, non il controllo.
    </p>

    <div v-else class="mt-4 flex flex-col gap-5">
      <!-- Spazio archiviato -->
      <div>
        <div class="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-sm text-haze-300">Spazio archiviato</span>
          <span class="font-mono text-[0.78rem] text-haze-400">
            {{ formatBytes(usage.storedBytes) }} di {{ formatBytes(limits.maxStoredBytes) }}
          </span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full transition-[width]"
            :class="barClass(storedWarning)"
            :style="{ width: `${storedPercent}%` }"
          />
        </div>
        <p v-if="storedWarning" class="m-0 mt-2 max-w-[64ch] text-xs leading-relaxed text-warn-400">
          Ti restano {{ formatBytes(storedRemaining ?? 0) }}. Quando lo spazio finisce non
          puoi più caricare — e <strong>nemmeno ricevere file dalle tue richieste</strong>:
          chi carica vedrebbe fallire l'invio. Libera spazio eliminando qualche file.
        </p>
      </div>

      <!-- Volume del mese -->
      <div>
        <div class="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-sm text-haze-300">Volume di questo mese</span>
          <span class="font-mono text-[0.78rem] text-haze-400">
            {{ formatBytes(usage.monthlyBytes) }} di {{ formatBytes(limits.maxMonthlyBytes) }}
          </span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full transition-[width]"
            :class="barClass(monthlyWarning)"
            :style="{ width: `${monthlyPercent}%` }"
          />
        </div>
        <p class="m-0 mt-2 text-xs leading-relaxed" :class="monthlyWarning ? 'text-warn-400' : 'text-haze-400'">
          <template v-if="monthlyWarning">
            Ti restano {{ formatBytes(monthlyRemaining ?? 0) }} per questo mese.
          </template>
          <template v-if="resetLabel">Il conteggio riparte il {{ resetLabel }}.</template>
        </p>
      </div>
    </div>
  </section>
</template>
