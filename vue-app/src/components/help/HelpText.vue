<script setup lang="ts">
import { computed } from 'vue'

/**
 * Il testo di un articolo di aiuto: `**grassetto**` e `codice`, nient'altro. Si compone a pezzi
 * (mai `v-html`): il contenuto è nostro, ma un renderer che non interpreta HTML non può
 * diventare un buco nemmeno per sbaglio.
 */
const props = defineProps<{ text: string }>()

const parts = computed(() =>
  props.text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
    .filter(Boolean)
    .map((chunk) => {
      if (chunk.startsWith('**') && chunk.endsWith('**')) return { kind: 'b' as const, text: chunk.slice(2, -2) }
      if (chunk.startsWith('`') && chunk.endsWith('`')) return { kind: 'code' as const, text: chunk.slice(1, -1) }
      return { kind: 't' as const, text: chunk }
    }),
)
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <strong v-if="part.kind === 'b'" class="font-semibold text-[#F2ECFF]">{{ part.text }}</strong>
    <code v-else-if="part.kind === 'code'" class="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.86em] text-[#37e7c4]">{{ part.text }}</code>
    <template v-else>{{ part.text }}</template>
  </template>
</template>
