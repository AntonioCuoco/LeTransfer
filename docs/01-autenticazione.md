# 🔐 Sistema di Autenticazione

## Overview

LeTransfer utilizza **AWS Cognito** come provider di autenticazione, supportando sia il login tradizionale (email/password) che OAuth con Google. Il sistema include gestione automatica del refresh token e protezione delle route.

---

## Architettura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  LoginPage   │    │ RegisterPage │    │   OAuthCallback      │  │
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
│  │  - accessToken (1h expiry)                                   │   │
│  │  - idToken (1h expiry)                                       │   │
│  │  - refreshToken (30 days expiry)                             │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │                  useTokenManager Hook                        │   │
│  │  - Token refresh automatico                                  │   │
│  │  - Controllo scadenza                                        │   │
│  │  - Redirect su logout                                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AWS Cognito                                 │
│  ┌─────────────────┐    ┌─────────────────┐                        │
│  │   User Pool     │    │  Identity Pool  │                        │
│  │  (Autenticaz.)  │    │  (per OAuth)    │                        │
│  └─────────────────┘    └─────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Componenti Coinvolti

### 1. LoginPage (`src/pages/LoginPage.tsx`)

Gestisce il flusso di login con:
- **Login tradizionale** via email/password
- **Google OAuth** tramite redirect
- **Password recovery** con invio email
- **Challenge handling** (es. NEW_PASSWORD_REQUIRED)

#### Funzioni Principali

```typescript
// Gestione login
const handleLogin = async () => {
    const command = new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: clientId,
        AuthParameters: {
            USERNAME: email,
            PASSWORD: password
        }
    });
    
    const response = await cognitoClient.send(command);
    
    if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
        // Gestione cambio password obbligatorio
        setShowChallenge(true);
    } else if (response.AuthenticationResult) {
        // Salvataggio token nei cookies
        const { AccessToken, IdToken, RefreshToken } = response.AuthenticationResult;
        Cookies.set('accessToken', AccessToken, { expires: 1/24 }); // 1h
        Cookies.set('idToken', IdToken, { expires: 1/24 });
        Cookies.set('refreshToken', RefreshToken, { expires: 30 });
        navigate('/');
    }
};

// Password recovery
const sendForgotEmail = async () => {
    const command = new ForgotPasswordCommand({
        ClientId: clientId,
        Username: forgotEmail
    });
    await cognitoClient.send(command);
    setForgotStep(2); // Mostra form per codice + nuova password
};
```

---

### 2. RegisterPage (`src/pages/RegisterPage.tsx`)

Gestisce la registrazione nuovo utente:

```typescript
// Registrazione
const signUp = async () => {
    const command = new SignUpCommand({
        ClientId: clientId,
        Username: email,
        Password: password,
        UserAttributes: [
            { Name: 'email', Value: email }
        ]
    });
    await cognitoClient.send(command);
    setConfirmPending(true);
};

// Conferma email
const confirmSignUp = async () => {
    const command = new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: email,
        ConfirmationCode: code
    });
    await cognitoClient.send(command);
    navigate('/login');
};
```

---

### 3. OAuthCallback (`src/pages/OAuthCallback.tsx`)

Gestisce il redirect dopo login Google:

```typescript
const OAuthCallback = () => {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        
        if (code) {
            // Scambio authorization code per tokens
            exchangeCodeForTokens(code);
        }
    }, []);
    
    const exchangeCodeForTokens = async (code: string) => {
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                code,
                redirect_uri: redirectUri
            })
        });
        
        const tokens = await response.json();
        // Salva tokens e redirect
    };
};
```

---

### 4. useTokenManager Hook (`src/hooks/useTokenManager.ts`)

Hook centrale per la gestione dei token:

#### Interfaccia

```typescript
interface TokenManagerState {
    isAuthenticated: boolean;
    isRefreshing: boolean;
    lastRefreshTime: number;
}

const useTokenManager = () => {
    return {
        isAuthenticated: boolean,
        isRefreshing: boolean,
        ensureValidToken: () => Promise<boolean>,
        refreshToken: () => Promise<boolean>,
        clearTokens: () => void
    };
};
```

#### Funzionalità

1. **Verifica Validità Token**
```typescript
const ensureValidToken = async (): Promise<boolean> => {
    const accessToken = Cookies.get('accessToken');
    
    if (!accessToken) {
        clearTokens();
        return false;
    }
    
    // Controlla scadenza
    if (!isTokenExpired(accessToken)) {
        return true;
    }
    
    // Token scaduto, prova refresh
    return await refreshToken();
};
```

