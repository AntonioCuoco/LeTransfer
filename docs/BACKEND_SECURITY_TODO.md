# Backend Express — Modifiche di sicurezza richieste

> Documento operativo da passare al **repo backend Express (Fly.io)**. Raccoglie tutte le
> modifiche lato backend che derivano dal lavoro di sicurezza sul frontend Vue, più
> l'hardening dell'autenticazione. Contesto completo: `docs/SECURITY_IMPROVEMENTS.md`.
>
> **Contratto di autenticazione attuale (post-modifiche frontend):** il frontend invia su
> **tutte** le route protette `Authorization: Bearer <accessToken>` (Cognito), iniettato da un
> interceptor axios globale. Non manda più `idToken`. Le route leggono l'identità dal `sub`.

---

## 🟢 1. Backup keypair: storage opaco `{ encryptedPrivateKey, iv }`

> **Aggiornato (design finale, 2026-06-27).** Sostituisce la versione precedente che chiedeva un
> campo `iterations`/`salt` (backup con password + PBKDF2). Quel design è stato **abbandonato**.

**Perché è cambiato:** il backup della private key RSA è ora cifrato con la **master key**
(AES-256 derivata dalla recovery key a 256 bit dell'utente), **non** con una password. Quindi:
niente PBKDF2, niente `salt`, niente `iterations`. Sicurezza più alta (il blob è inattaccabile
anche con il DB compromesso, perché la chiave è a piena entropia) e contratto più semplice.

**Endpoint:** `POST /user/keypair-backup` e `GET /user/keypair-backup`.

**Cosa fare:** trattare il record come **blob opaco** e salvarlo/restituirlo verbatim.

Body (POST) e risposta (GET → `data`):
```json
{ "encryptedPrivateKey": "<base64url>", "iv": "<base64url>" }
```

- **Nessun** campo `salt`/`iterations` (rimossi). Se lo schema li aveva, ignorarli.
- `GET` risponde `{ "success": true, "data": { ... } }`, oppure `404` se non esiste ancora un backup.
- Non è più "bloccante" come prima: essendo cifrato con una chiave a 256 bit, il blob è opaco e sicuro.

---

## ✅ 2. FATTO (verificato il 2026-08-02) — Verifica vera della firma JWT (`aws-jwt-verify`)

> **Stato: implementato.** `middleware/auth.js` verifica il token contro le JWKS della User Pool
> con `CognitoJwtVerifier` e `tokenUse: "access"`; `routes/fileSharing.js` riusa lo stesso verifier.
> Vedi [BACKEND_API_DOCS §2.1](BACKEND_API_DOCS.md).
>
> ⚠️ Questa sezione è rimasta a lungo a dire il contrario mentre il codice era già a posto: se
> modifichi il middleware, aggiorna **qui**, in [BACKEND_API_DOCS §2](BACKEND_API_DOCS.md) e in
> [PRODUCT_ROADMAP](PRODUCT_ROADMAP.md) — sono tre punti che parlano della stessa cosa.

**Perché contava:** con `jwt.decode()` la firma non veniva controllata → un token forgiato con
payload arbitrario sarebbe stato accettato su **tutte** le route protette (impersonazione totale).

**File:** `middleware/auth.js`.

**Com'è fatto:** verifica del token contro le JWKS della User Pool Cognito.
```js
import { CognitoJwtVerifier } from "aws-jwt-verify";

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse: "access",           // ← il frontend manda l'ACCESS token (vedi contratto sopra)
  clientId: process.env.COGNITO_CLIENT_ID,
});

export async function authenticateToken(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Access token required" });
  try {
    const payload = await verifier.verify(token);   // sub, ecc.
    req.user = { sub: payload.sub };                 // NON email: l'access token non ha email
    next();
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
}
```
- **`tokenUse: "access"` è obbligatorio** per matchare il frontend.
- L'**email non è nell'access token**: dove serve (es. `senderEmail`), risolverla via Cognito
  (`AdminGetUserCommand`) o dalla tabella utenti, non dal token.
- Vale per **tutte** le route 🔑.

---

## 🟠 3. Route multipart: auth + ownership + `userId` dal token

**Perché:** le vecchie Lambda multipart erano `AuthorizationType: NONE` e si fidavano del `userId`
dal body → chiunque poteva caricare nel bucket sotto qualsiasi utente. Portando le route
sull'Express **non ripetere** l'errore.

**Route:** `POST /api/upload/multipart/{init,urls,complete,abort}`.

**Cosa fare (contratto delle rotte in [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §4.3-bis):**
- Tutte protette da `authenticateToken`.
- **Non fidarsi del `userId` dal body**: usare `req.user.sub`.
- `init`: costruire la key come `uploads/files/${sub}/${Date.now()}-${randomUUID()}-${safeName}`.
- `urls` / `complete` / `abort`: verificare che `fileKey` inizi con `uploads/files/${req.user.sub}/`
  → altrimenti `403` (ownership).
- `complete`: scrivere i metadati su DynamoDB (`ownerUserId: sub`).

**🆕 Metadati formato v2 (streaming encryption #6 — GIÀ ATTIVO lato frontend).** Il frontend ora invia
tre campi nuovi che il backend deve **persistere** e **restituire** (senza questi il download non sa
come decifrare i file nuovi):
- **`init`** (body): `{ fileName, fileType, fileSize, originalSize, isEncrypted, formatVersion, chunkSize, userId }`.
- **`complete`** (body): `{ ..., formatVersion, chunkSize, originalSize, ... }`.
- **Persistere** su DynamoDB: `formatVersion` (number, es. 2), `chunkSize` (number), `originalSize` (number).
- **Restituire** questi 3 campi in **tutte** le risposte che elencano/servono file:
  `GET /user/files/dynamo`, `GET /shared-files`, e l'info del link pubblico `GET /shared-links/:token`.
- I file **senza** `formatVersion` (o `=1`) sono legacy → il frontend usa il vecchio percorso. Nessuna
  migrazione dei dati esistenti.

---

## 🟠 4. CORS ristretto + niente leak di errori interni

**Perché:** le vecchie Lambda usavano `Access-Control-Allow-Origin: *` e restituivano
`error.message` nel body.

**Cosa fare (in `app.js` / handler errori):**
- **CORS whitelist**: consentire solo le origini note.
  - dev: `http://localhost:5173` (o la porta di Vite);
  - prod: il dominio reale del frontend.
- **Errori**: loggare il dettaglio server-side (CloudWatch/Fly logs) ma rispondere al client con un
  messaggio **generico** (`{ error: "Internal Server Error" }`), mai `error.message` con stack/interni.

---

## 🟡 5. Password policy server-side (Cognito)

**Perché:** la validazione lato client (`password.length < 8`) è solo UX. La sicurezza vera è la
policy della User Pool.

**Cosa fare:** in Cognito (console/IaC), impostare: lunghezza minima **≥ 12**, con
maiuscole + minuscole + numeri + simboli.

---

## 🟡 6. Security headers / CSP sull'host che serve il frontend

> ⚠️ **La policy qui sotto è OBSOLETA.** La versione autoritativa e motivata è in
> **[PAGINE_CRITICHE.md](PAGINE_CRITICHE.md)**. Differenze principali: lo storage è **R2**, non S3;
> serve `frame-src` per l'**origine isolata del captcha**; e soprattutto **NON** va aggiunto
> `challenges.cloudflare.com` a `script-src` — Turnstile gira in un iframe cross-origin proprio
> perché la pagina che genera le chiavi possa restare su `script-src 'self'`.

**Perché:** in dev gli header stanno in `vite.config.ts` (solo i "safe"). La **CSP autoritativa** va
imposta in **produzione** dove viene servito il build (CDN/host/Fly static o reverse proxy).

**Cosa fare (Response Headers sull'host del frontend) — versione storica, vedi il documento sopra:**
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  connect-src 'self' https://*.amazonaws.com https://cognito-idp.*.amazonaws.com <URL-API-Express> <bucket-S3>;
  img-src 'self' data: blob:;
  style-src 'self' 'unsafe-inline';
  frame-ancestors 'none';
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```
- `connect-src` **deve** includere l'URL reale dell'API Express e il bucket S3, altrimenti
  fetch/upload vengono bloccati.
- Servire il frontend **solo su HTTPS** in prod: così i cookie `Secure` (già impostati dal frontend)
  si attivano.

---

## 🟠 7. Metadati formato v2 (#6 streaming) — ORA ATTIVO

> Il frontend è **già passato** alla cifratura a chunk (#6 implementato). Questo blocco non è più
> "futuro": senza questi campi i **nuovi** file non si possono decifrare in download.

- **Persistere** su DynamoDB, dalla `complete` (e leggere dalla `init`): `formatVersion` (number),
  `chunkSize` (number), `originalSize` (number). Dettaglio dei body in §3.
- **Restituire** i tre campi in `GET /user/files/dynamo`, `GET /shared-files`, `GET /shared-links/:token`.
- File senza `formatVersion` (o `=1`) = legacy, restano leggibili (nessuna migrazione).
- **Opzionale (#9):** un `keyVersion` sul record della file key facilita la transizione dell'AAD, ma
  **non è necessario** (il frontend fa fallback). Ignorabile.

---

## ✅ Checklist

- [x] `keypair-backup` salva/restituisce il blob opaco `{ encryptedPrivateKey, iv }` (no salt/iterations).
      ✅ verificato il 2026-08-02 su [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §4.6/§3.3 (la casella era rimasta indietro).
- [x] **(CRITICO)** `middleware/auth.js` verifica la firma con `aws-jwt-verify`, `tokenUse: "access"`. ✅ 2026-08-02
- [x] Route multipart: `authenticateToken` + ownership su `uploads/files/${sub}/` + `userId` dal `sub`. ✅ 2026-08-02
- [x] CORS whitelist (dev + prod) e nessun `error.message` nelle risposte. ✅ 2026-08-02
- [x] Cognito password policy ≥12 con classi di caratteri. ✅ 2026-08-02
- [ ] BLOCCATO DAL DOMINIO - CSP + security headers sull'host del frontend (prod) + HTTPS.
- [x] **(#6)** `formatVersion`/`chunkSize`/`originalSize` persistiti in `complete` e restituiti in lista/get/link.
      ✅ verificato il 2026-08-02 su API docs §4.3-bis/§4.5/§4.8; il frontend li consuma in download e anteprima.

> Note di coordinamento: `email` non è nell'access token → risolverla via Cognito dove serve.
> Verificare che gli endpoint di logout usati dal frontend esistano (`/auth/logout` e/o `/logout`):
> ora ricevono l'accessToken via interceptor, senza header manuale.
