<script setup lang="ts">
import SettingsSection from './SettingsSection.vue'
import SettingsToggle from './SettingsToggle.vue'
import { useSettings } from '@/src/composables/useSettings'
import { EMAIL_DELIVERY_LIVE } from '@/src/types/settings'

/**
 * Preferenze di notifica.
 *
 * L'avviso in fondo non è decorativo: dice all'utente **due fatti distinti**, e non
 * inventa nulla che il codice non sappia.
 *
 *  1. `EMAIL_DELIVERY_LIVE` — parte davvero un'email? Finché è `false`, nessuna.
 *  2. `preferencesAreAuthoritative` — queste preferenze le conosce il server, o vivono
 *     solo in questo browser? Diventa `true` quando `GET/PUT
 *     /api/user/notification-preferences` risponde.
 *
 * Il secondo arriva prima del primo (l'endpoint esisterà mentre l'invio è ancora spento),
 * quindi il messaggio ha tre stati e non due. Dire «arriveranno le email» quando il server
 * non sa nemmeno che le vuoi sarebbe una bugia comoda.
 */

const { settings, updateNotifications, preferencesAreAuthoritative } = useSettings()
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
        I nuovi download li trovi comunque segnati in dashboard, sulla tessera
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
      <div
        v-if="!EMAIL_DELIVERY_LIVE"
        class="mt-5 rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-4"
      >
        <p class="m-0 text-sm font-semibold text-haze-100">L’invio delle email non è ancora attivo</p>
        <p class="m-0 mt-1 max-w-[68ch] text-xs leading-relaxed text-haze-300">
          <template v-if="preferencesAreAuthoritative">
            Le tue preferenze sono salvate sul tuo account e verranno applicate appena
            accenderemo le notifiche. Finché quel momento non arriva, non riceverai email da
            noi — nemmeno se qui risultano attive.
          </template>
          <template v-else>
            Queste preferenze restano salvate in questo browser e verranno applicate quando
            accenderemo le notifiche. Finché quel momento non arriva, non riceverai email da
            noi — nemmeno se qui risultano attive.
          </template>
        </p>
      </div>

      <!--
        L'invio è acceso ma le preferenze non arrivano al server: caso raro e transitorio
        (endpoint caduto), ma se capita l'utente deve saperlo — altrimenti crede di aver
        disattivato qualcosa che continuerà ad arrivargli.
      -->
      <div
        v-else-if="!preferencesAreAuthoritative"
        class="mt-5 rounded-well border border-warn-400/25 bg-warn-400/[0.06] p-4"
      >
        <p class="m-0 text-sm font-semibold text-haze-100">Preferenze non sincronizzate</p>
        <p class="m-0 mt-1 max-w-[68ch] text-xs leading-relaxed text-haze-300">
          Non siamo riusciti a salvarle sul tuo account: restano valide solo in questo
          browser, e le email potrebbero non rispettarle. Riprova a salvare più tardi.
        </p>
      </div>
    </SettingsSection>
  </div>
</template>
