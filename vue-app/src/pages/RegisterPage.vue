<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { setAuthCookie } from '@/src/utils/cookieStore'
import Swal from 'sweetalert2'
import { AuthFlowType, SignUpCommand, ConfirmSignUpCommand, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId, handleCognitoError } from '@/src/utils/cognitoClient'
import AppSlider from '@/src/components/AppSlider.vue'
import PasswordInput from '@/src/components/PasswordInput.vue'
import GoogleLoginButton from '@/src/components/GoogleLoginButton.vue'

const router = useRouter()
if (Cookies.get('accessToken')) router.replace('/')

const name = ref('')
const surname = ref('')
const email = ref('')
const password = ref('')
const isModalOpen = ref(false)
const confirmCode = ref('')

const nameError = ref('')
const surnameError = ref('')
const emailError = ref('')
const passwordError = ref('')

const validate = () => {
  nameError.value = name.value ? '' : 'Nome obbligatorio'
  surnameError.value = surname.value ? '' : 'Cognome obbligatorio'
  emailError.value = !email.value ? 'Email obbligatoria' : (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value) ? 'Formato email non valido' : '')
  passwordError.value = !password.value ? 'Password obbligatoria' : (password.value.length < 8 ? 'Min 8 caratteri' : '')
  return !nameError.value && !surnameError.value && !emailError.value && !passwordError.value
}

const handleRegister = async () => {
  if (!validate()) return
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
      Swal.fire({ title: 'Utente registrato!', text: 'Controlla la tua email per il codice di verifica', icon: 'success' })
      isModalOpen.value = true
    }
  } catch (error) {
    Swal.fire({ title: 'Errore durante la registrazione!', text: handleCognitoError(error), icon: 'error' })
  }
}

const handleConfirm = async () => {
  try {
    const confirmResponse = await cognitoClient.send(new ConfirmSignUpCommand({
      ClientId: clientId, Username: email.value, ConfirmationCode: confirmCode.value,
    }))
    if (confirmResponse.$metadata.httpStatusCode === 200) {
      const loginResponse = await cognitoClient.send(new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: { USERNAME: email.value, PASSWORD: password.value },
        ClientId: clientId,
      }))
      if (loginResponse.AuthenticationResult) {
        const { AccessToken, IdToken, RefreshToken } = loginResponse.AuthenticationResult
        if (AccessToken && IdToken && RefreshToken) {
          setAuthCookie('accessToken', AccessToken, 1 / 24)
          setAuthCookie('idToken', IdToken, 1 / 24)
          setAuthCookie('refreshToken', RefreshToken, 30)
        }
        isModalOpen.value = false
        Swal.fire({ title: 'Registrazione completata!', text: 'Benvenuto nella piattaforma', icon: 'success' })
        router.push('/')
      }
    }
  } catch (error) { Swal.fire({ title: 'Errore!', text: handleCognitoError(error), icon: 'error' }) }
}
</script>

<template>
  <div class="w-full h-full flex flex-row justify-center items-center bg-[#2c2638]">
    <Dialog v-model:visible="isModalOpen" modal :closable="false" :style="{ width: '450px' }" :pt="{ header: '!hidden' }">
      <div class="flex flex-col items-center justify-center gap-4 py-4">
        <p class="text-[#DBD4D3] text-2xl font-bold">Codice di verifica</p>
        <InputText v-model="confirmCode" type="text" placeholder="Codice di verifica" fluid />
      </div>
      <template #footer>
        <Button label="Annulla" severity="secondary" outlined @click="isModalOpen = false" />
        <Button label="Conferma" @click="handleConfirm" />
      </template>
    </Dialog>

    <div class="w-1/2 h-full"><AppSlider /></div>
    <div class="w-1/2 h-full flex flex-col gap-12">
      <form class="pr-12 h-full flex flex-col justify-center items-center gap-8" @submit.prevent="handleRegister">
        <h1 class="text-[#DBD4D3] text-4xl font-bold text-center">Registrati all'applicazione</h1>
        <div class="flex flex-row gap-4 w-full">
          <div class="w-full">
            <InputText v-model="name" type="text" placeholder="Nome" fluid :invalid="!!nameError" />
            <p v-if="nameError" class="text-[#F4743B] mt-1 text-sm">{{ nameError }}</p>
          </div>
          <div class="w-full">
            <InputText v-model="surname" type="text" placeholder="Cognome" fluid :invalid="!!surnameError" />
            <p v-if="surnameError" class="text-[#F4743B] mt-1 text-sm">{{ surnameError }}</p>
          </div>
        </div>
        <div class="w-full">
          <InputText v-model="email" type="email" placeholder="Email" fluid :invalid="!!emailError" />
          <p v-if="emailError" class="text-[#F4743B] mt-1 text-sm">{{ emailError }}</p>
        </div>
        <PasswordInput v-model="password" :error="passwordError" placeholder="Password" :show-tooltip="true" />
        <div class="flex flex-row gap-4 w-full">
          <Button type="submit" label="Register" class="w-full" size="large" />
          <Button type="button" label="Login" variant="outlined" class="w-full" size="large" @click="router.push('/login')" />
        </div>
        <div class="flex flex-row gap-4 w-full items-center">
          <div class="w-full h-[1px] bg-[#DBD4D3]" />
          <p class="text-[#DBD4D3] text-sm whitespace-nowrap">Or register with</p>
          <div class="w-full h-[1px] bg-[#DBD4D3]" />
        </div>
        <div class="w-full">
          <GoogleLoginButton :on-error="(err: string) => Swal.fire({ title: 'Error', text: err, icon: 'error' })" />
        </div>
      </form>
    </div>
  </div>
</template>
