<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { setAuthCookie } from '@/src/utils/cookieStore'
import Swal from 'sweetalert2'
import { SignUpCommand, type AuthenticationResultType } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId, handleCognitoError } from '@/src/utils/cognitoClient'
import { passwordRules, PASSWORD_MIN_LENGTH } from '@/src/utils/passwordPolicy'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import BrandSeal from '@/src/components/landing/BrandSeal.vue'
import FieldInput from '@/src/components/ui/FieldInput.vue'
import GoogleLoginButton from '@/src/components/GoogleLoginButton.vue'
import ConfirmEmailForm from '@/src/components/auth/ConfirmEmailForm.vue'
import { REGISTRATION_OPEN, REGISTRATION_CLOSED_MESSAGE } from '@/src/utils/registration'

/**
 * Registrazione — stessa carta chiara delle altre superfici pubbliche.
 * La conferma del codice è una VISTA della carta, non un dialog che compare dal nulla:
 * l'utente resta nello stesso oggetto dall'inizio alla fine (pattern Linear/Notion).
 * Logica Cognito invariata (roadmap F5).
 */

const router = useRouter()
if (Cookies.get('accessToken')) router.replace('/app')

const view = ref<'form' | 'confirm'>('form')
const name = ref('')
const surname = ref('')
const email = ref('')
const password = ref('')
const isLoading = ref(false)

const nameError = ref('')
const surnameError = ref('')
const emailError = ref('')
const passwordError = ref('')

// Criteri password mostrati mentre si scrive, non dopo il rifiuto del server.
// Vengono da utils/passwordPolicy.ts, allineato alla policy vera del User Pool.
const rules = computed(() => passwordRules(password.value))

const canSubmit = computed(
  () => !!name.value && !!surname.value && !!email.value && rules.value.every((rule) => rule.ok) && !isLoading.value,
)

const validate = () => {
  nameError.value = name.value ? '' : 'Nome obbligatorio'
  surnameError.value = surname.value ? '' : 'Cognome obbligatorio'
  emailError.value = !email.value ? 'Email obbligatoria' : (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value) ? 'Formato email non valido' : '')
  passwordError.value = !password.value ? 'Password obbligatoria' : (password.value.length < PASSWORD_MIN_LENGTH ? `Min ${PASSWORD_MIN_LENGTH} caratteri` : '')
  return !nameError.value && !surnameError.value && !emailError.value && !passwordError.value
}

const handleRegister = async () => {
  // Con la registrazione chiusa il modulo non è nemmeno in pagina: questa è la seconda
  // serratura, perché una chiamata a Cognito partita da qui non la ferma più nessuno.
  if (!REGISTRATION_OPEN) return
  if (!validate()) return
  isLoading.value = true
  try {
    const response = await cognitoClient.send(new SignUpCommand({
      ClientId: clientId,
      Username: email.value,
      Password: password.value,
      UserAttributes: [
        { Name: 'email', Value: email.value },
        { Name: 'name', Value: `${name.value} ${surname.value}` },
      ],
    }))
    if (response.$metadata.httpStatusCode === 200) {
      view.value = 'confirm'
    }
  } catch (error) {
    // Email già registrata: può essere un account mai confermato. Da qui NON si rimanda il
    // codice — non abbiamo prova che la casella sia di chi scrive. Il login verifica la
    // password e poi apre la conferma con un codice nuovo.
    if ((error as { name?: string }).name === 'UsernameExistsException') {
      void Swal.fire({
        title: 'Email già registrata',
        // Il messaggio di Cognito, più cosa fare: può essere un account mai confermato.
        text: `${handleCognitoError(error)} Se non l’hai mai confermato, accedi: ti mandiamo un nuovo codice.`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Vai all’accesso',
        cancelButtonText: 'Chiudi',
      }).then((choice) => {
        if (choice.isConfirmed) router.push({ path: '/login', query: { email: email.value } })
      })
    } else {
      Swal.fire({ title: 'Registrazione non riuscita', text: handleCognitoError(error), icon: 'error' })
    }
  } finally {
    isLoading.value = false
  }
}

/**
 * Codice confermato (vedi ConfirmEmailForm). Con i token si entra; senza — login automatico
 * non riuscito, raro — l'account è comunque attivo e basta accedere.
 */
const onConfirmed = (tokens: AuthenticationResultType | null) => {
  if (tokens?.AccessToken && tokens.IdToken && tokens.RefreshToken) {
    setAuthCookie('accessToken', tokens.AccessToken, 1 / 24)
    setAuthCookie('idToken', tokens.IdToken, 1 / 24)
    setAuthCookie('refreshToken', tokens.RefreshToken, 30)
    router.push('/app')
    return
  }
  Swal.fire({ title: 'Email confermata', text: 'Ora accedi con la tua password.', icon: 'success' })
  router.push({ path: '/login', query: { email: email.value } })
}
</script>

