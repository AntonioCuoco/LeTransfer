<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { setAuthCookie } from '@/src/utils/cookieStore'
import Swal from 'sweetalert2'
import { AuthFlowType, ChallengeNameType, InitiateAuthCommand, RespondToAuthChallengeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId, handleCognitoError } from '@/src/utils/cognitoClient'
import { isPasswordValid, PASSWORD_MIN_LENGTH } from '@/src/utils/passwordPolicy'
import PublicShell from '@/src/components/landing/PublicShell.vue'
import novrenIcon from '@/src/assets/novren-icon.png'
import FieldInput from '@/src/components/ui/FieldInput.vue'
import GoogleLoginButton from '@/src/components/GoogleLoginButton.vue'
import ConfirmEmailForm from '@/src/components/auth/ConfirmEmailForm.vue'
import { REGISTRATION_OPEN, REGISTRATION_CLOSED_MESSAGE } from '@/src/utils/registration'

/**
 * Accesso — stessa carta chiara di invio e ricezione, dentro il mondo viola.
 * La logica Cognito è invariata: qui cambia solo il vestito (roadmap F5).
 */

const router = useRouter()
const route = useRoute()
if (Cookies.get('accessToken')) router.replace('/app')

// `confirm` = account mai confermato: si chiede un nuovo codice invece di lasciarlo bloccato.
const view = ref<'login' | 'newPassword' | 'mfa' | 'confirm'>('login')
const session = ref('')
const mfaCode = ref('')
// Precompilata quando si arriva dalla registrazione con un'email già esistente.
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const password = ref('')
const newPassword = ref('')
const isLoading = ref(false)

const isForgotOpen = ref(false)
const forgotStep = ref<'email' | 'confirm'>('email')
const forgotEmail = ref('')
const forgotCode = ref('')
const forgotNewPassword = ref('')
const isForgotLoading = ref(false)

const emailError = ref('')
const passwordError = ref('')

// Per le password NUOVE (cambio obbligatorio, recupero): la stessa policy del User Pool.
// Il login invece non la verifica: chi entra ha già una password che Cognito ha accettato.
const newPasswordHint = `Almeno ${PASSWORD_MIN_LENGTH} caratteri, con maiuscola, minuscola, numero e simbolo`

const canSubmit = computed(() => !!email.value && !!password.value && !isLoading.value)

const validateForm = () => {
  let ok = true
  emailError.value = ''
  passwordError.value = ''
  if (!email.value) { emailError.value = 'Email obbligatoria'; ok = false }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { emailError.value = 'Formato email non valido'; ok = false }
  if (!password.value) { passwordError.value = 'Password obbligatoria'; ok = false }
  else if (password.value.length < 8) { passwordError.value = 'Min 8 caratteri'; ok = false }
  return ok
}

const handleLogin = async () => {
  if (!validateForm()) return
  isLoading.value = true
  try {
    const response = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: { USERNAME: email.value, PASSWORD: password.value },
      ClientId: clientId,
    }))
    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      session.value = response.Session || ''; view.value = 'newPassword'
    } else if (response.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
      // Verifica in due passaggi attiva: Cognito non rilascia i token finché non arriva
      // il codice. La sessione è a tempo — se scade si ricomincia dall'email.
      session.value = response.Session || ''
      mfaCode.value = ''
      view.value = 'mfa'
    } else if (response.AuthenticationResult) {
      saveTokens(response.AuthenticationResult)
    }
  } catch (error) {
    // Cognito risponde così solo se la password è giusta: è la prova che la casella è di chi
    // scrive, quindi qui — e solo qui — si può mandare un codice nuovo.
    if ((error as { name?: string }).name === 'UserNotConfirmedException') {
      view.value = 'confirm'
      return
    }
    Swal.fire({ title: 'Accesso non riuscito', text: handleCognitoError(error), icon: 'error', confirmButtonText: 'OK' })
  } finally {
    isLoading.value = false
  }
}

type AuthTokens = { AccessToken?: string; IdToken?: string; RefreshToken?: string }

/** Unico punto in cui i token entrano nei cookie: login diretto e login con 2FA. */
const saveTokens = (result: AuthTokens) => {
  const { AccessToken, IdToken, RefreshToken } = result
  if (AccessToken && IdToken && RefreshToken) {
    setAuthCookie('accessToken', AccessToken, 1 / 24)
    setAuthCookie('idToken', IdToken, 1 / 24)
    setAuthCookie('refreshToken', RefreshToken, 30)
  }
  router.push('/app')
}

/** Account confermato dal login: con i token si entra, senza si torna al form. */
const onConfirmed = (tokens: AuthTokens | null) => {
  if (tokens) { saveTokens(tokens); return }
  view.value = 'login'
  Swal.fire({ title: 'Email confermata', text: 'Ora puoi accedere.', icon: 'success', confirmButtonText: 'OK' })
}