2. **Refresh Automatico**
```typescript
const refreshToken = async (): Promise<boolean> => {
    const refreshTokenValue = Cookies.get('refreshToken');
    
    const command = new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: clientId,
        AuthParameters: {
            REFRESH_TOKEN: refreshTokenValue
        }
    });
    
    const response = await cognitoClient.send(command);
    
    if (response.AuthenticationResult) {
        updateTokens(
            response.AuthenticationResult.AccessToken,
            response.AuthenticationResult.IdToken
        );
        return true;
    }
    return false;
};
```

3. **Controllo Proattivo Scadenza**
```typescript
// Effect che controlla ogni minuto se il token sta per scadere
useEffect(() => {
    const interval = setInterval(async () => {
        if (isTokenExpiringSoon() && !state.isRefreshing) {
            showWarning('Sessione in scadenza, rinnovo automatico...');
            const success = await ensureValidToken();
            if (!success) {
                navigate('/login');
            }
        }
    }, 60000); // Ogni minuto
    
    return () => clearInterval(interval);
}, []);
```

---

### 5. ProtectedRoutes (`src/components/ProtectedRoutes/protectedRoutes.tsx`)

Wrapper per route che richiedono autenticazione:

```typescript
const ProtectedRoutes = () => {
    const accessToken = Cookies.get('accessToken');
    
    if (!accessToken || isTokenExpired(accessToken)) {
        return <Navigate to="/login" replace />;
    }
    
    return <Outlet />;
};
```

---

### 6. checkAuth Utility (`src/components/checkAuth/checkAuth.ts`)

Funzioni di supporto per la verifica token:

```typescript
interface DecodedToken {
    exp: number;
    sub: string;
    email: string;
    // ... altri campi
}

export const isTokenExpired = (token: string): boolean => {
    try {
        const decoded = decodeToken(token);
        const currentTime = Math.floor(Date.now() / 1000);
        return decoded.exp < currentTime;
    } catch {
        return true;
    }
};

export const decodeToken = (token: string): DecodedToken => {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
        atob(base64).split('').map(c => 
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')
    );
    return JSON.parse(jsonPayload);
};
```

---

## Configurazione Cognito

### Client SDK Setup (`src/utils/cognitoClient.ts`)

```typescript
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';

export const cognitoClient = new CognitoIdentityProviderClient({
    region: import.meta.env.VITE_COGNITO_REGION
});

export const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
```

---

## Flussi di Autenticazione

### Login Tradizionale
```
1. Utente inserisce email/password
2. InitiateAuthCommand con USER_PASSWORD_AUTH
3. Se ChallengeName → gestione challenge
4. Se AuthenticationResult → salva token, redirect
```

### Google OAuth
```
1. Click "Login con Google"
2. Redirect a Cognito Hosted UI
3. Utente autorizza
4. Redirect a /oauth2/callback con code
5. Scambio code per tokens
6. Salva token, redirect
```

### Refresh Token
```
1. Token in scadenza (< 5 min)
2. useTokenManager rileva
3. InitiateAuthCommand con REFRESH_TOKEN_AUTH
4. Nuovi token salvati
5. Notifica utente
```

---

## Gestione Sessione

### Storage dei Token

| Token | Durata | Storage |
|-------|--------|---------|
| accessToken | 1 ora | Cookie |
| idToken | 1 ora | Cookie |
| refreshToken | 30 giorni | Cookie |

### Notifiche Sessione (`useSessionNotifications`)

```typescript
const { showInfo, showWarning, showError } = useSessionNotifications();

// Utilizzo
showInfo('Sessione rinnovata con successo');
showWarning('Sessione in scadenza, rinnovo automatico...');
showError('Sessione scaduta. Effettua nuovamente il login.');
```

---

## Considerazioni di Sicurezza

1. **Token JWT** - I token sono firmati da Cognito e verificabili
2. **HTTPS** - Tutte le comunicazioni sono cifrate
3. **Cookie Secure** - In produzione i cookie hanno flag `Secure`
4. **Refresh Token Rotation** - Non implementato (consigliato per produzione)
5. **Rate Limiting** - Gestito da Cognito

---

## Utility per Estrazione Dati Utente

```typescript
// src/utils/authUtils.ts

export const getUserIdFromToken = (): string | null => {
    const token = Cookies.get('idToken');
    if (!token) return null;
    
    const decoded = decodeToken(token);
    return decoded.sub;
};

export const getUserEmailFromToken = (): string | null => {
    const token = Cookies.get('idToken');
    if (!token) return null;
    
    const decoded = decodeToken(token);
    return decoded.email;
};
```

---

*Questa documentazione copre il sistema di autenticazione completo di LeTransfer.*
