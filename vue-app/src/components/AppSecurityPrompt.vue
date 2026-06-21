<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { notify } from '@/src/utils/notify'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import { deriveMasterKeyFromMnemonic } from '@/src/utils/recovery-key'
import { base64ToArrayBuffer } from '@/src/utils/crypto'

const encryptionStore = useEncryptionStore()
const { getRecoveryKeyStatus } = useRecoveryKeyAPI()

const visible = ref(false)
const mnemonic = ref('')
const verifying = ref(false)
const saltBase64 = ref('')
const verificationHash = ref('')

onMounted(async () => {
  if (encryptionStore.isUnlocked) return
  const status = await getRecoveryKeyStatus()
  if (status?.hasRecoveryKey && status.salt && status.verificationHash) {
    saltBase64.value = status.salt
    verificationHash.value = status.verificationHash
    visible.value = true
  }
})

const handleVerify = async () => {
  if (!mnemonic.value.trim()) return
  verifying.value = true
  try {
    const salt = new Uint8Array(base64ToArrayBuffer(saltBase64.value))
    const masterKey = await deriveMasterKeyFromMnemonic(mnemonic.value.trim(), salt)

    const packedBuffer = base64ToArrayBuffer(verificationHash.value)
    const packedArray = new Uint8Array(packedBuffer)
    const iv = packedArray.slice(0, 12)
    const ciphertext = packedArray.slice(12)

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, masterKey, ciphertext)
    const decoded = new TextDecoder().decode(decrypted)

    if (decoded !== 'VERIFY') throw new Error('invalid')

    encryptionStore.setMasterKey(masterKey)
    notify.success('Recovery Key verificata! File sbloccati.')
    visible.value = false
    mnemonic.value = ''
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    if (e?.name === 'OperationError' || e?.message?.includes('operation')) {
      notify.error('Recovery Key errata. Controlla le 24 parole e riprova.')
    } else {
      notify.error('Errore durante la verifica. Riprova.')
    }
  } finally {
    verifying.value = false
  }
}

const handleCancel = () => {
  // Allow close — app remains locked, encrypted files will be inaccessible
  visible.value = false
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :dismissable-mask="false"
    :style="{ width: '560px' }"
    :pt="{ content: '!p-8' }"
    @hide="handleCancel"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-[#724CF9]/20 flex items-center justify-center flex-shrink-0">
          <i class="pi pi-lock text-primary text-lg" />
        </div>
        <div>
          <h3 class="text-white text-lg font-semibold m-0">Richiesta Chiave di Sicurezza</h3>
          <p class="text-[#9ca3af] text-sm m-0">Nuovo dispositivo o sessione scaduta</p>
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-5">
      <div class="p-4 rounded-lg bg-[#724CF9]/15 border border-[#724CF9]/30">
        <p class="text-[#c4b5fd] text-sm m-0">
          Per accedere ai tuoi file cifrati E2E inserisci la Recovery Key (24 parole) generata durante la configurazione.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-white font-medium text-sm">Recovery Key</label>
        <Textarea
          v-model="mnemonic"
          :rows="4"
          placeholder="parola1 parola2 parola3 ..."
          class="font-mono"
          fluid
          @keydown.enter.ctrl="handleVerify"
        />
        <p class="text-[#9ca3af] text-xs m-0">Le parole separate da spazio — esattamente come le hai salvate.</p>
      </div>

      <div class="flex justify-end gap-3 pt-1">
        <Button label="Annulla" severity="secondary" outlined @click="handleCancel" />
        <Button label="Sblocca File" :loading="verifying" :disabled="!mnemonic.trim()" @click="handleVerify" />
      </div>
    </div>
  </Dialog>
</template>
