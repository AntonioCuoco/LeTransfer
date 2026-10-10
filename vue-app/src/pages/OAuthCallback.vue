<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { setAuthCookie } from '@/src/utils/cookieStore'
import { postLoginPath } from '@/src/utils/cliAuthorization'
import { notify } from '@/src/utils/notify'
import { withDetail } from '@/src/utils/errorDetail'
import { requestWelcomeEmail } from '@/src/utils/welcomeEmail'

const router = useRouter()

// Cognito risponde con i codici OAuth standard e a volte con una descrizione. Si mostra la
// descrizione se c'è; altrimenti il codice, detto con il suo significato; se il codice non
// è fra quelli noti, così com'è. Mai un testo che dice un'altra cosa.
const OAUTH_ERRORS: Record<string, string> = {
  access_denied: 'Accesso annullato: l’autorizzazione con Google non è stata concessa.',
  invalid_grant: 'Il codice di accesso è scaduto o è già stato usato: riprova ad accedere con Google.',
  invalid_request: 'La richiesta di accesso non è valida: riprova ad accedere con Google.',
  invalid_client: 'Questa app non è autorizzata ad accedere con Google.',
  unauthorized_client: 'Questa app non è autorizzata ad accedere con Google.',
  unsupported_grant_type: 'Questo tipo di accesso non è supportato.',
  server_error: 'Il servizio di accesso ha avuto un errore: riprova tra poco.',
  temporarily_unavailable: 'Il servizio di accesso è momentaneamente non disponibile: riprova tra poco.',
}

function describeOAuthError(code?: string | null, description?: string | null): string {
  if (description) return description
  if (code) return OAUTH_ERRORS[code] ?? code
  return 'L’accesso con Google non è andato a buon fine. Riprova.'
}

function fail(message: string) {
  notify.error(message, 'Accesso non riuscito')
  router.replace('/login')
}

onMounted(async () => {
  try {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    if (error || !code) { fail(describeOAuthError(error, params.get('error_description'))); return }

    const domain = import.meta.env.VITE_COGNITO_DOMAIN as string
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
    const redirectUri = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string) || `${window.location.origin}/oauth2/callback`
    const verifier = sessionStorage.getItem('pkce_verifier') || ''

    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier })
    const res = await fetch(`${domain}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string; error_description?: string }
      // Senza codice né descrizione resta solo lo status: meglio quello di una frase vuota.
      fail(body.error || body.error_description
        ? describeOAuthError(body.error, body.error_description)
        : `${describeOAuthError()} [HTTP ${res.status} dal servizio di accesso]`)
      return
    }

    const data = await res.json()
    // Prima, senza token si proseguiva lo stesso: la pagina successiva rimandava al login
    // senza una parola, e sembrava che il bottone Google non facesse niente.
    if (!data.access_token || !data.id_token) {
      fail(`Il servizio di accesso ha risposto senza i token di sessione [campi ricevuti: ${Object.keys(data).join(', ') || 'nessuno'}].`)
      return
    }
    setAuthCookie('accessToken', data.access_token, 1 / 24)
    setAuthCookie('idToken', data.id_token, 1 / 24)
    if (data.refresh_token) setAuthCookie('refreshToken', data.refresh_token, 30)
    sessionStorage.removeItem('pkce_verifier')
    // Il primo accesso con Google È la registrazione: il server manda il benvenuto solo a un
    // account nuovo, e una volta sola, quindi chiamarlo a ogni accesso non costa niente.
    requestWelcomeEmail()
    router.replace(postLoginPath())
  } catch (err) { fail(withDetail(describeOAuthError(), err)) }
})
</script>

<template>
  <div class="min-h-screen bg-deep-900 flex items-center justify-center">
    <ProgressSpinner />
  </div>
</template>
