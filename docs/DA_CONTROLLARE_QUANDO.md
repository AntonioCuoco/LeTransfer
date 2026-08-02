# ⏳ Da controllare QUANDO — checklist condizionali

> **Cos'è questo file.** Cose che **oggi non vanno fatte**, ma che dovrai controllare/fare
> **quando si verifica una certa condizione** (dominio custom, lancio pubblico, piani a pagamento…).
> Non è la TODO del "fare adesso": è il promemoria per non dimenticare i passi differiti.
> Ogni voce ha **Condizione → Azione → Come verificare**.

Riferimenti: [MIGRATION_S3_TO_R2.md](MIGRATION_S3_TO_R2.md) · [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md) · [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md)

---

## 🌐 QUANDO aggiungi un dominio custom / vai in produzione

Oggi il backend gira su `*.fly.dev` (solo proxy Fly = 1 hop) e non c'è dominio. Al primo dominio vero:

- [ ] **`TRUST_PROXY_HOPS`** — decidi 1 vs 2 in base a **come passa il traffico** (NON conta il registrar dove compri il dominio):
  - dominio **dritto a Fly** o Cloudflare **"DNS only" (grigio)** → resta **1** (default, non tocchi niente)
  - dominio **dietro proxy Cloudflare "Proxied" (arancione)** → `fly secrets set TRUST_PROXY_HOPS=2`
  - **Verifica:** `curl -sI https://TUO-DOMINIO | grep -iE "server|cf-ray"` → se vedi `cf-ray`/`server: cloudflare` = 2 hop, altrimenti 1.
  - ⚠️ Se sbagliato: troppo basso = rate limit grezzo; troppo alto = spoofabile → anti-abuso guest aggirato.

- [ ] **`FRONTEND_URL`** (env su Fly) — impostala all'origin di produzione del frontend. Serve a due cose:
  build degli URL `/share/:token` **e** whitelist CORS del backend ([app.js](../app.js)).

- [ ] **CORS del bucket R2** — aggiungi l'origin di produzione del frontend alla CORS policy del bucket
  (oggi ci sono solo gli origin di dev). Metodi `GET/PUT/HEAD`, expose `ETag`.

- [ ] **CSP sull'host del frontend** → policy completa e motivata in **[PAGINE_CRITICHE.md](PAGINE_CRITICHE.md)**.
  In sintesi: `connect-src` deve includere l'host storage R2 (`<account>.r2.cloudflarestorage.com`, o il
  dominio custom/CDN) **e** l'endpoint Cognito (l'auth avviene nel browser); `frame-src` l'origine del captcha.
  - ⚠️ **NON aggiungere `challenges.cloudflare.com` a `script-src`.** Dal 2026-07-30 Turnstile è isolato in
    un iframe cross-origin ([public/captcha.html](../vue-app/public/captcha.html)): la pagina che genera le
    chiavi resta su `script-src 'self'`. Riammettere quel dominio annullerebbe l'isolamento.

- [ ] **Origine dedicata per il captcha** — pubblica `captcha.html` su un sottodominio (es. `captcha.letransfer.app`)
  e imposta `VITE_CAPTCHA_ORIGIN` di produzione. Deve essere un'**origine diversa** da quella dell'app,
  altrimenti l'isolamento non esiste. Aggiorna anche `ALLOWED_PARENTS` dentro `captcha.html` con il dominio reale.

- [ ] **Turnstile — hostnames del widget** — nel dashboard Cloudflare aggiungi alla lista Hostnames
  l'**origine del captcha** (`captcha.letransfer.app`), non quella dell'app: è lì che il widget viene
  renderizzato. Solo hostname, **senza porta né schema**.
  - 💡 In sviluppo aggiungi anche `localhost` **e** `127.0.0.1`: senza, il widget riceve `401` da Cloudflare.

- [ ] *(opzionale)* **Dominio custom + CDN davanti a R2** — solo se vuoi download pubblici serviti da un tuo
  dominio invece che dall'endpoint R2. Se lo fai, aggiorna anche la CSP `connect-src` di conseguenza.

---

## 🚀 QUANDO lanci la feature "invio guest" al pubblico

- [ ] **Ordine Turnstile (critico).** Il frontend deve **già** mostrare il widget e inviare `turnstileToken`
  nel body di `/api/guest/upload/init` **prima** che `TURNSTILE_SECRET` sia attivo sul backend.
  Se attivi il secret prima, ogni upload guest senza token → **403** (li rompi tutti).
  - **Verifica:** con secret attivo, un `init` senza token deve dare `403 CAPTCHA_REQUIRED`; un upload reale dall'app deve passare.

- [ ] **TTL DynamoDB abilitato** su `SharedLinks`, attributo **`ttl`** (Number). Senza, i record guest scaduti
  non si auto-cancellano. (I byte del file li cancella comunque la lifecycle R2.)

- [ ] **Lifecycle R2 attiva** su `uploads/guest/` (delete dopo 7 giorni) — è la garanzia dura di cancellazione.

- [ ] **Password policy Cognito ≥12** con classi di caratteri — hardening da avere prima del pubblico.

