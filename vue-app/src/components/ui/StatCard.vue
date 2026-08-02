<script setup lang="ts">
/**
 * Tessera di un numero (roadmap F5).
 *
 * ⚠️ Le prop `trend` e `change` sono state RIMOSSE di proposito. Servivano a mostrare
 * una variazione percentuale, ma non esiste nessuna serie storica da cui calcolarla:
 * la dashboard finiva per esibire un "+12%" scritto a mano nel template. Un numero
 * inventato, su un prodotto che vende verificabilità, è il difetto peggiore possibile —
 * quindi è sparita l'affordance, non solo il valore. Quando ci sarà uno storico vero,
 * si rimette con i dati veri.
 */

withDefaults(defineProps<{
  value: string | number
  label: string
  hint?: string
  icon?: string
  tone?: 'default' | 'brand' | 'verified' | 'warn'
}>(), { tone: 'default' })

const TONE: Record<string, { icon: string; value: string }> = {
  default: { icon: 'bg-white/[0.06] text-haze-300', value: 'text-haze-100' },
  brand: { icon: 'bg-brand-500/15 text-brand-400', value: 'text-haze-100' },
  verified: { icon: 'bg-verified-400/15 text-verified-400', value: 'text-verified-400' },
  warn: { icon: 'bg-warn-400/15 text-warn-400', value: 'text-warn-400' },
}
</script>

<template>
  <div class="flex items-start gap-4 rounded-panel border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20">
    <div v-if="icon" class="grid h-11 w-11 flex-none place-items-center rounded-chip text-xl" :class="TONE[tone].icon">
      <i :class="icon" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="lt-label m-0 mb-1.5 !text-haze-400">{{ label }}</p>
      <p class="m-0 text-[1.9rem] font-bold leading-none tracking-[-0.03em]" :class="TONE[tone].value">{{ value }}</p>
      <p v-if="hint" class="m-0 mt-2 font-mono text-[0.72rem] text-haze-400">{{ hint }}</p>
    </div>
  </div>
</template>
