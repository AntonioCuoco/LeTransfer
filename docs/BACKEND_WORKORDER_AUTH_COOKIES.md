# Backend — Work order: token di sessione fuori dalla portata di JavaScript

> ## ⏸️ NON INIZIATO — rinviato consapevolmente il 2026-08-16
>
> **Non è lavoro in corso.** Il difetto che descrive è reale e tuttora presente (`js-cookie` in
> 17 file), ma la decisione presa è di **rimandarlo al momento in cui il prodotto apre davvero
> al pubblico**. Le ragioni, per non doverle ricostruire:
>
> - La **CSP di produzione è attiva** dal 2026-08-16 ed è stretta (`script-src 'self'`, niente
>   `unsafe-inline`, nessun `eval` nel bundle, nessuna libreria da CDN, Turnstile isolato su
>   un'altra origine). È la difesa che *impedisce* la XSS; questo lavoro **limita il danno**
>   quando quella fallisce. Primo strato prima del secondo.
> - Non protegge comunque le **chiavi E2E**, che stanno in IndexedDB (vedi §1).
> - Oggi non ci sono utenti reali: sta proteggendo sessioni che non esistono.
>
> **Quando riprenderlo:** prima di aprire al pubblico. È anche il momento più economico —
> il rollout a taglio netto del §6 funziona solo finché non ci sono sessioni da migrare.
> Il prerequisito bloccante (§0, sottodominio API) è **già soddisfatto**.

> **Cos'è.** La specifica operativa per spostare l'autenticazione Cognito dal browser al backend
> Express, mettendo il **refresh token in un cookie `httpOnly`**. Pensato per essere passato al
> **repo Express (Fly.io)** e implementato così com'è.
>
> **Perché.** Oggi `accessToken`, `idToken` e `refreshToken` stanno in cookie scritti con `js-cookie`
> ([cookieStore.ts](../vue-app/src/utils/cookieStore.ts)): **leggibili da qualunque JavaScript sulla
> pagina**. Una singola XSS non ruba solo la sessione corrente — si porta via un refresh token valido
> 30 giorni, utilizzabile comodamente da un'altra macchina, anche dopo che l'utente ha chiuso tutto.
>
> Riferimenti: [PAGINE_CRITICHE.md](PAGINE_CRITICHE.md) · [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) ·
> [BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md)

---

## 0. Il vincolo che decide tutto: **stesso sito**

⚠️ **Da leggere prima di stimare il lavoro.** Un cookie `SameSite=Strict`/`Lax` viene inviato solo a
richieste *same-site*. Oggi il backend è su `*.fly.dev` e il frontend andrà su un altro dominio: sono
**siti diversi**, quindi il cookie di refresh **non partirebbe mai**.

Le uniche due strade:

| Opzione | Cosa comporta | Giudizio |
|---|---|---|
| **A. API su sottodominio del frontend** — `api.novren.net` (CNAME → Fly) | Cookie `SameSite=Lax` funzionanti, protezione CSRF quasi gratis | ✅ **Consigliata** |
| B. Domini diversi + `SameSite=None; Secure` | Il cookie parte cross-site, ma si perde la difesa CSRF nativa → serve token anti-CSRF esplicito su ogni mutazione | ❌ più lavoro e più superficie |

**Decisione da prendere per prima**: assegnare al backend un sottodominio del dominio del frontend.
Senza questo passo, il resto del documento non è implementabile come scritto.

> ✅ **FATTO il 2026-08-16.** Scelta l'opzione A: l'API risponde su **`api.novren.net`**
> (record `A`/`AAAA` verso gli IP Fly, **DNS only**, certificato Fly emesso). Il frontend è su
> `novren.net`: stesso sito, quindi un cookie `SameSite=Lax` viaggia.
> Aggiornati di conseguenza `VITE_API_URL` e `connect-src` in `vue-app/public/_headers`.
>
> ⚠️ I record sono **grigi** (non proxati), quindi `TRUST_PROXY_HOPS` resta `1`. Se un domani
> passano ad arancione, va portato a `2` — altrimenti il rate limit conta l'IP del proxy.
>
> ⚠️ Anche l'altro prerequisito è soddisfatto: la **CSP di produzione è attiva** dal 2026-08-16.
> L'ordine consigliato in §1 (prima la CSP, poi i cookie) è quindi rispettato.

> Corollario: i cookie vanno impostati **host-only** (nessun attributo `Domain=.novren.net`).
> Un cookie su tutto il dominio verrebbe inviato anche a `captcha.novren.net`, cioè proprio
> all'origine dove facciamo girare codice di terze parti. Oggi `js-cookie` li scrive host-only: deve restare così.

---

## 1. Cosa si guadagna — e cosa **non** si guadagna

Onestà necessaria, perché questo intervento viene spesso venduto per più di quello che è.

**Si guadagna:** un attaccante con XSS non può più **esfiltrare un refresh token** da riusare altrove
e più tardi. La compromissione torna a essere limitata alla finestra in cui la vittima ha la pagina aperta.

**NON si guadagna:** l'immunità dalla XSS. Con script in esecuzione sulla pagina, l'attaccante può
comunque chiamare `POST /api/auth/refresh` (il cookie parte da solo) e ottenere access token finché
la sessione vive. E **non protegge le chiavi E2E**, che stanno in IndexedDB e restano raggiungibili.

→ Per questo l'ordine giusto è: **prima la CSP** (impedisce l'esecuzione), **poi** questo lavoro
(limita il danno). Vedi [PAGINE_CRITICHE.md](PAGINE_CRITICHE.md).