const handleMfa = async () => {
  isLoading.value = true
  try {
    const response = await cognitoClient.send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: ChallengeNameType.SOFTWARE_TOKEN_MFA,
      Session: session.value,
      ChallengeResponses: { USERNAME: email.value, SOFTWARE_TOKEN_MFA_CODE: mfaCode.value.trim() },
    }))
    if (response.AuthenticationResult) saveTokens(response.AuthenticationResult)
    else throw new Error('Codice non accettato')
  } catch (error) {
    // Titolo neutro: il motivo lo dice il testo. «Codice non valido» era falso quando a
    // scadere era la sessione di accesso, non il codice.
    Swal.fire({ title: 'Verifica non riuscita', text: handleCognitoError(error), icon: 'error', confirmButtonText: 'OK' })
    mfaCode.value = ''
  } finally {
    isLoading.value = false
  }
}

const handleChallenge = async () => {
  isLoading.value = true
  try {
    const response = await cognitoClient.send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      Session: session.value,
      ChallengeResponses: { NEW_PASSWORD: newPassword.value, USERNAME: email.value, NAME: email.value },
    }))
    if (response.$metadata.httpStatusCode === 200) {
      Swal.fire({ title: 'Nuova password confermata', icon: 'success', confirmButtonText: 'OK' })
      view.value = 'login'
    }
  } catch (error) {
    Swal.fire({ title: 'Nuova password non salvata', text: handleCognitoError(error), icon: 'error', confirmButtonText: 'OK' })
  } finally {
    isLoading.value = false
  }
}

const openForgotModal = () => { forgotEmail.value = email.value; forgotStep.value = 'email'; isForgotOpen.value = true }

const sendForgotEmail = async () => {
  isForgotLoading.value = true
  try {
    const res = await cognitoClient.send(new ForgotPasswordCommand({ ClientId: clientId, Username: forgotEmail.value }))
    if (res.$metadata?.httpStatusCode === 200) {
      forgotStep.value = 'confirm'
    }
  } catch (e) { Swal.fire({ title: 'Codice non inviato', text: handleCognitoError(e), icon: 'error' }) }
  finally { isForgotLoading.value = false }
}

