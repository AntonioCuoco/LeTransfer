<script setup lang="ts">
import { useConfirm } from 'primevue/useconfirm'
import { useSettings } from '@/src/composables/useSettings'
import { notify } from '@/src/utils/notify'
import GeneralSection from '@/src/components/settings/GeneralSection.vue'
import NotificationSection from '@/src/components/settings/NotificationSection.vue'
import IntegrationSettings from '@/src/components/settings/IntegrationSettings.vue'

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
  <div v-else class="p-6 max-w-[900px] mx-auto">
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="m-0 text-3xl font-bold text-white flex items-center gap-3">
          <i class="pi pi-cog text-primary text-2xl" />
          Impostazioni
        </h1>
        <p class="mt-1 mb-0 text-base text-[#9ca3af]">Personalizza la tua esperienza LeTransfer</p>
      </div>
      <div class="flex items-center gap-3">
        <Button icon="pi pi-undo" label="Ripristina" severity="secondary" outlined :disabled="isSaving" @click="handleReset" />
        <Button icon="pi pi-save" label="Salva Modifiche" :loading="isSaving" :disabled="!hasUnsavedChanges" @click="handleSave" />
      </div>
    </header>

    <div v-if="hasUnsavedChanges" class="mb-4 px-4 py-2 bg-[#724CF9]/10 border border-[#724CF9]/30 rounded-lg">
      <p class="text-[#724CF9] text-sm m-0">⚠️ Hai modifiche non salvate</p>
    </div>

    <Tabs value="1">
      <TabList>
        <Tab value="1">Generali &amp; Sicurezza</Tab>
        <Tab value="2">Notifiche</Tab>
        <Tab value="3">Integrazioni</Tab>
        <Tab value="4">Organizzazione</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="1"><GeneralSection /></TabPanel>
        <TabPanel value="2"><NotificationSection /></TabPanel>
        <TabPanel value="3"><IntegrationSettings /></TabPanel>
        <TabPanel value="4"><IntegrationSettings /></TabPanel>
      </TabPanels>
    </Tabs>
  </div>
</template>
