<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: string
  error?: string
  placeholder?: string
  showTooltip?: boolean
  class?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const isFocused = ref(false)
</script>

<template>
  <div :class="`w-full relative ${props.class ?? ''}`">
    <div
      v-if="showTooltip && isFocused"
      class="absolute bottom-full left-0 mb-2 w-80 bg-surface-800 text-white p-3 rounded-md shadow-lg z-10 border border-primary"
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
    <!-- toggleMask gives the built-in show/hide eye; feedback off to keep our own criteria tooltip -->
    <Password
      :model-value="modelValue"
      :placeholder="placeholder ?? 'Password'"
      :feedback="false"
      toggle-mask
      fluid
      @update:model-value="emit('update:modelValue', $event)"
      @focus="isFocused = true"
      @blur="isFocused = false"
    />
    <p v-if="error" class="text-[#F4743B] mt-1 text-sm">{{ error }}</p>
  </div>
</template>
