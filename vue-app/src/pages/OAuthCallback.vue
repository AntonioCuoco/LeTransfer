<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'

const router = useRouter()

onMounted(async () => {
  try {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')
    if (error || !code) { router.replace('/login'); return }

    const domain = import.meta.env.VITE_COGNITO_DOMAIN as string
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
    const redirectUri = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string) || `${window.location.origin}/oauth2/callback`
    const verifier = sessionStorage.getItem('pkce_verifier') || ''

    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier })
    const res = await fetch(`${domain}/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    if (!res.ok) { router.replace('/login'); return }

    const data = await res.json()
    if (data.access_token && data.id_token) {
      Cookies.set('accessToken', data.access_token, { expires: 1 / 24 })
      Cookies.set('idToken', data.id_token, { expires: 1 / 24 })
      if (data.refresh_token) Cookies.set('refreshToken', data.refresh_token, { expires: 30 })
    }
    sessionStorage.removeItem('pkce_verifier')
    router.replace('/')
  } catch { router.replace('/login') }
})
</script>

<template>
  <div class="min-h-screen bg-[#2c2638] flex items-center justify-center">
    <a-spin size="large" />
  </div>
</template>
