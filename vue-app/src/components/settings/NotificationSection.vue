<script setup lang="ts">
import SettingsSection from './SettingsSection.vue'
import SettingsToggle from './SettingsToggle.vue'
import { useSettings } from '@/src/composables/useSettings'

/**
 * ⚠️ Queste preferenze oggi vivono **solo in questo browser** e nessun server le legge:
 * l'invio email non è ancora agganciato (BACKEND_HANDOFF voci 12 e 14). Sono raccolte
 * qui perché è dove l'utente le cerca, e perché quando il backend arriverà saranno già
 * espresse — ma l'avviso in fondo lo dice apertamente. Un interruttore che finge di
 * fare qualcosa è peggio di un interruttore assente: insegna a non fidarsi della UI.
 */

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
      <p class="m-0 -mt-1 pl-1 text-xs leading-relaxed text-haze-400">
        Nel frattempo i nuovi download li trovi comunque segnati in dashboard, sulla tessera
        «Download ricevuti».
      </p>
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

      <!-- Meglio dirlo che farlo scoprire aspettando un'email che non arriva. -->
      <div class="mt-5 rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-4">
        <p class="m-0 text-sm font-semibold text-haze-100">L’invio delle email non è ancora attivo</p>
        <p class="m-0 mt-1 max-w-[68ch] text-xs leading-relaxed text-haze-300">
          Queste preferenze restano salvate in questo browser e verranno applicate quando accenderemo
          le notifiche. Finché quel momento non arriva, non riceverai email da noi — nemmeno se qui
          risultano attive.
        </p>
      </div>
    </SettingsSection>
  </div>
</template>
