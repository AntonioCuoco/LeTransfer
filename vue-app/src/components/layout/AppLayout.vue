<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import UploadQueueManager from '@/src/components/UploadQueueManager.vue'
import AppSecurityPrompt from '@/src/components/AppSecurityPrompt.vue'
import UpgradeDialog from '@/src/components/billing/UpgradeDialog.vue'
import PlanDowngradeNotice from '@/src/components/billing/PlanDowngradeNotice.vue'
import PlanUpgradeDialog from '@/src/components/billing/PlanUpgradeDialog.vue'
import { useUpgradePrompt } from '@/src/composables/useUpgradePrompt'
import { useTokenManager } from '@/src/composables/useTokenManager'
import { redeemPendingClaim } from '@/src/composables/usePendingClaim'

useTokenManager()

const {
  isOpen: isUpgradeOpen,
  offendingBytes: upgradeBytes,
  reason: upgradeReason,
  close: closeUpgrade,
} = useUpgradePrompt()

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
    <!-- Montato qui una volta sola: chi incontra un limite sta in profondità e non ha
         un posto sensato dove aprire una finestra. Vedi useUpgradePrompt. -->
    <UpgradeDialog
      :visible="isUpgradeOpen"
      :file-bytes="upgradeBytes"
      :reason="upgradeReason"
      @update:visible="(v: boolean) => { if (!v) closeUpgrade() }"
    />
    <!-- Da Pro a Free: avviso e scelta dei file da tenere durante la grazia. Non mostra
         niente se non c'è un passaggio in corso. -->
    <PlanDowngradeNotice />
    <!-- Da Free a Pro: proposta di rendere permanenti i file caricati da Free. -->
    <PlanUpgradeDialog />
  </div>
</template>
