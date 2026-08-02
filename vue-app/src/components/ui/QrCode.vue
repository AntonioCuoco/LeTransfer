<script setup lang="ts">
import { computed } from 'vue'
import { encodeQr, qrToPath } from '@/src/utils/qr'

/**
 * Il link come codice QR (roadmap F1.3) — un `<path>` SVG solo, generato in locale
 * da [utils/qr.ts](../../utils/qr.ts): niente servizio esterno, che per un link
 * contenente la chiave sarebbe l'esatto contrario di quello che promettiamo.
 *
 * SVG e non canvas: resta nitido a qualsiasi zoom e sopravvive allo screenshot,
 * che è poi il modo in cui questi codici vengono davvero condivisi.
 */

const props = withDefaults(
  defineProps<{
    /** Il testo da codificare (qui: l'URL completo, chiave nel fragment compresa). */
    value: string
    /** Lato del disegno in px. */
    size?: number
    dark?: string
    light?: string
    label?: string
  }>(),
  {
    size: 164,
    dark: '#1b1140',
    light: '#ffffff',
    label: 'Codice QR del link',
  },
)

// Il margine chiaro di 4 moduli è parte della specifica, non estetica: senza,
// molti lettori non trovano i mirini e il codice semplicemente non si legge.
const QUIET_ZONE = 4

const matrix = computed(() => {
  try {
    return encodeQr(props.value)
  } catch {
    // Un link troppo lungo per un QR non deve far cadere la pagina: chi invia ha
    // comunque il link testuale, che è la via principale.
    return null
  }
})

const extent = computed(() => (matrix.value ? matrix.value.size + QUIET_ZONE * 2 : 0))
const path = computed(() => (matrix.value ? qrToPath(matrix.value) : ''))
</script>

<template>
  <svg
    v-if="matrix"
    :width="props.size"
    :height="props.size"
    :viewBox="`0 0 ${extent} ${extent}`"
    role="img"
    :aria-label="props.label"
    shape-rendering="crispEdges"
  >
    <rect :width="extent" :height="extent" :fill="props.light" />
    <g :transform="`translate(${QUIET_ZONE} ${QUIET_ZONE})`">
      <path :d="path" :fill="props.dark" />
    </g>
  </svg>
</template>
