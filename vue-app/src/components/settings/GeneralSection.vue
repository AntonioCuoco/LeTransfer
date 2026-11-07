<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { notify } from '@/src/utils/notify'
import { withDetail } from '@/src/utils/errorDetail'
import SettingsSection from './SettingsSection.vue'
import SettingsInput from './SettingsInput.vue'
import SettingsSelect from './SettingsSelect.vue'
import DeleteAccountDialog from './DeleteAccountDialog.vue'
import ExportDataPanel from './ExportDataPanel.vue'
import { useSettings } from '@/src/composables/useSettings'
import { rememberedUntil, forgetMasterKey } from '@/src/crypto/rememberedDevice'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { accountSecurityUrl } from '@/src/utils/novrenId'

const { settings, updateAppearance, updateProfile } = useSettings()

const deleteModalVisible = ref(false)
// Password, secondo fattore, passkey, 24 parole e dispositivi: tutto in Novren ID.
const novrenIdSecurity = accountSecurityUrl()

// «Ricorda su questo dispositivo»: fino a quando, per poterlo revocare da qui.
const deviceRememberedUntil = ref<number | null>(null)
const deviceRememberedUntilLabel = computed(() =>
  deviceRememberedUntil.value
    ? new Date(deviceRememberedUntil.value).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : '',
)

async function refreshRememberedDevice() {
  try {
    deviceRememberedUntil.value = await rememberedUntil({ sub: getCurrentUser()?.sub })
  } catch {
    deviceRememberedUntil.value = null
  }
}

async function forgetThisDevice() {
  try {
    await forgetMasterKey({ sub: getCurrentUser()?.sub })
    deviceRememberedUntil.value = null
    notify.success('Alla prossima sessione i file si sbloccheranno passando da Novren ID.', 'Dispositivo dimenticato')
  } catch (err) {
    notify.error(withDetail('Non siamo riusciti a dimenticare questo dispositivo.', err), 'Operazione non riuscita')
  }
}

onMounted(() => {
  void refreshRememberedDevice()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <SettingsSection title="Profilo" description="Modifica i dati riguardanti il tuo profilo" icon="pi pi-user">
      <SettingsInput label="Nome" description="Il tuo nome" :model-value="settings.profile.name" @update:model-value="(v) => updateProfile({ name: v })" />
      <SettingsInput label="Cognome" description="Il tuo cognome" :model-value="settings.profile.surname" @update:model-value="(v) => updateProfile({ surname: v })" />
      <SettingsInput label="Email" description="La tua email" :model-value="settings.profile.email" disabled @update:model-value="(v) => updateProfile({ email: v })" />
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

    <SettingsSection title="Sicurezza" description="Account Novren ID e chiavi su questo dispositivo" icon="pi pi-shield">
      <div class="flex flex-wrap items-center justify-between gap-4 py-4">
        <div class="min-w-0">
          <h4 class="m-0 font-medium text-haze-100">Il tuo account è Novren ID</h4>
          <p class="m-0 mt-1 max-w-[64ch] text-xs leading-relaxed text-haze-400">
            Lo stesso di NovrenPass e Novren Drive. Password, secondo fattore, passkey, le 24 parole di
            recupero, i dispositivi e le app collegate si gestiscono lì: Novren riceve solo la chiave dei tuoi file.
          </p>
        </div>
        <a :href="novrenIdSecurity" target="_blank" rel="noopener" class="p-button p-component p-button-outlined p-button-secondary p-button-sm no-underline">
          Apri Novren ID
        </a>
      </div>

      <div v-if="deviceRememberedUntil" class="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 py-4">
        <div class="min-w-0">
          <h4 class="m-0 font-medium text-haze-100">Questo dispositivo è ricordato</h4>
          <p class="m-0 mt-1 max-w-[64ch] text-xs leading-relaxed text-haze-400">
            I tuoi file si sbloccano senza passare da Novren ID fino al {{ deviceRememberedUntilLabel }}.
            Dimenticalo se questo computer non lo usi solo tu.
          </p>
        </div>
        <Button label="Dimentica" severity="secondary" outlined size="small" @click="forgetThisDevice" />
      </div>

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

    <DeleteAccountDialog v-model:visible="deleteModalVisible" />

  </div>
</template>
