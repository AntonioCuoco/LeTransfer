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
      <div class="flex items-center gap-1">
        <span class="text-sm font-medium text-white">{{ label }}</span>
        <span v-if="tooltip" v-tooltip.top="tooltip" class="text-[#9ca3af] cursor-help text-xs">(?)</span>
      </div>
      <p v-if="description" class="text-xs text-[#9ca3af] mt-0.5">{{ description }}</p>
    </div>
    <ToggleSwitch :model-value="modelValue" :disabled="disabled" @update:model-value="$emit('update:modelValue', $event)" />
  </div>
</template>