const confirmForgotPassword = async () => {
  isForgotLoading.value = true
  try {
    const res = await cognitoClient.send(new ConfirmForgotPasswordCommand({
      ClientId: clientId, Username: forgotEmail.value, ConfirmationCode: forgotCode.value, Password: forgotNewPassword.value,
    }))
    if (res.$metadata?.httpStatusCode === 200) {
      Swal.fire({ title: 'Password reimpostata', icon: 'success' })
      isForgotOpen.value = false
      forgotEmail.value = ''; forgotCode.value = ''; forgotNewPassword.value = ''
    }
  } catch (e) { Swal.fire({ title: 'Password non reimpostata', text: handleCognitoError(e), icon: 'error' }) }
  finally { isForgotLoading.value = false }
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
          La password apre l'account, non i file: quelli si aprono con la tua chiave privata, che vive
          cifrata e si sblocca solo in questo browser.
        </p>

        <!-- Dettaglio tecnico onesto, in mono: è la firma del prodotto -->
        <dl class="mt-9 grid max-w-[420px] grid-cols-[auto_1fr] gap-x-5 gap-y-2 border-t border-white/10 pt-5 font-mono text-[0.72rem]">
          <dt class="text-[#8d7fb8]">Account</dt>
          <dd class="text-[#b9ace2]">email + password (Cognito)</dd>
          <dt class="text-[#8d7fb8]">File</dt>
          <dd class="text-[#37e7c4]">RSA-4096 · chiave privata mai in chiaro</dd>
        </dl>
      </div>

      <!-- Carta chiara -->
      <div class="lt-card w-[min(430px,100%)] p-2.5 lg:justify-self-end">
        <div class="flex items-center justify-between px-3.5 pb-3 pt-3.5">
          <div class="flex items-center gap-2.5 text-[1.04rem] font-bold tracking-[-0.01em]">
            <img :src="novrenIcon" alt="Novren" width="36" height="19" />
            {{
              view === 'login' ? 'Accedi'
              : view === 'mfa' ? 'Verifica in due passaggi'
              : view === 'confirm' ? 'Conferma l\'email'
              : 'Nuova password'
            }}
          </div>
          <div class="font-mono text-[0.66rem] font-semibold tracking-[0.04em] text-[#12b89a]">connessione TLS</div>
        </div>

        <form v-if="view === 'login'" class="flex flex-col gap-3.5 px-2.5 pb-2.5" @submit.prevent="handleLogin">
          <FieldInput
            v-model="email"
            index="01"
            label="Email"
            type="email"
            placeholder="tu@esempio.it"
            autocomplete="email"
            :error="emailError"
            :disabled="isLoading"
          />
          <FieldInput
            v-model="password"
            index="02"
            label="Password"
            type="password"
            placeholder="La tua password"
            autocomplete="current-password"
            :error="passwordError"
            :disabled="isLoading"
          />

          <button
            type="submit"
            class="lt-btn mt-0.5"
            :disabled="!canSubmit"
          >
            {{ isLoading ? 'Accedo…' : 'Entra' }}
          </button>

          <div class="flex items-center gap-3 py-0.5">
            <span class="h-px flex-1 bg-[#f0ebfa]" />
            <span class="font-mono text-[0.64rem] uppercase tracking-[0.18em] text-[#a79cc4]">oppure</span>
            <span class="h-px flex-1 bg-[#f0ebfa]" />
          </div>

          <GoogleLoginButton :on-error="(err: string) => Swal.fire({ title: 'Accesso con Google non avviato', text: err, icon: 'error' })" />

          <div class="flex items-center justify-between pt-1 text-[0.82rem]">
            <button type="button" class="font-semibold text-[#6a5f8c] hover:underline" @click="openForgotModal">
              Password dimenticata
            </button>
            <button v-if="REGISTRATION_OPEN" type="button" class="font-semibold text-[#12b89a] hover:underline" @click="router.push('/register')">
              Crea un account →
            </button>
            <span v-else :title="REGISTRATION_CLOSED_MESSAGE" aria-disabled="true" class="cursor-not-allowed font-semibold text-[#a79cc4]">
              Registrazione chiusa
            </span>
          </div>
        </form>

        <ConfirmEmailForm
          v-else-if="view === 'confirm'"
          :email="email"
          :password="password"
          send-on-mount
          back-label="← Torna all'accesso"
          @confirmed="onConfirmed"
          @back="view = 'login'"
        />

        <form v-else-if="view === 'mfa'" class="flex flex-col gap-3.5 px-2.5 pb-2.5" @submit.prevent="handleMfa">
          <p class="px-0.5 text-[0.86rem] leading-snug text-[#6a5f8c]">
            Apri la tua app di autenticazione e inserisci il codice a sei cifre.
          </p>
          <FieldInput
            v-model="mfaCode"
            index="01"
            label="Codice"
            placeholder="123456"
            autocomplete="one-time-code"
            :disabled="isLoading"
          />
          <button
            type="submit"
            class="lt-btn"
            :disabled="mfaCode.trim().length < 6 || isLoading"
          >
            Verifica e accedi
          </button>
        </form>

        <form v-else class="flex flex-col gap-3.5 px-2.5 pb-2.5" @submit.prevent="handleChallenge">
          <p class="px-0.5 text-[0.86rem] leading-snug text-[#6a5f8c]">
            Il tuo account richiede una nuova password prima di continuare.
          </p>
          <FieldInput
            v-model="newPassword"
            index="01"
            label="Nuova password"
            type="password"
            :placeholder="newPasswordHint"
            autocomplete="new-password"
            :disabled="isLoading"
          />
          <button
            type="submit"
            class="lt-btn"
            :disabled="!isPasswordValid(newPassword) || isLoading"
          >
            Salva e continua
          </button>
        </form>
      </div>
    </div>

    <!-- Recupero password: dialog nello stesso vestito -->
    <Dialog
      v-model:visible="isForgotOpen"
      modal
      dismissable-mask
      :style="{ width: 'min(420px, 92vw)' }"
      :pt="{ root: '!rounded-[22px] !border-0 !bg-[#FBFAFF] !text-[#1b1140] !p-2.5', header: '!hidden', content: '!bg-transparent !p-0' }"
    >
      <div class="flex items-center gap-2.5 px-3.5 pb-3 pt-3.5 text-[1.04rem] font-bold tracking-[-0.01em]">
        <img :src="novrenIcon" alt="Novren" width="36" height="19" />
        {{ forgotStep === 'email' ? 'Recupera la password' : 'Inserisci il codice' }}
      </div>

      <div v-if="forgotStep === 'email'" class="flex flex-col gap-3.5 px-2.5 pb-2.5">
        <FieldInput
          v-model="forgotEmail"
          label="Email dell'account"
          type="email"
          placeholder="tu@esempio.it"
          autocomplete="email"
          hint="Ti mandiamo un codice a sei cifre. Non tocca le tue chiavi: quelle restano cifrate."
          :disabled="isForgotLoading"
        />
        <button
          type="button"
          class="lt-btn"
          :disabled="!forgotEmail || isForgotLoading"
          @click="sendForgotEmail"
        >
          {{ isForgotLoading ? 'Invio…' : 'Mandami il codice' }}
        </button>
      </div>

      <div v-else class="flex flex-col gap-3.5 px-2.5 pb-2.5">
        <FieldInput v-model="forgotCode" label="Codice ricevuto" mono placeholder="123456" :disabled="isForgotLoading" />
        <FieldInput v-model="forgotNewPassword" label="Nuova password" type="password" autocomplete="new-password" :placeholder="newPasswordHint" :disabled="isForgotLoading" />
        <button
          type="button"
          class="lt-btn"
          :disabled="!forgotCode || !isPasswordValid(forgotNewPassword) || isForgotLoading"
          @click="confirmForgotPassword"
        >
          {{ isForgotLoading ? 'Confermo…' : 'Reimposta la password' }}
        </button>
      </div>
    </Dialog>
  </PublicShell>
</template>