---

## 💳 QUANDO inizi a vendere piani a pagamento (E3 / D)

- [ ] **Tabella `Subscriptions`** (PK `userId`) + env **`SUBSCRIPTIONS_TABLE`**. Finché non esiste, il codice
  tratta tutti come `free` (fail-open) — corretto, ma nessuno può essere Pro/Business.

- [ ] **Webhook Stripe** → aggiorna `Subscriptions.plan` (checkout + webhook + portal). Non tocca l'E2E.

- [ ] *(opzionale)* **Conteggio trasferimenti/mese** (D.1) — richiede tracking d'uso; oggi non è imposto.
  Va aggiunto ai punti di enforcement (`multipart/init`, `/shared-links`).

---

## 🔁 QUANDO migri un bucket con dati ESISTENTI (non ora — sei partito da zero)

- [ ] **Copia i dati PRIMA di impostare le env R2**: `rclone` o `aws s3 sync` da S3 a R2, poi il flip delle env.
  Se imposti le env prima di copiare, i link vecchi si rompono (oggetti non trovati).

- [ ] *(opzionale)* **Dual-read** con fallback su S3 durante la finestra di copia.

---

## 📈 QUANDO i volumi (e i costi) crescono

- [ ] Il costo R2 dominante è lo **storage** ≈ *(GB caricati/mese) × (retention giorni ÷ 30) × $0,015*.
  Egress e operazioni restano trascurabili. Leve: **retention breve** (7 gg guest ok) e **cap dimensioni per tier**.

- [ ] Verifica i prezzi correnti sulla **pagina prezzi ufficiale Cloudflare R2** prima di fare piani finanziari.

---

## ⚙️ Variabili d'ambiente collegate (riferimento rapido)

| Env | Quando impostarla | Default se assente |
|---|---|---|
| `TRUST_PROXY_HOPS` | dominio dietro Cloudflare proxy → `2` | `1` (solo Fly) |
| `FRONTEND_URL` | dominio frontend di produzione | `https://letransfer.app` |
| `TURNSTILE_SECRET` | quando il frontend invia il token | assente → captcha **disattivato** (fail-open) |
| `SUBSCRIPTIONS_TABLE` | quando vendi i piani | assente → tutti `free` |
| `GUEST_*`, `ABUSE_AUTO_QUARANTINE_THRESHOLD` | per tarare l'anti-abuso | default sensati in [config/constants.js](../config/constants.js) |

---

## 💡 DA VALUTARE in futuro — "Invia il link direttamente a una persona" *(ultimo punto)*

**Idea.** Oltre a *cifra + crea link*, offrire un modo per **mandare il link direttamente** a qualcuno
(email / tasto "Condividi"), togliendo l'attrito del copia-incolla. Il copia-incolla resta come alternativa.
*(Mandare il **file** vero è escluso: il server ha solo ciphertext e gli allegati email non reggono file grossi → è sempre il **link**.)*

**Chiarimento di sicurezza (già ragionato — da non ridiscutere da zero).**
- La chiave sta nel **fragment `#`** dell'URL → il browser non la invia **mai** al server → il server vede solo
  ciphertext. **Non è un buco: è il punto di forza** (zero-knowledge). La "chiave nel link" è voluta.
- Il link è comunque una **capability portatile** (chi ce l'ha apre) — ma è già così oggi col copia-incolla;
  si governa con **scadenza / max download / password / revoca** (già implementati).
- L'**unico delta** tra i modi di invio è **chi vede la chiave in transito**:
  - `mailto:` / Web Share → solo mittente → destinatario (**nessun downgrade**)
  - email dal server (Resend) → anche **il nostro server + Resend + inbox** (piccolo strappo allo zero-knowledge)

**Opzioni sul tavolo.**
- **A) `mailto:` / Web Share** — solo frontend, privacy piena. Consigliata se lo zero-knowledge è LA promessa.
- **B) Email brandizzata dal server** — endpoint backend + Resend (già nello stack). Comoda/brandizzabile
  (anche notifica al download), ma il server vede la chiave. Da etichettare come "meno privata".
- **C) Verso utenti registrati** — riuso `routes/fileSharing.js` (chiave RSA-wrapped): pienamente E2E, il
  server non vede la chiave. Solo se il destinatario ha un account.

**Mitigazione da approfondire (idea da tenere).** Se si sceglie la via **B**, **legare una password al link**
e consegnarla/condividerla **fuori dall'email** (o richiederla all'apertura), così un'email intercettata **da
sola non basta** a scaricare. La password è già supportata (`isPasswordProtected`, argon2, gate lato server) —
da definire: password **auto-generata** vs scelta dall'utente, e **come consegnarla** al destinatario (out-of-band).

**Decisione che sblocca il design:** quanto si vuole vendere lo **zero-knowledge** come pilastro (→ **A**) vs
comodità stile WeTransfer (→ **B**). Finché non si decide, **non si implementa**.

---

*Aggiorna questo file quando spunti una voce o quando emerge un nuovo passo differito.*
