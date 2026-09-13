<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { notify } from '@/src/utils/notify'
import SettingsSection from './SettingsSection.vue'
import SettingsInput from './SettingsInput.vue'
import SettingsSelect from './SettingsSelect.vue'
import RecoveryKeySetup from '@/src/components/RecoveryKeySetup.vue'
import DeleteAccountDialog from './DeleteAccountDialog.vue'
import ExportDataPanel from './ExportDataPanel.vue'
import TwoFactorPanel from './TwoFactorPanel.vue'
import { useSettings } from '@/src/composables/useSettings'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import { rememberedUntil, forgetMasterKey } from '@/src/crypto/rememberedDevice'

const { settings, updateAppearance, updateProfile, updatePassword } = useSettings()
const { getRecoveryKeyStatus } = useRecoveryKeyAPI()
const route = useRoute()
const router = useRouter()

const securityModalVisible = ref(false)
const deleteModalVisible = ref(false)
const isSetupRequired = ref(true)

// `?chiave=crea` arriva dalla patina sugli uploader (UploadVaultGate): chi ci clicca vuole
// creare le 24 parole adesso, quindi la creazione si apre da sola.
const cameFromUploadGate = route.query.chiave === 'crea'

// «Ricorda su questo dispositivo»: fino a quando, per poterlo revocare da qui.
const deviceRememberedUntil = ref<number | null>(null)
const deviceRememberedUntilLabel = computed(() =>
  deviceRememberedUntil.value
    ? new Date(deviceRememberedUntil.value).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : '',
)

async function refreshRememberedDevice() {
  try {
    deviceRememberedUntil.value = await rememberedUntil()
  } catch {
    deviceRememberedUntil.value = null
  }
}

async function forgetThisDevice() {
  try {
    await forgetMasterKey()
    deviceRememberedUntil.value = null
    notify.success('Alla prossima sessione ti chiederemo di nuovo le 24 parole.', 'Dispositivo dimenticato')
  } catch {
    notify.error('Non siamo riusciti a dimenticare questo dispositivo. Riprova.', 'Operazione non riuscita')
  }
}

onMounted(async () => {
  void refreshRememberedDevice()
  const status = await getRecoveryKeyStatus()
  isSetupRequired.value = !status?.hasRecoveryKey
  if (cameFromUploadGate && isSetupRequired.value) securityModalVisible.value = true
})

const onRecoveryComplete = () => {
  securityModalVisible.value = false
  isSetupRequired.value = false
  void refreshRememberedDevice()
  if (cameFromUploadGate) {
    // Era venuto per caricare: lo si riporta lì, con il vault già sbloccato.
    notify.success('Chiave di recupero creata: ora puoi caricare i tuoi file.', 'Tutto pronto')
    router.push('/app')
    return
  }
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

      <div v-if="deviceRememberedUntil" class="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-4">
        <div class="min-w-0">
          <h4 class="m-0 font-medium text-haze-100">Questo dispositivo è ricordato</h4>
          <p class="m-0 mt-1 max-w-[64ch] text-xs leading-relaxed text-haze-400">
            I tuoi file si sbloccano senza le 24 parole fino al {{ deviceRememberedUntilLabel }}.
            Dimenticalo se questo computer non lo usi solo tu.
          </p>
        </div>
        <Button label="Dimentica" severity="secondary" outlined size="small" @click="forgetThisDevice" />
      </div>

      <TwoFactorPanel :email="settings.profile.email" />

      <ExportDataPanel />

      <div class="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-4">
        <div>
          <h4 class="m-0 font-medium text-haze-100">Elimina l'account</h4>
          <p class="m-0 mt-1 text-xs text-haze-400">
            Cancellazione definitiva dell'account e dei file. Non è annullabile.
          </p>
        </div>
        <Button label="Elimina" severity="danger" outlined size="small" @click="deleteModalVisible = true" />
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

    <DeleteAccountDialog v-model:visible="deleteModalVisible" />
  </div>
</template>
