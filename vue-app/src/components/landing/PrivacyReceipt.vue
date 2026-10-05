<script setup lang="ts">
import { computed } from 'vue'

/**
 * Ricevuta di privacy — il differenziatore reso oggetto (roadmap F2).
 * Compare due volte nello stesso trasferimento: a chi invia quando il link è pronto,
 * a chi riceve dopo la decifratura. Stessa forma, verbo diverso: il cerchio si chiude.
 *
 * Tutto in mono: sono fatti tecnici, e in questo prodotto i fatti tecnici si scrivono in mono.
 */

type Tone = 'cipher' | 'verified' | 'plain'

interface Row {
  label: string
  value: string
  tone: Tone
}

const props = withDefaults(defineProps<{ variant?: 'send' | 'receive' }>(), { variant: 'send' })

const TONE_CLASS: Record<Tone, string> = {
  cipher: 'text-[#724cf9]',
  verified: 'font-bold text-[#12b89a]',
  plain: 'text-[#1b1140]',
}

const rows = computed<Row[]>(() =>
  props.variant === 'send'
    ? [
        { label: 'Il server ha visto', value: '████ ciphertext', tone: 'cipher' },
        { label: 'Non ha mai visto', value: 'file · chiave · nome', tone: 'verified' },
        { label: 'Cifrato', value: 'qui, sul tuo dispositivo', tone: 'plain' },
      ]
    : [
        { label: 'Il server ha mandato', value: '████ ciphertext', tone: 'cipher' },
        { label: 'La chiave', value: 'è arrivata dal link', tone: 'verified' },
        { label: 'Decifrato', value: 'qui, sul tuo dispositivo', tone: 'plain' },
      ],
)
</script>

<template>
  <div class="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 rounded-[11px] border border-[#e9e3f6] bg-[#f5f1fd] p-3 font-mono text-[0.72rem]">
    <template v-for="row in rows" :key="row.label">
      <span class="text-[#6a5f8c]">{{ row.label }}</span>
      <span class="text-right" :class="TONE_CLASS[row.tone]">{{ row.value }}</span>
    </template>
  </div>
</template>
