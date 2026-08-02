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
    <label class="block text-sm font-medium text-haze-100">{{ label }}</label>
    <p v-if="description" class="m-0 text-xs text-haze-400">{{ description }}</p>
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
