<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePlan } from '@/src/composables/usePlan'
import { useBilling, type BillingInterval } from '@/src/composables/useBilling'
import BillingIntervalChoice from './BillingIntervalChoice.vue'
import {
  PLAN_CATALOG,
  formatBytes,
  smallestPlanFor,
  nextPlanAfter,
} from '@/src/types/plan'

/**
 * Il momento in cui l'utente incontra un limite (roadmap E3/F3).
 *
 * Regola di tono: qui non si vende, si spiega. L'utente ha appena scoperto che non può
 * fare una cosa — il compito di questa finestra è dirgli **quanto** manca e **quale**
 * piano basterebbe, non elencare i vantaggi di Business. Per questo mostra un numero
 * concreto ("il tuo file pesa 3.4 GB, il tuo piano arriva a 2 GB") e propone il piano
 * *più piccolo* che lo accetterebbe, non il più caro.
 */

const props = defineProps<{
  visible: boolean
  /** Dimensione del file che ha superato il limite, se il caso è quello. */
  fileBytes?: number
  /** Testo alternativo quando il limite non è la dimensione (es. retention). */
  reason?: string
}>()

const emit = defineEmits<{ 'update:visible': [v: boolean] }>()

const router = useRouter()
const { plan, limits } = usePlan()
const { isStarting, availability, startCheckout } = useBilling()

// Il piano più piccolo che accetterebbe questo file; se non è la dimensione il problema,
// si propone semplicemente il gradino successivo.
const suggested = computed(() => {
  if (!props.fileBytes) return nextPlanAfter(plan.value)
  // `null` qui significa "nemmeno il piano più capiente basta" → il testo cambia di conseguenza.
  const fit = smallestPlanFor(props.fileBytes)
  return fit && fit !== plan.value ? fit : null
})

const billing = computed(() => availability())
const interval = ref<BillingInterval>('month')

function close() { emit('update:visible', false) }

function act() {
  const target = suggested.value
  close()
  if (!target || target === 'free' || !billing.value.ready) {
    router.push('/prezzi')
    return
  }
  void startCheckout(target, interval.value)
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :closable="true"
    :draggable="false"
    :style="{ width: '460px' }"
    header="Serve più spazio"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4">
      <!-- Il numero prima dell'offerta: è l'informazione che serve davvero. -->
      <div v-if="fileBytes" class="rounded-well border border-white/10 bg-white/[0.03] p-4 font-mono text-sm">
        <div class="flex items-baseline justify-between gap-4">
          <span class="text-haze-400">il tuo file</span>
          <span class="font-bold text-haze-100">{{ formatBytes(fileBytes) }}</span>
        </div>
        <div class="mt-1.5 flex items-baseline justify-between gap-4">
          <span class="text-haze-400">piano {{ PLAN_CATALOG[plan].name }}, al massimo</span>
          <span class="font-bold text-warn-400">{{ formatBytes(limits.maxFileBytes) }}</span>
        </div>
      </div>

      <p v-if="reason" class="m-0 text-sm leading-relaxed text-haze-200">{{ reason }}</p>

      <p v-if="suggested" class="m-0 text-sm leading-relaxed text-haze-300">
        Con <b class="text-haze-100">{{ PLAN_CATALOG[suggested].name }}</b> arrivi a
        <b class="text-haze-100">{{ formatBytes(PLAN_CATALOG[suggested].limits.maxFileBytes) }}</b> per file.
        La cifratura è la stessa: quello che cambia è la capienza.
      </p>
      <p v-else class="m-0 text-sm leading-relaxed text-haze-300">
        Questo file supera anche il piano più capiente. Per trasferimenti di queste dimensioni
        scrivici: si può fare, ma va impostato insieme.
      </p>

      <BillingIntervalChoice v-if="suggested && suggested !== 'free' && billing.ready" v-model="interval" :plan="suggested" />

      <p v-if="!billing.ready && billing.reason" class="m-0 text-xs leading-relaxed text-haze-400">
        {{ billing.reason }}
      </p>
    </div>

    <template #footer>
      <Button label="Ho capito" severity="secondary" text @click="close" />
      <Button
        :label="suggested && billing.ready ? `Passa a ${PLAN_CATALOG[suggested].name}` : 'Vedi i piani'"
        :loading="isStarting"
        @click="act"
      />
    </template>
  </Dialog>
</template>
