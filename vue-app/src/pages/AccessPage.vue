<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { finishLogin, takeNext } from '@/src/utils/novrenId'
import { useEncryptionStore } from '@/src/stores/encryption'
import { createMasterKey, openMasterKey } from '@/src/crypto/novrenIdMasterKey'
import { rememberMasterKey } from '@/src/crypto/rememberedDevice'
import { requestWelcomeEmail } from '@/src/utils/welcomeEmail'
import { withDetail } from '@/src/utils/errorDetail'
import { notify } from '@/src/utils/notify'
import { REMEMBER_REQUEST_KEY } from '@/src/composables/useSecurityPrompt'
import type { UserRecoveryKeyStatus } from '@/src/types'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import novrenIcon from '@/src/assets/novren-icon.png'

/**
 * Il ritorno da Novren ID (`redirect_uri` del client `novren-web`).
 *
 *  1. si apre la busta con la chiave di Novren e si scambia il codice (`finishLogin`);
 *  2. la master key di Novren: al primo accesso nasce qui, avvolta sotto la chiave del prodotto
 *     (`crypto/novrenIdMasterKey.ts`), e si manda al server; le volte dopo si riapre;
 *  3. se l'utente l'aveva chiesto, la si ricorda su questo dispositivo;
 *  4. si va dove si voleva andare.
 *
 * La chiave del prodotto non esce da questa pagina: aperta la master key, non serve più.
 */

const router = useRouter()
const encryption = useEncryptionStore()
const error = ref('')
const API = import.meta.env.VITE_API_URL

async function status(): Promise<UserRecoveryKeyStatus> {
  return (await axios.get(`${API}/user/recovery-key/status`)).data
}

onMounted(async () => {
  try {
    const login = await finishLogin()
    let current = await status()
    let firstTime = false

    if (!current.hasRecoveryKey) {
      const created = await createMasterKey(login.productKey, login.accountId)
      try {
        await axios.post(`${API}/user/recovery-key/setup`, created.setup)
        encryption.setMasterKey(created.masterKey)
        firstTime = true
      } catch (err) {
        // 409: un altro dispositivo ha creato la master key un istante prima. Si usa la sua.
        if (!(axios.isAxiosError(err) && err.response?.status === 409)) throw err
        current = await status()
      }
    }

    if (!encryption.isUnlocked) {
      if (current.format !== 'novren-id/v1' || !current.wrappedMasterKey) {
        throw new Error('Questo account ha ancora le chiavi delle 24 parole di prima: con Novren ID vanno ricreate.')
      }
      encryption.setMasterKey(await openMasterKey(current.wrappedMasterKey, login.productKey, login.accountId))
    }

    // «Ricorda su questo dispositivo», scelto prima di partire per Novren ID.
    if (sessionStorage.getItem(REMEMBER_REQUEST_KEY) === '1' && encryption.masterKey) {
      sessionStorage.removeItem(REMEMBER_REQUEST_KEY)
      await rememberMasterKey(encryption.masterKey, { sub: login.accountId }).catch((err) =>
        notify.warning(withDetail('I file sono aperti, ma questo browser non ci permette di ricordarlo.', err), 'Dispositivo non ricordato'),
      )
    }
    if (firstTime) requestWelcomeEmail()
    await router.replace(takeNext())
  } catch (err) {
    error.value =
      err instanceof Error && err.name === 'LoginRejected'
        ? 'L’accesso non si è completato (scheda diversa, o link già usato). Riprova.'
        : withDetail('Non siamo riusciti ad aprire le tue chiavi.', err)
  }
})
</script>

<template>
  <PublicShell :show-nav="false">
    <div class="grid w-full flex-1 place-items-center py-[clamp(26px,8vh,90px)]">
      <div class="lt-card w-[min(430px,100%)] p-6">
        <div class="mb-4 flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
          <img :src="novrenIcon" alt="Novren" width="36" height="19" />
          {{ error ? 'Accesso non completato' : 'Apriamo i tuoi file…' }}
        </div>
        <p v-if="!error" class="text-[0.9rem] leading-snug text-[#6a5f8c]">
          La chiave è arrivata da Novren ID sigillata per questa scheda: la apriamo qui, nel browser.
        </p>
        <template v-else>
          <p class="mb-4 text-[0.9rem] leading-snug text-[#b4385a]" role="alert">{{ error }}</p>
          <RouterLink to="/login" class="lt-btn inline-flex">Riprova</RouterLink>
        </template>
      </div>
    </div>
  </PublicShell>
</template>
