<script setup lang="ts">
import { ref } from 'vue'
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons-vue'

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
        <UserOutlined class="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
        <input
          v-model="visitorName"
          type="text"
          placeholder="Inserisci il tuo nome"
          :disabled="isLoading"
          minlength="2"
          required
          class="w-full p-3 pl-10 rounded-lg focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#1a1625] border border-[#4a4554] placeholder:text-[#676178] text-white disabled:opacity-50"
        />
      </div>
      <p class="text-[#676178] text-xs mt-1">Questo nome sarà visibile al proprietario del file</p>
    </div>

    <div v-if="isPasswordProtected">
      <label class="text-[#DBD4D3] font-medium text-sm mb-2 block">Password</label>
      <div class="relative">
        <LockOutlined class="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
        <input
          v-model="password"
          type="password"
          placeholder="Inserisci la password"
          :disabled="isLoading"
          required
          class="w-full p-3 pl-10 rounded-lg focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#1a1625] border border-[#4a4554] placeholder:text-[#676178] text-white disabled:opacity-50"
        />
      </div>
    </div>

    <div v-if="error" class="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
      <p class="text-red-400 text-sm m-0">{{ error }}</p>
    </div>

    <a-button
      type="primary"
      html-type="submit"
      :disabled="!isFormValid() || isLoading"
      :loading="isLoading"
      size="large"
      style="border-radius: 10px; height: 48px"
      class="w-full !bg-[#724CF9] hover:!bg-[#9d7bfa] !text-white !border-[#724CF9] disabled:!bg-[#4a4554] disabled:!border-[#4a4554]"
    >
      <template #icon><LoginOutlined v-if="!isLoading" /></template>
      {{ isLoading ? 'Accesso in corso...' : 'Accedi al file' }}
    </a-button>
  </form>
</template>
