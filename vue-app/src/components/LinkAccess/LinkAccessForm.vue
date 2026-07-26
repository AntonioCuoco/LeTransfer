<script setup lang="ts">
import { computed, ref } from 'vue'
import FieldInput from '@/src/components/ui/FieldInput.vue'

/**
 * Accesso al link pubblico. Volutamente NON è l'eroe della pagina: un campo,
 * una riga di spiegazione umana, un bottone. Stessa carta chiara del widget
 * d'invio — chi invia e chi riceve vedono lo stesso oggetto.
 */

const props = defineProps<{
  isPasswordProtected: boolean
  isLoading: boolean
  error?: string | null
}>()

const emit = defineEmits<{ submit: [visitorName: string, password?: string] }>()

const visitorName = ref('')
const password = ref('')

const isFormValid = computed(
  () => visitorName.value.trim().length >= 2 && (!props.isPasswordProtected || password.value.length > 0),
)

const handleSubmit = () => {
  if (!isFormValid.value || props.isLoading) return
  emit('submit', visitorName.value.trim(), props.isPasswordProtected ? password.value : undefined)
}
</script>

<template>
  <form class="flex flex-col gap-3.5" @submit.prevent="handleSubmit">
    <FieldInput
      v-model="visitorName"
      label="Chi sta scaricando?"
      placeholder="Il tuo nome"
      autocomplete="name"
      hint="Serve solo a far sapere a chi te l'ha mandato che l'hai ricevuto."
      :disabled="isLoading"
    />

    <FieldInput
      v-if="isPasswordProtected"
      v-model="password"
      label="Password del link"
      type="password"
      placeholder="Quella che ti hanno dato a voce"
      autocomplete="off"
      :disabled="isLoading"
    />

    <div v-if="error" class="rounded-[11px] border border-[#f3cfcc] bg-[#fdeceb] px-3 py-2.5 text-[0.82rem] font-medium text-[#b3352f]">
      {{ error }}
    </div>

    <button
      type="submit"
      class="w-full rounded-[13px] bg-[linear-gradient(140deg,#724cf9,#5a30eb)] p-3.5 text-base font-bold tracking-[-0.01em] text-white shadow-[0_14px_30px_-12px_rgba(90,48,235,0.85)] transition enabled:hover:-translate-y-px enabled:hover:brightness-105 disabled:opacity-50"
      :disabled="!isFormValid || isLoading"
    >
      {{ isLoading ? 'Un attimo…' : 'Apri il file' }}
    </button>
  </form>
</template>
