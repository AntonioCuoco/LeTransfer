# Backend — cosa fare adesso (consegna operativa)

> **A chi serve.** È l'elenco, in ordine di priorità, di ciò che manca **lato backend e infra**
> perché il prodotto possa aprire al pubblico. Ogni voce ha: cosa fare, perché, e **come si verifica**.
>
> **Contesto.** Il frontend è completo per E1 (invio senza account) — inclusi segnalazione, revoca e
> controllo pre-invio — e parla già tutti gli endpoint documentati in
> [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §4.9. Le voci qui sotto non sono "nuove feature": sono
> **promesse già fatte all'utente che oggi non sono mantenute**, più un difetto di sicurezza aperto.
>
> ⚠️ Lo stato del codice backend è dedotto da `BACKEND_API_DOCS.md`, non da un'ispezione del repo
> Express. Se qualcosa qui risulta già fatto, va spuntato lì e qui.
>
> Contesto di progetto: [ANTI_ABUSO.md](ANTI_ABUSO.md) · [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md)

---

## P0 — Blocca l'apertura al pubblico

### 1. Lifecycle di cancellazione su `uploads/guest/` 🌐 *infra*

**Cosa.** Regola di lifecycle sul bucket (R2 e/o S3) che cancella gli oggetti sotto `uploads/guest/`
dopo `GUEST_MAX_EXPIRY` (168h) + margine.

**Perché.** Oggi alla scadenza il **link** smette di funzionare, ma i **byte restano nel bucket**. È la
differenza tra "non è più accessibile" e "non c'è più", e noi promettiamo pubblicamente la seconda
(`/come-funziona`, `/sicurezza`). Finché la regola non c'è, stiamo dicendo una cosa non vera.

**Verifica.** Caricare un file guest con scadenza breve, attendere la scadenza + margine, controllare
con `HeadObject` che l'oggetto non esista più.

---

### 2. TTL DynamoDB sulla tabella `SharedLinks` 🌐 *infra*

**Cosa.** Abilitare il TTL **in console** sull'attributo `ttl` (il backend lo scrive già).

**Perché.** Senza, i record guest restano per sempre: il metadato sopravvive al file. Stessa promessa
del punto 1, altro archivio.

**Verifica.** Un record guest scaduto sparisce entro ~48h (il TTL DynamoDB è best-effort).

---

### 3. Verificare `TRUST_PROXY_HOPS` in produzione 🌐 *config*

**Cosa.** Confermare il valore corretto: `1` se c'è solo Fly davanti, `2` se il dominio passa dal
proxy Cloudflare.

**Perché.** `express-rate-limit` usa `req.ip`. Con gli hop sbagliati **conta l'IP del proxy**: tutti
gli utenti diventano un solo client, il rate limit non protegge niente e nei log sembra attivo. Un
controllo che dà falsa sicurezza è peggio di un controllo assente.

**Verifica.** Loggare `req.ip` su una rotta guest da due reti diverse: devono risultare due IP
diversi, e diversi dall'IP del proxy.

---

### 4. Difetto aperto — la quarantena è oggi uno strumento di censura ⚙️ *codice*

**Cosa.** Su `POST /api/guest/report/:publicToken`:

- **verifica Turnstile** come su `init`;
- **deduplicazione per (IP, publicToken)**: la seconda segnalazione dallo stesso IP sullo stesso link
  non incrementa il contatore;
- **soglia relativa ai download** invece della costante `ABUSE_AUTO_QUARANTINE_THRESHOLD = 3`:
  proposta `max(3, ceil(downloadCount × 0.05))` — 3 segnalazioni su 5 download sono un segnale,
  3 su 5000 sono rumore o sabotaggio;
- opzionale ma consigliato: registrare `reason` e timestamp per la revisione.

**Perché.** Oggi l'endpoint è pubblico, senza captcha, e bastano **tre richieste da tre IP** per
mettere in quarantena il link di chiunque ne conosca il token. Il frontend ha appena collegato il
bottone di segnalazione (prima non esisteva): da questo momento la debolezza è raggiungibile.

**Verifica.** 5 `report` dallo stesso IP → contatore a 1. Un `report` senza token Turnstile valido →
`403`. Un link con 1000 download non va in quarantena con 3 segnalazioni.

---

### 5. Appello sulla quarantena ⚙️ *codice*

**Cosa.** Endpoint per contestare una quarantena usando il `manageToken` (es.
`POST /api/guest/:publicToken/appeal`), che marca il record per revisione umana senza riattivarlo
automaticamente.

**Perché.** Una moderazione automatica senza appello è solo censura più veloce. Chi ha il
`manageToken` ha dimostrato di essere il mittente: è l'unico che possa contestare.

**Verifica.** Con `manageToken` corretto → `202` e record marcato. Senza → `403` uniforme.

---

### 6. `TURNSTILE_SECRET` in produzione 🌐 *config*

**Cosa.** Impostare la secret. **L'ordine di rollout è già rispettato**: il frontend invia
`turnstileToken` in `init` da tempo, quindi si può attivare senza rompere gli upload.

**Verifica.** Un `init` senza token → `403 CAPTCHA_REQUIRED`.

---

### 7. Cutover R2 completo 🌐 *infra*

**Cosa.** Bucket, API token scoped (object read/write/multipart/delete), **CORS** (origini frontend
dev+prod, metodi `GET/PUT/HEAD`, **expose `ETag`** — senza, il multipart si rompe),
`R2_JURISDICTION=eu` se il bucket è giurisdizionale, copia dati, flip delle env.

**Perché.** Il canale pubblico è download-heavy: è lì che l'egress S3 fa male e R2 (egress $0)
stravince. Il codice è già pronto (switch automatico sulle 4 env, `config/aws.js`): manca solo l'infra.

**Verifica.** Multipart completo (init→urls→PUT→complete), presigned GET, `HeadObject`.
⚠️ Su bucket EU senza `R2_JURISDICTION` → **403 su ogni operazione**.

---

### 8. Dominio → CSP autoritativa + HTTPS 🌐 *infra*

**Cosa.** CSP completa sull'host/CDN che serve il build (`connect-src` deve includere API Express +
host storage **finale**, quindi dopo il punto 7), più `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `frame-ancestors 'none'`. HTTPS ovunque → accende i cookie `Secure`.

**Nota per la CSP.** Il frontend è compatibile: font **self-hosted** (`font-src 'self'`), nessuna
libreria da CDN, QR generato in locale. L'unica origine esterna è **Cloudflare Turnstile**
(`script-src`/`frame-src`).

---

### 9. Caselle `security@` e `abuse@` 🌐 *processo*

**Cosa.** Devono esistere e avere qualcuno che legge. `/sicurezza` pubblica già
`security@letransfer.app`.

**Perché.** È la prima cosa che guardano registrar e provider quando arriva un reclamo, ed è la
differenza fra "hosting provider con un processo" e "hosting provider negligente".

---

## P1 — Serve per monetizzare (E3)

### 10. Notifiche di download ⚙️
Per gli invii con account: notifica (email/in-app) quando un link viene scaricato. È una delle tre
cose promesse in cambio della registrazione nel flusso "Reclama questo invio".

### 11. Contatore trasferimenti/mese ⚙️
Tracking usage per applicare il limite per piano (già rimandato in §5-ter delle API docs).

### 12. Webhook Stripe → `Subscriptions.plan` ⚙️
`loadPlan` legge già la tabella: manca chi la scrive.

---

## P2 — Alza la promessa (E2)

### 13. Nome del file cifrato ⚙️🖥️

**Cosa.** Oggi `fileName` viaggia in chiaro (`init` e `complete`), il backend lo salva nel record
`SharedLinks` e la pagina di ricezione lo mostra prima di decifrare. **La dichiarazione pubblica è
stata appena corretta per dire la verità** (`/come-funziona` sosteneva il contrario).

Per renderla vera invece che ritirarla: `complete` accetta un **blob opaco** al posto di `fileName`, e
`GET /api/shared-links/:publicToken` smette di restituirlo. Il client lo decifra con la chiave che ha
già nel fragment e lo mostra dopo. Serve un fallback per i record esistenti.

**Perché.** È l'ultimo metadato di contenuto che ci resta in mano. Toglierlo è il tipo di mossa che
questo prodotto può rivendicare e i concorrenti no.

---

## Riepilogo per priorità

| # | Voce | Tipo | Blocca il pubblico? |
|---|---|---|---|
| 1 | Lifecycle `uploads/guest/` | infra | ✅ promessa non mantenuta |
| 2 | TTL DynamoDB | infra | ✅ idem |
| 3 | `TRUST_PROXY_HOPS` | config | ✅ falsa sicurezza |
| 4 | Turnstile + dedup + soglia su `report` | codice | ✅ difetto raggiungibile |
| 5 | Appello quarantena | codice | 🟡 fortemente consigliato |
| 6 | `TURNSTILE_SECRET` | config | ✅ |
| 7 | Cutover R2 | infra | ✅ costo egress |
| 8 | Dominio + CSP + HTTPS | infra | ✅ |
| 9 | `security@` / `abuse@` | processo | ✅ |
| 10-12 | Notifiche, usage, Stripe | codice | ❌ serve per vendere |
| 13 | Nome file cifrato | codice | ❌ alza la promessa |

*Creato il 2026-08-02.*
