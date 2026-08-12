# LeTransfer Backend — Documentazione API & Logiche

> Documento di riferimento per il frontend. Descrive architettura, autenticazione, modelli dati e **tutti** gli endpoint del backend.
> Aggiornato al codice corrente (`app.js` + cartelle `routes/`, `services/`, `middleware/`, `config/`, `utils/`).
>
> **Aggiornamento — consolidamento Lambda → Express.** Tre gruppi di endpoint prima
> ospitati su AWS Lambda + API Gateway sono ora route Express sotto l'unico
> `VITE_API_URL` (i suffissi dei path NON cambiano, cambia solo la base):
> - **Multipart upload** (`POST /api/upload/multipart/{init,urls,complete,abort}`) — era `VITE_API_MULTIPART_URL`. Vedi §4.3-bis.
> - **Condivisione utente→utente** (`POST /api/share`, `GET /api/shared-files`) — era `VITE_LAMBDA_URL`. Vedi §4.8.
> - Inoltre l'auth JWT ora **verifica la firma** del token (vedi §2.1).
>
> **Aggiornamento — hardening sicurezza (2026-07).** Modifiche che il frontend deve conoscere:
> - 🔑 Le rotte protette richiedono ora l'**ACCESS token** Cognito (`tokenUse: "access"`), **non** più l'IdToken. L'email/name (assenti nell'access token) sono risolti server-side da Cognito. Vedi §2.1.
> - **Backup keypair** ora è un blob opaco `{ encryptedPrivateKey, iv }` — niente più `salt`/`iterations`. Vedi §4.6/§3.3.
> - **Metadati streaming encryption** (`formatVersion`, `chunkSize`, `originalSize`) persistiti su `complete` e restituiti in lista/get/share/link. Vedi §4.3-bis/§4.5/§4.8/§3.
> - **Errori interni**: le risposte `500` restituiscono un messaggio **generico** (niente più `error: error.message`). Vedi §6.
>
> **Aggiornamento — invio senza account + claim + Turnstile (2026-07).** Nuove feature per il frontend:
> - 🆕 **Invio guest** (`/api/guest/upload/{init,urls,complete,abort}` + `/revoke` + `/report`): upload E2E **senza login**, gated da rate-limit per IP + **Cloudflare Turnstile**. Il download riusa il flusso link pubblico. Vedi §4.9.
> - 🆕 **Claim** (`POST /api/share/claim`): trasforma un invio guest in file dell'account (owner + retention estesa). Vedi §4.10.
> - 🆕 Variante "guest" del record `SharedLinks` (`isGuest`/`transferId`/`ttl`/`manageTokenHash`…) — vedi §3.2. Nuove env `TURNSTILE_SECRET`/`GUEST_*`/`TRUST_PROXY_HOPS` — vedi §5 e §5-quater.

---

## 1. Panoramica architetturale

Backend **Node.js + Express 5** che gestisce upload, condivisione e crittografia end-to-end (E2E) di file, appoggiandosi a:

- **Object storage: AWS S3 ↔ Cloudflare R2** → storage fisico dei file, con **switch automatico** via env (§5-bis). Su S3: privati + `ServerSideEncryption: AES256`; su R2: privati e cifrati at-rest di default (ACL/SSE omessi). Bucket R2 **EU-giurisdizionale** → serve `R2_JURISDICTION=eu`.
- **AWS DynamoDB** → metadati file, link condivisi, chiavi E2E.
- **AWS Cognito** → autenticazione utenti (login/registrazione, JWT).
- **Sharp** → ottimizzazione immagini.
- **Argon2** → hashing password dei link protetti.
- **nanoid / uuid** → generazione token e ID.

### Struttura delle cartelle

| Cartella / file | Ruolo |
|---|---|
| `app.js` | Entry point: setup Express, CORS, helmet, mounting route, auth Cognito inline, avvio server. |
| `config/aws.js` | Init e getter di S3, Cognito, DynamoDB. `isInitialized()`. |
| `config/constants.js` | Nomi tabelle, limiti upload/piani/guest, rate limit, MIME ammessi. |
| `middleware/auth.js` | `authenticateToken` — verifica **firma** JWT Cognito (access token). Espone `verifier`/`resolveUserInfo`. |
| `middleware/plan.js` | `loadPlan` — risolve piano utente + limiti (§5-ter). |
| `middleware/guest.js` | Rate limit per IP + verifica Turnstile per le rotte guest (§4.9, §5-quater). |
| `middleware/validation.js` | Rate limiter + validatori input (express-validator). |
| `routes/*.js` | Definizione endpoint (vedi sotto). |
| `services/s3.js` | Upload/ottimizzazione file su S3. |
| `services/dynamo.js` | CRUD metadati su DynamoDB. |
| `utils/crypto.js` | Hash password, token sessione, validazione link. |
| `utils/helpers.js` | Sanitizzazione nomi, formato dimensioni, categoria file. |

### Mounting delle route (`app.js`)

```
/                        → healthRoutes        (health check)
/api/upload/multipart/*  → multipartRoutes      (upload a parti — NO uploadLimiter)   ⟵ NEW
/api/guest/*             → guestRoutes          (invio SENZA account — no auth, gated)  ⟵ NEW
/api/upload/*            → uploadRoutes         (+ uploadLimiter)
/api/user/*             → userRoutes           (file/immagini/profilo/stats)
/api/* (share)          → shareRoutes          (POST /api/share, GET /api/shared-files) ⟵ NEW
/api/*                  → filesRoutes          (url firmati, download, delete)
/api/shared-links/*     → sharedLinksRoutes    (link pubblici)
/api/user/*             → e2eRoutes            (chiavi E2E — stesso prefisso!)
/api/file-sharing/*     → fileSharingRoutes    (condivisione via email)
/api/login | /register | /confirm-registration → auth Cognito (inline in app.js)
```
> `multipartRoutes` è montato **prima** di `/api/upload` (e senza `uploadLimiter`, perché un
> singolo upload a parti genera molte richieste). `shareRoutes` e `guestRoutes` sono montati **prima** di
> `filesRoutes` per non essere intercettati dal prefisso generico `/api/*`. Il **claim** (§4.10) è
> `POST /api/share/claim`, definito dentro `shareRoutes`.

> ⚠️ **Nota collisione prefisso**: sia `userRoutes` che `e2eRoutes` sono montate su `/api/user`. `userRoutes` è registrata **prima**, quindi ha precedenza su path che combaciano. In pratica i path non si sovrappongono (`/files`, `/images`, `/stats` vs `/public-key`, `/file-keys`, `/recovery-key`), ma tienine conto se aggiungi nuovi endpoint.

---

## 2. Autenticazione

Esistono **tre** meccanismi di auth distinti:

