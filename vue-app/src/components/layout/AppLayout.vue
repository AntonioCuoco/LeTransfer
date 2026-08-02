<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import UploadQueueManager from '@/src/components/UploadQueueManager.vue'
import AppSecurityPrompt from '@/src/components/AppSecurityPrompt.vue'
import { useTokenManager } from '@/src/composables/useTokenManager'
import { redeemPendingClaim } from '@/src/composables/usePendingClaim'

useTokenManager()

// Un invio guest "reclamato" viene adottato qui, all'ingresso nell'area autenticata:
// è l'unico punto comune a tutti i percorsi di accesso (password, registrazione, Google).
onMounted(() => { void redeemPendingClaim() })
</script>

<template>
  <div class="flex min-h-screen bg-deep-900">
    <AppSidebar />
    <main class="ml-[72px] min-h-screen flex-1 overflow-x-hidden bg-deep-900 text-haze-100">
      <RouterView />
    </main>
    <UploadQueueManager />
    <AppSecurityPrompt />
  </div>
</template>
