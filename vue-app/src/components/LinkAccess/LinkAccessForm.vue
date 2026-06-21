<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  isPasswordProtected: boolean
  isLoading: boolean
  error?: string | null
}>()

const emit = defineEmits<{ submit: [visitorName: string, password?: string] }>()

const visitorName = ref('')
const password = ref('')

const isFormValid = () => visitorName.value.trim().length >= 2

const handleSubmit = () => {
  if (!isFormValid()) return
  emit('submit', visitorName.value.trim(), props.isPasswordProtected ? password.value : undefined)
}
</script>

<template>
  <form class="space-y-6" @submit.prevent="handleSubmit">
    <div>
      <label class="text-[#DBD4D3] font-medium text-sm mb-2 block">Il tuo nome</label>
      <div class="relative">
        <i class="pi pi-user absolute left-3 top-1/2 -translate-y-1/2 text-primary z-10" />
        <InputText
          v-model="visitorName"
          type="text"
          placeholder="Inserisci il tuo nome"
          :disabled="isLoading"
          fluid
          class="!pl-10"
        />
      </div>
      <p class="text-[#676178] text-xs mt-1">Questo nome sarà visibile al proprietario del file</p>
    </div>

    <div v-if="isPasswordProtected">
      <label class="text-[#DBD4D3] font-medium text-sm mb-2 block">Password</label>
      <div class="relative">
        <i class="pi pi-lock absolute left-3 top-1/2 -translate-y-1/2 text-primary z-10" />
        <Password
          v-model="password"
          placeholder="Inserisci la password"
          :feedback="false"
          toggle-mask
          fluid
          input-class="!pl-10"
          :disabled="isLoading"
        />
      </div>
    </div>

    <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
      <p class="text-red-400 text-sm m-0">{{ error }}</p>
    </div>

    <Button
      type="submit"
      :label="isLoading ? 'Accesso in corso...' : 'Accedi al file'"
      :icon="isLoading ? undefined : 'pi pi-sign-in'"
      :disabled="!isFormValid() || isLoading"
      :loading="isLoading"
      size="large"
      class="w-full"
    />
  </form>
</template>
