<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { LinkStatus } from '@/src/composables/usePublicLink'

defineProps<{ status: LinkStatus; message?: string }>()

const router = useRouter()

const errorConfig: Record<string, { icon: string; title: string; description: string }> = {
  not_found: { icon: 'pi pi-times-circle', title: 'Link non trovato', description: 'Il link che stai cercando non esiste o è stato eliminato.' },
  expired: { icon: 'pi pi-clock', title: 'Link scaduto', description: 'Questo link è scaduto e non è più accessibile. Contatta il proprietario per richiederne uno nuovo.' },
  revoked: { icon: 'pi pi-ban', title: 'Link revocato', description: 'Il proprietario ha revocato questo link. Non è più possibile accedere al file.' },
  download_limit: { icon: 'pi pi-exclamation-triangle', title: 'Limite raggiunto', description: 'Questo link ha raggiunto il numero massimo di download consentiti.' },
  error: { icon: 'pi pi-exclamation-triangle', title: 'Errore', description: 'Si è verificato un errore durante il caricamento. Riprova più tardi.' },
}
</script>

<template>
  <div class="min-h-screen bg-[#2c2638] flex items-center justify-center p-4">
    <div class="max-w-md w-full text-center">
      <div class="mb-6">
        <i
          :class="[
            (errorConfig[status] || errorConfig.error).icon,
            { 'text-red-400': status === 'not_found' || status === 'error', 'text-yellow-400': status === 'expired', 'text-orange-400': status === 'revoked', 'text-purple-400': status === 'download_limit' },
          ]"
          class="text-6xl"
        />
      </div>
      <h1 class="text-2xl font-bold text-white mb-3">{{ (errorConfig[status] || errorConfig.error).title }}</h1>
      <p class="text-[#9ca3af] mb-6">{{ message || (errorConfig[status] || errorConfig.error).description }}</p>
      <div class="bg-[#1a1625] border border-[#4a4554] rounded-xl p-4 mb-6">
        <p class="text-[#676178] text-sm m-0">Se ritieni che questo sia un errore, contatta la persona che ti ha inviato il link.</p>
      </div>
      <Button label="Torna alla home" icon="pi pi-home" size="large" @click="router.push('/')" />
    </div>
  </div>
</template>
