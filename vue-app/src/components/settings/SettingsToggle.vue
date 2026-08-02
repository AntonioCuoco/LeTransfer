<script setup lang="ts">
defineProps<{
  label: string
  description?: string
  modelValue: boolean
  tooltip?: string
  disabled?: boolean
}>()

defineEmits<{ 'update:modelValue': [v: boolean] }>()
</script>

<template>
  <div class="flex items-center justify-between py-2">
    <div class="flex-1">
      <div class="flex items-center gap-1.5">
        <span class="text-sm font-medium text-haze-100">{{ label }}</span>
        <span v-if="tooltip" v-tooltip.top="tooltip" class="cursor-help font-mono text-xs text-haze-400">(?)</span>
      </div>
      <p v-if="description" class="m-0 mt-0.5 text-xs text-haze-400">{{ description }}</p>
    </div>
    <ToggleSwitch :model-value="modelValue" :disabled="disabled" @update:model-value="$emit('update:modelValue', $event)" />
  </div>
</template>
