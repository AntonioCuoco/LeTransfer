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

    <SettingsSection title="Sicurezza" description="Gestisci la crittografia end-to-end con la recovery key e il 2FA" icon="pi pi-shield">
      <div class="py-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-white font-medium m-0">Recovery Key</h4>
            <p class="text-[#9ca3af] text-xs mt-1">
              {{ isSetupRequired ? 'Non configurata - necessaria per crittografia E2E' : 'Configurata - i tuoi file sono protetti' }}
            </p>
          </div>
          <Button
            :label="isSetupRequired ? 'Configura Ora' : 'Gestisci'"
            :severity="isSetupRequired ? 'danger' : 'secondary'"
            :outlined="!isSetupRequired"
            :disabled="!isSetupRequired"
            @click="securityModalVisible = true"
          />
        </div>
        <div v-if="isSetupRequired" class="mt-4 p-3 bg-[#cf1322]/10 border border-[#cf1322]/30 rounded-lg">
          <p class="text-[#cf1322] text-sm m-0">⚠️ La crittografia end-to-end non è configurata. I tuoi file non sono completamente protetti.</p>
        </div>
      </div>

      <div class="py-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-white font-medium m-0">2FA</h4>
            <p class="text-[#9ca3af] text-xs mt-1">Attiva la 2FA per usare il tuo telefono come ulteriore misura di sicurezza</p>
          </div>
          <Button label="Configura Ora" severity="secondary" outlined />
        </div>
      </div>

      <div class="py-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-white font-medium m-0">Elimina il tuo account</h4>
            <p class="text-[#9ca3af] text-xs mt-1">Elimina il tuo account definitivamente</p>
          </div>
          <Button label="Elimina Definitivamente" severity="danger" />
        </div>
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
