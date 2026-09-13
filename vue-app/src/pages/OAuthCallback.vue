<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { setAuthCookie } from '@/src/utils/cookieStore'
import { notify } from '@/src/utils/notify'

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
      fail(describeOAuthError(body.error, body.error_description))
      return
    }

    const data = await res.json()
    if (data.access_token && data.id_token) {
      setAuthCookie('accessToken', data.access_token, 1 / 24)
      setAuthCookie('idToken', data.id_token, 1 / 24)
      if (data.refresh_token) setAuthCookie('refreshToken', data.refresh_token, 30)
    }
    sessionStorage.removeItem('pkce_verifier')
    router.replace('/app')
  } catch { fail(describeOAuthError()) }
})
</script>

<template>
  <div class="min-h-screen bg-deep-900 flex items-center justify-center">
    <ProgressSpinner />
  </div>
</template>
