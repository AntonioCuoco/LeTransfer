<script setup lang="ts">
const props = defineProps<{
  value: string | number
  label: string
  trend?: 'up' | 'down' | 'neutral'
  change?: string
  icon?: string
  subtext?: string
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error'
  class?: string
}>()

const variantClasses: Record<string, string> = {
  default: 'bg-[#3c364c] border-[#4a4554]/50',
  primary: 'bg-gradient-to-br from-[#724CF9] to-purple-600 border-transparent',
  success: 'bg-[#3c364c] border-l-[3px] border-l-green-500 border-[#4a4554]/50',
  warning: 'bg-[#3c364c] border-l-[3px] border-l-amber-500 border-[#4a4554]/50',
  error: 'bg-[#3c364c] border-l-[3px] border-l-red-500 border-[#4a4554]/50',
}

const trendClasses: Record<string, string> = {
  up: 'bg-green-500/15 text-green-500',
  down: 'bg-red-500/15 text-red-500',
  neutral: 'bg-[#4a4554] text-[#9ca3af]',
}

const trendIcon: Record<string, string> = {
  up: 'pi pi-arrow-up',
  down: 'pi pi-arrow-down',
  neutral: 'pi pi-minus',
}
</script>

<template>
  <div
    :class="[
      'border rounded-2xl p-5 flex items-start gap-4 transition-all duration-200 hover:border-[#724CF9] hover:-translate-y-0.5 hover:shadow-[0_0_10px_rgba(114,76,249,0.4)]',
      variantClasses[variant || 'default'],
      props.class || '',
    ]"
  >
    <div
      v-if="icon"
      :class="['flex items-center justify-center w-12 h-12 rounded-[10px] text-2xl flex-shrink-0', variant === 'primary' ? 'bg-white/20 text-white' : 'bg-[#724CF9]/15 text-[#724CF9]']"
    >
      <i :class="icon" />
    </div>
    <div class="flex-1 min-w-0">
      <p :class="['m-0 mb-1 text-sm font-medium', variant === 'primary' ? 'text-white/80' : 'text-[#9ca3af]']">{{ label }}</p>
      <div class="flex items-baseline gap-3 flex-wrap">
        <span class="text-3xl font-bold leading-tight text-white">{{ value }}</span>
        <div
          v-if="trend || change"
          :class="['inline-flex items-center gap-1 py-1 px-2 rounded-full text-xs font-semibold', trendClasses[trend || 'neutral']]"
        >
          <i :class="trendIcon[trend || 'neutral']" class="text-[10px]" />
          <span v-if="change" class="whitespace-nowrap">{{ change }}</span>
        </div>
      </div>
      <p v-if="subtext" :class="['mt-2 mb-0 text-xs', variant === 'primary' ? 'text-white/70' : 'text-[#9ca3af]']">{{ subtext }}</p>
    </div>
  </div>
</template>
