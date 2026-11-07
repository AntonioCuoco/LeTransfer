<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { notify } from '@/src/utils/notify'
import { withDetail } from '@/src/utils/errorDetail'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useRecoveryKeyAPI } from '@/src/composables/useRecoveryKeyAPI'
import { useSecurityPrompt, REMEMBER_REQUEST_KEY } from '@/src/composables/useSecurityPrompt'
import { loadRememberedMasterKey, forgetMasterKey, REMEMBER_DAYS } from '@/src/crypto/rememberedDevice'
import { masterKeyMatches } from '@/src/crypto/novrenIdMasterKey'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { startLogin } from '@/src/utils/novrenId'
import novrenIcon from '@/src/assets/novren-icon.png'

/**
 * Sblocco dei file, con **Novren ID**.
 *
 * La master key di Novren vive solo in memoria: dopo una ricarica, o su un dispositivo nuovo, non
 * c'è. Si riapre passando da Novren ID (che consegna la chiave del prodotto, con cui la master key
 * si apre in `AccessPage.vue`), oppure da sola se l'utente aveva chiesto di ricordare questo
 * dispositivo: in quel caso si usa solo se apre la prova dell'account (`masterKeyMatches`).
 *
 * Le 24 parole non si chiedono più qui: sono di Novren ID, e servono solo a recuperare l'account
 * là. Il dialogo si può chiudere (l'app resta utilizzabile, i file cifrati no) e si riapre dalla
 * barra laterale — vedi useSecurityPrompt.
 */

const route = useRoute()
const encryptionStore = useEncryptionStore()
const { getRecoveryKeyStatus } = useRecoveryKeyAPI()
const { isPromptOpen, setUnlockAvailable, setRecoveryKeyStatus, close, open } = useSecurityPrompt()

// Non spuntata di default: ricordare il dispositivo è una scelta, non il comportamento normale.
const rememberDevice = ref(false)
const leaving = ref(false)

onMounted(async () => {
  if (encryptionStore.isUnlocked) return
  const status = await getRecoveryKeyStatus()
  setRecoveryKeyStatus(status ? (status.hasRecoveryKey ? 'present' : 'absent') : 'error')
  if (!status) return
  if (status.hasRecoveryKey && status.wrappedProof && (await unlockFromRememberedDevice(status.wrappedProof))) return
  // Con o senza master key sul server: si passa da Novren ID (se manca, la pagina di ritorno la crea).
  setUnlockAvailable(true)
  open()
})

/** Dispositivo ricordato: la master key è già in questo browser. Vale solo se apre la prova. */
async function unlockFromRememberedDevice(wrappedProof: string): Promise<boolean> {
  const sub = getCurrentUser()?.sub
  try {
    const remembered = await loadRememberedMasterKey({ sub })
    if (!remembered || !sub) return false
    if (await masterKeyMatches(remembered, wrappedProof, sub)) {
      encryptionStore.setMasterKey(remembered)
      return true
    }
    await forgetMasterKey({ sub })
  } catch {
    // IndexedDB non disponibile (es. navigazione privata): si passa da Novren ID, come sempre.
  }
  return false
}

async function unlockWithNovrenId() {
  leaving.value = true
  try {
    if (rememberDevice.value) sessionStorage.setItem(REMEMBER_REQUEST_KEY, '1')
    else sessionStorage.removeItem(REMEMBER_REQUEST_KEY)
    await startLogin(route.fullPath)
  } catch (err) {
    leaving.value = false
    notify.error(withDetail('Non siamo riusciti ad aprire Novren ID. Riprova tra poco.', err), 'Sblocco non avviato')
  }
}

// Si può chiudere: l'app resta usabile, ma i file cifrati restano illeggibili.
// Il rientro è dall'indicatore del vault nella barra laterale.
const handleCancel = () => close()
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
        La chiave che apre i tuoi file vive solo in memoria, quindi qui non c'è. Te la riconsegna
        <b class="text-haze-100">Novren ID</b>: un passaggio veloce dall'area account (password, o passkey) e
        torni qui con i file aperti.
      </p>

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
        <Button label="Sblocca con Novren ID" :loading="leaving" @click="unlockWithNovrenId" />
      </div>

      <p class="m-0 border-t border-white/10 pt-4 text-[0.82rem] leading-relaxed text-haze-400">
        Se chiudi, l'app resta utilizzabile ma i file cifrati non si apriranno. Puoi riprovare quando
        vuoi dall'indicatore delle chiavi, in basso nella barra laterale.
      </p>
    </div>
  </Dialog>
</template>
