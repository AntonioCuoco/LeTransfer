<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { postLoginPath } from '@/src/utils/cliAuthorization'
import { takeLoginNotice } from '@/src/utils/axiosInterceptor'
import { notify } from '@/src/utils/notify'
import { withDetail } from '@/src/utils/errorDetail'
import { registerUrl, startLogin } from '@/src/utils/novrenId'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import novrenIcon from '@/src/assets/novren-icon.png'

/**
 * Accesso — con **Novren ID**, l'account unico di Novren, NovrenPass e Novren Drive.
 *
 * Qui non ci sono più email, password, codice 2FA, «password dimenticata» né Google: tutto
 * questo vive nell'area account di Novren ID, una volta per tutti i prodotti. Il pulsante porta
 * là; al ritorno (`/accesso`, `AccessPage.vue`) si aprono le chiavi e si entra.
 */

const router = useRouter()
if (Cookies.get('accessToken')) router.replace(postLoginPath())

// Rimandati qui dall'interceptor (sessione non rinnovabile): si dice perché.
const loginNotice = takeLoginNotice()
if (loginNotice) notify.warning(loginNotice, 'Sessione scaduta')

const isLoading = ref(false)

async function signIn() {
  if (isLoading.value) return
  isLoading.value = true
  try {
    await startLogin(postLoginPath())
  } catch (err) {
    isLoading.value = false
    notify.error(withDetail('Non siamo riusciti ad aprire Novren ID. Riprova tra poco.', err), 'Accesso non avviato')
  }
}
</script>

<template>
  <PublicShell :show-nav="false">
    <div class="grid w-full flex-1 content-center gap-8 py-[clamp(26px,5vh,70px)] lg:grid-cols-[1.05fr_minmax(0,430px)] lg:items-center lg:gap-[60px]">
      <!-- Colonna narrativa: perché l'account, detto una volta sola -->
      <div class="max-w-[600px]">
        <p class="lt-eyebrow mb-[22px]">
          Bentornato
        </p>
        <h1 class="lt-display mb-5">
          Le tue chiavi<br />ti aspettano.
        </h1>
        <p class="max-w-[46ch] text-[clamp(1rem,1.5vw,1.18rem)] leading-relaxed text-haze-300">
          Entri con Novren ID, lo stesso account di NovrenPass e Novren Drive. La password resta lì:
          a Novren arriva solo la chiave che apre i tuoi file, in questo browser.
        </p>

        <!-- Dettaglio tecnico onesto, in mono: è la firma del prodotto -->
        <dl class="mt-9 grid max-w-[420px] grid-cols-[auto_1fr] gap-x-5 gap-y-2 border-t border-white/10 pt-5 font-mono text-[0.72rem]">
          <dt class="text-[#8d7fb8]">Account</dt>
          <dd class="text-[#b9ace2]">Novren ID · password, 2FA, passkey</dd>
          <dt class="text-[#8d7fb8]">A Novren</dt>
          <dd class="text-[#b9ace2]">un token solo per Novren, 5 minuti</dd>
          <dt class="text-[#8d7fb8]">File</dt>
          <dd class="text-[#37e7c4]">RSA-4096 · chiave privata mai in chiaro</dd>
        </dl>
      </div>

      <!-- Carta chiara -->
      <div class="lt-card w-[min(430px,100%)] p-2.5 lg:justify-self-end">
        <div class="flex items-center justify-between px-3.5 pb-3 pt-3.5">
          <div class="flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
            <img :src="novrenIcon" alt="Novren" width="36" height="19" />
            Accedi
          </div>
          <div class="font-mono text-[0.66rem] font-semibold tracking-[0.04em] text-[#12b89a]">connessione TLS</div>
        </div>

        <div class="flex flex-col gap-3.5 px-2.5 pb-2.5">
          <p class="px-0.5 text-[0.86rem] leading-snug text-[#6a5f8c]">
            Ti portiamo su Novren ID per l'accesso, e poi di nuovo qui.
          </p>
          <button type="button" class="lt-btn" :disabled="isLoading" @click="signIn">
            {{ isLoading ? 'Ti portiamo a Novren ID…' : 'Accedi con Novren ID' }}
          </button>

          <div class="flex items-center justify-between pt-1 text-[0.82rem]">
            <span class="text-[#a79cc4]">Password dimenticata? Si recupera su Novren ID.</span>
            <a :href="registerUrl()" class="font-semibold text-[#12b89a] hover:underline">
              Crea un Novren ID →
            </a>
          </div>
        </div>
      </div>
    </div>
  </PublicShell>
</template>
