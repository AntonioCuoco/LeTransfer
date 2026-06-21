<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'
import { AuthFlowType, ChallengeNameType, InitiateAuthCommand, RespondToAuthChallengeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId, handleCognitoError } from '@/src/utils/cognitoClient'
import AppSlider from '@/src/components/AppSlider.vue'
import PasswordInput from '@/src/components/PasswordInput.vue'
import GoogleLoginButton from '@/src/components/GoogleLoginButton.vue'

const router = useRouter()
if (Cookies.get('accessToken')) router.replace('/')

const view = ref<'login' | 'otp'>('login')
const session = ref('')
const email = ref('')
const password = ref('')
const newPassword = ref('')

const isForgotOpen = ref(false)
const forgotStep = ref<'email' | 'confirm'>('email')
const forgotEmail = ref('')
const forgotCode = ref('')
const forgotNewPassword = ref('')
const isForgotLoading = ref(false)

const emailError = ref('')
const passwordError = ref('')

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
  try {
    const response = await cognitoClient.send(new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: { USERNAME: email.value, PASSWORD: password.value },
      ClientId: clientId,
    }))
    if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
      session.value = response.Session || ''; view.value = 'otp'
    } else if (response.AuthenticationResult) {
      const { AccessToken, IdToken, RefreshToken } = response.AuthenticationResult
      if (AccessToken && IdToken && RefreshToken) {
        Cookies.set('accessToken', AccessToken, { expires: 1 / 24 })
        Cookies.set('idToken', IdToken, { expires: 1 / 24 })
        Cookies.set('refreshToken', RefreshToken, { expires: 30 })
      }
      Swal.fire({ title: 'Login effettuato!', icon: 'success', confirmButtonText: 'OK' })
      router.push('/')
    }
  } catch (error) {
    Swal.fire({ title: 'Login fallito!', text: handleCognitoError(error), icon: 'error', confirmButtonText: 'OK' })
  }
}

const handleChallenge = async () => {
  try {
    const response = await cognitoClient.send(new RespondToAuthChallengeCommand({
      ClientId: clientId,
      ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
      Session: session.value,
      ChallengeResponses: { NEW_PASSWORD: newPassword.value, USERNAME: email.value, NAME: email.value },
    }))
    if (response.$metadata.httpStatusCode === 200) {
      Swal.fire({ title: 'Nuova password confermata!', icon: 'success', confirmButtonText: 'OK' })
      view.value = 'login'
    }
  } catch (error) { Swal.fire({ title: 'Errore!', text: handleCognitoError(error), icon: 'error', confirmButtonText: 'OK' }) }
}

const openForgotModal = () => { forgotEmail.value = email.value; forgotStep.value = 'email'; isForgotOpen.value = true }

const sendForgotEmail = async () => {
  isForgotLoading.value = true
  try {
    const res = await cognitoClient.send(new ForgotPasswordCommand({ ClientId: clientId, Username: forgotEmail.value }))
    if (res.$metadata?.httpStatusCode === 200) {
      Swal.fire({ title: 'Codice inviato!', text: 'Controlla la tua email', icon: 'success' })
      forgotStep.value = 'confirm'
    }
  } catch (e) { Swal.fire({ title: 'Errore!', text: handleCognitoError(e), icon: 'error' }) }
  finally { isForgotLoading.value = false }
}

const confirmForgotPassword = async () => {
  isForgotLoading.value = true
  try {
    const res = await cognitoClient.send(new ConfirmForgotPasswordCommand({
      ClientId: clientId, Username: forgotEmail.value, ConfirmationCode: forgotCode.value, Password: forgotNewPassword.value,
    }))
    if (res.$metadata?.httpStatusCode === 200) {
      Swal.fire({ title: 'Password reimpostata!', icon: 'success' })
      isForgotOpen.value = false
      forgotEmail.value = ''; forgotCode.value = ''; forgotNewPassword.value = ''
    }
  } catch (e) { Swal.fire({ title: 'Errore!', text: handleCognitoError(e), icon: 'error' }) }
  finally { isForgotLoading.value = false }
}
</script>

<template>
  <div class="w-full h-full flex flex-row justify-center items-center bg-[#2c2638]">
    <div class="w-1/2 h-full"><AppSlider /></div>
    <div class="w-1/2 h-full flex flex-col gap-12">
      <form class="pr-12 h-full flex flex-col justify-center items-center gap-8" @submit.prevent="handleLogin">
        <template v-if="view === 'login'">
          <h1 class="text-[#DBD4D3] text-4xl font-bold text-center">Accedi al tuo account</h1>
          <div class="w-full">
            <InputText v-model="email" type="email" placeholder="Email" fluid :invalid="!!emailError" />
            <p v-if="emailError" class="text-[#F4743B] mt-1 text-sm">{{ emailError }}</p>
          </div>
          <PasswordInput v-model="password" :error="passwordError" placeholder="Password" :show-tooltip="false" />
          <div class="w-full flex flex-col gap-4">
            <div class="flex flex-row gap-4 w-full">
              <Button type="submit" label="Login" class="w-full" size="large" />
              <Button type="button" label="Register" variant="outlined" class="w-full" size="large" @click="router.push('/register')" />
            </div>
            <Button type="button" label="Recupera password" variant="link" size="small" @click="openForgotModal" />
          </div>
          <div class="flex flex-row gap-4 w-full items-center">
            <div class="w-full h-[1px] bg-[#DBD4D3]" />
            <p class="text-[#DBD4D3] text-sm whitespace-nowrap">Or login with</p>
            <div class="w-full h-[1px] bg-[#DBD4D3]" />
          </div>
          <div class="w-full">
            <GoogleLoginButton :on-error="(err: string) => Swal.fire({ title: 'Error', text: err, icon: 'error' })" />
          </div>
        </template>
        <template v-else>
          <div class="w-full flex flex-col items-start gap-2">
            <label class="text-[#DBD4D3] text-sm">Enter new password</label>
            <Password v-model="newPassword" placeholder="Enter new password" :feedback="false" toggle-mask fluid />
          </div>
          <Button type="button" label="Save New Password" class="w-full" size="large" @click="handleChallenge" />
        </template>
      </form>
    </div>

    <Dialog v-model:visible="isForgotOpen" modal :header="forgotStep === 'email' ? 'Recupera password' : 'Inserisci codice e nuova password'" :style="{ width: '450px' }">
      <div v-if="forgotStep === 'email'" class="flex flex-col gap-4">
        <InputText v-model="forgotEmail" type="email" placeholder="Inserisci la tua email" fluid />
        <Button :disabled="!forgotEmail" :loading="isForgotLoading" :label="isForgotLoading ? 'Invio in corso...' : 'Invia codice'" class="w-full" @click="sendForgotEmail" />
      </div>
      <div v-else class="flex flex-col gap-4">
        <InputText v-model="forgotCode" type="text" placeholder="Codice ricevuto via email" fluid />
        <Password v-model="forgotNewPassword" placeholder="Nuova password" :feedback="false" toggle-mask fluid />
        <Button :disabled="!forgotCode || !forgotNewPassword" :loading="isForgotLoading" :label="isForgotLoading ? 'Conferma in corso...' : 'Conferma nuova password'" class="w-full" @click="confirmForgotPassword" />
      </div>
    </Dialog>
  </div>
</template>
