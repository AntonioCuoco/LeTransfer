<script setup lang="ts">
import { Modal, message } from 'ant-design-vue'
import { SettingOutlined, SaveOutlined, UndoOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import { useSettings } from '@/src/composables/useSettings'
import GeneralSection from '@/src/components/settings/GeneralSection.vue'
import NotificationSection from '@/src/components/settings/NotificationSection.vue'
import IntegrationSettings from '@/src/components/settings/IntegrationSettings.vue'
import { h } from 'vue'

const { isLoading, isSaving, saveSettings, resetSettings, hasUnsavedChanges } = useSettings()

const handleSave = async () => {
  try { await saveSettings() } catch { /* handled in composable */ }
}

const handleReset = () => {
  Modal.confirm({
    title: 'Ripristinare le impostazioni?',
    icon: h(ExclamationCircleOutlined),
    content: 'Tutte le impostazioni verranno riportate ai valori predefiniti.',
    okText: 'Ripristina',
    cancelText: 'Annulla',
    okButtonProps: { danger: true },
    onOk: () => {
      resetSettings()
      message.info('Impostazioni ripristinate ai valori predefiniti')
    },
  })
}

const tabItems = [
  { key: '1', label: 'Generali & Sicurezza' },
  { key: '2', label: 'Notifiche' },
  { key: '3', label: 'Integrazioni' },
  { key: '4', label: 'Organizzazione' },
]
</script>

<template>
  <div v-if="isLoading" class="flex items-center justify-center h-full">
    <a-spin size="large" />
  </div>
  <div v-else class="p-6 max-w-[900px] mx-auto">
    <header class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="m-0 text-3xl font-bold text-white flex items-center gap-3">
          <SettingOutlined class="!text-[#724CF9]" />
          Impostazioni
        </h1>
        <p class="mt-1 mb-0 text-base text-[#9ca3af]">Personalizza la tua esperienza LeTransfer</p>
      </div>
      <div class="flex items-center gap-3">
        <a-button :icon="h(UndoOutlined)" :disabled="isSaving" class="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!text-white hover:!border-[#724CF9]" @click="handleReset">Ripristina</a-button>
        <a-button type="primary" :icon="h(SaveOutlined)" :loading="isSaving" :disabled="!hasUnsavedChanges" class="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none !text-white" @click="handleSave">Salva Modifiche</a-button>
      </div>
    </header>

    <div v-if="hasUnsavedChanges" class="mb-4 px-4 py-2 bg-[#724CF9]/10 border border-[#724CF9]/30 rounded-lg">
      <p class="text-[#724CF9] text-sm m-0">⚠️ Hai modifiche non salvate</p>
    </div>

    <a-tabs default-active-key="1">
      <a-tab-pane key="1" tab="Generali &amp; Sicurezza">
        <GeneralSection />
      </a-tab-pane>
      <a-tab-pane key="2" tab="Notifiche">
        <NotificationSection />
      </a-tab-pane>
      <a-tab-pane key="3" tab="Integrazioni">
        <IntegrationSettings />
      </a-tab-pane>
      <a-tab-pane key="4" tab="Organizzazione">
        <IntegrationSettings />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>