<template>
  <PublicShell :show-nav="false">
    <div class="grid w-full flex-1 content-center gap-8 py-[clamp(26px,5vh,70px)] lg:grid-cols-[1fr_minmax(0,450px)] lg:items-center lg:gap-[60px]">
      <div class="max-w-[600px]">
        <p class="lt-eyebrow mb-[22px]">
          Crea un account
        </p>
        <h1 class="lt-display mb-5">
          Un posto<br />per le tue<br /><em class="not-italic text-verified-400">chiavi.</em>
        </h1>
        <p class="max-w-[46ch] text-[clamp(1rem,1.5vw,1.18rem)] leading-relaxed text-haze-300">
          Senza account puoi già inviare. Con l'account tieni lo storico, revochi i link quando vuoi,
          alzi i limiti — e i file restano cifrati esattamente come prima.
        </p>

        <ul class="mt-9 grid max-w-[440px] gap-2.5 border-t border-white/10 pt-5 font-mono text-[0.74rem] text-[#b9ace2]">
          <li class="flex items-baseline gap-3"><span class="text-[#37e7c4]">→</span> La coppia di chiavi nasce in questo browser</li>
          <li class="flex items-baseline gap-3"><span class="text-[#37e7c4]">→</span> La privata resta cifrata, anche da noi</li>
          <li class="flex items-baseline gap-3"><span class="text-[#37e7c4]">→</span> Una recovery key da 24 parole per non perderla</li>
        </ul>
      </div>

      <div class="lt-card w-[min(450px,100%)] p-2.5 lg:justify-self-end">
        <div class="flex items-center justify-between px-3.5 pb-3 pt-3.5">
          <div class="flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
            <BrandSeal :size="19" :variant="view === 'confirm' ? 'check' : 'plain'" />
            {{ !REGISTRATION_OPEN ? 'Registrazione chiusa' : (view === 'form' ? 'Nuovo account' : 'Conferma l\'email') }}
          </div>
          <div v-if="REGISTRATION_OPEN" class="font-mono text-[0.66rem] font-semibold tracking-[0.04em] text-[#12b89a]">
            {{ view === 'form' ? 'passo 1 di 2' : 'passo 2 di 2' }}
          </div>
        </div>

        <form v-if="REGISTRATION_OPEN && view === 'form'" class="flex flex-col gap-3.5 px-2.5 pb-2.5" @submit.prevent="handleRegister">
          <div class="grid grid-cols-2 gap-2.5">
            <FieldInput v-model="name" index="01" label="Nome" placeholder="Antonio" autocomplete="given-name" :error="nameError" :disabled="isLoading" />
            <FieldInput v-model="surname" index="02" label="Cognome" placeholder="Rossi" autocomplete="family-name" :error="surnameError" :disabled="isLoading" />
          </div>

          <FieldInput
            v-model="email"
            index="03"
            label="Email"
            type="email"
            placeholder="tu@esempio.it"
            autocomplete="email"
            :error="emailError"
            :disabled="isLoading"
          />

          <div>
            <FieldInput
              v-model="password"
              index="04"
              label="Password"
              type="password"
              placeholder="Scegline una lunga"
              autocomplete="new-password"
              :error="passwordError"
              :disabled="isLoading"
            />
            <!-- Criteri live: si spengono uno a uno mentre scrivi -->
            <ul class="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[0.68rem]">
              <li
                v-for="rule in rules"
                :key="rule.label"
                class="flex items-center gap-1 transition-colors"
                :class="rule.ok ? 'text-[#12b89a]' : 'text-[#a79cc4]'"
              >
                <span>{{ rule.ok ? '✓' : '·' }}</span>{{ rule.label }}
              </li>
            </ul>
          </div>

          <button
            type="submit"
            class="lt-btn mt-0.5"
            :disabled="!canSubmit"
          >
            {{ isLoading ? 'Creo l\'account…' : 'Crea l\'account' }}
          </button>

          <div class="flex items-center gap-3 py-0.5">
            <span class="h-px flex-1 bg-[#f0ebfa]" />
            <span class="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-[#a79cc4]">oppure</span>
            <span class="h-px flex-1 bg-[#f0ebfa]" />
          </div>

          <GoogleLoginButton :on-error="(err: string) => Swal.fire({ title: 'Accesso con Google non avviato', text: err, icon: 'error' })" />

          <div class="pt-1 text-center text-[0.82rem] text-[#6a5f8c]">
            Hai già un account?
            <button type="button" class="font-semibold text-[#12b89a] hover:underline" @click="router.push('/login')">Accedi</button>
          </div>
        </form>

        <ConfirmEmailForm
          v-else-if="REGISTRATION_OPEN"
          :email="email"
          :password="password"
          back-label="← Correggi i dati"
          @confirmed="onConfirmed"
          @back="view = 'form'"
        />

        <!-- Registrazione chiusa: si dice perché e dove andare, invece di mostrare un
             modulo che il server (e Cognito) rifiuterebbero comunque. -->
        <div v-else data-testid="registration-closed" class="flex flex-col gap-3.5 px-3.5 pb-4 pt-1">
          <p class="m-0 text-[0.92rem] leading-relaxed text-[#3d3260]">
            {{ REGISTRATION_CLOSED_MESSAGE }}
          </p>
          <p class="m-0 text-[0.82rem] leading-relaxed text-[#6a5f8c]">
            Riapriremo le iscrizioni appena la fatturazione sarà pronta. Se un account ce l'hai già, puoi accedere.
          </p>
          <button type="button" class="lt-btn" @click="router.push('/login')">
            Vai all’accesso
          </button>
        </div>
      </div>
    </div>
  </PublicShell>
</template>
