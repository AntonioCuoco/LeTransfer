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

    <div v-if="error" class="rounded-field border border-crit-200 bg-crit-100 px-3 py-2.5 text-[0.82rem] font-medium text-crit-600">
      {{ error }}
    </div>

    <button type="submit" class="lt-btn" :disabled="!isFormValid || isLoading">
      {{ isLoading ? 'Un attimo…' : 'Apri il file' }}
    </button>
  </form>
</template>