### 2.1 `authenticateToken` (middleware standard)
File: `middleware/auth.js`. Usato da upload, multipart, user, files, shared-links (rotte owner), share.

- Header richiesto: `Authorization: Bearer <AccessToken Cognito>`
- **Aggiornato**: il token viene **verificato crittograficamente** con `aws-jwt-verify`
  (`CognitoJwtVerifier`, **`tokenUse: "access"`**, controllo di firma/scadenza/client contro le JWKS
  del User Pool). Non è più un semplice `jwt.decode`. → un token forgiato/scaduto viene **respinto**.
  ⚠️ Inviare l'**AccessToken** Cognito (non l'IdToken): un IdToken viene ora **respinto con `403`**.
- L'access token **non contiene** `email`/`name`: vengono risolti server-side da Cognito
  (`ListUsers` filtrando per `sub`, con **cache in-memory da 5 min**) e attaccati a `req.user`.
- Popola `req.user`:
  ```js
  req.user = { sub, email, name }   // sub dal token; email/name risolti da Cognito
  ```
- Errori: `401 { error: 'Access token required' }` se manca; `403 { error: 'Invalid token' }` se la verifica fallisce.

### 2.2 `authFileSharing` (middleware locale di fileSharing)
File: `routes/fileSharing.js`. **Riusa lo stesso verifier** di §2.1 (access token, firma verificata) e
risolve l'email da Cognito (helper `resolveUserInfo` condiviso), mantenendo la sua forma:
```js
req.user = { email, userId, name }   // userId = sub; email risolta da Cognito
```
Poiché tutta la feature si basa sull'email, se non è risolvibile → `401`.
Errori: `401 { success:false, message }` token mancante / email non risolvibile, `403 { success:false, message }` token non valido/scaduto.

### 2.3 Session token dei link condivisi (JWT proprietario)
File: `utils/crypto.js`. Per accesso a file dietro link pubblico.

- Generato da `POST /api/shared-links/:publicToken/access` dopo verifica password.
- Firmato con `SESSION_SECRET` (HS256), `type: 'shared_link_session'`, scadenza **1h**.
- Passato come `Authorization: Bearer <sessionToken>` su `GET /api/shared-links/:publicToken/file`.

### 2.4 Auth Cognito (login/registrazione) — inline in `app.js`

| Metodo | Path | Body | Risposta |
|---|---|---|---|
| `POST` | `/api/login` | `{ email, password }` | `200 { message, userSub: <IdToken> }` / `400 { message }` |
| `POST` | `/api/register` | `{ email, password, name }` | `200 { message, userSub }` / `400 { message }` |
| `POST` | `/api/confirm-registration` | `{ email, confirmationCode }` | `200 { message }` / `400 { message }` |

> ⚠️ **Attenzione al tipo di token**: l'endpoint inline `/api/login` restituisce in `userSub`
> l'**IdToken** Cognito, ma le rotte protette 🔑 richiedono l'**AccessToken** (§2.1) → usare l'IdToken
> come Bearer dà `403`. Il frontend deve ottenere l'**access token** da Cognito (client SDK/interceptor
> axios) e usare quello. Questo endpoint di login inline è di fatto legacy per il flusso token.

---

## 3. Modelli dati (DynamoDB)

Nomi tabella configurabili via env (default tra parentesi).

### 3.1 `SharedFiles` (`SHARED_FILES_TABLE`)
Doppio uso: (a) metadati di **tutti i file caricati**, (b) record di **condivisione via email**.

File caricato (creato da `saveFileToDynamoDB`):
```js
{
  id,                // uuid (PK)
  s3Key,             // chiave S3
  fileName,          // sanitizzato
  fileSize,          // es. "2.56 MB"
  fileType,          // MIME
  ownerUserId,       // Cognito sub
  ownerEmail?,       // solo se presente
  uploadedAt,        // ISO
  status: 'uploaded',
  isShared: false,
  // Metadati streaming encryption (#6) — solo per file cifrati a chunk, assenti sui legacy:
  formatVersion?,    // number (es. 2); assente/1 = legacy → percorso vecchio lato client
  chunkSize?,        // number, byte per chunk
  originalSize?      // number, dimensione in chiaro (pre-cifratura)
}
```
Record condiviso via email (creato da `POST /api/file-sharing/send`):
```js
{
  id, type: 'shared_file', s3Key, fileName, fileSize, fileType,
  senderEmail, senderName, senderId,
  recipientEmail, message?, downloadUrl, expiresAt,
  downloadCount: 0, createdAt
}
```
**GSI usati**: `RecipientEmailIndex` (PK `recipientEmail`), `SenderEmailIndex` (PK `senderEmail`).
> ⚠️ I record file non condivisi **non** includono `senderEmail`/`recipientEmail` perché i GSI DynamoDB non accettano chiavi null.

### 3.2 `SharedLinks` (`SHARED_LINKS_TABLE`)
Link pubblici condivisibili.
```js
{
  id,                  // uuid (PK)
  publicToken,         // nanoid 21 char (token pubblico in URL)
  s3Key,
  fileName, fileSize, fileType,
  ownerId,             // Cognito sub
  ownerEmail?,
  isPasswordProtected, // bool
  passwordHash?,       // Argon2, solo se protetto
  expiresAt,           // ISO
  maxDownloads?,       // int o assente
  downloadCount,       // int
  revokedAt?,          // ISO o null
  createdAt,
  // Metadati streaming encryption (#6), copiati dal record file alla creazione del link:
  formatVersion?, chunkSize?, originalSize?   // assenti sui link legacy
}
```
> Nota: `routes/files.js` (`/api/file-url?share=true`) crea una variante più semplice di questo record con `type: 'shared_link'`, `fileId`, `url` e **senza** `publicToken`/`passwordHash`. Sono due flussi distinti di "condivisione".

**Variante "guest" (§4.9 — invio senza account).** Un invio senza login crea un record `SharedLinks`
con questi campi extra e **senza `ownerId`/`ownerEmail`** (omessi, non `null` — evitano problemi con eventuali GSI su `ownerId`):
```js
{
  // ... campi SharedLinks sopra, ma SENZA ownerId/ownerEmail ...
  isGuest: true,           // discrimina il record guest
  transferId,              // uuid = segmento del prefisso storage uploads/guest/{transferId}/
  manageTokenHash,         // sha256 del manageToken (revoca/claim) — mai in chiaro
  abuseReports: 0,         // contatore segnalazioni (quarantena a soglia)
  ttl,                     // number, epoch secondi → DynamoDB TTL (auto-cancellazione del record)
  quarantined?,            // true se messo in quarantena dai report
  reporterIpHashes?,       // list di sha256(IP) — dedup delle segnalazioni (§4.9 report)
  abuseReportsLog?,        // list capped di { at, reason } per la revisione umana
  appealRequestedAt?,      // ISO — set da /appeal (§4.9)
  appealStatus?            // 'pending' quando c'è un appello in attesa di revisione
}
```
> Il download usa lo **stesso** flusso pubblico (§4.5): `getLinkByPublicToken`/`validateLinkStatus` non
> assumono un owner. Dopo un **claim** (§4.10) il record perde i marker guest (`isGuest=false`, `ownerId`
> valorizzato, `ttl`/`manageTokenHash` rimossi).

