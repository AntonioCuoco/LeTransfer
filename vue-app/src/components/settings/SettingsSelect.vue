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
    <Select
      :model-value="modelValue"
      :options="options"
      option-label="label"
      option-value="value"
      :disabled="disabled"
      fluid
      @update:model-value="$emit('update:modelValue', $event)"
    />
  </div>
</template>
