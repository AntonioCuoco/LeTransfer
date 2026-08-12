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

## Come questo documento si incastra con gli altri

Questo file è **l'indice unico** del lavoro backend aperto. Non sostituisce le specifiche di
dettaglio: per ogni voce, dove esiste un documento che spiega *come* si fa, il link è nella voce.

| Documento | Cosa contiene | Rapporto con questo |
|---|---|---|
| [DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md) | Checklist **condizionali** (quando prendi il dominio, quando apri al pubblico, quando accendi i pagamenti) con procedure di verifica puntuali | ⭐ **Fonte di dettaglio per tutta la §P0 infra.** Ha cose che qui non ripeto: come decidere `TRUST_PROXY_HOPS` con `curl \| grep cf-ray`, gli hostname Turnstile, l'origine dedicata del captcha |
| [MIGRATION_S3_TO_R2.md](MIGRATION_S3_TO_R2.md) | Il piano R2 passo per passo + i conti dei costi | Dettaglio della voce 7 |
| [EMAIL_NOTIFICHE.md](EMAIL_NOTIFICHE.md) | Design dell'invio email (Resend, template, aggancio) | Dettaglio della voce 14 |
| [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) | Il contratto completo: architettura, auth, modelli, endpoint, config | ⭐ **Fonte di verità sullo stato del codice.** La migrazione Lambda → Express è chiusa e il suo piano è stato archiviato |
| [BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md) | I punti #1–#15 di hardening | Aperto solo #3 (CSP/HTTPS), qui alla voce 8 |
| [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md) | Punti rinviati + **checklist di verifica** | Non è lavoro da scrivere: sono prove da eseguire, vedi §Verifiche |

> **Nota di igiene documentale (2026-08-02).** Diverse caselle in quei file erano rimaste indietro
> rispetto al codice — davano per aperte cose implementate da tempo (router multipart, share
> utente→utente, metadati streaming, blob opaco del backup, password policy, switch R2 nel codice).
> Sono state corrette. Se trovi un'altra casella che non corrisponde alla realtà, il documento da
> credere è `BACKEND_API_DOCS.md`, che dichiara di seguire il codice.

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

**Stato (2026-08-12): ✅ implementato** in `routes/guest.js`. `report` ora usa `verifyTurnstile` (come
`init`, fail-open senza secret), **dedup per (hash IP, link)** via `reporterIpHashes`, **soglia
relativa** `max(3, ceil(downloadCount × ABUSE_REPORT_DOWNLOAD_RATIO))` (default ratio 0.05), e log capped
`abuseReportsLog` di `{ at, reason }` per la revisione. ⚠️ **Frontend**: quando `TURNSTILE_SECRET` è
attivo, il bottone report deve inviare `turnstileToken` (altrimenti `403`).

---

### 5. Appello sulla quarantena ⚙️ *codice*

**Cosa.** Endpoint per contestare una quarantena usando il `manageToken` (es.
`POST /api/guest/:publicToken/appeal`), che marca il record per revisione umana senza riattivarlo
automaticamente.

**Perché.** Una moderazione automatica senza appello è solo censura più veloce. Chi ha il
`manageToken` ha dimostrato di essere il mittente: è l'unico che possa contestare.

**Verifica.** Con `manageToken` corretto → `202` e record marcato. Senza → `403` uniforme.

**Stato (2026-08-12): ✅ implementato** — `POST /api/guest/:publicToken/appeal { manageToken }` in
`routes/guest.js`: verifica il `manageToken` (confronto a tempo costante), marca `appealRequestedAt` +
`appealStatus: 'pending'` per revisione umana e **non** riattiva il link. `202` se autorizzato, `403`
uniforme altrimenti.

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

### 10. Configurazione d'ambiente che oggi manca 🌐 *config*

Voci raccolte da [DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md), dove ognuna ha la procedura:

- **`FRONTEND_URL`** su Fly → serve a due cose insieme: costruire gli URL `/share/:token` **e** la
  whitelist CORS del backend. Se resta al default, in produzione i link nascono con il dominio
  sbagliato e le richieste del frontend vero vengono respinte.
- **CORS del bucket R2**: aggiungere l'origin di produzione (oggi ci sono solo quelli di dev).
- **Turnstile — hostname del widget**: nel dashboard Cloudflare va aggiunto il dominio di produzione,
  altrimenti il widget rifiuta di comparire.
- **Origine dedicata per il captcha** (`captcha.html` su un sottodominio): serve a tenere lo script di
  terzi fuori dall'origine che maneggia le chiavi. È anche ciò che permette una CSP più stretta.

---

### 11. Cancellare gli stack Lambda / API Gateway orfani 🌐 *pulizia, ma non solo*

Il consolidamento su Express è finito, ma i vecchi stack risultavano ancora attivi. Non è solo igiene: sono **endpoint pubblici che nessuno sta più
guardando** — costo acceso e superficie d'attacco che sopravvive alla migrazione. Vanno spenti e
rimossi, verificando prima che nessun client punti ancora lì.

**Stato (2026-08-12): ✅ fatto** — gli stack Lambda / API Gateway orfani sono stati rimossi (confermato).

---

