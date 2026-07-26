<script setup lang="ts">
import { useId } from 'vue'

/**
 * Marchio-firma di LeTransfer: un rombo (sigillo) con sfumatura viola→menta.
 * - variant 'plain' → solo il rombo
 * - variant 'mark'  → rombo + buco della serratura (wordmark)
 * - variant 'check' → rombo + spunta (stato "cifrato/verificato")
 */
const props = withDefaults(defineProps<{
  size?: number
  variant?: 'plain' | 'mark' | 'check'
  checkColor?: string
}>(), {
  size: 30,
  variant: 'plain',
  checkColor: '#1f0d49',
})

// id unico per il gradiente: evita collisioni quando ci sono più sigilli nella pagina.
const gradientId = `brand-seal-${useId()}`
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 40 40"
    aria-hidden="true"
    class="block"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b6bff" />
        <stop offset="1" stop-color="#37e7c4" />
      </linearGradient>
    </defs>

    <path d="M20 1.5 38.5 20 20 38.5 1.5 20Z" :fill="`url(#${gradientId})`" />

    <template v-if="props.variant === 'mark'">
      <path d="M20 6 34 20 20 34 6 20Z" fill="none" stroke="rgba(11,4,28,.35)" stroke-width="1" />
      <circle cx="20" cy="18.5" r="3.4" fill="#1f0d49" />
      <path d="M18.7 20.5h2.6l.9 6h-4.4z" fill="#1f0d49" />
    </template>

    <path
      v-else-if="props.variant === 'check'"
      d="M13.5 20.5 18.5 25.5 27 15"
      fill="none"
      :stroke="props.checkColor"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
