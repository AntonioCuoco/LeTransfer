<script setup lang="ts">
import { computed, ref } from 'vue'
import { fingerprintGroups } from '@/src/utils/fingerprint'

/**
 * L'impronta di una chiave, resa leggibile (roadmap F0.3).
 *
 * Mostra il digest SHA-256 **per intero**, in coppie esadecimali su griglia: è il
 * modo in cui lo mostrano gli strumenti crittografici veri, e serve a poterlo
 * confrontare a voce con l'altra persona. Troncarlo starebbe più comodo nel
 * layout, ma renderebbe il confronto meno solido — quindi non lo tronchiamo.
 */

const props = withDefaults(defineProps<{
  hex: string
  tone?: 'light' | 'dark'
  copyable?: boolean
}>(), { tone: 'light', copyable: true })

const groups = computed(() => fingerprintGroups(props.hex))
const copied = ref(false)

// La riga separata in gruppi di quattro dà il ritmo con cui si legge a voce.
const spoken = computed(() =>
  groups.value.reduce<string[]>((lines, group, index) => {
    if (index % 4 === 0) lines.push(group)
    else lines[lines.length - 1] += `:${group}`
    return lines
  }, []).join(' '),
)

async function copy() {
  try {
    await navigator.clipboard?.writeText(spoken.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1400)
  } catch {
    // clipboard non disponibile
  }
}
</script>

<template>
  <div>
    <div
      class="grid grid-cols-8 gap-x-1.5 gap-y-1 rounded-field p-3 font-mono text-[0.78rem] tabular-nums"
      :class="tone === 'dark' ? 'border border-white/10 bg-white/[0.04] text-haze-200' : 'border border-lilac-300 bg-lilac-100 text-ink-900'"
    >
      <span
        v-for="(group, index) in groups"
        :key="index"
        class="text-center"
        :class="index % 8 < 4
          ? (tone === 'dark' ? 'text-verified-400' : 'text-verified-600')
          : (tone === 'dark' ? 'text-haze-200' : 'text-ink-700')"
      >
        {{ group }}
      </span>
    </div>

    <button
      v-if="copyable"
      type="button"
      class="mt-1.5 font-mono text-[0.68rem] uppercase tracking-[0.12em] transition-colors"
      :class="tone === 'dark' ? 'text-haze-400 hover:text-haze-100' : 'text-ink-400 hover:text-ink-900'"
      @click="copy"
    >
      {{ copied ? 'copiata ✓' : 'copia impronta' }}
    </button>
  </div>
</template>
