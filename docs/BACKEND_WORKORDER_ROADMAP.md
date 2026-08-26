# Backend — Work order (Orizzonte 1 della roadmap)

> **Cos'è questo documento.** La specifica operativa, "per filo e per segno", del lavoro **backend**
> necessario per il primo orizzonte della [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) (epiche E0, E0.5, E1, E3).
> Pensato per essere passato al **repo Express separato** (Fly.io) e implementato così com'è.
>
> **Contesto stack** (da [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §1): Node + Express 5, `@aws-sdk/*`,
> `DynamoDBDocumentClient`, `express-rate-limit`, `express-validator`, `nanoid`, `uuid`, `argon2`, `helmet`.
> Tutto ciò che serve è già in casa.
>
> **Come leggerlo.** Le sezioni **A** ed **B** sono già specificate altrove → qui do solo il puntatore
> + l'ordine + le cose da confermare. La sezione **C (invio senza account)** e la **D (piani + claim)**
> erano **design nuovo**: oggi sono **implementate** (vedi sotto).

---

## 📍 Stato al 2026-08-02 — §C e §D sono IMPLEMENTATE

> **Attenzione, questo documento era rimasto indietro.** Le sezioni C e D qui sotto sono scritte al
> futuro ("da fare"), ma [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) — che dichiara di essere *aggiornato
> al codice corrente* — documenta gli endpoint come **esistenti**. Vanno quindi lette come **specifica di
> ciò che è stato costruito**, non come lavoro aperto.
>
> ⚠️ **Provenienza di questa verifica**: il repo Express è separato e non è stato ispezionato riga per
> riga. Lo stato qui sotto è dedotto da `BACKEND_API_DOCS.md`. Prima di dichiararlo in pubblico va
> confermato eseguendo le prove di §C.10.

| Blocco | Stato | Riferimento |
|---|---|---|
| **A — E0 hardening** | 🟡 #15 firma JWT ✅ · #7 CORS + no error-leak ✅ · #14 ownership multipart ✅ · #12 password policy ✅ · **#3 CSP + HTTPS aperti** (bloccati dal dominio) | API docs §2.1, §6, §5 |
| **B — E0.5 R2** | 🟡 **codice fatto**, infra da fare: `config/aws.js` fa lo switch automatico su 4 env R2, omette ACL/SSE su R2. Restano bucket, API token, CORS, **lifecycle su `uploads/guest/`**, copia dati, flip | API docs §5-bis |
| **C — E1 invio guest** | 🟢 **fatta**: `init/urls/complete/abort`, `revoke`, `report`+quarantena, record guest (`isGuest`/`ttl`/`manageTokenHash`/`abuseReports`), rate limit per IP, Turnstile, cap dimensione reale a `complete` | API docs §4.9, §5-quater |
| **D — E3 piani + claim** | 🟢 **quasi fatta**: `loadPlan` + enforcement su link e multipart, `POST /api/share/claim`. Restano contatore trasferimenti/mese e webhook Stripe | API docs §4.10, §5-ter |

### Conseguenza operativa: il buco è nel frontend, non nel backend

`report` e `revoke` **esistono e non hanno un bottone**. La quarantena automatica scatta a
`ABUSE_AUTO_QUARANTINE_THRESHOLD` segnalazioni, ma senza UI quella soglia non può essere raggiunta da
nessuno: la macchina di takedown è montata e la leva non è collegata. È il primo lavoro da fare
(vedi [FRONTEND_WORKORDER_ROADMAP.md](FRONTEND_WORKORDER_ROADMAP.md) §F1.5), e vale più di qualunque
controllo lato client.

---

## 0. Precondizioni e incongruenze da risolvere PRIMA di scrivere codice

Da chiarire con chi conosce lo stato attuale del repo Express, perché i doc si contraddicono:

1. ~~**Stato reale di `middleware/auth.js`.**~~ ✅ **RISOLTO il 2026-08-02.** Il codice è stato ispezionato:
   `authenticateToken` verifica davvero la firma (`CognitoJwtVerifier`, `tokenUse:"access"`) e
   `routes/fileSharing.js` riusa lo stesso verifier. Aveva ragione [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §2.1;
   gli altri documenti erano rimasti indietro e sono stati allineati. **#15 è fatto.**
2. ~~**Incongruenza `tokenUse`.**~~ ✅ **RISOLTO il 2026-08-02.** Uno snippet nelle docs diceva
   **`tokenUse: "id"`** ed è stato corretto in **`"access"`**, che è il contratto reale (il codice fa già
   così). Promemoria che resta valido: l'email non è nell'access token → va risolta via Cognito dove serve.
3. **Ordine con R2 (§B).** Le nuove rotte "guest" (§C) toccano lo storage: vanno scritte **puntando a R2**
   (dopo E0.5), non prima, per non rifarle. Ma #15 (§A) è indipendente dallo storage → si fa **subito**.

---

## A. E0 — Hardening di sicurezza  *(già specificato — solo puntatore + ordine)*

Specifica completa: **[BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md)**. Da fare in quest'ordine:

1. ✅ ~~**[#15] Verifica firma JWT**~~ — **FATTO** (verificato il 2026-08-02): `CognitoJwtVerifier`,
   `tokenUse:"access"`, stesso verifier riusato in `routes/fileSharing.js`.
   → **Il primo task aperto è ora il #7.**
2. **[#7 — PRIMO APERTO] CORS whitelist** (dev + prod) + **niente `error.message`** nelle risposte 500 (§4).
3. **[#5-Cognito] Password policy** ≥12 con classi di caratteri (§5) — è config Cognito, non codice.
4. **[#3] CSP + security headers** sull'host che serve il build (§6) — **dopo E0.5** (il `connect-src`
   deve puntare all'host storage finale = R2). HTTPS obbligatorio in prod.
5. **[#14] Route multipart**: `authenticateToken` + ownership su `uploads/files/${sub}/` + `userId` dal `sub`
   + persistere `formatVersion`/`chunkSize`/`originalSize` (§3, §7). *(Probabilmente già fatto col consolidamento
   Lambda→Express — verificare.)*

> Nulla da riscrivere qui: seguire `BACKEND_SECURITY_TODO.md`. Questo work order aggiunge solo **C** e **D**.

---

## B. E0.5 — Migrazione storage S3 → R2  *(già specificato — solo puntatore + sottoinsieme backend)*

Specifica completa: **[MIGRATION_S3_TO_R2.md](MIGRATION_S3_TO_R2.md)**. Parte backend, in sintesi:

- Aggiungere env `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`.
- Aggiornare **ogni** `new S3Client({...})` con `endpoint` R2 + `region:'auto'` + credenziali R2.
- Configurare **CORS sul bucket R2** (origin frontend dev+prod, `GET/PUT/HEAD`, expose `ETag`).
- Test end-to-end: multipart, presigned GET, `HeadObject`. Copia dati con **dual-read** (fallback S3).
- (Consigliato) dominio custom + CDN Cloudflare davanti al bucket per i download pubblici.

> **Le rotte guest (§C) usano lo stesso `S3Client`**: una volta puntato a R2, ereditano R2 gratis.

---

## C. E1 — Invio SENZA account  *(DESIGN NUOVO E COMPLETO — il grosso del lavoro)*

Obiettivo: chiunque, **senza login**, carica un file cifrato E2E e ottiene un link condivisibile. Il server
vede **solo ciphertext**; la chiave nasce nel browser e sta nel fragment `#` del link (mai al server).
Con **controlli anti-abuso** seri (il canale non autenticato è il più esposto — Firefox Send è morto per questo).

### C.1 Principio: cosa si RIUSA e cosa è NUOVO

| Pezzo | Stato | Nota |
|---|---|---|
| **Download** (info → access → file, session token, password, scadenza, max download) | ♻️ **Riuso** | Il flusso pubblico `GET/POST /api/shared-links/:token*` esiste già ed è no-auth. Basta che gestisca record **senza owner**. |
| **Chiave nel fragment `#`** | ♻️ **Riuso** | Già implementato lato frontend (`createKeyHash`). Il backend non la vede mai. |
| **Tabella `SharedLinks`** | ♻️ **Riuso esteso** | Si aggiungono pochi campi (§C.2). |
| **Upload senza auth** (init/urls/complete/abort) | 🆕 **Nuovo** | Mirror del multipart ma **senza `authenticateToken`** e ownership per **token**, non per utente. |
| **Prefisso storage + TTL** | 🆕 **Nuovo** | `uploads/guest/{transferId}/` con lifecycle di auto-cancellazione. |
| **Anti-abuso** (rate limit, captcha, size, report, revoca, quarantena) | 🆕 **Nuovo** | §C.7. |

**Idea chiave:** un invio senza account **è** un link pubblico senza proprietario. Quindi il `complete`
scrive direttamente un record `SharedLinks` e il **download riusa il flusso pubblico già esistente**.

### C.2 Modello dati — estensione di `SharedLinks`

Aggiungere al record `SharedLinks` (vedi [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §3.2) questi campi per gli invii guest:

```jsonc
{
  // ... campi esistenti (id, publicToken, s3Key, fileName, fileSize, fileType,
  //     isPasswordProtected, passwordHash?, expiresAt, maxDownloads?, downloadCount,
  //     revokedAt?, createdAt, formatVersion?, chunkSize?, originalSize?) ...

  "ownerId": null,             // 🆕 null per gli invii senza account (oggi è il Cognito sub)
  "isGuest": true,             // 🆕 discrimina il record guest
  "transferId": "<uuid>",      // 🆕 = segmento del prefisso storage (per cleanup/lifecycle)
  "manageTokenHash": "<sha256>",// 🆕 hash del segreto di gestione (revoca/claim). NON in chiaro.
  "abuseReports": 0,           // 🆕 contatore segnalazioni (quarantena automatica a soglia)
  "ttl": 1737590400            // 🆕 epoch secondi per DynamoDB TTL (= expiresAt + grace)
}
```

- **DynamoDB TTL**: abilitare il TTL sull'attributo `ttl` (Number, epoch secondi). ⚠️ La cancellazione TTL è
  *best-effort* (fino a ~48h di ritardo) → **non** è la garanzia sui byte: quella è il **lifecycle S3/R2** (§C.3).
- Il download deve comunque controllare `expiresAt`/`revokedAt` **a runtime** (già fatto: `LINK_EXPIRED`,
  `LINK_REVOKED`).
- `ownerId: null` non può essere chiave di un GSI → assicurarsi che i GSI su `SharedLinks` (se esistono su `ownerId`)
  **tollerino l'assenza** (non scrivere l'attributo del GSI per i record guest, come già si fa altrove per i null).

### C.3 Storage & lifecycle (auto-cancellazione)

- **Prefisso**: `uploads/guest/{transferId}/{timestamp}-{uuid}-{safeName}` — **separato** da `uploads/files/{sub}/`.
- **Lifecycle rule** su S3/R2: gli oggetti sotto `uploads/guest/` scadono dopo **N giorni** (default 7, = `GUEST_MAX_EXPIRY`).
  È la **garanzia dura** di cancellazione anche se il record DB sopravvive.
- I file guest sono comunque **formato v2** (chunked) → persistere `formatVersion`/`chunkSize`/`originalSize`.

### C.4 Endpoint upload SENZA auth (nuovo router `routes/guest.js`)

Legenda auth: 🔓 nessuna (ma **gated** da rate-limit + captcha). Montare **prima** del catch-all `/api/*`.

#### `POST /api/guest/upload/init` 🔓
- **Gate**: verifica **Cloudflare Turnstile** (token dal client) + **rate limit per IP** (§C.7).
- **Body**: `{ fileName, fileType, fileSize, originalSize, formatVersion, chunkSize, turnstileToken }`.
- **Validazioni**: `fileSize ≤ GUEST_MAX_FILE_SIZE`; `fileName` sanitizzato; tipo consentito.
- **Logica**: verifica Turnstile → genera `transferId = randomUUID()`, `publicToken = nanoid(21)`,
  `manageToken = nanoid(32)` (in chiaro **solo** nella risposta, mai salvato),
  `fileKey = uploads/guest/${transferId}/${Date.now()}-${randomUUID()}-${safeName}` → `CreateMultipartUploadCommand`.
- **Risposta**: `{ transferId, publicToken, manageToken, uploadId, fileKey }`.
- *(Nessun record DB ancora: si scrive al `complete`. Se il client abbandona, il multipart pendente lo pulisce
  l'abort o il lifecycle S3 dei multipart incompleti.)*

#### `POST /api/guest/upload/urls` 🔓
- **Body**: `{ fileKey, uploadId, partNumbers: number[] }`.
- **Ownership per token**: `fileKey` **deve** iniziare con `uploads/guest/` → altrimenti `403`. (La capability è
  conoscere `fileKey`+`uploadId`, restituiti solo al chiamante di `init`.)
- **Logica**: presigned `UploadPartCommand` per ogni parte (`expiresIn: 3600`). **Risposta**: `{ urls: { [n]: url } }`.

#### `POST /api/guest/upload/complete` 🔓
- **Body**: `{ fileKey, uploadId, parts:[{PartNumber,ETag}], publicToken, manageToken, fileName, fileSize,
  fileType, formatVersion, chunkSize, originalSize, password?, expiresInHours?, maxDownloads? }`.
- **Verifica**: prefisso `uploads/guest/`. `expiresInHours ≤ GUEST_MAX_EXPIRY` (default/clamp 168).
- **Logica**:
  1. `CompleteMultipartUploadCommand` (parti ordinate per `PartNumber`).
  2. **Ricontrollo dimensione reale**: `HeadObjectCommand` → se `ContentLength > GUEST_MAX_FILE_SIZE` →
     `AbortMultipartUpload`/`DeleteObject` + `413`. *(Le presigned PUT non impongono la dimensione: questo è il
     punto dove la si fa rispettare davvero.)*
  3. Scrivi il record `SharedLinks` guest (§C.2): `ownerId:null`, `isGuest:true`, `transferId`,
     `manageTokenHash = sha256(manageToken)`, `isPasswordProtected = !!password`,
     `passwordHash = password ? await argon2.hash(password) : undefined`,
     `expiresAt = now + expiresInHours`, `ttl = epoch(expiresAt) + grace`, `downloadCount:0`, `abuseReports:0`,
     `formatVersion/chunkSize/originalSize`.
- **Risposta**: `{ publicToken, url: "<FRONTEND_URL>/share/<publicToken>", expiresAt }`.
  *(Il client appende `#<chiave>` al link — il server non la vede.)*

#### `POST /api/guest/upload/abort` 🔓
- **Body**: `{ fileKey, uploadId }`. Verifica prefisso → `AbortMultipartUploadCommand`. **Risposta**: `{ status:'aborted' }`.

### C.5 Download — RIUSO del flusso pubblico esistente

Nessun endpoint nuovo. Verificare che questi **funzionino con record `ownerId:null`**:
- `GET /api/shared-links/:publicToken` (info pubbliche) → deve restituire anche `formatVersion/chunkSize/originalSize`.
- `POST /api/shared-links/:publicToken/access` (visitorName + password opz. → session token). Già ok.
- `GET /api/shared-links/:publicToken/file` (presigned GET, incrementa `downloadCount`, enforce
  `maxDownloads`/`expiresAt`/`revokedAt`). **Deve puntare a R2** dopo E0.5.
- ⚠️ **Audit**: controllare che questi handler non assumano un `ownerId` non-null (query, log, branch). Se lo fanno,
  renderli tolleranti al guest.

### C.6 Gestione dell'invio (revoca) e segnalazione abuso

#### `POST /api/guest/:publicToken/revoke` 🔓
- **Body**: `{ manageToken }`. Verifica `sha256(manageToken) === record.manageTokenHash` → set `revokedAt = now`
  (+ opzionale `DeleteObject` immediato). Errori generici (non rivelare l'esistenza del token). È così che chi ha
  inviato senza account può **revocare** il proprio trasferimento.

#### `POST /api/guest/report/:publicToken` 🔓
- **Gate**: rate limit per IP (anti-flood delle segnalazioni). **Body**: `{ reason? }`.
- **Logica**: `abuseReports += 1`; se `≥ ABUSE_AUTO_QUARANTINE_THRESHOLD` → `revokedAt = now` (**quarantena
  automatica**) + flag per revisione manuale. Risposta **generica** di presa in carico.

### C.7 Modello anti-abuso (obbligatorio, non opzionale)

| Controllo | Come | Env |
|---|---|---|
| **Rate limit per IP** | `express-rate-limit` dedicato su `/api/guest/*`: N `init`/IP/ora, M GB/IP/giorno | `GUEST_RATE_*` |
| **Captcha** | **Cloudflare Turnstile** su `init` (verifica server-side via `siteverify`) — coerente con la scelta R2/Cloudflare | `TURNSTILE_SECRET` |
| **Cap dimensione** | validato in `init` (dichiarato) **e** in `complete` (`HeadObject` reale → 413) | `GUEST_MAX_FILE_SIZE` |
| **Scadenza breve + auto-delete** | lifecycle S3/R2 su `uploads/guest/` + DynamoDB TTL | `GUEST_MAX_EXPIRY` |
| **Report → quarantena** | `abuseReports` + soglia auto-revoca | `ABUSE_AUTO_QUARANTINE_THRESHOLD` |
| **Revoca rapida** | `manageToken` (mittente) o revisione manuale | — |

⚠️ **Trust proxy.** Dietro Fly.io/Cloudflare, `req.ip` va letto dall'`X-Forwarded-For` reale:
impostare `app.set('trust proxy', ...)` correttamente, **altrimenti il rate limit vede l'IP del proxy** (inutile).
⚠️ **CSP.** Se si usa Turnstile, il `connect-src`/`script-src` della CSP (§A #3) deve includere
`https://challenges.cloudflare.com`.

### C.8 Cosa resta IMPOSSIBILE (ed è giusto così)

- **Scansione malware/contenuti lato server: impossibile.** Il server ha solo ciphertext. La difesa è
  **procedurale + client-side**: scan on-device pre-invio (frontend, epica E5), rate limit, scadenze brevi,
  report/quarantena, revoca. Metterlo nero su bianco: non è una mancanza, è la conseguenza dello zero-knowledge.

### C.9 Env & IAM nuovi per §C

```
GUEST_MAX_FILE_SIZE=2147483648        # 2 GB (tarabile)
GUEST_MAX_EXPIRY=168                  # ore (7 giorni)
GUEST_RATE_MAX_INIT_PER_HOUR=…        # per IP
GUEST_RATE_MAX_GB_PER_DAY=…           # per IP
ABUSE_AUTO_QUARANTINE_THRESHOLD=…    # non pubblicato: vedi nota
TURNSTILE_SECRET=…
```
- **IAM/token storage**: gli stessi permessi multipart già in uso (`CreateMultipartUpload`, `UploadPart`,
  `CompleteMultipartUpload`, `AbortMultipartUpload`, `GetObject`, `HeadObject`, `DeleteObject`) — su R2 è l'API token scoped.
- **Lifecycle**: configurare la regola su `uploads/guest/` (S3 e/o R2).

### C.10 Criteri di accettazione §C

> Implementati (API docs §4.9). Restano da **verificare sul campo**: sono prove, non codice da scrivere.

- [x] Un utente **non loggato** carica un file cifrato e riceve un link `/(share)/:token`; il server riceve **solo ciphertext**.
- [x] Il download del link guest funziona col flusso pubblico esistente (info → access → file), anche con password.
- [x] File > `GUEST_MAX_FILE_SIZE` respinto al `complete` (413) e ripulito — enforce reale via `HeadObject`.
- [ ] Scadenza: dopo `expiresAt` il download dà `LINK_EXPIRED`; l'oggetto sparisce per lifecycle.
      ⚠️ La **lifecycle su `uploads/guest/` è un passo infra manuale** (§5-bis punto 3) e non risulta fatta:
      finché non c'è, i byte restano nel bucket oltre la scadenza logica del link. È la differenza tra
      "il link non funziona più" e "il file non c'è più", e noi promettiamo la seconda.
- [x] `revoke` col `manageToken` disattiva subito il link; senza/errato → generico, nessun leak.
- [x] `report` incrementa il contatore e alla soglia mette in quarantena (revoca) il link.
      ⚠️ **Inerte finché il frontend non espone il bottone** (vedi sopra).
- [ ] Rate limit per IP attivo e basato sull'IP reale (**`TRUST_PROXY_HOPS` da verificare in prod**: se
      sbagliato conta l'IP del proxy e il rate limit non protegge nulla, pur sembrando attivo).
- [ ] Turnstile verificato server-side su `init` — codice pronto, ma `TURNSTILE_SECRET` va impostata
      **dopo** che il frontend manda già il token, altrimenti ogni upload guest va in `403`.

---

## D. E3 — Piani, limiti e "claim" del trasferimento  *(DESIGN NUOVO)*

### D.1 Limiti per tier, applicati server-side

Oggi i limiti sono di fatto solo lato client → vanno **imposti dal backend**.

- **Dove salvare il piano**: attributo Cognito `custom:plan` **oppure** tabella `Subscriptions` (PK `userId`)
  aggiornata dal webhook pagamenti. Consigliata la tabella (più flessibile del custom attribute).
- **Middleware** `loadPlan` (dopo `authenticateToken`): popola `req.plan` (`free|pro|business`, default `free`).
- **Config limiti** (tarabile):

  | Limite | Free | Pro | Business |
  |---|---|---|---|
  | Dimensione max file | es. 2 GB | es. 20 GB | es. 100+ GB |
  | Retention max (`expiresInHours`) | 7 gg | 30 gg | configurabile |
  | Trasferimenti/mese | limitato | illimitato | illimitato |
  | Cronologia | breve | completa | completa + audit |

- **Punti di enforcement**: `POST /api/shared-links` (clamp `expiresInHours`, `maxDownloads`), `multipart/init`
  (cap dimensione), eventuale contatore trasferimenti/mese.

### D.2 "Claim": trasformare un invio senza account in un file dell'account

Endpoint per il funnel senza-account → Free/Pro (roadmap §1).

#### `POST /api/share/claim` 🔑
- **Body**: `{ publicToken, manageToken }`.
- **Logica**:
  1. Carica il record `SharedLinks` guest; verifica `sha256(manageToken) === manageTokenHash`.
  2. `ownerId = req.user.sub`, `isGuest = false`; **estendi `expiresAt`** secondo il piano dell'utente; rimuovi/riallinea `ttl`.
  3. **Sottrarre l'oggetto dal lifecycle guest** (altrimenti verrebbe cancellato). Due opzioni:
     - **(a, consigliata) Copia + re-home**: `CopyObject` `uploads/guest/{transferId}/…` → `uploads/files/{sub}/…`,
       aggiorna `s3Key` nel record, `DeleteObject` originale. Su R2 la copia intra-bucket è un'operazione Class A
       (economica, **niente egress**). Pulito: l'oggetto esce dal prefisso a scadenza.
     - **(b) Object tagging**: taggare l'oggetto (`guest=claimed`) e configurare il lifecycle per escludere quel tag.
       Meno copie, ma regole lifecycle più complesse.
- **Nota crittografica importante**: il file guest è cifrato con una **chiave casuale nel fragment**, *non* con la
  coppia RSA dell'utente. Il claim **non ri-cifra nulla**: ri-ospita solo l'oggetto e riassegna il record. Il file
  resta decifrabile **solo** tramite la chiave nel link (che l'utente possiede). Resta un elemento "in stile link
  pubblico", non un file E2E personale. → nessun rewrapping di chiavi al claim.
- **Risposta**: `{ ok: true, fileId }`.

### D.3 Pagamenti (Stripe) — fuori dallo scope crittografico

- Webhook Stripe → aggiorna `Subscriptions.plan`. È lavoro backend "classico" (checkout, webhook, portal),
  **non tocca** l'E2E. Progettabile a parte quando si affronta E3 sul serio.

---

## E. Checklist finale consolidata (per il backend)

**Precondizioni**
- [x] Confermato lo stato reale di `middleware/auth.js` (§0.1) e risolta l'incongruenza `tokenUse` → **access** (§0.2). ✅ 2026-08-02

**A — E0 (vedi BACKEND_SECURITY_TODO.md)**
- [x] #15 verifica firma JWT (`aws-jwt-verify`, `tokenUse:"access"`) su tutte le route 🔑. ✅ 2026-08-02
- [x] #7 CORS whitelist + niente `error.message`. (2026-08-02)
- [x] Password policy Cognito ≥12. (2026-08-02)
- [x] #14 multipart auth + ownership + metadati v2 — fatto col consolidamento.
- [ ] #3 CSP/headers + HTTPS — **dopo E0.5**, e bloccato dal dominio.

**B — E0.5 (vedi MIGRATION_S3_TO_R2.md)** — *codice fatto, infra aperta*
- [x] `S3Client` → switch automatico su endpoint R2 quando le 4 env sono presenti (ACL/SSE omessi su R2).
- [ ] Bucket R2 + API token scoped, **CORS** (expose `ETag`, serve al multipart), **lifecycle su `uploads/guest/`**,
      copia dati, flip delle env, (opz.) dominio custom + CDN.
- [ ] `R2_JURISDICTION=eu` se il bucket è giurisdizionale — senza, **403 su ogni operazione**.

**C — E1 invio senza account** — *fatta*
- [x] Router `routes/guest.js`: `init`/`urls`/`complete`/`abort` no-auth + ownership per prefisso.
- [x] Estensione record `SharedLinks` (isGuest, ownerId omesso, transferId, manageTokenHash, abuseReports, ttl).
- [ ] DynamoDB TTL **da abilitare in console** sulla tabella `SharedLinks` (non è codice).
- [x] Prefisso `uploads/guest/`; ❌ lifecycle di auto-cancellazione ancora da configurare (vedi B).
- [x] Download: flusso `/shared-links/:token*` funziona con record senza owner.
- [x] `revoke` (manageToken, confronto a tempo costante) + `report` (quarantena a soglia).
- [x] Anti-abuso: rate limit per IP, Turnstile, cap dimensione reale a `complete`.
- [ ] ⚠️ **Frontend mancante**: nessun bottone per `report` né per `revoke` → la quarantena non può scattare.

**D — E3 piani + claim** — *quasi fatta*
- [x] Middleware `loadPlan` + enforcement dei limiti (clamp retention sui link, `413` su multipart init/complete).
- [x] `POST /api/share/claim` (re-home dell'oggetto + riassegnazione owner, `publicToken` invariato, senza rewrapping chiavi).
- [ ] Contatore trasferimenti/mese (richiede tracking usage).
- [ ] (a parte) Webhook Stripe → `Subscriptions.plan`.

---

*Creato il 2026-07-23. Copre l'Orizzonte 1 backend della roadmap. E2/E4–E9 (privacy receipt, post-quantum,
compliance, key transparency, team) hanno tocchi backend minori o futuri: si progettano quando si arriva lì.*
