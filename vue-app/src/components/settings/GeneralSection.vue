<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { notify } from '@/src/utils/notify'
import SettingsSection from './SettingsSection.vue'
import SettingsInput from './SettingsInput.vue'
import SettingsSelect from './SettingsSelect.vue'
import RecoveryKeySetup from '@/src/components/RecoveryKeySetup.vue'
import { useSettings } from '@/src/composables/useSettings'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'

const { settings, updateAppearance, updateProfile, updatePassword } = useSettings()
const { getRecoveryKeyStatus } = useRecoveryKeyAPI()

const securityModalVisible = ref(false)
const isSetupRequired = ref(true)

onMounted(async () => {
  const status = await getRecoveryKeyStatus()
  isSetupRequired.value = !status?.hasRecoveryKey
})

const onRecoveryComplete = () => {
  securityModalVisible.value = false
  isSetupRequired.value = false
  notify.success('Sicurezza configurata!')
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <SettingsSection title="Profilo" description="Modifica i dati riguardanti il tuo profilo" icon="pi pi-user">
      <SettingsInput label="Nome" description="Il tuo nome" :model-value="settings.profile.name" @update:model-value="(v) => updateProfile({ name: v })" />
      <SettingsInput label="Cognome" description="Il tuo cognome" :model-value="settings.profile.surname" @update:model-value="(v) => updateProfile({ surname: v })" />
      <SettingsInput label="Email" description="La tua email" :model-value="settings.profile.email" disabled @update:model-value="(v) => updateProfile({ email: v })" />
    </SettingsSection>

    <SettingsSection title="Password" description="Modifica la tua password" icon="pi pi-lock">
      <SettingsInput label="Password Attuale" :model-value="settings.password.actualPassword" type="password" @update:model-value="(v) => updatePassword({ actualPassword: v })" />
      <SettingsInput label="Password Nuova" :model-value="settings.password.newPassword" type="password" @update:model-value="(v) => updatePassword({ newPassword: v })" />
      <SettingsInput label="Conferma Password Nuova" :model-value="settings.password.newPasswordConfirm" type="password" @update:model-value="(v) => updatePassword({ newPasswordConfirm: v })" />
    </SettingsSection>

    <SettingsSection title="Aspetto" description="Personalizza l'interfaccia" icon="pi pi-palette">
      <SettingsSelect
        label="Cambia lingua"
        description="Cambia la lingua dell'applicazione"
        :model-value="settings.appearance.language"
        :options="[{ value: 'it', label: '🇮🇹 Italiano' }, { value: 'en', label: '🇬🇧 Inglese' }]"
        disabled
        @update:model-value="(v) => updateAppearance({ language: v as 'it' | 'en' })"
      />
    </SettingsSection>

    <SettingsSection title="Sicurezza" description="Chiave di recupero e accesso all'account" icon="pi pi-shield">
      <div class="flex flex-wrap items-center justify-between gap-4 py-4">
        <div class="min-w-0">
          <h4 class="m-0 font-medium text-haze-100">Chiave di recupero</h4>
          <p class="m-0 mt-1 max-w-[64ch] text-xs leading-relaxed text-haze-400">
            {{ isSetupRequired
              ? 'Non ancora creata: senza, se perdi questo dispositivo i tuoi file non li riapre più nessuno.'
              : 'Attiva. Sono le 24 parole con cui puoi riaprire i tuoi file da un altro dispositivo.' }}
          </p>
        </div>
        <Button
          v-if="isSetupRequired"
          label="Creala ora"
          @click="securityModalVisible = true"
        />
        <span v-else class="font-mono text-[0.74rem] text-verified-400">attiva ✓</span>
      </div>

      <div v-if="isSetupRequired" class="mb-2 rounded-field border border-warn-400/30 bg-warn-400/[0.07] p-3">
        <p class="m-0 text-sm leading-relaxed text-haze-200">
          Finché non la crei, la protezione end-to-end funziona solo su questo browser.
        </p>
      </div>

      <!-- Non implementate: segnate come tali, invece di offrire bottoni che non fanno nulla -->
      <div class="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-4">
        <div>
          <h4 class="m-0 font-medium text-haze-100">Verifica in due passaggi</h4>
          <p class="m-0 mt-1 text-xs text-haze-400">Un secondo fattore per l'accesso all'account.</p>
        </div>
        <span class="font-mono text-[0.74rem] text-haze-400">non ancora disponibile</span>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-4">
        <div>
          <h4 class="m-0 font-medium text-haze-100">Elimina l'account</h4>
          <p class="m-0 mt-1 text-xs text-haze-400">Cancellazione definitiva dell'account e dei file.</p>
        </div>
        <span class="font-mono text-[0.74rem] text-haze-400">non ancora disponibile</span>
      </div>
    </SettingsSection>

    <Dialog
      v-model:visible="securityModalVisible"
      modal
      :closable="false"
      :dismissable-mask="false"
      :style="{ width: '800px' }"
      :pt="{ header: '!hidden', content: '!p-8' }"
    >
      <RecoveryKeySetup @complete="onRecoveryComplete" @cancel="securityModalVisible = false" />
    </Dialog>
  </div>
</template>