### 3.3 `UserPublicKeys` (`USER_PUBLIC_KEYS_TABLE`)
Chiavi E2E per utente (PK `userId`).
```js
{
  userId,
  publicKeyJWK,            // { n, e, ... } chiave pubblica RSA in JWK
  // Backup chiave privata = blob opaco cifrato con la master key a 256 bit
  // dell'utente (derivata dalla recovery key), NON con password → no PBKDF2/salt:
  encryptedPrivateKey?, backupIV?, backupCreatedAt?,
  createdAt, updatedAt
}
```
> ⚠️ Il vecchio schema aveva `backupSalt`/`backupIterations` (backup con password): **abbandonato**.
> I record legacy possono ancora avere quegli attributi, ma non vengono più letti né scritti.

### 3.4 `UserSecurity` (`USER_SECURITY_TABLE`)
Recovery key (PK `userId`).
```js
{ userId, salt, verificationHash, createdAt, updatedAt }
```

### 3.5 `UserFileKeys` (`USER_FILE_KEYS_TABLE`)
Chiavi file E2E (PK composta `userId` + `s3Key`).
```js
{ userId, s3Key, wrappedKey, wrapIV, fileIV, createdAt }
```

### 3.6 `Users` (`USERS_TABLE`)
Usata in sola lettura per lookup `email → userId` (`GET /api/user/by-email/:email/public-key`).

### 3.7 `SharesTable` (`SHARES_TABLE`) — condivisione utente→utente  ⟵ NEW
Record di condivisione diretta **utente → utente** (E2E), portata dalle vecchie Lambda di sharing.
Distinta da `SharedFiles` (email) e `SharedLinks` (link pubblici).
```js
{
  shareId,             // uuid (PK)
  s3Key,               // file condiviso
  ownerId,             // Cognito sub del mittente
  sharedToUserId,      // Cognito sub del destinatario (PK del GSI SharedToUserIndex)
  type: 'read',
  status: 'active',
  encryptedAESKey?,    // chiave AES cifrata per il destinatario (E2E), opzionale
  encryptionIV?,       // IV cifratura, opzionale
  createdAt,           // ISO
  // snapshot metadati file:
  fileName, fileSize, fileType, uploadedAt,
  // Metadati streaming encryption (#6), copiati dal record file al momento della condivisione:
  formatVersion?, chunkSize?, originalSize?   // assenti sulle share legacy
}
```
**GSI**: `SharedToUserIndex` (PK `sharedToUserId`) → query "file condivisi con me" (`GET /api/shared-files`).

### Struttura chiavi S3
```
uploads/images/{userId}/{timestamp}-{uuid}.jpg          // immagini (ottimizzate, max 1200px, jpeg q85)
uploads/profiles/{userId}/profile-{timestamp}-{uuid}.jpg // profilo (400x400 cover, jpeg q90)
uploads/files/{userId}/{timestamp}-{uuid}-{nome}.ext     // file generici (owner = Cognito sub)
uploads/guest/{transferId}/{timestamp}-{uuid}-{nome}.ext // invii guest §4.9 (lifecycle auto-delete)
```
Su **S3** gli oggetti hanno `ACL: private` + `ServerSideEncryption: AES256`; su **R2** questi due sono **omessi** (oggetti privati e cifrati at-rest di default). I `Metadata` (`original-name`, `uploaded-by`, `file-size-formatted`, ecc.) restano su entrambi.

---

## 4. Endpoint API — riferimento completo

Legenda auth: 🔓 nessuna · 🔑 `authenticateToken` · 📧 `authFileSharing` · 🎟️ session token link.

### 4.1 Health

| Auth | Metodo | Path | Descrizione |
|---|---|---|---|
| 🔓 | `GET` | `/health` | Stato del servizio. |

Risposta:
```json
{ "status": "OK|DEGRADED", "timestamp", "aws_region", "s3_bucket",
  "environment", "aws_initialized": true, "version": "1.0.0" }
```

---

### 4.2 Upload — `/api/upload` (rate limit: 10 / 15 min)

Tutti `multipart/form-data`. Campo `fileSize` opzionale (stringa già formattata lato client), `description`/`tags` opzionali.

| Auth | Metodo | Path | Campo file | Limite | Note |
|---|---|---|---|---|---|
| 🔑 | `POST` | `/api/upload/upload-image` | `image` | 5MB | JPEG/PNG/WebP. Ottimizzata a 1200px, jpeg q85. |
| 🔑 | `POST` | `/api/upload/upload-profile-image` | `profileImage` | 5MB | Cancella vecchie profile image, poi carica 400x400. |
| 🔑 | `POST` | `/api/upload/upload-file` | `file` | 50MB | Tipi: vedi `ALLOWED_FILE_MIMES`. |

Risposta upload-image / upload-file (`200`):
```json
{ "message": "...", "file": {
  "key", "originalName", "size", "location", "contentType",
  "description", "tags"?, "uploadTime", "optimized"? } }
```
Risposta upload-profile-image (`200`): oggetto `profileImage` con `imageType: 'profile'`.

Errori comuni: `400` file troppo grande / tipo non supportato / file assente · `503` AWS non disponibile · `429` rate limit.

---

### 4.3-bis Multipart Upload — `/api/upload/multipart` (NO rate limiter)  ⟵ NEW

Upload di file grandi a parti. Owner = `req.user.sub`; il `fileKey` è generato dal server e
deve appartenere all'utente (prefisso `uploads/files/{sub}/`, altrimenti `403`).
Dettaglio completo + flusso client in [`multipart-upload.md`](./multipart-upload.md).

| Auth | Metodo | Path | Body | Risposta |
|---|---|---|---|---|
| 🔑 | `POST` | `/api/upload/multipart/init` | `{ fileName, fileType }` | `{ uploadId, fileKey }` |
| 🔑 | `POST` | `/api/upload/multipart/urls` | `{ fileKey, uploadId, partNumbers: number[] }` | `{ urls: { [partNumber]: presignedUrl } }` (scad. 1h) |
| 🔑 | `POST` | `/api/upload/multipart/complete` | `{ fileKey, uploadId, parts:[{PartNumber,ETag}], fileName?, fileSize?, fileType?, formatVersion?, chunkSize?, originalSize? }` | `{ location, key }` |
| 🔑 | `POST` | `/api/upload/multipart/abort` | `{ fileKey, uploadId }` | `{ status: 'aborted' }` |

