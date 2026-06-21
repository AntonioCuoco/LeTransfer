<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import UploadQueueManager from '@/src/components/UploadQueueManager.vue'
import AppSecurityPrompt from '@/src/components/AppSecurityPrompt.vue'
import { useTokenManager } from '@/src/composables/useTokenManager'

useTokenManager()
</script>

<template>
  <div class="flex min-h-screen bg-[#2c2638]">
    <AppSidebar />
    <main class="flex-1 ml-[72px] min-h-screen bg-[#2c2638] overflow-x-hidden">
      <RouterView />
    </main>
    <UploadQueueManager />
    <AppSecurityPrompt />
  </div>
</template>
