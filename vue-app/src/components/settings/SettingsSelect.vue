<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  options: { value: string; label: string }[]
  description?: string
  disabled?: boolean
}>()

defineEmits<{ 'update:modelValue': [v: string] }>()
</script>

<template>
  <div class="space-y-1 py-2">
    <label class="block text-sm font-medium text-white">{{ label }}</label>
    <p v-if="description" class="text-xs text-[#9ca3af]">{{ description }}</p>
    <a-select :value="modelValue" :disabled="disabled" class="w-full" @change="(v: string) => $emit('update:modelValue', v)">
      <a-select-option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
    </a-select>
  </div>
</template>
