<script setup lang="ts">
import SettingsSection from './SettingsSection.vue'
import SettingsToggle from './SettingsToggle.vue'
import { useSettings } from '@/src/composables/useSettings'

const { settings, updateNotifications } = useSettings()
</script>

<template>
  <div class="flex flex-col gap-6">
    <SettingsSection title="Notifiche" description="Gestisci le tue preferenze di notifica" icon="pi pi-bell">
      <SettingsToggle
        label="Notifiche Email"
        description="Ricevi aggiornamenti via email"
        :model-value="settings.notifications.emailNotifications"
        @update:model-value="(v) => updateNotifications({ emailNotifications: v })"
      />
      <SettingsToggle
        label="Upload Completato"
        description="Notifica quando un upload è completato"
        :model-value="settings.notifications.uploadComplete"
        :disabled="!settings.notifications.emailNotifications"
        @update:model-value="(v) => updateNotifications({ uploadComplete: v })"
      />
      <SettingsToggle
        label="Download Completato"
        description="Notifica quando i tuoi file vengono scaricati"
        :model-value="settings.notifications.downloadComplete"
        :disabled="!settings.notifications.emailNotifications"
        @update:model-value="(v) => updateNotifications({ downloadComplete: v })"
      />
      <SettingsToggle
        label="File Ricevuto"
        description="Notifica quando ricevi un file condiviso"
        :model-value="settings.notifications.shareReceived"
        :disabled="!settings.notifications.emailNotifications"
        @update:model-value="(v) => updateNotifications({ shareReceived: v })"
      />
      <SettingsToggle
        label="Link in Scadenza"
        description="Avviso quando un link sta per scadere"
        :model-value="settings.notifications.linkExpiring"
        :disabled="!settings.notifications.emailNotifications"
        @update:model-value="(v) => updateNotifications({ linkExpiring: v })"
      />
    </SettingsSection>
  </div>
</template>
