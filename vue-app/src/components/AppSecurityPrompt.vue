<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { notify } from '@/src/utils/notify'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'
import { deriveMasterKeyFromMnemonic, verifyMasterKey } from '@/src/crypto/recovery-key'
import { loadRememberedMasterKey, rememberMasterKey, forgetMasterKey, REMEMBER_DAYS } from '@/src/crypto/rememberedDevice'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { base64ToArrayBuffer } from '@/src/crypto/crypto'
import novrenIcon from '@/src/assets/novren-icon.png'

/**
 * Sblocco del vault con la chiave di recupero (roadmap F5).
 *
 * ⚠️ Qui le 24 parole SONO materiale crittografico: si inseriscono tutte e da esse
 * si deriva la master key. Incollarle è legittimo e previsto — l'utente le sta
 * prendendo dal suo gestore password o dal file che ha conservato. È il caso opposto
 * a RecoveryKeySetup, dove la digitazione a campione serve a verificare l'umano.
 *
 * Il dialogo si può chiudere (l'app resta utilizzabile, ma i file cifrati no) e si
 * riapre dalla barra laterale — vedi useSecurityPrompt.
 */

const encryptionStore = useEncryptionStore()
const { getRecoveryKeyStatus } = useRecoveryKeyAPI()
const { isPromptOpen, setUnlockAvailable, setRecoveryKeyStatus, close, open } = useSecurityPrompt()

const mnemonic = ref('')
const verifying = ref(false)
const saltBase64 = ref('')
const verificationHash = ref('')
// Non spuntata di default: ricordare il dispositivo è una scelta, non il comportamento normale.
const rememberDevice = ref(false)

const WORDS_MISMATCH = 'Le parole non corrispondono. Controlla di averle copiate tutte e 24, in ordine.'

onMounted(async () => {
  if (encryptionStore.isUnlocked) return
  const status = await getRecoveryKeyStatus()
  // Serve anche a chi blocca gli upload: senza chiave di recupero si crea, con la chiave si sblocca.
  setRecoveryKeyStatus(status ? (status.hasRecoveryKey ? 'present' : 'absent') : 'error')
  if (status?.hasRecoveryKey && status.salt && status.verificationHash) {
    saltBase64.value = status.salt
    verificationHash.value = status.verificationHash
    if (await unlockFromRememberedDevice(status.verificationHash)) return
    setUnlockAvailable(true)
    open()
  }
})

/**
 * Dispositivo ricordato: la master key è già in questo browser. Si usa solo se apre il blob
 * di verifica dell'account; se non lo apre più, il record è inutile e si cancella.
 */
async function unlockFromRememberedDevice(hash: string): Promise<boolean> {
  try {
    const remembered = await loadRememberedMasterKey({ sub: getCurrentUser()?.sub })
    if (!remembered) return false
    if (await verifyMasterKey(remembered, hash)) {
      encryptionStore.setMasterKey(remembered)
      return true
    }
    await forgetMasterKey({ sub: getCurrentUser()?.sub })
  } catch {
    // IndexedDB non disponibile (es. navigazione privata): si chiedono le parole, come prima.
  }
  return false
}

const handleVerify = async () => {
  if (!mnemonic.value.trim()) return
  verifying.value = true
  try {
    const salt = new Uint8Array(base64ToArrayBuffer(saltBase64.value))

    // Parole non valide (checksum) e parole valide ma di un altro account sono lo stesso
    // errore per chi le digita: in entrambi i casi vanno ricontrollate.
    let masterKey: CryptoKey
    try {
      masterKey = await deriveMasterKeyFromMnemonic(mnemonic.value.trim(), salt)
    } catch {
      notify.error(WORDS_MISMATCH, 'Parole non valide')
      return
    }
    if (!(await verifyMasterKey(masterKey, verificationHash.value))) {
      notify.error(WORDS_MISMATCH, 'Parole non valide')
      return
    }

    encryptionStore.setMasterKey(masterKey)
    setUnlockAvailable(false)
    if (rememberDevice.value) {
      try {
        await rememberMasterKey(masterKey, { sub: getCurrentUser()?.sub })
      } catch {
        notify.warning(
          'I file sono sbloccati, ma questo browser non ci permette di ricordarlo: alla prossima sessione ti chiederemo di nuovo le 24 parole.',
          'Dispositivo non ricordato',
        )
      }
    }
    notify.success('File sbloccati.')
    close()
    mnemonic.value = ''
  } catch {
    notify.error('Errore durante la verifica. Riprova.', 'Sblocco non riuscito')
  } finally {
    verifying.value = false
  }
}

