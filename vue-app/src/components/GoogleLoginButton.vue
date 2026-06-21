<script setup lang="ts">
import { ref } from 'vue'
import { generateCodeVerifier, generateCodeChallenge } from '@/src/utils/pkce'

const props = defineProps<{ disabled?: boolean; onError?: (error: string) => void }>()

const isLoading = ref(false)

const handleGoogleLogin = async () => {
  if (props.disabled || isLoading.value) return
  isLoading.value = true
  try {
    const domain = import.meta.env.VITE_COGNITO_DOMAIN as string
    const redirect = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string) || `${window.location.origin}/oauth2/callback`
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string
    if (!domain || !clientId) throw new Error('Missing Cognito configuration.')
    const verifier = generateCodeVerifier()
    sessionStorage.setItem('pkce_verifier', verifier)
    const challenge = await generateCodeChallenge(verifier)
    const scope = 'openid email profile'
    window.location.href = `${domain}/oauth2/authorize?identity_provider=Google&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scope)}&code_challenge_method=S256&code_challenge=${challenge}`
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error during Google login'
    props.onError?.(msg)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <button
    type="button"
    :disabled="disabled || isLoading"
    class="w-full flex items-center justify-center gap-3 bg-white text-gray-700 font-medium py-2.5 px-4 rounded-md border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    @click="handleGoogleLogin"
  >
    <svg viewBox="0 0 24 24" class="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    {{ isLoading ? 'Redirect in corso...' : 'Continua con Google' }}
  </button>
</template>
