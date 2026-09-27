<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  AuthFlowType,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  type AuthenticationResultType,
} from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId, handleCognitoError } from '@/src/utils/cognitoClient'
import { notify } from '@/src/utils/notify'
import { withDetail } from '@/src/utils/errorDetail'
import FieldInput from '@/src/components/ui/FieldInput.vue'

/**
 * Conferma dell'email con il codice di Cognito — condivisa da registrazione e login.
 *
 * **Perché è un componente e non una vista della registrazione.** Prima la conferma
 * esisteva solo come secondo passo di RegisterPage, e non c'era modo di chiedere un nuovo
 * codice. Chi chiudeva la scheda o lasciava scadere il codice restava bloccato per sempre:
 * il login rispondeva «account non confermato», una nuova registrazione «email già usata».
 * Ora il login, davanti a un account non confermato, apre questa stessa carta.
 *
 * ⚠️ **Il nuovo codice si chiede solo dopo aver dimostrato la password** (dal login) o nella
 * stessa sessione in cui l'account è appena nato (dalla registrazione). `ResendConfirmationCode`
 * non vuole la password: esposto altrove, chiunque potrebbe riempire di codici la casella di
 * un altro.
 *
 * Il componente non tocca i cookie: emette i token e chi lo usa li salva come fa già.
 */

const RESEND_COOLDOWN_SECONDS = 60

const props = withDefaults(
  defineProps<{
    email: string
    /** Se c'è, dopo la conferma si entra subito senza ridigitarla. */
    password?: string
    /** `true` dal login: il codice vecchio è perso o scaduto, ne serve uno nuovo adesso. */
    sendOnMount?: boolean
    backLabel?: string
  }>(),
  { password: undefined, sendOnMount: false, backLabel: '← Indietro' },
)

const emit = defineEmits<{
  /** `null` = email confermata ma login automatico non riuscito: l'account è comunque attivo. */
  confirmed: [tokens: AuthenticationResultType | null]
  back: []
}>()

const code = ref('')
const isConfirming = ref(false)
const isResending = ref(false)
const cooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

function stopCooldown() {
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = null
}

/**
 * La pausa fra un invio e l'altro. Cognito ha già un suo limite, ma scoprirlo significa un
 * errore dopo il terzo clic: meglio un pulsante che dice quanto manca.
 */
function startCooldown() {
  stopCooldown()
  cooldown.value = RESEND_COOLDOWN_SECONDS
  cooldownTimer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) stopCooldown()
  }, 1000)
}

async function resend() {
  if (isResending.value || cooldown.value > 0) return
  isResending.value = true
  try {
    await cognitoClient.send(new ResendConfirmationCodeCommand({ ClientId: clientId, Username: props.email }))
    startCooldown()
    notify.success(`Nuovo codice inviato a ${props.email}.`, 'Codice inviato')
  } catch (error) {
    notify.error(handleCognitoError(error), 'Codice non inviato')
  } finally {
    isResending.value = false
  }
}

async function confirm() {
  const confirmationCode = code.value.trim()
  if (!confirmationCode || isConfirming.value) return
  isConfirming.value = true

  try {
    await cognitoClient.send(new ConfirmSignUpCommand({
      ClientId: clientId,
      Username: props.email,
      ConfirmationCode: confirmationCode,
    }))
  } catch (error) {
    notify.error(handleCognitoError(error), 'Email non confermata')
    isConfirming.value = false
    return
  }

  // Da qui l'account è attivo. Il login automatico è una comodità: se fallisce non è un
  // errore (basta accedere), ma il motivo si dice lo stesso — con un avviso, non in rosso.
  let tokens: AuthenticationResultType | null = null
  if (props.password) {
    try {
      const response = await cognitoClient.send(new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        AuthParameters: { USERNAME: props.email, PASSWORD: props.password },
        ClientId: clientId,
      }))
      tokens = response.AuthenticationResult ?? null
    } catch (err) {
      tokens = null
      notify.info(withDetail('Email confermata, ma l’accesso automatico non è riuscito: entra con email e password.', err), 'Accesso automatico non riuscito')
    }
  }

  isConfirming.value = false
  emit('confirmed', tokens)
}

onMounted(() => {
  // Dalla registrazione il codice è appena partito con `SignUp`: si parte già in pausa.
  if (props.sendOnMount) void resend()
  else startCooldown()
})

onBeforeUnmount(stopCooldown)
</script>

<template>
  <form class="flex flex-col gap-3.5 px-2.5 pb-2.5" @submit.prevent="confirm">
    <p class="px-0.5 text-[0.86rem] leading-snug text-[#6a5f8c]">
      <template v-if="sendOnMount">L'account non è ancora confermato. Mandiamo un nuovo codice a</template>
      <template v-else>Abbiamo mandato un codice a</template>
      <b class="font-mono text-[0.82rem] text-[#1b1140]">{{ email }}</b>.
      {{ password ? 'Incollalo qui e sei dentro.' : 'Incollalo qui per confermare.' }}
    </p>

    <FieldInput
      v-model="code"
      label="Codice di verifica"
      mono
      placeholder="123456"
      autocomplete="one-time-code"
      :disabled="isConfirming"
    />

    <button type="submit" class="lt-btn" :disabled="!code.trim() || isConfirming">
      {{ isConfirming ? 'Verifico…' : 'Conferma e entra' }}
    </button>

    <div class="flex items-center justify-between text-[0.82rem]">
      <button type="button" class="font-semibold text-[#6a5f8c] hover:underline" @click="emit('back')">
        {{ backLabel }}
      </button>
      <button
        type="button"
        class="font-semibold text-[#12b89a] hover:underline disabled:cursor-not-allowed disabled:text-[#a79cc4] disabled:no-underline"
        :disabled="isResending || cooldown > 0"
        @click="resend"
      >
        {{ isResending ? 'Invio…' : cooldown > 0 ? `Rimanda il codice (${cooldown}s)` : 'Rimanda il codice' }}
      </button>
    </div>

    <!-- Il mittente di default di Cognito è un dominio che non è il nostro: detto qui,
         evita di scartare l'email come spam proprio quando serve. -->
    <p class="m-0 px-0.5 font-mono text-[0.68rem] leading-normal text-[#8a7fae]">
      Non arriva? Guarda nello spam: il mittente è no-reply@verificationemail.com.
    </p>
  </form>
</template>
