# Security Improvements — LeTransfer

Analisi dell'implementazione E2E e dei meccanismi di sicurezza. L'architettura crittografica di base è corretta (AES-256-GCM, RSA-OAEP 4096, BIP39, PBKDF2, chiavi mai inviate al server), ma ci sono vulnerabilità nel layer che la circonda. Una catena E2E vale quanto il suo anello più debole: qui gli anelli deboli sono lo storage lato client e l'assenza di hardening XSS.

---

## 🔴 Critici

### 1. Chiave privata RSA salvata in `localStorage` in chiaro

**File:** `vue-app/src/composables/useUserKeyPair.ts` — righe 30-36

**Problema**

Al momento la private key RSA dell'utente viene esportata in formato JWK (JSON) e scritta in `localStorage` senza alcuna cifratura:

```ts
const saveToLocalStorage = async (pubKey: CryptoKey, privKey: CryptoKey) => {
  const privateKeyJWK = await exportPrivateKeyToJWK(privKey)
  localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, JSON.stringify(privateKeyJWK)) // ← chiave in chiaro
}
```

`localStorage` è accessibile da qualsiasi script JavaScript in esecuzione nel dominio. Un attacco XSS — anche minimo, anche da una dipendenza npm compromessa (ant-design, sweetalert2, aws-sdk ecc.) — può leggere e esfiltrare la chiave privata in modo silenzioso e permanente. Con la private key in mano, l'attaccante può decifrare retroattivamente tutti i file condivisi via email (il wrapped AES key è sul server) e impersonare l'utente per condivisioni future. Questo annulla interamente la garanzia E2E sulla funzione di condivisione.

**Soluzione**

Rendere la chiave `extractable: false` e conservarla in IndexedDB come oggetto `CryptoKey` nativo (la Web Crypto API lo permette). Una chiave non estraibile non può essere letta o esportata dal codice JavaScript, nemmeno in caso di XSS.

```ts
// Invece di exportKey + localStorage.setItem, usare IDBKeyVal o idb:
import { set, get } from 'idb-keyval'

const saveKeys = async (pubKey: CryptoKey, privKey: CryptoKey) => {
  await set('letransfer_public_key', pubKey)
  await set('letransfer_private_key', privKey)  // salvato come CryptoKey, non come JWK
}

const loadKeys = async () => {
  const pubKey = await get<CryptoKey>('letransfer_public_key')
  const privKey = await get<CryptoKey>('letransfer_private_key')
  return pubKey && privKey ? { pubKey, privKey } : null
}
```

E la generazione deve passare `extractable: false`:

```ts
// In crypto.ts — generateRSAKeyPair:
crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
  false,  // ← non estraibile
  ['decrypt', 'unwrapKey']
)
```

Nota: se la chiave non è estraibile, il meccanismo di `backupToServer` (che esporta la private key per cifrarla con password) deve essere riprogettato — ad esempio generando la coppia estraibile solo al momento del backup esplicito, o usando `wrapKey` direttamente con la derived key invece di `exportKey`.

---

### 2. Token di sessione in cookie senza `Secure`, `SameSite`, né `HttpOnly`

**File:** `vue-app/src/pages/LoginPage.vue` righe 55-57, `vue-app/src/pages/OAuthCallback.vue` righe 26-28

**Problema**

Tutti i token Cognito (access, id, refresh) vengono salvati con `js-cookie` senza attributi di sicurezza:

```ts
Cookies.set('accessToken', AccessToken, { expires: 1 / 24 })   // nessun Secure, SameSite
Cookies.set('refreshToken', RefreshToken, { expires: 30 })       // 30 giorni, leggibile da JS
```

Conseguenze:
- **Senza `Secure`**: il cookie viaggia anche su HTTP (su reti non cifrate il token è in chiaro).
- **Senza `SameSite`**: esposto ad attacchi CSRF.
- **Senza `HttpOnly`**: leggibile da JavaScript → stesso vettore XSS del punto 1. Il refresh token a 30 giorni è particolarmente pericoloso.

**Soluzione**

Aggiungere gli attributi a tutte le `Cookies.set` nell'intera codebase:

```ts
const cookieOptions = { secure: true, sameSite: 'strict' as const }

Cookies.set('accessToken', AccessToken, { expires: 1/24, ...cookieOptions })
Cookies.set('idToken', IdToken,         { expires: 1/24, ...cookieOptions })
Cookies.set('refreshToken', RefreshToken, { expires: 30, ...cookieOptions })
```