- Flusso: `init` → `urls` → il client fa `PUT` di ogni chunk **direttamente su S3** alle presigned URL e raccoglie gli `ETag` → `complete` (o `abort`).
- Su `complete` il server scrive anche i metadati su `SharedFiles` (così il file compare nelle liste).
- **Streaming encryption (#6)**: per i file cifrati a chunk, passare in `complete` i campi
  `formatVersion` (number, es. 2), `chunkSize` (number), `originalSize` (number). Vengono persistiti
  su `SharedFiles` e restituiti in tutte le liste/get e nei record share/link. Se assenti → file legacy.
  `init` accetta i campi extra (`fileSize`, `originalSize`, `isEncrypted`, `formatVersion`, `chunkSize`)
  ma **non li persiste**: la persistenza avviene in `complete`. `init` usa solo `fileName`/`fileType`.
- Errori: `400` campi mancanti · `403` `fileKey` non di proprietà · `503` AWS down · `500`.

---

### 4.3 User — `/api/user` (immagini, file, profilo, stats)

| Auth | Metodo | Path | Descrizione |
|---|---|---|---|
| 🔑 | `GET` | `/api/user/images` | Lista immagini utente (S3 `uploads/images/{sub}/`) con URL firmati (1h). Max 100. |
| 🔑 | `GET` | `/api/user/profile-images` | Lista immagini profilo (max 10), ordinate per data desc. |
| 🔑 | `GET` | `/api/user/profile-image` | Immagine profilo corrente (la più recente) o `null`. |
| 🔑 | `DELETE` | `/api/user/profile-image` | Cancella **tutte** le immagini profilo dell'utente da S3. |
| 🔑 | `GET` | `/api/user/files` | Lista file (legacy). Query: `limit` (max 100), `fileType` (categoria). URL firmati. |
| 🔑 | `GET` | `/api/user/files/paginated` | File paginati. Query: `page`, `limit` (1-100), `fileType`. |
| 🔑 | `GET` | `/api/user/files/dynamo` | File da DynamoDB (scan su `ownerUserId`). Query: `limit`, `lastKey`, `type`, `onlyOwned`. Paginazione via `nextKey`. |
| 🔑 | `GET` | `/api/user/files/dynamo/by-key?key=...` | Singolo file DynamoDB per `s3Key`. Verifica ownership (403 altrimenti). |
| 🔑 | `GET` | `/api/user/files/dynamo/:fileId` | Singolo file DynamoDB per `id`. Verifica ownership. |
| 🔑 | `GET` | `/api/user/stats` | Conteggi: `{ files, images, profileImages, total }`. |

Forma elemento file (lista S3):
```json
{ "key", "fileName", "originalName", "size", "lastModified",
  "contentType", "category", "url", "urlExpires", "metadata" }
```
`category` ∈ `image | video | audio | document | archive | text | other`.

Risposta DynamoDB file: ogni item arricchito con `s3Url` (firmato 1h) e `urlExpires`.

---

### 4.4 Files — `/api` (URL firmati, download, eliminazione)

| Auth | Metodo | Path | Descrizione |
|---|---|---|---|
| 🔑 | `DELETE` | `/api/uploads/files` | Elimina file. Body `{ fileId }` (= s3Key). Verifica prefisso ownership, cancella da S3 **e** DynamoDB. |
| 🔑 | `GET` | `/api/file-url` | URL firmato per un file dell'utente. Query sotto. |
| 🔓 | `GET` | `/api/download-file/:fileKey` | Redirect a URL firmato (per link email). Query `download` (default true). |

**`GET /api/file-url`** query params:
- `key` (obbligatorio) — s3Key del file (deve appartenere all'utente).
- `download` (`true|false`) — forza `Content-Disposition: attachment`.
- `expires` — secondi, clamp **60 … 604800** (7gg), default 3600.
- `share` (`true|false`) — se true salva anche un record `shared_link` in DynamoDB.
- `password`, `maxDownloads` — opzionali, salvati nel record se `share=true`.

Risposta:
```json
{ "url", "key", "contentType", "contentLength", "originalName",
  "expiresIn", "expiresAt", "sharedLink"? { ... } }
```
Errori: `400` key mancante · `403` non proprietario · `404` non trovato · `503` S3 down.

---

### 4.5 Shared Links — `/api/shared-links` (link pubblici con token + password)

Flusso pubblico: **info → access (password) → file (con session token)**.

| Auth | Metodo | Path | Descrizione |
|---|---|---|---|
| 🔑 | `POST` | `/api/shared-links` | Crea link. Body sotto. → `201`. |
| 🔑 | `GET` | `/api/shared-links` | Lista link dell'owner, ordinati per `createdAt` desc. |
| 🔓 | `GET` | `/api/shared-links/:publicToken` | Info pubbliche del link (no s3Key, no hash). |
| 🔓 | `POST` | `/api/shared-links/:publicToken/access` | Verifica password + nome visitatore → session token. |
| 🎟️ | `GET` | `/api/shared-links/:publicToken/file` | URL firmato (15 min). Query `action=download\|preview`. Incrementa `downloadCount` solo su download. |
| 🔑 | `POST` | `/api/shared-links/:id/revoke` | Revoca link (owner). |
| 🔑 | `POST` | `/api/shared-links/:id/regenerate` | Nuovo `publicToken`, reset scadenza (7gg) e download. |
| 🔑 | `PATCH` | `/api/shared-links/:id` | Aggiorna `expiresAt` / `password` / `maxDownloads` / `removePassword`. |
| 🔑 | `DELETE` | `/api/shared-links/:id` | Elimina fisicamente il link. |

**Body `POST /api/shared-links`**:
```js
{ s3Key*, fileName*, fileSize?, fileType?, password?,
  expiresInHours? /* default 168, clamp al cap retention del piano — §5-ter */, maxDownloads? }
```
Risposta `201`:
```json
{ "success": true, "data": {
  "id", "publicToken", "url": "<FRONTEND_URL>/share/<token>",
  "fileName", "fileSize", "fileType", "isPasswordProtected",
  "expiresAt", "maxDownloads", "downloadCount": 0, "createdAt" } }
```

**Info pubbliche `GET /api/shared-links/:publicToken`** → `{ success, data: { fileName, fileSize, fileType, isPasswordProtected, expiresAt, createdAt, formatVersion?, chunkSize?, originalSize? } }`. I tre campi streaming (#6) sono presenti solo per file cifrati a chunk (assenti sui link legacy) e servono al client per decifrare in download.

**Body `POST .../access`**: `{ visitorName* (min 2), password? }` → `{ sessionToken, expiresAt, fileName, fileSize, fileType, previewSupported, downloadAllowed }`.

**Errori standardizzati** (`errorCode`): `LINK_NOT_FOUND` (404), `LINK_REVOKED`/`LINK_EXPIRED`/`DOWNLOAD_LIMIT_REACHED` (410), `PASSWORD_REQUIRED`/`INVALID_PASSWORD` (401), `FORBIDDEN` (403), `INVALID_REQUEST` (400), `ALREADY_REVOKED` (400), `INTERNAL_ERROR` (500).

---

### 4.6 E2E Encryption — `/api/user` (chiavi pubbliche, backup, recovery, file keys)

| Auth | Metodo | Path | Descrizione |
|---|---|---|---|
| 🔑 | `POST` | `/api/user/public-key` | Salva chiave pubblica. Body `{ publicKeyJWK: { n, e, ... } }`. |
| 🔑 | `GET` | `/api/user/:userId/public-key` | Chiave pubblica di un utente per ID. `404 PUBLIC_KEY_NOT_FOUND`. |
| 🔑 | `GET` | `/api/user/by-email/:email/public-key` | Lookup email → userId → chiave pubblica. |
| 🔑 | `POST` | `/api/user/keypair-backup` | Salva backup chiave privata (blob opaco). Body `{ encryptedPrivateKey, iv }` — **no** `salt`/`iterations`. |
| 🔑 | `GET` | `/api/user/keypair-backup` | Recupera backup → `{ success, data: { encryptedPrivateKey, iv, createdAt } }`. `404 BACKUP_NOT_FOUND`. |
| 🔑 | `POST` | `/api/user/recovery-key/setup` | Configura recovery key. Body `{ salt, verificationHash }`. `409` se già esiste. |
| 🔑 | `GET` | `/api/user/recovery-key/status` | `{ hasRecoveryKey, salt, verificationHash }`. |
| 🔑 | `POST` | `/api/user/file-keys` | Salva chiave file wrapped. Body `{ s3Key, wrappedKey, wrapIV, fileIV }`. |
| 🔑 | `GET` | `/api/user/file-keys` | Tutte le chiavi file dell'utente → `{ keys: [...] }`. |
| 🔑 | `GET` | `/api/user/file-keys/:s3Key` | Singola chiave file (`:s3Key` URL-encoded). |
| 🔑 | `DELETE` | `/api/user/file-keys/:s3Key` | Elimina chiave file. |

> Modello E2E: il client genera coppia RSA, carica la **chiave pubblica**; cifra ogni file con una chiave simmetrica, poi "wrappa" quella chiave con la pubblica e la salva in `UserFileKeys`. Il backend non vede mai le chiavi private in chiaro.

---

### 4.7 File Sharing (via email) — `/api/file-sharing`

| Auth | Metodo | Path | Descrizione |
|---|---|---|---|
| 📧 | `POST` | `/api/file-sharing/send` | Condivide file con destinatari. Body sotto. Genera URL firmati (7gg) e un record per ogni coppia file×destinatario. |
| 📧 | `GET` | `/api/file-sharing/received?limit=` | File ricevuti (GSI `RecipientEmailIndex`). |
| 📧 | `GET` | `/api/file-sharing/sent?limit=` | File inviati (GSI `SenderEmailIndex`). |

**Body `/send`**:
```js
{ recipients: ["email1", ...], files: [{ s3Key|key, name, size, type|contentType }, ...], message? }
```
Risposta: `{ success, message, results[], totalRecipients, totalFiles, totalShared }`.

> Nota: l'endpoint registra i record di condivisione ma **non invia email** nel codice attuale (la dipendenza `resend` è presente ma non usata qui).

---

### 4.8 User-to-User Sharing (E2E) — `/api/share`, `/api/shared-files`  ⟵ NEW

Condivisione diretta **utente → utente** su tabella `SharesTable` (porting delle Lambda
`dev-createShare` / `dev-getSharedFiles`). Distinta dal file-sharing via email (§4.7) e dai
link pubblici (§4.5). Dettaglio completo in [`user-shares.md`](./user-shares.md).

| Auth | Metodo | Path | Descrizione |
|---|---|---|---|
| 🔑 | `POST` | `/api/share` | Condivide un file con un altro utente (per email). |
| 🔑 | `GET` | `/api/shared-files` | Lista dei file condivisi **con** l'utente autenticato. |

**Body `POST /api/share`**:
```js
{ s3Key*, type?: 'user', targetEmail*, encryptedAESKey?, encryptionIV? }
```
- Verifica esistenza file su S3 (`HeadObject`), risolve `targetEmail` via Cognito, vieta il self-share, scrive su `SharesTable`. `ownerId = req.user.sub`.
- I metadati streaming (`formatVersion`/`chunkSize`/`originalSize`) sono **letti automaticamente dal record file dell'owner** (`SharedFiles`) e copiati sulla share: il frontend **non** deve inviarli.
- Risposta `200`: `{ message: 'File shared successfully', shareId }`.
- Errori: `400` (s3Key/targetEmail mancanti, self-share, type non valido) · `404` (file non in S3, utente non trovato) · `503`.

**Risposta `GET /api/shared-files`** → `{ files: [...] }`, ogni elemento:
```json
{ "shareId", "s3Key", "ownerId", "encryptedAESKey", "encryptionIV", "sharedAt",
  "s3Url": "<presigned download, 1h>", "senderEmail": "<email reale mittente>",
  "fileName", "fileSize", "fileType", "lastModified",
  "name", "size", "type", "uploadedAt",
  "formatVersion"?, "chunkSize"?, "originalSize"? }
```
> `formatVersion`/`chunkSize`/`originalSize` (streaming encryption #6) sono presenti solo se il file
> condiviso era cifrato a chunk; assenti sulle share legacy → il client usa il percorso di download vecchio.
> `s3Url` è una **presigned URL** (bucket privato) e `senderEmail` è l'email reale risolta via
> Cognito — due bug delle vecchie Lambda corretti nel porting. I campi duplicati
> (`fileName`/`name`, ecc.) sono voluti per compatibilità col frontend.

---

### 4.9 Invio SENZA account (guest) — `/api/guest`  ⟵ NEW

Upload E2E **senza login**: chiunque carica un file cifrato e ottiene un link pubblico. Il server vede
**solo ciphertext** (la chiave sta nel fragment `#` del link, mai al server). È il mirror del multipart
(§4.3-bis) ma **senza `authenticateToken`**: l'"ownership" è per **prefisso** `uploads/guest/` (la capability
è conoscere `fileKey`+`uploadId`, restituiti solo da `init`). Un invio completato **è** un record `SharedLinks`
senza owner (§3.2) → il **download riusa il flusso pubblico esistente** (§4.5):
`GET /api/shared-links/:publicToken` → `.../access` → `.../file`.

**Gate anti-abuso** (§5-quater): rate-limit **per IP** su tutte le rotte + **Cloudflare Turnstile** su `init`.

| Auth | Metodo | Path | Body | Risposta |
|---|---|---|---|---|
| 🔓 | `POST` | `/api/guest/upload/init` | `{ fileName*, fileType*, fileSize?, turnstileToken? }` | `{ transferId, publicToken, manageToken, uploadId, fileKey }` |
| 🔓 | `POST` | `/api/guest/upload/urls` | `{ fileKey*, uploadId*, partNumbers: number[] }` | `{ urls: { [partNumber]: presignedUrl } }` (scad. 1h) |
| 🔓 | `POST` | `/api/guest/upload/complete` | vedi sotto | `201 { publicToken, url, expiresAt }` |
| 🔓 | `POST` | `/api/guest/upload/abort` | `{ fileKey*, uploadId* }` | `{ status: 'aborted' }` |
| 🔓 | `POST` | `/api/guest/:publicToken/revoke` | `{ manageToken* }` | `{ status: 'revoked' }` |
| 🔓 | `POST` | `/api/guest/report/:publicToken` | `{ reason?, turnstileToken? }` | `202 { status: 'received' }` |
| 🔓 | `POST` | `/api/guest/:publicToken/appeal` | `{ manageToken* }` | `202 { status: 'appeal_received' }` |

**`init`** — verifica Turnstile + rate-limit, poi genera `transferId` (uuid), `publicToken` (nanoid 21),
`manageToken` (nanoid 32, **mostrato una sola volta** — serve per `revoke`/claim), `fileKey` sotto
`uploads/guest/{transferId}/…` e avvia il multipart. **Nessun record DB** ancora (si scrive a `complete`;
il multipart abbandonato lo pulisce `abort` o la lifecycle dei multipart incompleti).
- ⚠️ **Turnstile**: se `TURNSTILE_SECRET` è impostato sul backend, `turnstileToken` è **obbligatorio** →
  senza/invalido = `403 { errorCode: 'CAPTCHA_REQUIRED' | 'CAPTCHA_FAILED' }`; errore rete Cloudflare = `503 CAPTCHA_UNAVAILABLE`.
  Se il secret **non** è impostato, il check è disattivato (fail-open, dev). Il token si ottiene dal widget Turnstile (site key) lato frontend.

**`complete`** — body:
```js
{ fileKey*, uploadId*, parts*:[{PartNumber,ETag}], publicToken*, manageToken*, transferId?,
  fileName?, fileSize?, fileType?, formatVersion?, chunkSize?, originalSize?,
  password?, expiresInHours? /* clamp a GUEST_MAX_EXPIRY, default 168 */, maxDownloads? }
```
Assembla l'oggetto, **rivalida la dimensione reale** (`HeadObject` → `413 FILE_TOO_LARGE` + cleanup se oltre
`GUEST_MAX_FILE_SIZE`), scrive il record `SharedLinks` guest (§3.2: `isGuest:true`, `ttl`, `manageTokenHash`,
`ownerId` **omesso**), con `password` opzionale (argon2). Risposta: `{ publicToken, url:
"<FRONTEND_URL>/share/<token>", expiresAt }` — il client appende `#<chiave>` al link (il server non la vede).

**`revoke`** — il **mittente** (che possiede il `manageToken`) disattiva il link: confronto `sha256(manageToken)`
vs `manageTokenHash` (tempo costante), set `revokedAt` + delete immediato dell'oggetto. Risposta **uniforme**
`403 FORBIDDEN` se link assente o token errato (nessun leak sull'esistenza).

**`report`** — segnalazione abuso, **hardened anti-censura**: **gated da Turnstile** (come `init`),
**deduplicato per (IP, link)** (una seconda segnalazione dallo stesso IP sullo stesso link non conta) e con
**soglia relativa ai download** `max(ABUSE_AUTO_QUARANTINE_THRESHOLD, ceil(downloadCount × 0.05))` — così pochi
report non abbattono un link popolare. Alla soglia va in **quarantena** (`revokedAt` + `quarantined:true`;
oggetto **conservato** per revisione). Risposta sempre generica `202` (nessun leak sull'esistenza).
Se `TURNSTILE_SECRET` è attivo, il client deve inviare `turnstileToken` (altrimenti `403`).

**`appeal`** — chi possiede il `manageToken` (il mittente) può **contestare una quarantena**: confronto
`sha256(manageToken)` a tempo costante → marca `appealRequestedAt` + `appealStatus:'pending'` per revisione
umana. **Non riattiva** il link (decide un umano). `202` se autorizzato, `403` uniforme altrimenti.

- Errori: `400 INVALID_REQUEST` · `403 FORBIDDEN`/`CAPTCHA_*` · `413 FILE_TOO_LARGE` · `429 RATE_LIMITED` · `503 SERVICE_UNAVAILABLE`/`CAPTCHA_UNAVAILABLE` · `500 INTERNAL_ERROR`.

---

### 4.10 Claim — invio guest → file dell'account — `/api/share/claim`  ⟵ NEW

| Auth | Metodo | Path | Body | Risposta |
|---|---|---|---|---|
| 🔑 | `POST` | `/api/share/claim` | `{ publicToken*, manageToken* }` | `{ ok: true, fileId, publicToken, expiresAt }` |

Un utente loggato "reclama" un invio guest fornendo il `manageToken` ricevuto all'upload. Il backend:
verifica `sha256(manageToken)` (tempo costante) → **ri-ospita** l'oggetto (`CopyObject` `uploads/guest/…` →
`uploads/files/{sub}/…`, così esce dalla lifecycle guest) → crea un record `SharedFiles` (il file compare nel
file manager; il suo `id` è `fileId`) → **riassegna la stessa link** all'utente (`ownerId=sub`, `isGuest=false`,
`publicToken` **invariato** → i link già distribuiti restano validi) → **estende `expiresAt`** al cap del piano →
rimuove `ttl` e i marker guest → cancella l'oggetto originale.
- **Nessun re-wrapping di chiavi**: il file resta decifrabile solo con la chiave nel fragment del link.
- Errori: `400` (campi mancanti) · `403 Not authorized` (link assente / non-guest / token errato, uniforme) · `503` · `500`.

---

## 5. Configurazione & limiti

### Variabili d'ambiente
| Var | Default | Uso |
|---|---|---|
| `PORT` | 3000 | Porta server. |
| `AWS_REGION` | `eu-central-1` | Regione AWS. |
| `S3_BUCKET_NAME` | — (obbligatoria se non R2) | Bucket S3. Ignorata se R2 è attivo (vedi §5-bis). |
| `USER_POOL_ID` | — (obbligatoria) | Cognito User Pool. |
| `COGNITO_CLIENT_ID` | — (obbligatoria) | Cognito App Client. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | Credenziali AWS (DynamoDB/Cognito, e S3 se non R2). Fallback `_2`. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | — | Cloudflare R2. Se **tutte e 4** impostate → lo storage oggetti passa a R2 (§5-bis). |
| `R2_JURISDICTION` | — | Solo per bucket **giurisdizionali** (`eu`/`fedramp`): forza l'endpoint `<account>.<juris>.r2.cloudflarestorage.com`. Senza → endpoint standard. Se mancante su un bucket EU → **403 su ogni operazione**. |
| `SESSION_SECRET` | default insicuro | Firma session token link. |
| `FRONTEND_URL` | `https://letransfer.app` | Base per URL `/share/:token` **e** origine aggiunta alla whitelist CORS. |
| `MAX_FILE_SIZE` | 5MB | Limite immagini. |
| `MAX_GENERIC_FILE_SIZE` | 50MB | Limite file generici (upload singolo). |
| `SHARES_TABLE` | `SharesTable` | Tabella condivisioni utente→utente (§3.7). Valore reale: `dev-swiftsend-shares`. |
| `SUBSCRIPTIONS_TABLE` | — (unset → tutti `free`) | Tabella piani (D.1, §5-ter). Se non impostata, `loadPlan` non interroga Dynamo e tutti sono `free`. |
| `PLAN_FREE_MAX_FILE_GB` / `PLAN_PRO_MAX_FILE_GB` / `PLAN_BUSINESS_MAX_FILE_GB` | 2 / 20 / 100 | Cap dimensione per piano (GB). |
| `PLAN_FREE_MAX_EXPIRY_HOURS` / `PLAN_PRO_MAX_EXPIRY_HOURS` | 168 / 720 | Cap retention link per piano (ore). Business = solo ceiling assoluto. |
| `ABSOLUTE_MAX_EXPIRY_HOURS` | 8760 | Ceiling di sicurezza retention (1 anno). |
| `TRUST_PROXY_HOPS` | 1 | Hop di proxy fidati per `req.ip` (rate-limit per IP). 1 = solo Fly; 2 se il dominio è dietro proxy Cloudflare. Vedi §5-quater. |
| `TURNSTILE_SECRET` | — (unset → captcha OFF) | Secret Cloudflare Turnstile. Se impostata, `init` guest richiede `turnstileToken` valido (§4.9). |
| `GUEST_MAX_FILE_SIZE` | 2 GB | Cap dimensione invio guest (byte). Enforce reale a `complete` via `HeadObject`. |
| `GUEST_MAX_EXPIRY` | 168 | Cap retention link guest (ore). |
| `GUEST_RATE_MAX_INIT_PER_HOUR` / `GUEST_RATE_MAX_REQUESTS` | 20 / 300 | Rate-limit per IP: `init`/h e richieste guest/h (finestra `GUEST_RATE_WINDOW_MS`, def. 1h). |
| `GUEST_TTL_GRACE_SECONDS` | 172800 | Grazia aggiunta a `expiresAt` per il `ttl` DynamoDB del record guest. |
| `ABUSE_AUTO_QUARANTINE_THRESHOLD` | 3 | Soglia **minima** (floor) di `report` per la quarantena di un link guest. |
| `ABUSE_REPORT_DOWNLOAD_RATIO` | 0.05 | Fattore della soglia relativa ai download: quarantena a `max(floor, ceil(downloadCount × ratio))` report (§4.9). |
| `*_TABLE` | nomi default | Override nomi tabelle DynamoDB. |
| `NODE_ENV` | `development` | Solo logging richieste in dev. Il **dettaglio errori non è più esposto** al client in nessun ambiente (§6). |

### 5-bis. Object storage: AWS S3 ↔ Cloudflare R2

Lo storage oggetti è **centralizzato** in `config/aws.js`: un solo `AWS.S3` (aws-sdk v2) usato da tutto il codice via `getS3()`. R2 è S3-compatibile, quindi la migrazione è un cambio di configurazione, non di logica.

- **Switch automatico**: se `R2_ACCOUNT_ID`+`R2_ACCESS_KEY_ID`+`R2_SECRET_ACCESS_KEY`+`R2_BUCKET` sono **tutte** presenti, il client punta a R2 (`endpoint https://<account>.r2.cloudflarestorage.com`, `region:'auto'`, path-style) e il bucket attivo diventa `R2_BUCKET`. Altrimenti resta AWS S3 con `S3_BUCKET_NAME`. **DynamoDB e Cognito restano su AWS** in entrambi i casi.
- **Parametri write**: su R2 vengono **omessi** `ACL:'private'` e `ServerSideEncryption:'AES256'` (R2 li rifiuta: gli oggetti sono privati e cifrati at-rest di default). Su S3 restano invariati.
- **Passi infra (manuali, lato Cloudflare)** per il cutover:
  1. Creare bucket R2 + API token scoped (permessi object read/write/multipart/delete).
  2. **CORS sul bucket R2**: origini frontend (dev+prod), metodi `GET/PUT/HEAD`, header `*`, expose `ETag` (serve al multipart).
  3. **Lifecycle** su `uploads/guest/` (per §C invii guest) — auto-cancellazione.
  4. **Copia dati** S3→R2 (es. `rclone`/`aws s3 sync`) **prima** di impostare le env in prod, poi flip.
  5. Le presigned URL punteranno a R2 → la **CSP** del frontend (`connect-src`) dovrà includere l'host R2 (o il dominio custom/CDN).

### 5-ter. Piani e limiti (D.1)

Enforcement server-side dei limiti per piano. `loadPlan` (dopo `authenticateToken`) risolve il piano da `SUBSCRIPTIONS_TABLE` (PK `userId`, attributo `plan` ∈ `free|pro|business`) e popola `req.plan`/`req.planLimits`. Default `free` se tabella non configurata o lookup fallito (fail-open).
- **Punti di enforcement**: `POST /api/shared-links` (clamp `expiresInHours` al cap retention del piano), `POST /api/upload/multipart/init` (rifiuta dimensione dichiarata oltre cap → `413`), `POST /api/upload/multipart/complete` (ricontrollo reale via `HeadObject` → `413` + cleanup se oltre cap).
- **Rimandato**: contatore trasferimenti/mese (richiede tracking usage, arriva con E3/pagamenti).

### 5-quater. Invio guest & anti-abuso (§C)

Il canale guest (§4.9) è no-auth → protetto da quattro livelli:
- **Rate limit per IP** (`middleware/guest.js`): `guestInitLimiter` (solo `init`) + `guestLimiter` (tutte le
  rotte guest). ⚠️ Richiede `app.set('trust proxy', TRUST_PROXY_HOPS)` **corretto**, altrimenti conta l'IP del
  proxy invece del client (rate-limit inutile). Default `1` (solo Fly); `2` se dietro proxy Cloudflare.
- **Cloudflare Turnstile** su `init`: fail-**open** se `TURNSTILE_SECRET` non impostata (dev/pre-config),
  fail-**closed** se impostata (token mancante/invalido → `403`, errore rete Cloudflare → `503`).
  ⚠️ **Ordine di rollout**: il frontend deve **già** inviare `turnstileToken` **prima** di impostare il secret,
  altrimenti tutti gli upload guest vanno in `403`.
- **Storage/lifecycle**: prefisso `uploads/guest/{transferId}/`; una **lifecycle rule R2** cancella gli oggetti
  dopo `GUEST_MAX_EXPIRY` giorni (garanzia dura sui byte). Il **TTL DynamoDB** sull'attributo `ttl` ripulisce il
  record (best-effort ~48h; va **abilitato in console** sulla tabella `SharedLinks`).
- **Segnalazioni & quarantena** (§4.9 `report`/`appeal`): `report` è **Turnstile-gated**, **deduplicato per
  (hash IP, link)** e con **soglia relativa ai download** `max(ABUSE_AUTO_QUARANTINE_THRESHOLD, ceil(downloadCount
  × ABUSE_REPORT_DOWNLOAD_RATIO))` — anti-censura: pochi report non abbattono un link popolare. Chi ha il
  `manageToken` può **contestare** la quarantena via `appeal` (marca per revisione umana, **non** riattiva).

### Rate limiting
- `uploadLimiter`: 10 richieste / 15 min sulle rotte `/api/upload`.
- `apiLimiter`: 100 / 15 min (definito, disponibile per uso generale).
- `guestLimiter` / `guestInitLimiter`: per IP sulle rotte `/api/guest/*` (§5-quater).

### CORS
Origini ammesse: `http://localhost:5173`, `http://localhost:3000`, **+ `FRONTEND_URL` se impostata**. Metodi: GET/POST/PUT/DELETE/PATCH/OPTIONS. Header: `Content-Type`, `Authorization`, `X-Requested-With`.
> Per il deploy basta impostare `FRONTEND_URL` con l'origine di produzione: `app.js` la aggiunge automaticamente alla whitelist.

### Sicurezza header
`helmet` con `crossOriginResourcePolicy: cross-origin` e `crossOriginOpenerPolicy: same-origin-allow-popups`.

---

## 6. Convenzioni di risposta

Due stili coesistono nel codice:

- **Rotte "nuove"** (shared-links, e2e, file-sharing, files/dynamo): `{ success: boolean, data?|files?, error?|message?, errorCode? }`.
- **Rotte "legacy"** (upload, user/images, user/files): oggetto diretto con `error` su fallimento, senza campo `success`.

Codici di stato usati: `200`, `201`, `400`, `401`, `403`, `404`, `409`, `410`, `429`, `500`, `503`.

**Errori interni (`500`)**: il body è ora **generico** (es. `{ error: 'Internal Server Error' }` o
`{ success:false, message:'...' }` senza dettaglio tecnico). Il dettaglio (`error.message`, stack)
è **solo nei log server** (Fly logs), mai nella risposta — anche in `development`. Restano invece
descrittivi i `400` di validazione (login/registrazione Cognito, "Unsupported file type"): sono
feedback utili all'utente, non leak interni.

URL firmati S3: scadenze tipiche **1h** (liste/preview owner), **15 min** (download link pubblico), **7gg** (file-sharing email). Tutte configurabili dove indicato.

---

## 7. Note per il frontend

1. **Token Bearer**: usa l'**AccessToken** Cognito per tutte le rotte 🔑 (`tokenUse: "access"`, firma verificata). ⚠️ **Cambio importante**: prima si usava l'IdToken, ora un IdToken viene **respinto con `403`**. L'access token non contiene email/name: il backend li risolve da Cognito quando servono. Non usare il valore `userSub` di `/api/login` (è un IdToken) come Bearer.
2. **Upload**: invia `multipart/form-data`; il nome del campo file è specifico per endpoint (`image` / `profileImage` / `file`). Puoi passare `fileSize` già formattato per coerenza visiva.
   - Per file grandi usa il **multipart** (§4.3-bis): `init → urls → PUT chunk su S3 → complete`.
8. **Consolidamento URL (Lambda → Express)**: multipart e sharing utente→utente sono ora sotto `VITE_API_URL` (prima `VITE_API_MULTIPART_URL` e `VITE_LAMBDA_URL`). I suffissi dei path restano identici (`/upload/multipart/*`, `/share`, `/shared-files`): basta cambiare la base URL.
3. **Eliminazione file**: `DELETE /api/uploads/files` vuole `fileId` = la **s3Key** completa (es. `uploads/files/{sub}/...`).
4. **Link condivisi pubblici**: flusso a 3 step (info → access → file). Conserva il `sessionToken` (valido 1h) per scaricare/preview.
5. **E2E**: tutta la crittografia avviene lato client; il backend è solo deposito di chiavi pubbliche/wrapped e backup cifrati.
   - **Backup keypair**: blob opaco `{ encryptedPrivateKey, iv }`, cifrato con la master key a 256 bit (no password/PBKDF2/salt). Vedi §4.6.
6. **Ownership**: gli endpoint verificano la proprietà via prefisso s3Key (`uploads/.../{sub}/`) o `ownerUserId`/`ownerId`; richieste su risorse altrui → `403`.
7. **Categorie file** disponibili per filtri: `image, video, audio, document, archive, text, other`.
9. **Streaming encryption (#6)**: per i file cifrati a chunk invia `formatVersion`/`chunkSize`/`originalSize` in `multipart/complete`. Il backend li persiste e li **restituisce** in `GET /api/user/files/dynamo`, `GET /api/shared-files` e `GET /api/shared-links/:publicToken`, così hai i parametri per decifrare in download. File **senza** questi campi (o `formatVersion=1`) = legacy → usa il percorso di download precedente. Non serve inviarli a `/api/share` o `/api/shared-links` (il backend li copia dal record file).
10. **Invio guest (§4.9)**: flusso multipart **no-auth** `init → urls → PUT chunk su S3 → complete`; il download poi usa il flusso pubblico dei link (§4.5). **Conserva il `manageToken`** ricevuto da `init` (mostrato **una volta sola**): serve per `revoke` e per il **claim** (§4.10). Se il backend ha `TURNSTILE_SECRET` impostato, invia `turnstileToken` (dal widget Turnstile) nel body di `init`, altrimenti ricevi `403 CAPTCHA_REQUIRED`. Il link finale è `<url>#<chiave>`: la chiave la aggiunge il client, il server non la vede mai. `expiresInHours` è limitato a `GUEST_MAX_EXPIRY`.
11. **Claim (§4.10)**: dopo login, `POST /api/share/claim { publicToken, manageToken }` per adottare un invio guest come file dell'account. Il `publicToken` **non cambia** (i link già condivisi restano validi); la retention viene estesa al piano dell'utente.
