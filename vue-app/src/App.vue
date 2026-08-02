<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/src/stores/theme'

// Initializes the store: its watcher (immediate) sets the `dark` class on
// <html>, which drives both Tailwind's dark: variant and PrimeVue's dark mode.
useThemeStore()
</script>

<template>
  <div class="w-[100dvw] h-[100dvh] bg-deep-900">
    <RouterView />
  </div>
  <!-- Global PrimeVue overlays -->
  <Toast position="top-right" />
  <!-- Centered modal confirms (replaces ant Modal.confirm) -->
  <ConfirmDialog />
  <!-- Inline confirms anchored to a trigger (replaces ant a-popconfirm) -->
  <ConfirmPopup group="popup" />
</template>
