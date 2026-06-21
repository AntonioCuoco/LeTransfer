<script setup lang="ts">
import { ref } from 'vue'
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons-vue'

const props = defineProps<{
  modelValue: string
  error?: string
  placeholder?: string
  showTooltip?: boolean
  class?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const showPassword = ref(false)
const isFocused = ref(false)
</script>

<template>
  <div :class="`w-full relative ${props.class ?? ''}`">
    <div
      v-if="showTooltip && isFocused"
      class="absolute bottom-full left-0 mb-2 w-80 bg-gray-800 text-white p-3 rounded-md shadow-lg z-10 border border-[#724CF9]"
    >
      <div class="text-sm font-medium mb-2">Criteri password:</div>
      <ul class="text-xs space-y-1">
        <li>• Almeno 8 caratteri</li>
        <li>• Almeno 1 numero</li>
        <li>• Almeno 1 lettera minuscola</li>
        <li>• Almeno 1 lettera maiuscola</li>
        <li>• Almeno 1 carattere speciale</li>
      </ul>
    </div>
    <input
      :type="showPassword ? 'text' : 'password'"
      :value="modelValue"
      :placeholder="placeholder ?? 'Password'"
      class="w-full p-2 pr-10 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />
    <button
      type="button"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
      @click="showPassword = !showPassword"
    >
      <EyeInvisibleOutlined v-if="showPassword" />
      <EyeOutlined v-else />
    </button>
    <p v-if="error" class="text-[#F4743B] mt-1 text-sm">{{ error }}</p>
  </div>
</template>