Idealmente il refresh token andrebbe gestito server-side con `HttpOnly` (non leggibile da JS), ma con Cognito client-side questo richiede un layer BFF (Backend For Frontend) — è un'evoluzione architetturale, non necessariamente urgente. Come minimo, `Secure` + `SameSite: strict` va fatto subito.

---

### 3. Nessuna Content Security Policy (CSP)

**File:** `vue-app/index.html`

**Problema**

`index.html` non ha alcun header o meta-tag di sicurezza. Non c'è CSP, non c'è `X-Content-Type-Options`, non c'è `X-Frame-Options`. Dato che un XSS su questo dominio compromette chiave privata e token (punti 1 e 2), l'assenza di CSP è una mancanza critica: è la difesa di profondità che protegge tutto il resto.

**Soluzione**

Configurare gli header a livello di server/CDN (CloudFront, API Gateway, o il server che serve l'app). Per il dev locale, usarli in `vite.config.ts`:

```ts
// vite.config.ts
server: {
  headers: {
    'Content-Security-Policy':
      "default-src 'self'; " +
      "script-src 'self'; " +         // niente unsafe-inline, niente unsafe-eval
      "connect-src 'self' https://*.amazonaws.com https://*.cognito.*.amazonaws.com; " +
      "img-src 'self' data:; " +
      "style-src 'self' 'unsafe-inline';",  // unsafe-inline serve a Tailwind/Ant Design
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
}
```

In produzione questi header vanno impostati a livello CloudFront (Response Headers Policy) o Lambda@Edge. Verificare anche che nel codice Vue non esista nessun `v-html` alimentato con dati non fidati — è il vettore XSS più comune in Vue.

---

## 🟠 Alti

### 4. PBKDF2 con 100.000 iterazioni sul backup della keypair

**File:** `vue-app/src/utils/crypto.ts` — riga 131

**Problema**

`deriveKeyFromPassword` usa 100.000 iterazioni di PBKDF2-SHA256. Questo valore è corretto per la **Recovery Key** (dove l'input è una mnemonica a 256 bit di entropia — il brute force è impossibile), ma viene usato anche per proteggere il **backup della private key con password utente** ([useUserKeyPair.ts:113](vue-app/src/composables/useUserKeyPair.ts#L113)), dove la password potrebbe essere debole.

Il backup cifrato è salvato sul server. Con accesso al DB, un attaccante può fare brute-force offline: OWASP 2023 raccomanda ≥600.000 iterazioni per PBKDF2-SHA256, e con hardware moderno (GPU) 100k si attaccano rapidamente su password comuni.

**Soluzione**

Separare il percorso di derivazione: mantenere 100k (o meno) per la Recovery Key (già sicura per entropia), alzare a **600.000+** per la password utente, o preferibilmente passare ad **Argon2id** (resistente a GPU e ASIC):

```ts
// Opzione A: alzare le iterazioni
const PBKDF2_ITERATIONS_FILE = 100_000   // per Recovery Key (entropia alta)
const PBKDF2_ITERATIONS_PWD  = 600_000  // per password utente (entropia bassa)

// Opzione B: Argon2id via WASM (argon2-browser)
import argon2 from 'argon2-browser'
const result = await argon2.hash({
  pass: password, salt,
  type: argon2.ArgonType.Argon2id,
  mem: 65536, time: 3, parallelism: 1,
})
```

---

### 5. Chiave pubblica del destinatario non verificata (trust-on-first-use implicito)

**File:** `vue-app/src/composables/useUserKeyPair.ts` righe 120-126, `vue-app/src/composables/useShareFile.ts` righe 36-39

**Problema**

Quando si condivide un file via email, la file key viene wrappata con la chiave pubblica RSA del destinatario scaricata dal server:

```ts
const recipientPublicKey = await getRecipientPublicKey(targetEmail)  // fiducia cieca
const encryptedAESKey = await wrapKeyWithPublicKey(aesKey, recipientPublicKey)
```

Non c'è nessuna verifica che la chiave restituita dal server sia davvero quella del destinatario. Un server compromesso (o malevolo) può restituire la propria chiave pubblica: intercetta la file key, la decifra, e la ri-wrappa per il vero destinatario. MITM trasparente che annulla completamente la garanzia E2E sulla condivisione.

Questo è un limite architetturale noto (PKI trust problem) che tutti i sistemi E2E devono affrontare. Le soluzioni esistono ma hanno costo:

**Soluzioni possibili (in ordine di complessità):**

1. **Documentare esplicitamente il trust model**: la condivisione E2E è E2E-in-transit ma trusts-the-server per la distribuzione delle chiavi. È già così, va solo scritto chiaramente nella security policy.
2. **Key fingerprint UI**: mostrare all'utente il fingerprint della chiave pubblica del destinatario (SHA-256 della JWK pubblica) e chiedere di verificarlo out-of-band prima della condivisione.
3. **Key transparency / signed key directory**: il server firma le chiavi con una chiave di log immutabile (simile a Certificate Transparency). Soluzione robusta ma complessa.

---

### 6. Il file viene cifrato interamente in RAM prima del multipart upload

**File:** `vue-app/src/composables/useS3MultipartUpload.ts` righe 231-266, `vue-app/src/utils/crypto.ts` righe 37-42

**Problema**

```ts
const { encrypted: encryptedBlob, iv: encryptionIV } = await encryptFile(file, encryptionKey)
// ↑ carica l'intero file in RAM con file.arrayBuffer(), lo cifra come un unico blob GCM
// poi lo affetta in chunk per il multipart
```

Questo crea due problemi:
- **Out Of Memory su file grandi**: il multipart esiste esattamente per non tenere file grandi in RAM. Cifra-tutto-poi-chunking annulla il vantaggio.
- **No integrità per-chunk**: con un unico tag GCM sull'intero file, non puoi verificare l'integrità di un chunk prima di averli scaricati tutti. Un chunk corrotto o sostituito si scopre solo alla decifratura finale.

Esiste già il design corretto in `crypto.ts` — `encryptChunk`/`decryptChunk` usano AAD con l'indice del chunk per prevenire riordino — ma non è usato da nessuna parte. Il codice è scritto, va solo collegato.

**Soluzione**

Cifrare ogni chunk separatamente con IV unico e AAD = indice:

```ts
// In useS3MultipartUpload.ts, dentro il loop di preparazione parti:
for (let i = 0; i < totalParts; i++) {
  const start = i * chunkSize
  const rawChunk = await file.slice(start, start + chunkSize).arrayBuffer()
  const chunkIV = generateIV()       // IV unico per chunk
  const encryptedChunk = await encryptChunk(rawChunk, encryptionKey, chunkIV, i)

  // Prefissa l'IV al chunk cifrato (12 bytes) così il receiver sa quale IV usare
  const withIV = new Uint8Array(12 + encryptedChunk.byteLength)
  withIV.set(chunkIV)
  withIV.set(new Uint8Array(encryptedChunk), 12)

  newQueue.push({ partNumber: i + 1, chunk: new Blob([withIV]), retries: 0 })
}
```

Attenzione: cambia il formato del blob su S3, quindi va aggiornato anche il download/decrypt in modo coordinato. È una breaking change sul formato dei file esistenti — va pianificata con versioning del formato o migrazione.

---

## 🟡 Medi

### 7. CORS wildcard e leak errori interni nella lambda

**File:** `backend_infra/lambdas/complete-upload.js` righe 20-23 e 90

```js
"Access-Control-Allow-Origin": "*"   // qualsiasi origine può fare request cross-origin
// ...
body: JSON.stringify({ message: "Internal Server Error", error: error.message })  // dettagli interni
```

Restringere l'origin all'URL del frontend (`process.env.ALLOWED_ORIGIN`) e non esporre `error.message` al client in produzione (loggarla solo su CloudWatch).

---

### 8. Incoerenza token: l'interceptor sovrascrive idToken con accessToken

**File:** `vue-app/src/utils/axiosInterceptor.ts` righe 44-50

L'interceptor globale imposta sempre `Authorization: Bearer <accessToken>`, ma la maggior parte dei composable (useShareFile, useSharedLinks, useUserKeyPair…) aggiunge esplicitamente `Authorization: Bearer <idToken>`. L'interceptor vince perché viene eseguito dopo, quindi in produzione passa sempre l'accessToken — tutto il codice che usa idToken è di fatto ignorato.

Da stabilire: l'authorizer API Gateway vuole idToken o accessToken? I due token hanno claim diversi (idToken ha email/sub, accessToken ha scope/groups). Una volta deciso, eliminare il codice ridondante. Se serve l'idToken, cambiare l'interceptor; se serve l'accessToken, rimuovere gli header manuali dai composable.

---

### 9. Nessun legame crittografico tra wrapped key e file specifico

**File:** `vue-app/src/stores/encryption.ts` — `storeKey` / `getKey`

Le file key vengono wrapped con la master key e indicizzate per `s3Key` in DynamoDB, ma `s3Key` non è inclusa come AAD nell'operazione di wrapping. Un server malevolo potrebbe scambiare le entry tra file: l'unwrap non fallirebbe (GCM con la chiave giusta), ma l'utente decifra il file sbagliato (DoS dell'integrità, non confidenzialità).

**Fix** — includere `s3Key` come AAD nel `wrapFileKey`:

```ts
// In crypto.ts — wrapFileKey:
export async function wrapFileKey(fileKey: CryptoKey, wrappingKey: CryptoKey, s3Key: string) {
  const iv = generateIV()
  const keyData = await crypto.subtle.exportKey('raw', fileKey)
  const aad = new TextEncoder().encode(s3Key)
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    wrappingKey, keyData
  )
  return { wrappedKey: arrayBufferToBase64(encryptedBuffer), wrapIV: arrayBufferToBase64(iv.buffer) }
}
```

---

## 🟢 Minori

### 10. `keyCache` è reattivo — visibile in Vue DevTools

**File:** `vue-app/src/stores/encryption.ts` — riga 11

`keyCache` usa `ref<Record<string, EncryptionKeyData>>` che è pienamente reattivo e ispezionabile da Vue DevTools (o da estensioni browser). Le file key in chiaro sono accessibili a chiunque abbia accesso agli strumenti di sviluppo o a un'estensione malevola.

Cambiare in `shallowRef` e considerare di svuotarlo non solo al logout ma anche dopo un periodo di inattività (idle timeout).

### 11. Cookie senza `Secure`/`SameSite` anche nel logout/refresh

Verificare che in **tutto** il codebase ogni `Cookies.set` includa gli attributi — non solo nel login. L'interceptor di refresh ([axiosInterceptor.ts:32-33](vue-app/src/utils/axiosInterceptor.ts#L32-L33)) riscrive i cookie senza attributi.

### 12. Validazione password solo lato client

**File:** `vue-app/src/pages/LoginPage.vue` riga 38 — `password.length < 8` è l'unico check. Verificare che la User Pool Cognito abbia una password policy server-side adeguata (minuscole, maiuscole, numeri, simboli, lunghezza ≥12). La validazione client è UX, non sicurezza.

---

## Riepilogo priorità

| # | Problema | Impatto | Costo implementazione |
|---|----------|---------|----------------------|
| 1 | Private key RSA in localStorage | Critico — rompe E2E condivisione | Medio (refactor IDB) |
| 2 | Cookie senza Secure/SameSite | Critico — token esfiltrabili | Basso (aggiungere opzioni) |
| 3 | Nessuna CSP | Critico — amplifica XSS | Basso (config server) |
| 4 | PBKDF2 100k su password utente | Alto — backup attaccabile offline | Basso (alzare iterazioni) |
| 5 | No verifica chiave pubblica destinatario | Alto — MITM server-side | Alto (architetturale) |
| 6 | Cifratura intero file in RAM | Alto — OOM + no integrità chunk | Medio (breaking change) |
| 7 | CORS wildcard + error leak lambda | Medio | Basso |
| 8 | Incoerenza accessToken/idToken | Medio — potenziale auth failure | Basso (unificare) |
| 9 | No AAD con s3Key nel wrapping | Medio — integrità chiavi | Basso |
| 10-12 | Minori | Basso | Basso |

**Ordine consigliato di intervento:**
1. **Subito** (basso costo, alto impatto): #2 cookie options, #3 CSP, #4 PBKDF2, #7 CORS, #8 token, #11 cookie ovunque
2. **Sprint successivo**: #1 IndexedDB + extractable:false (richiede refactor del backup), #9 AAD s3Key
3. **Roadmap**: #6 streaming encryption (breaking change formato), #5 key fingerprint UI

---

*Documento generato dall'analisi del codice in data 2026-06-21.*
*La crittografia di base (AES-256-GCM, RSA-OAEP 4096, BIP39, PBKDF2, zero-knowledge URL fragment) è corretta e ben implementata — i problemi sono nel layer di hardening circostante.*