## P1 — Serve per monetizzare (E3)

### 12. Notifiche di download ⚙️
Per gli invii con account: notifica quando un link viene scaricato. È una delle tre cose promesse in
cambio della registrazione nel flusso "Reclama questo invio" — oggi la promessa è sulla pagina e la
funzione non c'è.

### 13. Tabella `Subscriptions` + webhook Stripe ⚙️🌐
`loadPlan` legge già `SUBSCRIPTIONS_TABLE` e **fa fail-open a `free`** se la tabella non c'è: significa
che oggi tutti sono sul piano gratuito, in silenzio. Servono la tabella (PK `userId`, attributo `plan`),
la env, e il webhook che la scrive (checkout + webhook + portal).

### 14. Invio email delle condivisioni ⚙️
Design completo in [EMAIL_NOTIFICHE.md](EMAIL_NOTIFICHE.md): `services/email.js`, env `RESEND_API_KEY`
e `EMAIL_FROM` (dominio verificato), aggancio su `POST /api/file-sharing/send` e/o `POST /api/share`.
⚠️ L'invio va **best-effort**: un errore dell'email non deve far fallire la condivisione.

### 15. Contatore trasferimenti/mese ⚙️
Tracking usage per applicare il limite per piano (rimandato in §5-ter delle API docs).

---

## P2 — Alza la promessa (E2)

### 16. Nome del file cifrato ⚙️🖥️

**Cosa.** Oggi `fileName` viaggia in chiaro (`init` e `complete`), il backend lo salva nel record
`SharedLinks` e la pagina di ricezione lo mostra prima di decifrare. **La dichiarazione pubblica è
stata appena corretta per dire la verità** (`/come-funziona` sosteneva il contrario).

Per renderla vera invece che ritirarla: `complete` accetta un **blob opaco** al posto di `fileName`, e
`GET /api/shared-links/:publicToken` smette di restituirlo. Il client lo decifra con la chiave che ha
già nel fragment e lo mostra dopo. Serve un fallback per i record esistenti.

**Perché.** È l'ultimo metadato di contenuto che ci resta in mano. Toglierlo è il tipo di mossa che
questo prodotto può rivendicare e i concorrenti no.

---

## Verifiche da eseguire (prove, non codice)

Non sono lavoro da scrivere: sono le prove che dicono se quanto sopra funziona davvero.

- **§C.10** di [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md): gli otto criteri di
  accettazione del canale guest.
- **Checklist di verifica** in [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md): `/init` senza
  `Authorization` → `401`; utente A che dichiara `userId` di B → il file finisce comunque sotto A;
  preflight `OPTIONS` senza token → `200`; origin non autorizzato → bloccato.
- **Test R2** dopo il cutover: multipart completo, presigned GET, `HeadObject`
  ([MIGRATION_S3_TO_R2.md](MIGRATION_S3_TO_R2.md)).
- Lato frontend il percorso critico è già coperto da un test end-to-end su browser vero
  (`vue-app/e2e/`), ma **con la rete stubbata**: verifica il client, non il contratto col server reale.
  Le prove qui sopra restano necessarie.

---

## Riepilogo per priorità

| # | Voce | Tipo | Blocca il pubblico? | Stato (2026-08-12) |
|---|---|---|---|---|
| 1 | Lifecycle `uploads/guest/` | infra | ✅ promessa non mantenuta | ✅ fatto (regola R2) |
| 2 | TTL DynamoDB | infra | ✅ idem | ✅ fatto |
| 3 | `TRUST_PROXY_HOPS` | config | ✅ falsa sicurezza | ⏳ al dominio (default 1) |
| 4 | Turnstile + dedup + soglia su `report` | codice | ✅ difetto raggiungibile | ✅ **fatto** |
| 5 | Appello quarantena | codice | 🟡 fortemente consigliato | ✅ **fatto** |
| 6 | `TURNSTILE_SECRET` | config | ✅ | ✅ settato |
| 7 | Cutover R2 | infra | ✅ costo egress | ✅ fatto (incl. `R2_JURISDICTION=eu`) |
| 8 | Dominio + CSP + HTTPS | infra | ✅ | ⏳ al dominio |
| 9 | `security@` / `abuse@` | processo | ✅ | ❓ da confermare |
| 10 | `FRONTEND_URL`, CORS R2 prod, hostname Turnstile, origine captcha | config | ✅ | ⏳ al dominio |
| 11 | Stack Lambda orfani da spegnere | pulizia | 🟡 costo + superficie d'attacco | ✅ fatto (rimossi) |
| 12-15 | Notifiche download, `Subscriptions`+Stripe, email, usage | codice | ❌ serve per vendere | ❌ P1 (rimandato) |
| 16 | Nome file cifrato | codice | ❌ alza la promessa | ❌ P2 (rimandato) |

> ⚠️ Manca ancora **il deploy**: le voci 4 e 5 sono in `routes/guest.js` ma non ancora in produzione
> (`git push` + `fly deploy`). Fino al deploy, in prod restano come prima.

*Creato il 2026-08-02. Riletto e completato lo stesso giorno incrociando tutte le docs backend:
la prima versione ne copriva solo una parte.*
