<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  placeholder?: string
  description?: string
  type?: string
  disabled?: boolean
}>()

defineEmits<{ 'update:modelValue': [v: string] }>()
</script>

<template>
  <div class="space-y-1 py-2">
    <label class="block text-sm font-medium text-haze-100">{{ label }}</label>
    <p v-if="description" class="m-0 text-xs text-haze-400">{{ description }}</p>
    <InputText
      :model-value="modelValue"
      :placeholder="placeholder"
      :type="type || 'text'"
      :disabled="disabled"
      fluid
      @update:model-value="$emit('update:modelValue', $event ?? '')"
    />
  </div>
</template>
