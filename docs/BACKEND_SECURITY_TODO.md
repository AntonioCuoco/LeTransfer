# Backend Express — Modifiche di sicurezza richieste

> Documento operativo da passare al **repo backend Express (Fly.io)**. Raccoglie tutte le
> modifiche lato backend che derivano dal lavoro di sicurezza sul frontend Vue, più
> l'hardening dell'autenticazione. Contesto completo: `docs/SECURITY_IMPROVEMENTS.md`.
>
> **Contratto di autenticazione attuale (post-modifiche frontend):** il frontend invia su
> **tutte** le route protette `Authorization: Bearer <accessToken>` (Cognito), iniettato da un
> interceptor axios globale. Non manda più `idToken`. Le route leggono l'identità dal `sub`.

---

## 🔴 1. BLOCCANTE — Backup keypair: persistere il campo `iterations`

**Perché:** il frontend ora protegge il backup della private key con **PBKDF2 a 600.000
iterazioni** (prima 100k), e salva il numero di iterazioni **dentro il record di backup** per
retrocompatibilità. Se il backend non salva/restituisce questo campo, i **nuovi** backup non si
riescono più a ripristinare (deriverebbe la chiave con le iterazioni sbagliate → restore fallito).
I backup **vecchi** non sono a rischio (il frontend fa fallback a 100k se il campo manca).

**Endpoint coinvolti:** `POST /user/keypair-backup` e `GET /user/keypair-backup`.

**Cosa fare:** salvare e restituire il record di backup **verbatim**, includendo `iterations`.
Trattarlo come blob opaco: non validare/riscrivere i campi crittografici.

**Forma del body inviato dal frontend (POST):**
```json
{
  "encryptedPrivateKey": "<base64url>",
  "salt": "<base64url>",
  "iv": "<base64url>",
  "iterations": 600000
}
```

**Forma attesa in risposta (GET):**
```json
{ "success": true, "data": {
  "encryptedPrivateKey": "<base64url>",
  "salt": "<base64url>",
  "iv": "<base64url>",
  "iterations": 600000
} }
```

- `iterations` è un **number**, **opzionale** (i record già esistenti non ce l'hanno → il frontend
  assume 100000). Aggiungere la colonna/attributo senza migrazione dei dati vecchi.
- ⚠️ Da rilasciare **prima o insieme** al deploy del frontend, altrimenti chi ricrea il backup
  dopo il deploy non riesce più a ripristinarlo.

---

## 🔴 2. CRITICO — Verifica vera della firma JWT (`aws-jwt-verify`)

**Perché:** oggi il middleware fa `jwt.decode()` **senza verificare la firma** → un token forgiato
(payload arbitrario) viene accettato su **tutte** le route protette. È il buco di sicurezza più
grave lato backend (impersonazione totale).

**File:** `middleware/auth.js`.

**Cosa fare:** verificare il token contro le JWKS della User Pool Cognito.
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

**Cosa fare (dettaglio già in `BACKEND_CONSOLIDATION.md` §3.1–3.4):**
- Tutte protette da `authenticateToken`.
- **Non fidarsi del `userId` dal body**: usare `req.user.sub`.
- `init`: costruire la key come `uploads/files/${sub}/${Date.now()}-${randomUUID()}-${safeName}`.
- `urls` / `complete` / `abort`: verificare che `fileKey` inizi con `uploads/files/${req.user.sub}/`
  → altrimenti `403` (ownership).
- `complete`: scrivere i metadati su DynamoDB (`ownerUserId: sub`).

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

**Perché:** in dev gli header stanno in `vite.config.ts` (solo i "safe"). La **CSP autoritativa** va
imposta in **produzione** dove viene servito il build (CDN/host/Fly static o reverse proxy).

**Cosa fare (Response Headers sull'host del frontend):**
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

## 🔵 7. Preparare per le fasi frontend successive (non urgenti)

Modifiche che serviranno quando il frontend farà Fase 1/2. Solo da tenere presente ora.

- **`formatVersion` sui file (per lo streaming encryption, #6):** quando il frontend passerà alla
  cifratura a chunk, il record del file su DynamoDB dovrà avere un campo `formatVersion` (number),
  scritto in `complete` e restituito in lista/get, per sapere come decifrare. I file esistenti = v1.
- **Versione sui wrapped key (#9, opzionale):** il frontend legherà la file key al suo `s3Key` via
  AAD. Gestibile interamente lato client con fallback, ma se volete un campo `keyVersion` sul record
  della file key facilita la transizione. **Non necessario** se il frontend fa il fallback.

---

## ✅ Checklist

- [ ] **(BLOCCANTE)** `keypair-backup` salva e restituisce `iterations` (opzionale, number).
- [ ] **(CRITICO)** `middleware/auth.js` verifica la firma con `aws-jwt-verify`, `tokenUse: "access"`.
- [ ] Route multipart: `authenticateToken` + ownership su `uploads/files/${sub}/` + `userId` dal `sub`.
- [ ] CORS whitelist (dev + prod) e nessun `error.message` nelle risposte.
- [ ] Cognito password policy ≥12 con classi di caratteri.
- [ ] CSP + security headers sull'host del frontend (prod) + HTTPS.
- [ ] (Futuro) `formatVersion` sui file; (opz.) `keyVersion` sulle file key.

> Note di coordinamento: `email` non è nell'access token → risolverla via Cognito dove serve.
> Verificare che gli endpoint di logout usati dal frontend esistano (`/auth/logout` e/o `/logout`):
> ora ricevono l'accessToken via interceptor, senza header manuale.
