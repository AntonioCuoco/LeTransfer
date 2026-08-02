# 🔒 Pagine critiche — regole non negoziabili

> **Cos'è questo file.** LeTransfer promette che il server non può leggere i file. Quella promessa
> non vive nel backend: vive **nelle poche pagine del frontend dove nascono e si usano le chiavi**.
> Su quelle pagine valgono regole più severe che sul resto dell'app. Questo documento le fissa,
> perché il modo tipico in cui un prodotto E2E perde la sua promessa non è un attacco: è una PR
> ragionevole che aggiunge analytics alla landing.
>
> Riferimenti: [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md) · [DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md)

---

## Quali sono

| Rotta | Perché è critica |
|---|---|
| `/` ([LandingPage](../vue-app/src/pages/LandingPage.vue) + [GuestSendWidget](../vue-app/src/components/landing/GuestSendWidget.vue)) | Qui `generateAESKey()` crea la chiave dell'invio guest e la cifratura avviene in pagina |
| `/share/:publicToken` ([ShareAccessPage](../vue-app/src/pages/ShareAccessPage.vue)) | Qui la chiave arriva dal fragment `#` e il file viene decifrato |
| `/app` e figlie (dashboard) | Qui vive la chiave privata RSA (IndexedDB, non estraibile) e si wrappano le chiavi dei file |
| `/login`, `/register` | Qui transitano le credenziali dell'account |

---

## Le regole

### 1. Nessuno script di terze parti. Mai.

Uno script caricato da un dominio altrui gira **nella nostra origine**: vede il DOM, la memoria,
e può agganciare `crypto.subtle` prima che venga usato. Su queste pagine è vietato:

- ❌ analytics (Google Analytics, Plausible embed, Hotjar, PostHog…)
- ❌ widget di chat / supporto (Intercom, Crisp, Tawk…)
- ❌ font, CSS o icone da CDN
- ❌ pixel pubblicitari, A/B testing, heatmap
- ❌ SDK di pagamento incorporati in pagina (Stripe.js va usato **solo** su una rotta non critica)

**Se serve davvero qualcosa di esterno, si isola in un iframe cross-origin.** È ciò che facciamo
con Turnstile: vedi [public/captcha.html](../vue-app/public/captcha.html) e
[useTurnstile.ts](../vue-app/src/composables/useTurnstile.ts). Il cross-origin nega l'accesso al
documento genitore; la comunicazione passa solo per `postMessage` con origine validata **in entrambe
le direzioni**.

> ⚠️ Un **Web Worker non isola**: è same-origin, e uno script ostile in pagina può agganciare
> `Worker`, `postMessage` o `crypto.subtle` prima che parta. L'unico confine reale è l'origine.

### 2. Analytics: solo lato server, solo aggregate

Se serve sapere quanti invii ci sono stati, lo si conta nel backend. Nessun conteggio in pagina.

### 3. Nuove dipendenze npm: si guarda cosa fanno a runtime

Il bundle è codice nostro a tutti gli effetti. Prima di aggiungere un pacchetto usato su queste rotte:
- serve davvero? esiste in piattaforma? (es. `crypto.subtle` invece di una libreria crypto)
- quante dipendenze transitive porta?
- fa richieste di rete a runtime? tocca `document`/`window` in modo inatteso?
- il lockfile è committato e la CI usa `npm ci` (mai `npm install`)

### 3-bis. La crittografia sta solo in `src/crypto/`

Ogni riga che tocca chiavi o ciphertext vive in [src/crypto/](../vue-app/src/crypto/), con la
specifica in [README.md](../vue-app/src/crypto/README.md). Non spargere crypto nei componenti:
il confine esiste perché chi vuole verificare le nostre affermazioni possa leggere **una cartella**.
Regole della cartella: nessuna dipendenza da Vue/store/rete/DOM, nessuna libreria crittografica di
terzi (solo Web Crypto), ogni cambio di formato passa da un numero di versione, README aggiornato
nello stesso commit.

### 4. Le chiavi non si loggano, non si serializzano, non si persistono

- Mai `console.log` di `CryptoKey`, chiavi esportate, fragment dell'URL o `manageToken`.
- La chiave privata RSA resta **non estraibile** in IndexedDB.
- La chiave di un invio guest esiste solo in memoria e nel fragment `#`: **non** in storage.
- Storage lato client: contenitore minimo necessario e motivazione scritta nel file
  (vedi [usePendingClaim.ts](../vue-app/src/composables/usePendingClaim.ts) e
  [useVerifiedKeys.ts](../vue-app/src/composables/useVerifiedKeys.ts)).

### 5. Il fragment `#` non deve mai raggiungere il server

Il browser non lo invia — è il fondamento dello schema. Quindi vietato:
- ❌ redirect lato server sui link `/share/...` (il fragment si perde e la chiave con esso)
- ❌ URL shortener o link brandizzati che rimbalzano
- ❌ mettere la chiave in query string "per comodità"

---

## CSP di produzione

La CSP autoritativa **non** sta in `vite.config.ts` (romperebbe l'HMR): va impostata sull'host/CDN
che serve il build di produzione. Valore di riferimento, da adattare ai domini reali:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' https://<account>.r2.cloudflarestorage.com https://cognito-idp.<regione>.amazonaws.com;
frame-src https://captcha.letransfer.app;
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
form-action 'self';
upgrade-insecure-requests
```

Note che spiegano le scelte, e i due punti dolenti:

- **`script-src 'self'` senza eccezioni** è possibile *solo* grazie all'isolamento di Turnstile:
  prima serviva ammettere `challenges.cloudflare.com`. Non riaggiungerlo.
- **`connect-src` deve includere Cognito**: l'autenticazione avviene nel browser con l'SDK AWS.
  Se un domani si spostasse l'auth nel backend (cookie `httpOnly`), questa voce sparisce.
- **`connect-src` deve includere l'host R2**: le presigned URL puntano lì.
- ⚠️ **`style-src 'unsafe-inline'` è un compromesso**: PrimeVue in modalità *styled* inietta CSS a
  runtime. Per toglierlo servirebbe passare a nonce per gli stili o a CSS precompilato — è un lavoro
  aperto. Gli stili inline sono molto meno pericolosi degli script, ma non è "pulito": va saputo.
- `blob:` in `img-src` serve alle anteprime decifrate localmente.

**L'origine del captcha ha una CSP diversa e più permissiva** (deve poter caricare
`challenges.cloudflare.com`): è esattamente il punto: quella pagina non contiene niente da proteggere.

---

## Checklist per una PR che tocca queste rotte

- [ ] Nessun nuovo `<script src>` verso domini terzi, nessun `@import` da CDN
- [ ] Nessuna nuova dipendenza che fa rete a runtime
- [ ] Nessun log/serializzazione di chiavi, fragment o token di gestione
- [ ] Se è stato aggiunto uno storage lato client: contenitore giustificato nel commento
- [ ] La CSP di produzione regge ancora (in particolare `script-src 'self'`)
- [ ] `npm ci && npm run build` pulito

---

*Creato il 2026-07-30, quando Turnstile è stato spostato in un'origine isolata.*
