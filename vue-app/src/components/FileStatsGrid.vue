<script setup lang="ts">
import StatCard from '@/src/components/ui/StatCard.vue'

/**
 * Riepilogo numerico della pagina di gestione (roadmap F5).
 *
 * ⚠️ Prima riceveva un oggetto `FileStats` con sei chiavi fisse e ne mostrava sei
 * tessere — ma `downloaded`, `archived` e `deleted` non sono tracciati da nessuna
 * parte: erano zeri scritti nel codice, esposti all'utente come se fossero misure.
 * Ora il componente riceve **le tessere che il chiamante può davvero calcolare**:
 * se un dato non esiste, non c'è modo di disegnarlo per sbaglio.
 */

export interface StatTile {
  label: string
  value: string | number
  icon?: string
  tone?: 'default' | 'brand' | 'verified' | 'warn'
  hint?: string
}

defineProps<{ tiles: StatTile[] }>()
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <StatCard
      v-for="tile in tiles"
      :key="tile.label"
      :value="tile.value"
      :label="tile.label"
      :icon="tile.icon"
      :tone="tile.tone"
      :hint="tile.hint"
    />
  </div>
</template>
