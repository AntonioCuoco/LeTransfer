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
        <a-tooltip v-if="tooltip" :title="tooltip">
          <span class="text-[#9ca3af] cursor-help text-xs">(?)</span>
        </a-tooltip>
      </div>
      <p v-if="description" class="text-xs text-[#9ca3af] mt-0.5">{{ description }}</p>
    </div>
    <a-switch :checked="modelValue" :disabled="disabled" @change="(v: boolean) => $emit('update:modelValue', v)" />
  </div>
</template>
