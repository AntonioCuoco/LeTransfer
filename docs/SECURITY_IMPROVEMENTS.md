# Security Improvements — LeTransfer

Analisi dell'implementazione E2E e dei meccanismi di sicurezza. L'architettura crittografica di base è corretta (AES-256-GCM, RSA-OAEP 4096, BIP39, PBKDF2, chiavi mai inviate al server), ma ci sono vulnerabilità nel layer che la circonda. Una catena E2E vale quanto il suo anello più debole: qui gli anelli deboli sono lo storage lato client, l'assenza di hardening XSS e l'autenticazione lato backend.

---

## 📐 Architettura backend (leggere prima)

Il backend è stato **consolidato**: le AWS Lambda + API Gateway sono state dismesse e tutta la logica è ora in un **unico backend Express su Fly.io** (mantenendo S3, DynamoDB, Cognito). Il frontend Vue punta già tutto a `VITE_API_URL`. Vedi [BACKEND_CONSOLIDATION.md](BACKEND_CONSOLIDATION.md) e [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md).

Conseguenze per questo documento:

- **`backend_infra/lambdas/` è codice morto** → gli interventi che nel piano originale riguardavano le lambda (**#7**, **#14**) **non vanno fatti qui**: si spostano sulle route Express.
- Questo repository è il **frontend Vue**. Alcuni interventi vivono nel **repo Express separato** o a livello di **hosting/infra** e sono segnalati come tali.

### I tre "ambiti" degli interventi

| Ambito | Dove si fa | Quando |
|--------|-----------|--------|
| 🖥️ **Frontend (DEV)** | questo repo (`vue-app/`) — codice | **Adesso** |
| 🌐 **Infra/PROD** | host che serve il build, https, CDN | Appena possibile (dopo DEV) |
| ⚙️ **Backend Express** | repo Express separato (Fly.io) | Appena possibile (dopo DEV) |

---

## 🎯 Approccio: prima DEV, poi PROD (appena possibile)

**Ora implementiamo tutto l'hardening lato codice frontend (binario DEV).** È la parte che sta in questo repo, non ha dipendenze esterne e si scrive in modo che l'hardening **si auto-attivi in produzione**.

**Subito dopo** va completato il **binario PROD/Infra + Backend Express**, che è obbligatorio perché è lì che vivono le difese di trasporto e l'autenticazione reale. Finché la prod non è fatta, l'app è hardenata solo "a metà".

### Cosa cambia tra DEV e PROD (ed è corretto che cambi)

| Difesa | In DEV | In PROD | Note |
|--------|--------|---------|------|
| Cookie `SameSite=strict` | ✅ attivo | ✅ attivo | uguale nei due ambienti |
| Cookie `Secure` | ❌ spento (http localhost) | ✅ acceso (https) | si scrive `secure: protocol==='https:'` → si accende da solo in prod |
| CSP + security headers | 🔸 rilassata/assente (o `vite preview`) | ✅ **stretta, autoritativa** | in dev una CSP stretta rompe l'HMR di Vite; l'enforcement vero è sull'host |
| CORS | origine `localhost` | dominio frontend prod | whitelist in `app.js` dell'Express |
| Verifica firma JWT | — | ✅ obbligatoria | è codice Express, uguale nei due ambienti ma critica in prod |

> **"In dev è meno sicuro?"** Sì, il transport hardening (Secure, CSP) è più debole in dev — ma **non è un rischio reale**: in dev il traffico non lascia `localhost` e gli utenti veri toccano solo la prod. Ciò che conta è che la **PROD sia hardenata al 100%**.

---

## 🔴 Critici

### 1. Chiave privata RSA salvata in `localStorage` in chiaro
**Ambito:** 🖥️ Frontend (DEV)
**File:** [useUserKeyPair.ts:30-36](vue-app/src/composables/useUserKeyPair.ts#L30-L36)

**Problema.** La private key RSA viene esportata in JWK e scritta in `localStorage` senza cifratura. `localStorage` è leggibile da qualsiasi script sul dominio: un XSS (anche da una dipendenza npm compromessa) può esfiltrare la chiave in modo silenzioso e permanente, decifrare retroattivamente i file condivisi e impersonare l'utente. Annulla la garanzia E2E sulla condivisione.

**Soluzione.** Chiave `extractable: false` conservata in **IndexedDB** come `CryptoKey` nativo. Una chiave non estraibile non è leggibile/esportabile da JS, nemmeno con XSS.

```ts
import { set, get } from 'idb-keyval'
await set('letransfer_private_key', privKey) // CryptoKey, non JWK
```
```ts
// crypto.ts — generateRSAKeyPair: extractable = false
crypto.subtle.generateKey({ name:'RSA-OAEP', modulusLength:4096, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256' },
  false, ['decrypt','unwrapKey'])
```

**✅ Design del backup deciso.** `crypto.subtle.wrapKey()` **richiede `extractable: true`** (come `exportKey`): quindi `wrapKey` da solo non basta, serve una finestra estraibile. Schema:
1. **Generazione:** coppia `extractable: true` (transitoria, solo in RAM).
2. **Backup immediato:** `wrapKey('jwk', privateKey, derivedAESKey, {name:'AES-GCM', iv})` con chiave AES da password (PBKDF2 600k, #4) → blob cifrato sul server. `wrapKey` invece di `exportKey` così il materiale grezzo non transita come oggetto JS.
3. **Storage runtime:** re-import della JWK come **`extractable: false`** in IndexedDB; scarta la copia estraibile.
4. **Runtime:** solo chiave non-estraibile (`decrypt`/`unwrapKey` non richiedono estraibilità). XSS può al massimo *usarla* finché la sessione è viva, **non esfiltrarla**.
5. **Cambio password:** si opera sul backup server (decifra con password attuale → copia estraibile transitoria → ri-cifra con nuova password), mai sulla chiave in IDB.

**Trappola:** salvare in IDB una chiave `extractable: true` non serve a nulla (XSS la rilegge da IDB e fa `exportKey`). Il punto è **`extractable: false`**, non il cambio di storage.
**Migrazione:** al primo avvio post-deploy leggi la JWK da localStorage → re-importa non-estraibile in IDB → cancella localStorage. Il backup server esistente resta valido.

---

### 15. Backend Express: JWT accettato senza verifica della firma
**Ambito:** ⚙️ Backend Express (PROD — appena possibile)
**File:** `middleware/auth.js` del repo Express (vedi [BACKEND_CONSOLIDATION.md](BACKEND_CONSOLIDATION.md) §5)

**Problema.** L'attuale `authenticateToken` dell'Express fa `jwt.decode()` **senza verificare la firma** del token. Un token **forgiato** (payload arbitrario, firma finta) viene accettato → un attaccante può impersonare qualsiasi utente su **tutte** le route protette (`req.user.sub` controllato dall'attaccante). Le vecchie Lambda usavano un JWT Authorizer Cognito che la firma la verificava: portando tutto su Express **senza** verifica, si è *regrediti* in sicurezza.

**Soluzione.** Verifica vera con `aws-jwt-verify` (Cognito), su **tutte** le route 🔑:
```js
import { CognitoJwtVerifier } from "aws-jwt-verify";
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID, tokenUse: "access", clientId: process.env.COGNITO_CLIENT_ID,
});
export async function authenticateToken(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Access token required" });
  try { req.user = await verifier.verify(token); next(); }
  catch { return res.status(403).json({ error: "Invalid token" }); }
}
```
> Nota `tokenUse`: coerente con la decisione #8 (accessToken). Se qualche route ha bisogno di `email`, quel claim è solo nell'idToken → valutare `tokenUse: "id"` o leggere l'email da Cognito/`Users`.

---

### 2. Token di sessione in cookie senza `Secure`/`SameSite`
**Ambito:** 🖥️ Frontend (DEV) — l'attributo `Secure` diventa effettivo solo in PROD (https)
**File:** 6 punti: [LoginPage.vue:55-57](vue-app/src/pages/LoginPage.vue#L55-L57), [RegisterPage.vue:70-72](vue-app/src/pages/RegisterPage.vue#L70-L72), [OAuthCallback.vue:26-28](vue-app/src/pages/OAuthCallback.vue#L26-L28), [axiosInterceptor.ts:32-33](vue-app/src/utils/axiosInterceptor.ts#L32-L33), [useTokenManager.ts:26-28](vue-app/src/composables/useTokenManager.ts#L26-L28)

**Problema.** Token Cognito (access/id/refresh) salvati con `js-cookie` senza attributi: viaggiano su http (no `Secure`), esposti a CSRF (no `SameSite`), leggibili da JS (no `HttpOnly` — stesso vettore XSS del #1). Il refresh a 30 giorni è il più pericoloso.

**Soluzione.** Helper centralizzato `vue-app/src/utils/cookieStore.ts`:
```ts
import Cookies from 'js-cookie'
// Secure fisso a true romperebbe il login su http://localhost in DEV → legarlo al protocollo
const secureOpts = { secure: window.location.protocol === 'https:', sameSite: 'strict' as const }
export const setAuthCookie = (n: string, v: string, days: number) => Cookies.set(n, v, { expires: days, ...secureOpts })
export const clearAuthCookies = () => ['accessToken','idToken','refreshToken'].forEach(c => Cookies.remove(c))
```
Sostituire tutte le 6 `Cookies.set` con `setAuthCookie`. `SameSite=strict` è attivo già in dev; `Secure` si accende da solo in prod (https). L'`HttpOnly` vero richiederebbe un BFF (evoluzione futura, non urgente).

---

### 3. Nessuna Content Security Policy (CSP)
**Ambito:** 🌐 Infra/PROD (autoritativa sull'host) — in DEV solo versione rilassata opzionale
**File:** hosting che serve il build; per il dev [vite.config.ts](vue-app/vite.config.ts)

**Problema.** Nessun header di sicurezza. Dato che un XSS compromette chiave privata e token (#1, #2), l'assenza di CSP è la mancanza che amplifica tutto il resto.

**Soluzione — PROD (autoritativa, sull'host/CDN che serve il frontend buildato):**
```
default-src 'self';
script-src 'self';
connect-src 'self' https://*.amazonaws.com https://cognito-idp.*.amazonaws.com <URL-API-Express> <bucket-S3>;
img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline';
frame-ancestors 'none';
```
+ `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
Il `connect-src` **deve** includere il dominio reale dell'API Express e il bucket S3, altrimenti le fetch/upload vengono bloccati.

**DEV.** Una CSP stretta rompe l'HMR di Vite (usa eval + websocket). In dev tenere una versione rilassata o applicarla solo su `vite preview`. **L'enforcement che conta è quello PROD.**

---

## 🟠 Alti

### 4. PBKDF2 100k anche sul backup con password utente
**Ambito:** 🖥️ Frontend (DEV) — richiede un piccolo campo lato Backend Express
**File:** [crypto.ts:6](vue-app/src/utils/crypto.ts#L6), [:129](vue-app/src/utils/crypto.ts#L129)

**Problema.** 100k iterazioni vanno bene per la Recovery Key (mnemonica a 256 bit), ma sono deboli per il backup cifrato con **password utente** (potenzialmente debole), attaccabile offline se un attaccante accede al DB. OWASP 2023: ≥600k per PBKDF2-SHA256.

**Soluzione.** Separare i percorsi:
```ts
export const PBKDF2_ITER_RECOVERY = 100_000
export const PBKDF2_ITER_PASSWORD = 600_000
export async function deriveKeyFromPassword(pwd: string, salt: Uint8Array, iterations = PBKDF2_ITER_PASSWORD) { /* usa iterations */ }
```
- backup password → 600k; recovery key (`recovery-key.ts`) → 100k.

> **Trappola (backward-compat):** alzare a 600k **rompe i backup password esistenti** (creati a 100k). Aggiungere un campo `iterations` al record `KeyPairBackup`: in decrypt usa il valore salvato (assente ⇒ 100k = vecchio formato), in encrypt scrivi 600k. ⚙️ Lo storage del backup lato **Express** deve accettare il nuovo campo (di norma è un blob opaco → basta accettare il JSON esteso).

---

### 5. Chiave pubblica del destinatario non verificata (MITM lato server)
**Ambito:** 🖥️ Frontend (DEV) — **rinviato a fine roadmap** (dettaglio in [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md))
**File:** [useShareFile.ts:34-37](vue-app/src/composables/useShareFile.ts#L34-L37), [useUserKeyPair.ts:120-126](vue-app/src/composables/useUserKeyPair.ts#L120-L126)

**Problema.** La file key viene wrappata con la chiave pubblica RSA del destinatario scaricata dal server, senza verifica: un server malevolo può restituire la propria chiave e fare MITM trasparente. È il PKI trust problem.

**Soluzione (sintesi).** (1) documentare il trust model; (2) UI **fingerprint** SHA-256 della JWK pubblica, verifica out-of-band, opt-in; (3) key transparency (roadmap lontana). Dettaglio, trade-off e file impattati: [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md).

---

### 6. File cifrato/decifrato interamente in RAM (upload + download)
**Ambito:** 🖥️ Frontend (DEV) — breaking change formato; tocca un campo metadati lato Express
**File upload:** [useS3MultipartUpload.ts:231-266](vue-app/src/composables/useS3MultipartUpload.ts#L231-L266). **File download:** [useFileFromDynamoDB.ts:143-153](vue-app/src/composables/useFileFromDynamoDB.ts#L143-L153), [ShareAccessPage.vue:74-77](vue-app/src/pages/ShareAccessPage.vue#L74-L77)

**Problema.** Il file viene cifrato/decifrato come un unico blob GCM in RAM: OOM su file grandi (annulla il senso del multipart) e nessuna integrità per-chunk. Esistono già `encryptChunk`/`decryptChunk` con AAD sull'indice ([crypto.ts:44-58](vue-app/src/utils/crypto.ts#L44-L58)) ma non sono collegati.

**Soluzione.** Cifrare ogni chunk con IV unico + AAD=indice, prefissando l'IV al chunk. Va aggiornato **upload + download + preview** insieme, con **versioning del formato** (campo `formatVersion` nei metadati DynamoDB, scritto dall'Express in `complete`), altrimenti i file esistenti diventano illeggibili. È una breaking change → pianificata a parte.

---

## 🟡 Medi

### 7. ~~CORS wildcard + error leak nelle lambda~~ → SUPERATO, si sposta sull'Express
**Ambito:** 🌐 Infra/PROD + ⚙️ Backend Express (le lambda sono codice morto)

Le 4 lambda avevano `Access-Control-Allow-Origin: *` e leak di `error.message`. **Non vanno più corrette lì** (dismesse). Gli equivalenti sull'Express:
- **CORS:** whitelist in `app.js` con l'origine del frontend (dev: `localhost`; prod: dominio reale) — vedi [BACKEND_CONSOLIDATION.md](BACKEND_CONSOLIDATION.md) §8.5.
- **Error leak:** le route non devono rispondere con dettagli interni/`error.message`; loggare server-side, rispondere generico.

---

### 8. Incoerenza token: accessToken vs idToken
**Ambito:** 🖥️ Frontend (DEV)
**File:** [axiosInterceptor.ts:44-50](vue-app/src/utils/axiosInterceptor.ts#L44-L50) + composable

**Problema.** L'interceptor globale impone sempre l'accessToken, ma molti composable aggiungono manualmente `Bearer idToken`: l'interceptor vince, quindi il codice a idToken è di fatto ignorato.

**✅ Decisione: accessToken.** Le route Express leggono solo il `sub`, presente in entrambi i token → si standardizza sull'accessToken.
1. Rimuovere gli header manuali `Bearer idToken` (e le `Cookies.get('idToken')` usate per gli header) da: `useShareFile`, `useUserKeyPair`, `useFileFromDynamoDB`, `useFileKeysAPI`, `useRecoveryKeyAPI`, `useProfileImage`, `useSharedLinks` → affidarsi all'interceptor.
2. Interceptor invariato (inietta accessToken).
3. ⚠️ **Caveat S3:** le richieste verso URL S3 presigned devono usare un'istanza axios **senza interceptor** (come già [useS3MultipartUpload.ts:59](vue-app/src/composables/useS3MultipartUpload.ts#L59)). Il PUT S3 in [useFileFromDynamoDB.ts:90](vue-app/src/composables/useFileFromDynamoDB.ts#L90) usa l'axios globale → spostarlo su istanza dedicata, altrimenti l'`Authorization` finisce (e fa leak) verso S3.

> Coordinare con #15: se l'Express verifica `tokenUse: "access"`, il frontend deve mandare l'accessToken (coerente con questa decisione).

---

### 9. Nessun legame crittografico tra wrapped key e file
**Ambito:** 🖥️ Frontend (DEV)
**File:** [encryption.ts](vue-app/src/stores/encryption.ts) — `storeKey`/`getKey`, [crypto.ts:158-170](vue-app/src/utils/crypto.ts#L158-L170)

`s3Key` non è inclusa come AAD nel wrapping delle file key: un server malevolo può scambiare le entry (l'unwrap non fallisce, ma l'utente decifra il file sbagliato — integrità, non confidenzialità). **Fix:** includere `s3Key` come `additionalData` in `wrapFileKey`/`unwrapFileKey`.

---

### 13. `crypto-js` con KDF debole — ed è codice morto
**Ambito:** 🖥️ Frontend (DEV)
**File:** [utils.ts:4-14](vue-app/src/utils/utils.ts#L4-L14), [vite.config.ts:30](vue-app/vite.config.ts#L30), [package.json:21](vue-app/package.json#L21)

`encryptPayload`/`decryptPayload` usano `CryptoJS.AES` con chiave-stringa (KDF = EVP_BytesToKey, MD5×1 — debolissimo) e **non sono usate da nessuna parte**. Crypto debole + dipendenza morta. **Fix:** rimuovere le funzioni, la dipendenza `crypto-js`/`@types/crypto-js` e il chunk `crypto` in `vite.config.ts`. La crittografia reale usa già Web Crypto.

---

## 🟢 Minori

### 10. `keyCache` reattivo — visibile in Vue DevTools
**Ambito:** 🖥️ Frontend (DEV) — [encryption.ts:11](vue-app/src/stores/encryption.ts#L11). Usare `shallowRef` e svuotarlo su logout **e** idle-timeout.

### 11. Cookie senza attributi anche in logout/refresh
**Ambito:** 🖥️ Frontend (DEV) — coperto dall'helper del #2: verificare che **ogni** `Cookies.set` passi da `setAuthCookie` (incluso il refresh in [axiosInterceptor.ts:32-33](vue-app/src/utils/axiosInterceptor.ts#L32-L33)).

### 12. Validazione password solo lato client
**Ambito:** 🌐 Infra/Cognito (PROD) — [LoginPage.vue:38](vue-app/src/pages/LoginPage.vue#L38). Verificare/rafforzare la password policy **server-side** della User Pool Cognito (≥12, maiusc/minusc/numeri/simboli). La validazione client è UX, non sicurezza.

---

## Riepilogo priorità

| # | Problema | Ambito | Impatto | Costo |
|---|----------|--------|---------|-------|
| 15 | Express: JWT senza verifica firma | ⚙️ Express | **Critico** — impersonazione su tutte le route | Basso (`aws-jwt-verify`) |
| 1 | Private key RSA in localStorage | 🖥️ Frontend | Critico — rompe E2E condivisione | Medio (IDB + backup) |
| 2 | Cookie senza Secure/SameSite | 🖥️ Frontend | Critico — token esfiltrabili | Basso |
| 3 | Nessuna CSP | 🌐 Infra/PROD | Critico — amplifica XSS | Basso (config host) |
| 4 | PBKDF2 100k su password | 🖥️ Frontend | Alto — backup attaccabile offline | Basso |
| 5 | No verifica chiave destinatario | 🖥️ Frontend | Alto — MITM server-side | Alto (rinviato) |
| 6 | Cifratura intero file in RAM | 🖥️ Frontend | Alto — OOM + no integrità chunk | Medio (breaking) |
| 7 | CORS/error leak (→ Express) | 🌐/⚙️ | Medio | Basso |
| 8 | Incoerenza accessToken/idToken | 🖥️ Frontend | Medio | Basso |
| 9 | No AAD con s3Key | 🖥️ Frontend | Medio — integrità chiavi | Basso |
| 13 | crypto-js debole (morto) | 🖥️ Frontend | Basso | Basso |
| 10-12 | Minori | 🖥️/🌐 | Basso | Basso |
| 14 | Auth endpoint multipart | ⚙️ Express | (assorbito da #15 + ownership) | vedi rinviati |

---

## Piano d'esecuzione — due binari

### 🖥️ BINARIO DEV — repo frontend (ADESSO)
Tutto codice in `vue-app/`, nessuna dipendenza esterna. Ordine consigliato (dal più isolato al più delicato):

**Fase 0 — Quick wins (una PR, nessuna breaking change)**
- **#13** — rimuovere `crypto-js`, `@types/crypto-js`, funzioni morte, chunk `crypto`.
- **#4** — PBKDF2 separato (100k recovery / 600k password) + campo `iterations` nel backup.
- **#2 + #11** — helper `cookieStore.ts` (`secure: protocol==='https:'`, `sameSite: 'strict'`) su tutte le 6 `Cookies.set`.
- **#8** — unificare su accessToken: rimuovere header manuali idToken + spostare il PUT S3 di `useFileFromDynamoDB` su istanza axios senza interceptor.
- **#3 (parte dev)** — CSP rilassata in `vite.config.ts`/`vite preview` (la versione autoritativa è nel binario PROD).

**Fase 1 — Chiavi (richiede migrazione)**
- **#1 + #9** — private key `extractable:false` in IndexedDB, backup estraibile-on-demand + `wrapKey`, migrazione da localStorage; AAD `s3Key` in `wrapFileKey`/`unwrapFileKey`.

**Fase 2 — Streaming encryption (breaking change formato)**
- **#6** — `encryptChunk`/`decryptChunk` in upload + download + preview, con `formatVersion`.

**Fase 3 — Minori**
- **#10** `keyCache` → `shallowRef` + idle-timeout.

### 🌐⚙️ BINARIO PROD / INFRA / EXPRESS — appena possibile (dopo DEV)
Non in questo repo: repo Express + hosting. **Obbligatorio per essere davvero sicuri in produzione.**
- **#15** — verifica vera del JWT con `aws-jwt-verify` su tutte le route 🔑. *(Critico.)*
- **#3 (autoritativa)** — CSP + security headers sull'host/CDN che serve il build.
- **#7** — CORS whitelist Express con l'origine prod + niente `error.message` nelle risposte.
- **#14** — sulle route multipart Express: auth già presente (🔑, dipende da #15) + **ownership** sul prefisso `uploads/files/${sub}/` + non fidarsi del `userId` dal body (usare `req.user.sub`).
- **#12** — password policy server-side su Cognito.
- **HTTPS ovunque** in prod → accende automaticamente i cookie `Secure` (#2).

### 🏁 Rinviati a fine roadmap
- **#5** — verifica chiave destinatario (fingerprint UI). Dettaglio: [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md).

---

*Generato il 2026-06-21. Aggiornato il 2026-06-27: struttura DEV/PROD, allineamento al backend Express (lambda dismesse → #7/#14 spostati su Express), nuovo critico #15 (JWT non verificato), piano a due binari.*
*La crittografia di base (AES-256-GCM, RSA-OAEP 4096, BIP39, PBKDF2, zero-knowledge URL fragment) è corretta — i problemi sono nel layer di hardening, nell'autenticazione backend e nel transport.*
