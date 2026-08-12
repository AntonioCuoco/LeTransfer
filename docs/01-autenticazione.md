# 🔐 Sistema di Autenticazione

## Overview

LeTransfer utilizza **AWS Cognito** come provider di autenticazione, supportando sia il login tradizionale (email/password) che OAuth con Google. Il sistema include gestione automatica del refresh token e protezione delle route (via navigation guard di Vue Router).

---

## Architettura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Vue)                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │ LoginPage.vue│    │RegisterPage  │    │  OAuthCallback.vue   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────────┬───────────┘  │
│         │                   │                       │               │
│         ▼                   ▼                       ▼               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    AWS Cognito SDK                          │   │
│  │  - InitiateAuthCommand (Login)                              │   │
│  │  - SignUpCommand (Registrazione)                            │   │
│  │  - ConfirmSignUpCommand (Conferma email)                    │   │
│  │  - ForgotPasswordCommand (Reset password)                   │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                    Token Storage (Cookies)                   │   │
│  │  - accessToken (1h) · idToken (1h) · refreshToken (30gg)     │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                useTokenManager (composable)                  │   │
│  │  - Token refresh automatico · controllo scadenza · redirect  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS Cognito (User Pool)                     │
└─────────────────────────────────────────────────────────────────────┘
```

> La logica Cognito (i `*Command` dell'SDK) è indipendente dal framework UI: è rimasta identica
> nella migrazione a Vue. A cambiare sono i costrutti UI (componenti `.vue`, composable, router).

---

## Componenti Coinvolti

### 1. LoginPage (`vue-app/src/pages/LoginPage.vue`)

Gestisce il flusso di login con:
- **Login tradizionale** via email/password
- **Google OAuth** tramite redirect
- **Password recovery** con invio email
- **Challenge handling** (es. NEW_PASSWORD_REQUIRED)

#### Funzioni principali

```ts
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { InitiateAuthCommand, ForgotPasswordCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoClient, clientId } from '@/src/utils/cognitoClient'
import Cookies from 'js-cookie'

const router = useRouter()
const showChallenge = ref(false)
const forgotStep = ref(1)

const handleLogin = async () => {
  const command = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: { USERNAME: email.value, PASSWORD: password.value },
  })
  const response = await cognitoClient.send(command)

  if (response.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    showChallenge.value = true
  } else if (response.AuthenticationResult) {
    const { AccessToken, IdToken, RefreshToken } = response.AuthenticationResult
    Cookies.set('accessToken', AccessToken!, { expires: 1 / 24 }) // 1h
    Cookies.set('idToken', IdToken!, { expires: 1 / 24 })
    Cookies.set('refreshToken', RefreshToken!, { expires: 30 })
    router.push('/')
  }
}

const sendForgotEmail = async () => {
  await cognitoClient.send(new ForgotPasswordCommand({ ClientId: clientId, Username: forgotEmail.value }))
  forgotStep.value = 2 // mostra form codice + nuova password
}
```

---

### 2. RegisterPage (`vue-app/src/pages/RegisterPage.vue`)

```ts
import { SignUpCommand, ConfirmSignUpCommand } from '@aws-sdk/client-cognito-identity-provider'

const confirmPending = ref(false)

const signUp = async () => {
  await cognitoClient.send(new SignUpCommand({
    ClientId: clientId,
    Username: email.value,
    Password: password.value,
    UserAttributes: [{ Name: 'email', Value: email.value }],
  }))
  confirmPending.value = true
}

const confirmSignUp = async () => {
  await cognitoClient.send(new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: email.value,
    ConfirmationCode: code.value,
  }))
  router.push('/login')
}
```

---

### 3. OAuthCallback (`vue-app/src/pages/OAuthCallback.vue`)

Gestisce il redirect dopo login Google. La route è `/oauth2/callback` (vedi `router/index.ts`).
`useEffect(..., [])` di React diventa `onMounted`:

```ts
import { onMounted } from 'vue'

onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  if (code) exchangeCodeForTokens(code)
})

const exchangeCodeForTokens = async (code: string) => {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    }),
  })
  const tokens = await response.json()
  // salva tokens nei cookie e router.push('/')
}
```

---

### 4. useTokenManager (`vue-app/src/composables/useTokenManager.ts`)

Composable centrale per la gestione dei token.

#### Valori ritornati

```ts
const {
  isAuthenticated, // Ref<boolean>
  isRefreshing,    // Ref<boolean>
  ensureValidToken,// () => Promise<boolean>
  refreshToken,    // alias di ensureValidToken
  clearTokens,     // () => void
} = useTokenManager()
```

#### Funzionalità

1. **Verifica validità + refresh** (`ensureValidToken`): se l'`accessToken` è valido ritorna `true`;
   se scaduto ma c'è il `refreshToken`, esegue `InitiateAuthCommand` con `REFRESH_TOKEN_AUTH`.
   Include un guard anti-race (`isRefreshingRef`) per evitare refresh concorrenti.

```ts
const ensureValidToken = async (): Promise<boolean> => {
  const accessToken = Cookies.get('accessToken')
  const refreshTokenValue = Cookies.get('refreshToken')
  if (!accessToken && !refreshTokenValue) { clearTokens(); return false }
  if (accessToken && !isTokenExpired(accessToken)) { isAuthenticated.value = true; return true }
  if (!refreshTokenValue) { clearTokens(); return false }

  const response = await cognitoClient.send(new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: clientId,
    AuthParameters: { REFRESH_TOKEN: refreshTokenValue },
  }))
  const { AccessToken, IdToken } = response.AuthenticationResult ?? {}
  if (AccessToken && IdToken) { updateTokens(AccessToken, IdToken); return true }
  clearTokens(); return false
}
```

2. **Controllo proattivo scadenza**: in React era un `useEffect` con `setInterval`. In Vue è in
   `onMounted` (avvio + interval ogni 60s + listener su `focus`/`visibilitychange`) con cleanup in
   `onUnmounted`:

```ts
onMounted(async () => {
  if (!(await ensureValidToken())) { router.push('/login'); return }
  intervalId = setInterval(checkToken, 60000)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', checkToken)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('focus', checkToken)
})