Le tre mitigazioni che rendono l'intervento davvero utile, da implementare **insieme** al resto:
1. **Access token a vita breve** (15 min invece di 1 ora).
2. **Rotazione del refresh token a ogni uso** + **rilevamento del riuso**: se arriva un refresh già
   consumato, si revoca l'intera famiglia di sessioni. È così che si scopre un token rubato.
3. **Path scoping**: il cookie viaggia solo verso `/api/auth`, non verso tutte le API.

---

## 2. Design scelto

**Refresh token → cookie `httpOnly`. Access token → solo in memoria del frontend.**

L'access token continua a viaggiare nell'header `Authorization: Bearer`, esattamente come oggi: le
route esistenti non cambiano. Cambia solo *da dove* il frontend lo prende — non più da un cookie
leggibile, ma da una risposta tenuta in una variabile JS, mai persistita.

> Alternativa valutata e scartata: mettere **anche** l'access token in un cookie `httpOnly` e
> autenticare le route via cookie. Più pulito in teoria, ma introduce CSRF su ogni endpoint e obbliga
> a toccare tutte le route. Con `SameSite=Lax` sarebbe gestibile, ma non vale il rischio ora.

---

## 3. Endpoint da creare (repo Express)

Tutti sotto `/api/auth`, tutti **senza** `authenticateToken` (sono loro a crearla), tutti con
rate-limit per IP.

| Metodo | Rotta | Body | Risposta |
|---|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` | `{ accessToken, idToken, expiresIn }` + `Set-Cookie` refresh |
| `POST` | `/api/auth/challenge` | `{ session, email, newPassword }` | come sopra (flusso `NEW_PASSWORD_REQUIRED`) |
| `POST` | `/api/auth/refresh` | — (legge il cookie) | `{ accessToken, idToken, expiresIn }` + cookie ruotato |
| `POST` | `/api/auth/logout` | — | `204` + cookie cancellato + `GlobalSignOut` su Cognito |
| `POST` | `/api/auth/register` | `{ email, password, name }` | `{ ok: true }` |
| `POST` | `/api/auth/confirm` | `{ email, code }` | come `/login` (auto-accesso dopo conferma) |
| `POST` | `/api/auth/forgot-password` | `{ email }` | `202` **sempre** (non rivelare se l'utente esiste) |
| `POST` | `/api/auth/reset-password` | `{ email, code, newPassword }` | `204` |
| `POST` | `/api/auth/oauth/callback` | `{ code, codeVerifier }` | come `/login` (scambio PKCE lato server) |

**Attributi del cookie di refresh:**

```
Set-Cookie: lt_rt=<token>; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=2592000
```

- `HttpOnly` → invisibile a JavaScript (è il punto di tutto)
- `Secure` → solo HTTPS (in dev su http, accenderlo in base al protocollo come già fa il frontend)
- `SameSite=Lax` → possibile **solo** con l'opzione A del §0
- `Path=/api/auth` → non viene allegato alle chiamate su file, upload, condivisioni
- **nessun `Domain`** → host-only, vedi §0

---

## 4. Cognito: passare a un client confidenziale

Oggi l'app client è **pubblico** (nessun secret) perché girava nel browser. Spostando l'auth sul server:

- [ ] Creare un **nuovo app client con secret** (o abilitare il secret su quello esistente — cambia l'ID).
- [ ] Calcolare `SECRET_HASH` = Base64(HMAC-SHA256(`username` + `clientId`, `clientSecret`)) su
      `InitiateAuth`, `SignUp`, `ConfirmSignUp`, `ForgotPassword`, `RespondToAuthChallenge`.
- [ ] Env su Fly: `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`.
- [ ] Aggiungere `https://api.novren.net/api/auth/oauth/callback` alle **Callback URL** del client
      (il redirect di Google non torna più al frontend).
