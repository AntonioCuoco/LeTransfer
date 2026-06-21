<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { LockOutlined } from '@ant-design/icons-vue'
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
    message.success('Recovery Key verificata! File sbloccati.')
    visible.value = false
    mnemonic.value = ''
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string }
    if (e?.name === 'OperationError' || e?.message?.includes('operation')) {
      message.error('Recovery Key errata. Controlla le 24 parole e riprova.')
    } else {
      message.error('Errore durante la verifica. Riprova.')
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
  <a-modal
    :open="visible"
    :footer="null"
    :closable="true"
    :mask-closable="false"
    :width="560"
    centered
    :styles="{
      content: { backgroundColor: '#1a1625', border: '1px solid #4a4554', borderRadius: '16px', padding: '0' },
      mask: { backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.75)' },
    }"
    @cancel="handleCancel"
  >
    <div class="p-8 flex flex-col gap-5">
      <div class="flex items-center gap-3 mb-1">
        <div class="w-10 h-10 rounded-full bg-[#724CF9]/20 flex items-center justify-center flex-shrink-0">
          <LockOutlined class="!text-[#724CF9] text-lg" />
        </div>
        <div>
          <h3 class="text-white text-lg font-semibold m-0">Richiesta Chiave di Sicurezza</h3>
          <p class="text-[#9ca3af] text-sm m-0">Nuovo dispositivo o sessione scaduta</p>
        </div>
      </div>

      <div class="p-4 rounded-lg bg-[#724CF9]/15 border border-[#724CF9]/30">
        <p class="text-[#c4b5fd] text-sm m-0">
          Per accedere ai tuoi file cifrati E2E inserisci la Recovery Key (24 parole) generata durante la configurazione.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <label class="text-white font-medium text-sm">Recovery Key</label>
        <a-textarea
          v-model:value="mnemonic"
          :rows="4"
          placeholder="parola1 parola2 parola3 ..."
          class="font-mono !bg-[#2c2638] !border-[#4a4554] !text-white placeholder:!text-[#6b7280] focus:!border-[#724CF9]"
          @keydown.enter.ctrl="handleVerify"
        />
        <p class="text-[#9ca3af] text-xs m-0">Le parole separate da spazio — esattamente come le hai salvate.</p>
      </div>

      <div class="flex justify-end gap-3 pt-1">
        <a-button
          class="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white"
          @click="handleCancel"
        >
          Annulla
        </a-button>
        <a-button
          type="primary"
          :loading="verifying"
          :disabled="!mnemonic.trim()"
          class="!bg-[#724CF9] hover:!bg-[#9d7bfa] !border-[#724CF9]"
          @click="handleVerify"
        >
          Sblocca File
        </a-button>
      </div>
    </div>
  </a-modal>
</template>
