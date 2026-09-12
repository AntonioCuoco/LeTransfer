<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { setAuthCookie } from '@/src/utils/cookieStore'
import { notify } from '@/src/utils/notify'

const router = useRouter()

// Prima si tornava al login senza una parola, e sembrava che il pulsante Google non
// avesse fatto niente. Cognito qui risponde con codici (`invalid_grant`), non con frasi:
// il testo è il nostro.
function fail() {
  notify.error('L’accesso con Google non è andato a buon fine. Riprova.', 'Accesso non riuscito')
  router.replace('/login')
}

onMounted(async () => {
  try {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    if (error || !code) { fail(); return }

    const domain = import.meta.env.VITE_COGNITO_DOMAIN as string
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
    const redirectUri = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string) || `${window.location.origin}/oauth2/callback`
    const verifier = sessionStorage.getItem('pkce_verifier') || ''

    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier })
    const res = await fetch(`${domain}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!res.ok) { fail(); return }

    const data = await res.json()
    if (data.access_token && data.id_token) {
      setAuthCookie('accessToken', data.access_token, 1 / 24)
      setAuthCookie('idToken', data.id_token, 1 / 24)
      if (data.refresh_token) setAuthCookie('refreshToken', data.refresh_token, 30)
    }
    sessionStorage.removeItem('pkce_verifier')
    router.replace('/app')
  } catch { fail() }
})
</script>

<template>
  <div class="min-h-screen bg-deep-900 flex items-center justify-center">
    <ProgressSpinner />
  </div>
</template>
