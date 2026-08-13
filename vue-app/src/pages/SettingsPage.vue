<script setup lang="ts">
import { useConfirm } from 'primevue/useconfirm'
import { useSettings } from '@/src/composables/useSettings'
import { notify } from '@/src/utils/notify'
import GeneralSection from '@/src/components/settings/GeneralSection.vue'
import NotificationSection from '@/src/components/settings/NotificationSection.vue'
import SubscriptionSection from '@/src/components/settings/SubscriptionSection.vue'
import IntegrationSettings from '@/src/components/settings/IntegrationSettings.vue'
import MyKeyFingerprint from '@/src/components/settings/MyKeyFingerprint.vue'

const confirm = useConfirm()
const { isLoading, isSaving, saveSettings, resetSettings, hasUnsavedChanges } = useSettings()

const handleSave = async () => {
  try { await saveSettings() } catch { /* handled in composable */ }
}

const handleReset = () => {
  confirm.require({
    header: 'Ripristinare le impostazioni?',
    message: 'Tutte le impostazioni verranno riportate ai valori predefiniti.',
    icon: 'pi pi-exclamation-circle',
    acceptProps: { label: 'Ripristina', severity: 'danger' },
    rejectProps: { label: 'Annulla', severity: 'secondary', outlined: true },
    accept: () => {
      resetSettings()
      notify.info('Impostazioni ripristinate ai valori predefiniti')
    },
  })
}
</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center h-full">
    <ProgressSpinner />
  </div>
  <div v-else class="lt-page">
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="m-0 text-3xl font-bold text-white flex items-center gap-3">
          <i class="pi pi-cog text-primary text-2xl" />
          Impostazioni
        </h1>
        <p class="mt-1 mb-0 text-base text-haze-400">Personalizza la tua esperienza Novren</p>
      </div>
      <div class="flex items-center gap-3">
        <Button icon="pi pi-undo" label="Ripristina" severity="secondary" outlined :disabled="isSaving" @click="handleReset" />
        <Button icon="pi pi-save" label="Salva Modifiche" :loading="isSaving" :disabled="!hasUnsavedChanges" @click="handleSave" />
      </div>
    </header>

    <div v-if="hasUnsavedChanges" class="mb-4 px-4 py-2 bg-brand-500/10 border border-brand-500/30 rounded-lg">
      <p class="text-brand-400 text-sm m-0">⚠️ Hai modifiche non salvate</p>
    </div>

    <Tabs value="1">
      <!-- C'era una quarta tab "Organizzazione" che renderizzava lo stesso componente
           di "Integrazioni": due etichette diverse, contenuto identico. Rimossa finché
           non esiste una schermata sua. -->
      <TabList>
        <Tab value="1">Generali &amp; Sicurezza</Tab>
        <Tab value="2">Notifiche</Tab>
        <Tab value="3">Abbonamento</Tab>
        <Tab value="4">Integrazioni</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="1">
          <GeneralSection />
          <div class="mt-6"><MyKeyFingerprint /></div>
        </TabPanel>
        <TabPanel value="2"><NotificationSection /></TabPanel>
        <TabPanel value="3"><SubscriptionSection /></TabPanel>
        <TabPanel value="4"><IntegrationSettings /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