// checkToken: se isTokenExpiringSoon() (< 5 min) → ensureValidToken(); se fallisce → router.push('/login')
```

---

### 5. Protezione delle route — navigation guard (`vue-app/src/router/index.ts`)

In React la protezione era un componente wrapper (`<ProtectedRoutes>` con `<Navigate>`/`<Outlet>`).
In Vue è un **navigation guard** sulle route con `meta: { requiresAuth: true }`:

```ts
const router = createRouter({
  history: createWebHistory(),
  routes: [
    // pubbliche
    { path: '/login', component: () => import('@/src/pages/LoginPage.vue') },
    { path: '/register', component: () => import('@/src/pages/RegisterPage.vue') },
    { path: '/oauth2/callback', component: () => import('@/src/pages/OAuthCallback.vue') },
    { path: '/share/:publicToken', component: () => import('@/src/pages/ShareAccessPage.vue') },
    // protette
    {
      path: '/',
      component: () => import('@/src/components/layout/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/src/pages/Homepage.vue') },
        { path: 'profile', component: () => import('@/src/pages/Profile.vue') },
        { path: 'settings', component: () => import('@/src/pages/SettingsPage.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  if (to.meta.requiresAuth) {
    const accessToken = Cookies.get('accessToken')
    const refreshToken = Cookies.get('refreshToken')
    if (!accessToken && !refreshToken) return { path: '/login' }
  }
})
```

---

### 6. Utility token (`vue-app/src/utils/getCurrentUser.ts`)

Funzioni di supporto per decodifica/scadenza token (es. `isTokenExpired`, usata sopra):

```ts
export const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = decodeToken(token)
    return decoded.exp < Math.floor(Date.now() / 1000)
  } catch {
    return true
  }
}

export const decodeToken = (token: string) => {
  const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  )
  return JSON.parse(json)
}
```

---

## Configurazione Cognito

### Client SDK (`vue-app/src/utils/cognitoClient.ts`)

```ts
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'

export const cognitoClient = new CognitoIdentityProviderClient({
  region: import.meta.env.VITE_COGNITO_REGION,
})

export const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
```

---

## Flussi di Autenticazione

### Login tradizionale
```
1. Utente inserisce email/password
2. InitiateAuthCommand con USER_PASSWORD_AUTH
3. Se ChallengeName → gestione challenge
4. Se AuthenticationResult → salva token, router.push('/')
```

### Google OAuth
```
1. Click "Login con Google"
2. Redirect a Cognito Hosted UI
3. Utente autorizza
4. Redirect a /oauth2/callback con code
5. Scambio code per tokens
6. Salva token, router.push('/')
```

### Refresh token
```
1. Token in scadenza (< 5 min)  → isTokenExpiringSoon()
2. useTokenManager rileva (interval 60s / focus / visibilitychange)
3. InitiateAuthCommand con REFRESH_TOKEN_AUTH
4. Nuovi token salvati + notifica
```

---

## Gestione Sessione

### Storage dei Token

| Token | Durata | Storage |
|-------|--------|---------|
| accessToken | 1 ora | Cookie |
| idToken | 1 ora | Cookie |
| refreshToken | 30 giorni | Cookie |

### Notifiche Sessione (`composables/useSessionNotifications.ts`)

```ts
const { showInfo, showWarning, showError } = useSessionNotifications()

showInfo('Sessione rinnovata con successo')
showError('Sessione scaduta. Effettua nuovamente il login.')
```

---

## Considerazioni di Sicurezza

1. **Token JWT** — firmati da Cognito e verificabili.
2. **HTTPS** — tutte le comunicazioni cifrate.
3. **Cookie Secure** — in produzione i cookie hanno flag `Secure`.
4. **Refresh Token Rotation** — non implementato (consigliato per produzione).
5. **Rate Limiting** — gestito da Cognito.

> Nota backend: la verifica della firma con `aws-jwt-verify` (`tokenUse: "access"`) è **implementata**
> in `middleware/auth.js` — vedi [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §2.

---

## Estrazione Dati Utente (`vue-app/src/utils/getCurrentUser.ts`)

```ts
export const getUserIdFromToken = (): string | null => {
  const token = Cookies.get('idToken')
  return token ? decodeToken(token).sub : null
}

export const getUserEmailFromToken = (): string | null => {
  const token = Cookies.get('idToken')
  return token ? decodeToken(token).email : null
}
```

---

*Questa documentazione copre il sistema di autenticazione completo di LeTransfer (frontend Vue).*
