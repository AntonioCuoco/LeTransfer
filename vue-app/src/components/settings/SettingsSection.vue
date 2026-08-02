<script setup lang="ts">
defineProps<{
  title: string
  icon: string
  description?: string
}>()
</script>

<template>
  <section class="overflow-hidden rounded-panel border border-white/10 bg-white/[0.03]">
    <div class="flex items-center gap-3 border-b border-white/10 px-6 py-4">
      <div class="grid h-8 w-8 place-items-center rounded-chip bg-brand-500/15">
        <i :class="icon" class="text-brand-400" />
      </div>
      <div>
        <h3 class="m-0 font-semibold text-haze-100">{{ title }}</h3>
        <p v-if="description" class="m-0 text-xs text-haze-400">{{ description }}</p>
      </div>
    </div>
    <div class="p-6">
      <slot />
    </div>
  </section>
</template>
