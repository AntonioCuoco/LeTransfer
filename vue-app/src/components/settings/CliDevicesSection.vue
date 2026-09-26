<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SettingsSection from '@/src/components/settings/SettingsSection.vue'
import { useCliAuthorization, type CliDevice } from '@/src/composables/useCliAuthorization'
import { notify } from '@/src/utils/notify'

/**
 * I computer su cui la CLI (`novren`) è collegata a questo account, e il modo di scollegarli.
 *
 * Un token della CLI vive 90 giorni su un disco che non è il browser: può essere quello di un
 * server, di un portatile venduto, di una macchina di lavoro lasciata. Poterlo revocare da qui,
 * senza accesso a quel computer, è la contropartita di non chiedere il login a ogni invio.
 *
 * Con la funzione spenta sul backend la sezione **non compare**: `listDevices` restituisce
 * `null` e qui non si disegna niente, invece di un elenco vuoto o di un errore.
 */

const { listDevices, revokeDevice } = useCliAuthorization()

const devices = ref<CliDevice[] | null>(null)
const loadError = ref<string | null>(null)
const revoking = ref<string | null>(null)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

async function load() {
  try {
    devices.value = await listDevices()
  } catch (error) {
    loadError.value = (error as Error).message
  }
}

async function revoke(device: CliDevice) {
  revoking.value = device.tokenId
  try {
    await revokeDevice(device.tokenId)
    devices.value = (devices.value ?? []).filter((d) => d.tokenId !== device.tokenId)
    notify.success(`«${device.deviceName}» è stato scollegato.`, 'Dispositivo scollegato')
  } catch (error) {
    notify.error((error as Error).message, 'Non scollegato')
  } finally {
    revoking.value = null
  }
}

onMounted(load)
</script>

<template>
  <SettingsSection
    v-if="devices !== null || loadError"
    title="Dispositivi collegati alla CLI"
    description="I computer da cui invii con il comando novren"
    icon="pi pi-desktop"
    data-testid="cli-devices"
  >
    <p v-if="loadError" class="m-0 text-sm text-crit-400" role="alert">{{ loadError }}</p>

    <p v-else-if="devices && devices.length === 0" class="m-0 text-sm text-haze-400">
      Nessun computer collegato. Da un terminale: <code class="font-mono">novren login</code>.
    </p>

    <ul v-else class="m-0 flex list-none flex-col gap-3 p-0">
      <li
        v-for="device in devices ?? []"
        :key="device.tokenId"
        class="flex items-center justify-between gap-4 rounded-well border border-white/10 px-4 py-3"
      >
        <div class="min-w-0">
          <p class="m-0 truncate font-semibold text-haze-100">
            {{ device.deviceName }}
            <span v-if="device.suspended" class="ml-2 text-xs font-normal text-crit-400">sospeso</span>
          </p>
          <p class="m-0 text-xs text-haze-400">
            Collegato il {{ formatDate(device.createdAt) }} · usato l’ultima volta il {{ formatDate(device.lastUsedAt) }}
          </p>
        </div>
        <button
          type="button"
          class="lt-btn-dark shrink-0"
          :disabled="revoking === device.tokenId"
          @click="revoke(device)"
        >
          Scollega
        </button>
      </li>
    </ul>
  </SettingsSection>
</template>
