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

Nota: se la chiave non è estraibile, il meccanismo di `backupToServer` (che esporta la private key per cifrarla con password) deve essere riprogettato.

**✅ Design del backup deciso (2026-06-27)**

Dettaglio chiave dello standard Web Crypto: **`crypto.subtle.wrapKey()` richiede `extractable: true`** sulla chiave da wrappare — su una chiave non-estraibile lancia `InvalidAccessError`, esattamente come `exportKey`. Quindi `wrapKey` da solo *non* risolve il problema: serve comunque una finestra in cui la chiave è estraibile. Le due idee non sono alternative — **estraibile-on-demand è la strategia, `wrapKey` è la primitiva da usarci dentro**. Schema definitivo:

1. **Generazione:** crea la coppia RSA `extractable: true` (finestra transitoria, solo in RAM).
2. **Backup immediato:** `wrapKey('jwk', privateKey, derivedAESKey, { name: 'AES-GCM', iv })` con la chiave AES derivata dalla password (PBKDF2 600k, vedi #4) → carica il blob cifrato sul server. Si usa `wrapKey` invece di `exportKey` così il materiale grezzo della private key non transita mai come oggetto JS in memoria (resta nel layer crypto).
3. **Storage runtime:** re-importa la stessa JWK come **`extractable: false`** e salvala in IndexedDB; poi scarta la copia estraibile dalla RAM.
4. **Runtime:** si usa solo la chiave non-estraibile (`decrypt`/`unwrapKey` non richiedono `extractable`). Un XSS può al massimo *usarla* finché la sessione è viva, ma **non può esfiltrare il materiale grezzo** — è questo il guadagno reale del #1.
5. **Cambio password / nuovo backup:** non si tocca mai la chiave in IDB (è non-estraibile). Si opera sul backup server: decifra il blob con la password attuale → copia estraibile transitoria in RAM → ri-cifra con la nuova password → ri-carica.

**Trappola da evitare:** salvare in IndexedDB una chiave `extractable: true` pensando che basti spostarsi da localStorage a IDB. In quel caso l'XSS la rilegge da IDB e fa `exportKey` → nessun guadagno rispetto a oggi. Il punto del #1 è **`extractable: false`**, non il cambio di storage.

Nota: la migrazione degli utenti esistenti (chiave estraibile in `localStorage`) è semplice: al primo avvio post-deploy, leggi la JWK da localStorage → re-importa `extractable: false` in IDB → cancella localStorage. Il backup server, se già presente, resta valido così com'è.

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

In produzione questi header vanno impostati a livello CloudFront (Response Headers Policy) o Lambda@Edge. Verificare anche che nel codice Vue non esista nessun `v-html` alimentato con dati non fidati — è il vettore XSS più comune in Vue. *(Verificato in data 2026-06-27: nessuna occorrenza di `v-html` / `innerHTML` nel codice Vue — buono.)*

---

### 14. Endpoint di upload multipart **completamente non autenticati** (`AuthorizationType: NONE`)

**File:** `backend_infra/multipart-upload-stack.yaml` — righe 256, 298, 340, 382 (tutte le `Method`) + le 4 lambda in `backend_infra/lambdas/`

**Problema**

Ogni metodo POST dell'API multipart (`/upload/multipart/init`, `/urls`, `/complete`, `/abort`) è dichiarato con:

```yaml
AuthorizationType: NONE
```

Non c'è alcun authorizer (né Cognito User Pool, né Lambda Authorizer). Il client invia `Authorization: Bearer <token>` ma **né API Gateway né le lambda lo validano** — le lambda fanno solo `JSON.parse(event.body)` e si fidano del `userId` ricevuto nel body.

Conseguenze (indipendenti dall'E2E):
- **Chiunque su internet** può chiamare gli endpoint senza autenticazione. Il file viene scritto in `uploads/files/${userId}/${fileName}` con `userId` arbitrario preso dal body → un attaccante può caricare file nel bucket sotto qualsiasi utente (storage abuse, costi AWS, hosting di contenuti illeciti sul tuo dominio/bucket).
- **Inquinamento di DynamoDB** (la `complete-upload` scrive item con `ownerUserId` arbitrario).
- **Abort di upload altrui** se l'attaccante indovina/ottiene `fileKey` + `uploadId`.

Questo è un buco di autenticazione totale: gli altri fix E2E proteggono la *confidenzialità* dei contenuti, ma non l'*integrità* né l'*abuso* del bucket.

Nota CORS: il preflight `OPTIONS` (righe 280/322/364/406) e il codice lambda inline (riga 102) rispondono con `Access-Control-Allow-Origin: '*'` e `Access-Control-Allow-Headers: '*'` — ancora più permissivo dei file `.js` standalone (vedi #7).

**Soluzione**

1. Aggiungere un **Cognito User Pool Authorizer** all'`AWS::ApiGateway::RestApi` e impostare `AuthorizationType: COGNITO_USER_POOLS` su tutti i metodi POST (gli `OPTIONS` restano `NONE` per il preflight CORS).
2. Le lambda **non devono più fidarsi del `userId` dal body**: derivarlo dai claim del token validato (`event.requestContext.authorizer.claims.sub` / `email`).
3. In alternativa al Cognito Authorizer, un **Lambda Authorizer** che verifica la firma JWT contro le JWKS della User Pool.

Finché questi endpoint restano `NONE`, sono attaccabili a prescindere da tutto il resto.

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

Lo **stesso anti-pattern di decifratura-in-RAM** è presente anche nei due percorsi di download, che vanno aggiornati insieme all'upload:
- [useFileFromDynamoDB.ts:143-153](vue-app/src/composables/useFileFromDynamoDB.ts#L143-L153) — `response.blob()` carica l'intero file cifrato, poi `decryptFile` lo decifra in un colpo solo.
- [ShareAccessPage.vue:74-77](vue-app/src/pages/ShareAccessPage.vue#L74-L77) — idem per il download da link pubblico.

Qualunque schema di chunked encryption deve essere progettato **upload + download + preview** insieme, con un versioning del formato, altrimenti i file esistenti diventano illeggibili.

---

## 🟡 Medi

### 7. CORS wildcard e leak errori interni nelle lambda (tutte e 4)

**File:** **tutti e quattro** i lambda, non solo `complete-upload.js`:
- [initiate-upload.js:9](backend_infra/lambdas/initiate-upload.js#L9) e :58
- [get-presigned-urls.js:9](backend_infra/lambdas/get-presigned-urls.js#L9) e :52
- [complete-upload.js:20-23](backend_infra/lambdas/complete-upload.js#L20-L23) e :90
- [abort-upload.js:8](backend_infra/lambdas/abort-upload.js#L8) e :44
- inoltre le versioni **inline nello YAML** ([multipart-upload-stack.yaml](backend_infra/multipart-upload-stack.yaml#L101)) usano anche `Access-Control-Allow-Headers: '*'`.

```js
"Access-Control-Allow-Origin": "*"   // qualsiasi origine può fare request cross-origin
// ...
body: JSON.stringify({ message: "Internal Server Error", error: error.message })  // dettagli interni
```

Restringere l'origin all'URL del frontend (`process.env.ALLOWED_ORIGIN`) e non esporre `error.message` al client in produzione (loggarla solo su CloudWatch) **in tutti e 4 i lambda** + allineare la versione inline nello YAML. Attenzione a tenere coerenti i due copie del codice lambda (file `.js` standalone vs `ZipFile` inline nello YAML — vedi `update_lambdas.ps1`).

---

### 8. Incoerenza token: l'interceptor sovrascrive idToken con accessToken

**File:** `vue-app/src/utils/axiosInterceptor.ts` righe 44-50

L'interceptor globale imposta sempre `Authorization: Bearer <accessToken>`, ma la maggior parte dei composable (useShareFile, useSharedLinks, useUserKeyPair…) aggiunge esplicitamente `Authorization: Bearer <idToken>`. L'interceptor vince perché viene eseguito dopo, quindi in produzione passa sempre l'accessToken — tutto il codice che usa idToken è di fatto ignorato.

Da stabilire: l'authorizer API Gateway vuole idToken o accessToken? I due token hanno claim diversi (idToken ha email/sub, accessToken ha scope/groups). Una volta deciso, eliminare il codice ridondante. Se serve l'idToken, cambiare l'interceptor; se serve l'accessToken, rimuovere gli header manuali dai composable.

**Verifica 2026-06-27:** l'IaC presente nel repo (`multipart-upload-stack.yaml`) riguarda solo l'API di upload multipart, che **non ha alcun authorizer** (vedi #14) — quindi per quegli endpoint la distinzione idToken/accessToken è irrilevante finché non si aggiunge l'authorizer. L'API dati (`VITE_API_URL` / `VITE_LAMBDA_URL`: `/share`, `/shared-files`, `/user/files/dynamo`, `/user/public-key`, `/user/keypair-backup`...) **non è definita in questo repository**.

**✅ Decisione (2026-06-27):** le lambda dell'API dati leggono **solo il `sub`** dal JWT. Il `sub` è presente sia nell'idToken sia nell'accessToken, quindi **si standardizza sull'accessToken** — che è anche ciò che l'interceptor già impone vincendo sugli header manuali. Azioni:

1. **Rimuovere gli header manuali `Authorization: Bearer <idToken>`** da tutti i composable che li aggiungono (`useShareFile`, `useSharedLinks`, `useUserKeyPair`, `useFileFromDynamoDB`, `useFileKeysAPI`, `useRecoveryKeyAPI`, `useProfileImage`…) e affidarsi all'interceptor globale.
2. **Lasciare l'interceptor invariato** ([axiosInterceptor.ts:44-50](vue-app/src/utils/axiosInterceptor.ts#L44-L50)): inietta l'accessToken su tutte le richieste.
3. ⚠️ **Caveat S3:** rimuovendo gli header manuali e affidando tutto all'interceptor globale, attenzione alle richieste verso **URL S3 presigned**. Devono passare per un'istanza axios **senza interceptor** (come già fa correttamente [useS3MultipartUpload.ts:59](vue-app/src/composables/useS3MultipartUpload.ts#L59) con `s3Api = axios.create()`). Il PUT S3 in [useFileFromDynamoDB.ts:90](vue-app/src/composables/useFileFromDynamoDB.ts#L90) usa invece l'istanza `axios` globale: andrà spostato su un'istanza dedicata, altrimenti l'`Authorization: Bearer` finisce sulla richiesta S3 (può far fallire l'upload presigned e fa leak del token verso S3).

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

### 13. `crypto-js` con KDF debole — ed è codice morto

**File:** [utils.ts:4-14](vue-app/src/utils/utils.ts#L4-L14), [vite.config.ts:30](vue-app/vite.config.ts#L30), [package.json:21](vue-app/package.json#L21)

`utils.ts` definisce `encryptPayload`/`decryptPayload` basati su `CryptoJS.AES.encrypt(data, secretKey)` con una **chiave-stringa**. In questa modalità CryptoJS deriva la chiave con **EVP_BytesToKey (MD5, 1 iterazione)** — uno schema obsoleto e debolissimo, vulnerabile a brute force.

```ts
export const encryptPayload = (payload, secretKey) =>
  CryptoJS.AES.encrypt(JSON.stringify(payload), secretKey).toString()  // KDF = MD5 x1
```

**Verificato (2026-06-27): queste due funzioni non sono usate in nessun punto del codebase.** È quindi insieme *crypto debole* e *dipendenza morta*: `crypto-js` è l'unica ragione per cui resta in bundle (manualChunk `crypto`).

**Fix:** rimuovere `encryptPayload`/`decryptPayload`, eliminare la dipendenza `crypto-js` e `@types/crypto-js`, e togliere il chunk `crypto` da `vite.config.ts`. Tutta la crittografia reale dell'app usa già Web Crypto (`crypto.subtle`), che è l'approccio corretto. *(Se in futuro servisse cifrare un payload con una password, usare `deriveKeyFromPassword` + AES-GCM già presenti in [crypto.ts](vue-app/src/utils/crypto.ts), mai CryptoJS con chiave-stringa.)*

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
| 14 | Endpoint multipart senza authorizer (`AuthorizationType: NONE`) | **Critico** — upload/abuso non autenticato del bucket | Medio (IaC + lambda) |
| 1 | Private key RSA in localStorage | Critico — rompe E2E condivisione | Medio (refactor IDB) |
| 2 | Cookie senza Secure/SameSite (6 punti) | Critico — token esfiltrabili | Basso (aggiungere opzioni) |
| 3 | Nessuna CSP | Critico — amplifica XSS | Basso (config server) |
| 4 | PBKDF2 100k su password utente | Alto — backup attaccabile offline | Basso (alzare iterazioni) |
| 5 | No verifica chiave pubblica destinatario | Alto — MITM server-side | Alto (architetturale) |
| 6 | Cifratura/decifratura intero file in RAM (upload **+ download**) | Alto — OOM + no integrità chunk | Medio (breaking change) |
| 7 | CORS wildcard + error leak (tutti e 4 i lambda) | Medio | Basso |
| 8 | Incoerenza accessToken/idToken | Medio — potenziale auth failure | Basso (unificare) |
| 9 | No AAD con s3Key nel wrapping | Medio — integrità chiavi | Basso |
| 13 | crypto-js KDF debole (codice morto) | Basso — non usato, ma dep da rimuovere | Basso (rimuovere dep) |
| 10-12 | Minori | Basso | Basso |

---

## Piano d'esecuzione per fasi

### 🟢 FASE 0 — Quick wins (basso costo, alto impatto — un'unica PR, nessuna breaking change)
- **#2 + #11** — Cookie hardening centralizzato: nuovo helper `utils/cookieStore.ts` (`{ secure: true, sameSite: 'strict' }`) e sostituzione delle **6** `Cookies.set` raw ([LoginPage](vue-app/src/pages/LoginPage.vue#L55), [RegisterPage](vue-app/src/pages/RegisterPage.vue#L70), [OAuthCallback](vue-app/src/pages/OAuthCallback.vue#L26), [axiosInterceptor](vue-app/src/utils/axiosInterceptor.ts#L32), [useTokenManager](vue-app/src/composables/useTokenManager.ts#L26)).
- **#3** — CSP + security headers in dev ([vite.config.ts](vue-app/vite.config.ts)); annotare che in prod vanno su CloudFront/API Gateway. `v-html` già verificato assente.
- **#4** — PBKDF2: separare `PBKDF2_ITER_RECOVERY` (100k) da `PBKDF2_ITER_PASSWORD` (600k) in [crypto.ts](vue-app/src/utils/crypto.ts#L6).
- **#7** — Lambda (tutti e 4 + inline YAML): origin da `ALLOWED_ORIGIN`, niente `error.message` nel body.
- **#13** — Rimuovere `crypto-js`, `@types/crypto-js`, le funzioni morte in `utils.ts` e il chunk `crypto` in `vite.config.ts`.
- **#8** — ✅ *Deciso: accessToken.* Rimuovere gli header manuali `Bearer idToken` dai composable; spostare il PUT S3 di `useFileFromDynamoDB` su un'istanza axios senza interceptor (vedi caveat S3 nel #8).

### 🔴 FASE 1 — Critico strutturale chiavi (richiede migrazione)
- **#1 + #9** — Chiave privata RSA `extractable: false` in IndexedDB (`idb-keyval`), backup secondo il *design deciso* (estraibile-on-demand + `wrapKey`, vedi #1), migrazione one-shot da `localStorage`; nello stesso PR aggiungere `s3Key` come AAD in `wrapFileKey`/`unwrapFileKey`.

### 🟡 FASE 2 — Streaming encryption (breaking change pianificata)
- **#6** — Collegare `encryptChunk`/`decryptChunk` (già scritti) in upload **e** nei due percorsi di download, con versioning del formato file.

### 🟢 FASE 3 — Minori
- **#10** `keyCache` → `shallowRef` + idle-timeout flush.
- **#12** verificare la password policy server-side della User Pool Cognito.

### 🏁 FASE FINALE — Punti rinviati (dettaglio in [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md))
Implementati per ultimi, dopo tutte le fasi precedenti:
- **#14** — Authorizer Cognito sull'API multipart + lambda che derivano `userId` dai claim. ⚠️ Se rinviato fin qui, applicare la mitigazione-tampone (CORS ristretto / WAF) nel frattempo, perché è una porta aperta attiva.
- **#5** — Trust model documentato (subito) + UI fingerprint SHA-256 della chiave pubblica destinatario (opt-in).

> I due punti hanno un documento dedicato con trade-off, file impattati e criteri di accettazione: [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md).

---

*Documento generato dall'analisi del codice in data 2026-06-21.*
*Aggiornato il 2026-06-27: ispezione di verifica (tutti i 12 punti confermati) + nuove criticità #13 (crypto-js debole/morto) e #14 (endpoint multipart senza authorizer), generalizzazione di #6 (download) e #7 (tutti i lambda), e piano d'esecuzione per fasi.*
*La crittografia di base (AES-256-GCM, RSA-OAEP 4096, BIP39, PBKDF2, zero-knowledge URL fragment) è corretta e ben implementata — i problemi sono nel layer di hardening circostante e nell'autenticazione degli endpoint.*
