<script setup lang="ts">
import { ref } from 'vue'
import { message } from 'ant-design-vue'
import { CopyOutlined, SafetyCertificateOutlined } from '@ant-design/icons-vue'
import { generateRecoveryKey, deriveMasterKeyFromMnemonic } from '@/src/utils/recovery-key'
import { generateSalt, arrayBufferToBase64 } from '@/src/utils/crypto'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import { useEncryptionStore } from '@/src/stores/encryption'

const emit = defineEmits<{ complete: []; cancel: [] }>()

const currentStep = ref(0)
const mnemonic = ref('')
const confirmMnemonic = ref('')
const isVerifying = ref(false)

const { setupRecoveryKey, isLoading } = useRecoveryKeyAPI()
const encryptionStore = useEncryptionStore()

const steps = [
  { title: 'Genera Chiave' },
  { title: 'Salva' },
  { title: 'Verifica' },
]

const handleGenerate = async () => {
  mnemonic.value = await generateRecoveryKey()
  currentStep.value = 1
}

const performSetup = async () => {
  isVerifying.value = true
  try {
    const salt = generateSalt()
    const masterKey = await deriveMasterKeyFromMnemonic(mnemonic.value, salt)

    const encoder = new TextEncoder()
    const dataToEncrypt = encoder.encode('VERIFY')
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, dataToEncrypt)

    const encArr = new Uint8Array(encryptedBuffer)
    const packed = new Uint8Array(12 + encArr.byteLength)
    packed.set(iv)
    packed.set(encArr, 12)

    const verificationHash = arrayBufferToBase64(packed.slice().buffer)
    const saltBase64 = arrayBufferToBase64(salt.slice().buffer)

    const success = await setupRecoveryKey({ salt: saltBase64, verificationHash })
    if (success) {
      message.success('Sicurezza configurata con successo!')
      encryptionStore.setMasterKey(masterKey)
      emit('complete')
    }
  } catch {
    message.error('Errore durante la configurazione.')
  } finally {
    isVerifying.value = false
  }
}

const handleConfirm = async () => {
  const original = mnemonic.value.trim().toLowerCase()
  const input = confirmMnemonic.value.trim().toLowerCase()
  if (original !== input) {
    message.error('Le parole inserite non corrispondono. Riprova.')
    return
  }
  await performSetup()
}

const mnemonicWords = () => mnemonic.value.split(' ')
</script>

<template>
  <div class="w-full px-4 pb-4">
    <a-steps :current="currentStep" class="!mb-10 p-4" :items="steps.map(s => ({ title: s.title }))" />

    <!-- Step 0: Genera -->
    <div v-if="currentStep === 0" class="text-center space-y-8 px-4">
      <div class="w-20 h-20 mx-auto bg-[#724CF9]/20 rounded-full flex items-center justify-center ring-4 ring-[#724CF9]/10">
        <SafetyCertificateOutlined class="!text-[#724CF9] text-4xl" />
      </div>
      <div class="space-y-3">
        <h3 class="text-white text-2xl font-bold">Proteggi i tuoi file</h3>
        <p class="text-[#DBD4D3] text-lg leading-relaxed max-w-lg mx-auto">
          LeTransfer utilizza la crittografia End-to-End. Per proteggere i tuoi file in modo permanente,
          dobbiamo generare una <span class="text-[#724CF9] font-bold">Chiave di Ripristino</span>.
        </p>
      </div>
      <div class="bg-[#1a1625] border border-[#4a4554] p-5 rounded-xl flex gap-4 text-left shadow-lg">
        <span class="text-[#F4743B] text-2xl">⚠️</span>
        <span class="text-[#F4743B] text-base leading-relaxed">
          Questa chiave è l'<strong>UNICO</strong> modo per recuperare i tuoi file se dimentichi la password o cambi dispositivo.
        </span>
      </div>
      <div class="flex justify-center gap-4 pt-4">
        <a-button size="large" class="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white" @click="emit('cancel')">Annulla</a-button>
        <a-button type="primary" size="large" class="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none" @click="handleGenerate">Genera Recovery Key</a-button>
      </div>
    </div>

    <!-- Step 1: Salva -->
    <div v-else-if="currentStep === 1">
      <div class="text-center mb-6">
        <h4 class="text-white text-xl font-semibold">Salva la tua Recovery Key</h4>
        <p class="text-[#DBD4D3]">Salva queste 24 parole in un luogo sicuro (password manager, carta e penna).<br />Non condividerle mai con nessuno.</p>
      </div>
      <div class="grid grid-cols-4 gap-2 bg-[#1a1625] p-4 rounded-lg border border-[#4a4554] my-4">
        <div v-for="(word, i) in mnemonicWords()" :key="i" class="flex items-center space-x-1">
          <span class="text-[#9ca3af] text-xs w-5">{{ i + 1 }}.</span>
          <span class="font-mono font-medium text-white text-sm">{{ word }}</span>
        </div>
      </div>
      <div class="flex justify-between items-center mt-6">
        <a-button class="!bg-[#2c2638] !border-[#4a4554] !text-white hover:!border-[#724CF9]" @click="() => { navigator.clipboard.writeText(mnemonic); message.success('Copiata negli appunti') }">
          <template #icon><CopyOutlined /></template>
          Copia tutto
        </a-button>
        <a-button type="primary" class="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none" @click="currentStep = 2">Ho salvato le parole</a-button>
      </div>
    </div>

    <!-- Step 2: Verifica -->
    <div v-else-if="currentStep === 2" class="flex flex-col gap-6">
      <div class="text-center">
        <h4 class="text-white text-xl font-semibold">Verifica Recovery Key</h4>
        <p class="text-[#DBD4D3]">Per sicurezza, inserisci le parole che hai appena salvato.</p>
      </div>
      <a-textarea
        v-model:value="confirmMnemonic"
        :rows="4"
        placeholder="Incolla qui le 24 parole separate da spazio..."
        class="!bg-[#1a1625] !border-[#4a4554] !text-white"
      />
      <div class="flex justify-end gap-2">
        <a-button class="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white" @click="currentStep = 1">Indietro</a-button>
        <a-button
          type="primary"
          :loading="isVerifying || isLoading"
          :disabled="!confirmMnemonic"
          class="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none"
          @click="handleConfirm"
        >
          Verifica e Attiva
        </a-button>
      </div>
    </div>
  </div>
</template>

