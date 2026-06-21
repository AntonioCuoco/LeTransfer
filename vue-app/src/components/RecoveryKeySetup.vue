<script setup lang="ts">
import { ref } from 'vue'
import { notify } from '@/src/utils/notify'
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
      notify.success('Sicurezza configurata con successo!')
      encryptionStore.setMasterKey(masterKey)
      emit('complete')
    }
  } catch {
    notify.error('Errore durante la configurazione.')
  } finally {
    isVerifying.value = false
  }
}

const handleConfirm = async () => {
  const original = mnemonic.value.trim().toLowerCase()
  const input = confirmMnemonic.value.trim().toLowerCase()
  if (original !== input) {
    notify.error('Le parole inserite non corrispondono. Riprova.')
    return
  }
  await performSetup()
}

const copyMnemonic = () => {
  navigator.clipboard.writeText(mnemonic.value)
  notify.success('Copiata negli appunti')
}

const mnemonicWords = () => mnemonic.value.split(' ')
</script>

<template>
  <div class="w-full px-4 pb-4">
    <!-- Step indicator -->
    <div class="flex items-center justify-center gap-2 mb-10">
      <template v-for="(s, i) in steps" :key="i">
        <div class="flex items-center gap-2">
          <div :class="['w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold', i <= currentStep ? 'bg-primary text-white' : 'bg-surface-700 text-surface-300']">
            {{ i + 1 }}
          </div>
          <span :class="['text-sm hidden sm:inline', i <= currentStep ? 'text-white' : 'text-[#9ca3af]']">{{ s.title }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="w-10 h-px bg-surface-600" />
      </template>
    </div>

    <!-- Step 0: Genera -->
    <div v-if="currentStep === 0" class="text-center space-y-8 px-4">
      <div class="w-20 h-20 mx-auto bg-[#724CF9]/20 rounded-full flex items-center justify-center ring-4 ring-[#724CF9]/10">
        <i class="pi pi-shield text-primary text-4xl" />
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
        <Button label="Annulla" severity="secondary" outlined size="large" @click="emit('cancel')" />
        <Button label="Genera Recovery Key" size="large" @click="handleGenerate" />
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
        <Button label="Copia tutto" icon="pi pi-copy" severity="secondary" outlined @click="copyMnemonic" />
        <Button label="Ho salvato le parole" @click="currentStep = 2" />
      </div>
    </div>

    <!-- Step 2: Verifica -->
    <div v-else-if="currentStep === 2" class="flex flex-col gap-6">
      <div class="text-center">
        <h4 class="text-white text-xl font-semibold">Verifica Recovery Key</h4>
        <p class="text-[#DBD4D3]">Per sicurezza, inserisci le parole che hai appena salvato.</p>
      </div>
      <Textarea
        v-model="confirmMnemonic"
        :rows="4"
        placeholder="Incolla qui le 24 parole separate da spazio..."
        class="font-mono"
        fluid
      />
      <div class="flex justify-end gap-2">
        <Button label="Indietro" severity="secondary" outlined @click="currentStep = 1" />
        <Button
          label="Verifica e Attiva"
          :loading="isVerifying || isLoading"
          :disabled="!confirmMnemonic"
          @click="handleConfirm"
        />
      </div>
    </div>
  </div>
</template>
