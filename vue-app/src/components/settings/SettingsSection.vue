<script setup lang="ts">
defineProps<{
  title: string
  icon: string
  description?: string
}>()
</script>

<template>
  <div class="bg-[#3c364c] border border-[#4a4554]/30 rounded-xl overflow-hidden">
    <div class="flex items-center gap-3 px-6 py-4 border-b border-[#4a4554]/30">
      <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-[#724CF9]/20">
        <i :class="icon" class="text-primary" />
      </div>
      <div>
        <h3 class="font-semibold text-white">{{ title }}</h3>
        <p v-if="description" class="text-xs text-[#9ca3af]">{{ description }}</p>
      </div>
    </div>
    <div class="p-6">
      <slot />
    </div>
  </div>
</template>