- [ ] **Dopo la migrazione**: disattivare `USER_PASSWORD_AUTH` sul client pubblico, così il vecchio
      percorso browser smette di funzionare invece di restare una porta aperta dimenticata.
- [ ] Password policy ≥12 caratteri con classi (già in [DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md)).

---

## 5. Modifiche lato frontend (repo Vue)

- [ ] **Rimuovere `@aws-sdk/client-cognito-identity-provider`** da `vue-app`. Tocca
      [LoginPage.vue](../vue-app/src/pages/LoginPage.vue), [RegisterPage.vue](../vue-app/src/pages/RegisterPage.vue),
      [OAuthCallback.vue](../vue-app/src/pages/OAuthCallback.vue), [cognitoClient.ts](../vue-app/src/utils/cognitoClient.ts),
      [axiosInterceptor.ts](../vue-app/src/utils/axiosInterceptor.ts).
- [ ] Nuovo store/composable `useAuth` che tiene l'access token **in memoria** (mai in cookie, mai in storage)
      e chiama `/api/auth/refresh` alla scadenza e all'avvio dell'app.
- [ ] `axiosInterceptor`: al `401` chiama `/api/auth/refresh` (con `withCredentials: true`) invece di
      parlare con Cognito. La coda delle richieste fallite resta com'è.
- [ ] `cookieStore.ts`: restano solo eventuali preferenze non sensibili; i token spariscono.
- [ ] Il router `beforeEach` non può più leggere il cookie per decidere: usa lo stato di `useAuth`
      (con un `refresh` tentato una volta all'avvio) invece di `Cookies.get('accessToken')`.
- [ ] `axios.defaults.withCredentials = true` per le chiamate a `/api/auth`.

### Due effetti collaterali, entrambi positivi

1. **CSP più stretta**: sparisce la necessità di `connect-src https://cognito-idp.<regione>.amazonaws.com`,
   perché il browser non parla più con AWS. Aggiornare [PAGINE_CRITICHE.md](PAGINE_CRITICHE.md).
2. **Meno codice sulle pagine critiche**: l'SDK AWS è una dipendenza grossa che oggi viene caricata anche
   dove si generano le chiavi. Toglierla riduce insieme peso del bundle e superficie della supply chain.

---

## 6. Rollout

Il prodotto non è ancora pubblico → **taglio netto**, niente doppio supporto. In ordine:

1. ✅ **Fatto (2026-08-16)** — Sottodominio API + certificato (§0)
2. Endpoint `/api/auth/*` sul backend + client Cognito confidenziale ⬅️ **il prossimo**
3. Frontend su `useAuth`, rimozione dell'SDK
4. Disattivazione di `USER_PASSWORD_AUTH` sul client pubblico
5. Invalidazione delle sessioni esistenti (i vecchi cookie non saranno più letti: gli utenti rifanno login)

---

## 7. Verifica

- [ ] Dopo il login, in console `document.cookie` **non** mostra il refresh token
- [ ] L'access token non compare in `localStorage`, `sessionStorage` né nei cookie
- [ ] Con la scheda aperta, alla scadenza dell'access token la sessione continua senza re-login
- [ ] `POST /api/auth/refresh` da un'altra origine (fetch cross-site) **non** riceve il cookie
- [ ] Un refresh token già usato → revoca della famiglia e `401` (rilevamento del riuso)
- [ ] `logout` invalida davvero: il vecchio refresh non funziona più
- [ ] `forgot-password` risponde `202` sia per email esistenti che inesistenti
- [ ] Il cookie **non** viene inviato a `captcha.novren.net` (host-only + Path)

---

*Creato il 2026-07-30. Prerequisito consigliato: CSP di produzione attiva ([PAGINE_CRITICHE.md](PAGINE_CRITICHE.md)).*
