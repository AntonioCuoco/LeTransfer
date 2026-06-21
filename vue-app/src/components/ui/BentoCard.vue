<script setup lang="ts">
defineProps<{
  size?: '1x1' | '2x1' | '1x2' | '2x2' | 'full'
  title?: string
  subtitle?: string
  glass?: boolean
  glow?: boolean
  class?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  onClick?: () => void
  icon?: string
}>()

const sizeClasses: Record<string, string> = {
  '1x1': 'col-span-1 row-span-1',
  '2x1': 'col-span-2 row-span-1',
  '1x2': 'col-span-1 row-span-2',
  '2x2': 'col-span-2 row-span-2',
  'full': 'col-span-full',
}

const paddingClasses: Record<string, string> = {
  none: 'p-0', sm: 'p-3', md: 'p-5', lg: 'p-6',
}
</script>

<template>
  <div
    :class="[
      'bg-[#3c364c] border border-[#4a4554]/50 rounded-2xl transition-all duration-200 flex flex-col overflow-hidden',
      sizeClasses[size || '1x1'],
      paddingClasses[padding || 'md'],
      glass ? 'bg-[#2c2638]/60 backdrop-blur-xl' : '',
      glow !== false ? 'hover:border-[#724CF9] hover:shadow-[0_0_10px_rgba(114,76,249,0.4)] hover:-translate-y-0.5' : '',
      onClick ? 'cursor-pointer active:translate-y-0' : '',
      $props.class || '',
    ]"
    @click="onClick"
  >
    <div v-if="title || icon" class="flex items-start justify-between gap-3 mb-4">
      <div class="flex items-center gap-3">
        <span v-if="icon" class="flex items-center justify-center w-9 h-9 bg-[#724CF9]/15 rounded-[10px] text-[#724CF9] text-lg">
          <i :class="icon" />
        </span>
        <div class="flex flex-col gap-0.5">
          <h3 v-if="title" class="m-0 text-base font-semibold text-white leading-tight">{{ title }}</h3>
          <p v-if="subtitle" class="m-0 text-sm text-[#9ca3af] leading-tight">{{ subtitle }}</p>
        </div>
      </div>
      <slot name="action" />
    </div>
    <div class="flex-1 flex flex-col">
      <slot />
    </div>
  </div>
</template>