// Si può chiudere: l'app resta usabile, ma i file cifrati restano illeggibili.
// Il rientro è dall'indicatore del vault nella barra laterale.
const handleCancel = () => {
  mnemonic.value = ''
  close()
}
</script>

<template>
  <Dialog
    :visible="isPromptOpen"
    modal
    :dismissable-mask="false"
    :style="{ width: 'min(560px, 94vw)' }"
    :pt="{ content: '!p-8' }"
    @update:visible="!$event && handleCancel()"
  >
    <template #header>
      <div class="flex items-center gap-3">
        <img :src="novrenIcon" alt="Novren" width="54" height="28" />
        <div>
          <h3 class="m-0 text-lg font-semibold text-haze-100">I tuoi file sono chiusi a chiave</h3>
          <p class="m-0 text-sm text-haze-400">Nuovo dispositivo, o sessione ripartita da zero</p>
        </div>
      </div>
    </template>

    <div class="flex flex-col gap-5">
      <p class="m-0 leading-relaxed text-haze-300">
        La chiave che apre i tuoi file non è mai uscita dal browser in cui l'hai creata, quindi qui non
        c'è. Inserisci le <b class="text-haze-100">24 parole</b> della chiave di recupero: da quelle la
        ricostruiamo, in locale.
      </p>

      <div class="flex flex-col gap-2">
        <label class="lt-label !text-haze-400">Chiave di recupero</label>
        <Textarea
          v-model="mnemonic"
          :rows="4"
          placeholder="parola1 parola2 parola3 …"
          class="font-mono"
          fluid
          autocapitalize="off"
          spellcheck="false"
          @keydown.enter.ctrl="handleVerify"
        />
        <p class="m-0 font-mono text-[0.72rem] text-haze-400">
          tutte e 24, separate da spazio · incollarle dal gestore password va benissimo
        </p>
      </div>

      <label class="flex cursor-pointer items-start gap-2.5 text-[0.9rem] text-haze-200">
        <input v-model="rememberDevice" type="checkbox" class="mt-0.5 h-4 w-4 flex-none accent-[var(--color-brand-500)]" />
        <span>
          Ricorda su questo dispositivo per {{ REMEMBER_DAYS }} giorni
          <span class="mt-0.5 block text-[0.78rem] leading-relaxed text-haze-400">
            Non spuntarla su un computer condiviso: chi lo usa con il tuo account aperto potrebbe aprire i
            tuoi file. La chiave resta in questo browser e non arriva mai a noi.
          </span>
        </span>
      </label>

      <div class="flex flex-wrap justify-end gap-3 pt-1">
        <Button label="Più tardi" severity="secondary" outlined @click="handleCancel" />
        <Button label="Sblocca i file" :loading="verifying" :disabled="!mnemonic.trim()" @click="handleVerify" />
      </div>

      <p class="m-0 border-t border-white/10 pt-4 text-[0.82rem] leading-relaxed text-haze-400">
        Se chiudi, l'app resta utilizzabile ma i file cifrati non si apriranno. Puoi riprovare quando
        vuoi dall'indicatore delle chiavi, in basso nella barra laterale.
      </p>
    </div>
  </Dialog>
</template>
