# LeTransfer — Roadmap di prodotto & backlog

> **Obiettivo (Nord).** Occupare il quadrante di mercato vuoto: **semplice come WeTransfer + zero-knowledge vero e _verificabile_**.
> La promessa che nessun concorrente semplice può fare: **«Impossibile da leggere. Anche per noi — e te lo dimostriamo.»**
>
> Analisi di mercato completa (dossier): https://claude.ai/code/artifact/530bfe1c-7235-4cfe-b79d-976a1b55aef2
> Documenti collegati: [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md) · [BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md) · [BACKEND_CONSOLIDATION.md](BACKEND_CONSOLIDATION.md) · [10-e2e-encryption.md](10-e2e-encryption.md) · [05-shared-links.md](05-shared-links.md)

---

## Legenda

| Sigla | Significato |
|---|---|
| **P0 / P1 / P2** | Priorità: P0 = blocca il lancio, P1 = fossato competitivo, P2 = allarga il vantaggio |
| **S / M / L / XL** | Sforzo stimato: Small (giorni) · Medium (1-2 settimane) · Large (settimane) · XL (mesi) |
| **⚙️ / 🖥️ / 🌐** | Ambito: Backend Express · Frontend Vue · Infra/PROD |
| `[ ]` / `[x]` | Task da fare / fatto |
| **DoD** | Definition of Done — quando l'epica è "fatta" |

---

## 1. La decisione confermata: il modello «a due porte»

LeTransfer avrà **due modi di entrare**, non uno. È la mossa strategica che unisce la conquista di massa (funnel WeTransfer) alla monetizzazione (account).

### 🚪 Porta A — Invio **senza account** (il «WeTransfer cifrato»)
Chiunque arriva sul sito, trascina un file, ottiene un link. **Ma cifrato end-to-end**: la chiave nasce nel browser e viaggia nel fragment `#` del link, mai al server. Nessun login richiesto né al mittente né al destinatario.

- **«Senza account» = senza registrazione/login, non «irrintracciabile».** Il file è comunque cifrato E2E; il server vede solo ciphertext, ma conosce l'IP della richiesta (serve per rate-limit e anti-abuso).
- È il canale di **acquisizione di massa** e di passaparola: intercetta l'esodo da WeTransfer (scandalo AI 2025 + free plan tagliato).
- Limiti volutamente modesti (dimensione, scadenza breve, niente cronologia) → spingono all'upgrade.
- **Attenzione**: è anche il canale più esposto all'abuso (Firefox Send è morto per il malware). I controlli anti-abuso non sono opzionali (vedi Epica E1 e §7).

### 🔐 Porta B — Account registrato, piano **Free / Pro / Business**
Chi si registra sblocca il modello E2E "pieno" già costruito: coppia RSA per utente, condivisione utente-a-utente, cronologia, gestione link, recovery BIP39, file più grandi, retention lunga, branding, e (per Business) sovranità/compliance.

### 🔄 Il ponte: funnel di conversione
Dopo un invio senza account riuscito → invito a **«reclamare» il trasferimento** creando un account gratuito (retention più lunga, notifiche di download, cronologia). È il passaggio senza-account → Free → Pro/Business (Epica E3).

> **Nota tecnica chiave.** Il lato **ricezione** pubblico esiste già ([usePublicLink.ts](../vue-app/src/composables/usePublicLink.ts): flusso info → access → file con session token; chiave nel fragment via `createKeyHash` in [useSharedLinks.ts](../vue-app/src/composables/useSharedLinks.ts)). Il lato **invio senza account è nuovo**: oggi creare un link richiede login ([useSharedLinks.ts:49-50](../vue-app/src/composables/useSharedLinks.ts#L49-L50)) e l'upload richiede auth + ownership su `uploads/files/{sub}/` (BACKEND_API_DOCS §4.3-bis). Serve un percorso dedicato senza autenticazione.

---

## 2. Stato attuale (baseline da cui partiamo)

### ✅ Già costruito
- **E2E zero-knowledge (utenti registrati)**: AES-256-GCM, RSA-OAEP 4096, chiave nel fragment mai inviata al server, recovery BIP39, PBKDF2 (100k recovery / 600k password).
- **Streaming encryption v2** a chunk con IV+AAD per-chunk, upload/download streaming, retrocompatibile v1 (SECURITY_FIX_6).
- **Chiave privata `extractable:false` in IndexedDB** + backup cifrato con master key (SECURITY_FIX_1).
- **Hardening frontend (binario DEV)**: cookie `SameSite`/`Secure`, header sicuri, unificazione su accessToken, AAD `s3Key`, `keyCache` con idle-timeout.
- **Condivisione**: link pubblici (password, scadenza, max download, revoca, rigenerazione), utente-a-utente E2E, condivisione via email.
- **Ricezione pubblica**: pagina di accesso link con flusso a 3 step + chiave nel fragment.

### ⏳ Da completare / non ancora fatto
- **Binario PROD/Express + Infra** (obbligatorio per la sicurezza reale): verifica firma JWT (#15), CSP autoritativa (#3), CORS, HTTPS, residenza dati → Epica **E0**.
- **Migrazione storage S3 → Cloudflare R2** (egress $0; da fare prima di E1) → Epica **E0.5**.
- **Invio senza account** (Porta A) → Epica **E1**.
- **Privacy verificabile** (fingerprint destinatario #5, oggi rinviato; ricevuta di privacy; client open-source) → Epica **E2**.
- **Piani & funnel di conversione** → Epica **E3**.
- **Post-quantum, AI on-device, compliance B2B, key transparency, team, mobile** → Epiche **E4–E9**.
- **Ridisegno UI/UX ispirato a Proton** → §6.

---

## 3. Orizzonte 1 — ADESSO (0–3 mesi): stabilizza, apri la porta pubblica, rendi la privacy visibile

### Epica E0 — Chiudere il binario PROD/Express + Infra  · **P0** · ⚙️🌐 · **L**
> Senza questo l'app è hardenata solo "a metà". È il prerequisito di tutto il resto. Fonte: [BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md), [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md) §binario PROD.

- [ ] **#15** Verifica vera della firma JWT con `aws-jwt-verify` (`CognitoJwtVerifier`, `tokenUse:"access"`) su **tutte** le route protette. ⚙️
- [ ] **#3** CSP autoritativa + security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `frame-ancestors 'none'`) sull'host/CDN che serve il build. `connect-src` deve includere API Express + bucket. ⚠️ Il `connect-src` deve puntare all'**host storage finale** → cablarlo **dopo E0.5** (R2), una volta sola. 🌐
- [ ] **#7** CORS whitelist con l'origine di produzione + niente `error.message` nelle risposte 500. ⚙️
- [ ] **#14** Route multipart: ownership sul prefisso `uploads/files/${sub}/`, usare `req.user.sub` (mai `userId` dal body). ⚙️
- [ ] **#12** Password policy server-side su Cognito (≥12, complessità). 🌐
- [ ] **HTTPS ovunque** in prod → accende automaticamente i cookie `Secure`. 🌐
- [ ] **Residenza dati**: fissare regione UE (`eu-central-1`) e documentare il data-flow; valutare AWS European Sovereign Cloud (attivo da gen 2026) come opzione futura. 🌐

**DoD:** un token forgiato/scaduto viene respinto su ogni route; CSP attiva in prod; nessun leak di errori interni; ownership verificata; deploy https con cookie Secure.

> ⚠️ **Sequencing con E0.5.** Gli item **storage-agnostic** di E0 (#15 firma JWT, #12 password policy, #7 no error-leak) vanno fatti **subito**, non aspettano R2. Invece **CSP `connect-src` e residenza dati** conviene finalizzarli **dopo E0.5**, quando l'host storage è quello definitivo (R2). Vedi §8.

---

### Epica E0.5 — Migrazione storage S3 → Cloudflare R2  · **P0** · ⚙️🌐 · **M**
> Da fare **prima di E1** (e prima di cablare CSP `connect-src`), ma **senza bloccare #15** (indipendente dallo storage). Perché ora: E1 è download-heavy (link pubblici) → è dove l'egress S3 (~$0.09/GB) fa male e R2 (egress **$0**) stravince; costruisci il path upload/download **una volta sola** sullo storage finale; migrare ora (pochi dati) è più facile che dopo il lancio. Piano completo e verdetto: [MIGRATION_S3_TO_R2.md](MIGRATION_S3_TO_R2.md).

- [ ] Verificare **prezzi correnti** R2/S3 e stimare il risparmio sul volume reale. Se pre-lancio il risparmio *oggi* è ~zero: si fa per evitare rework + la bolletta egress futura, non per risparmio immediato. ⚙️
- [ ] Verificare **data residency**: essendo E2E, R2 tiene **solo ciphertext** → i metadati/chiavi leggibili restano su DynamoDB `eu-central-1`. Confermare l'hint UE sul bucket (non è un blocker per E6: è l'E2E a reggere la sovranità). 🌐
- [ ] Creare bucket R2 + **API token scoped** (solo read/write sul bucket). 🌐
- [ ] Configurare **CORS** su R2 (origin frontend dev+prod, metodi `GET/PUT/HEAD`, expose `ETag` per il multipart). 🌐
- [ ] Aggiungere env `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET` e aggiornare le istanze `S3Client` (`endpoint` + `region:'auto'` + credenziali R2). ⚙️
- [ ] Test end-to-end su R2: multipart (init→urls→PUT→complete), presigned GET (file/condivisione/link pubblico), `HeadObject`. ⚙️
- [ ] Copia dati S3 → R2 (Super Slurper / rclone) con **dual-read** (fallback S3 sugli oggetti non ancora copiati) + verifica integrità. ⚙️
- [ ] (Consigliato) **dominio custom + CDN Cloudflare** davanti al bucket per i download dei link pubblici — fatto su misura per il funnel di E1. 🌐
- [ ] Switch completo su R2 + monitoraggio; dismissione S3 dopo periodo di sicurezza. Rollback = ripuntare `S3Client` a S3 (dati DynamoDB invariati).

**DoD:** upload/download E2E funzionano su R2 (multipart + presigned + head); dati esistenti migrati e verificati; egress a zero; DynamoDB/Cognito/Express invariati; rollback documentato.

> **Frontend:** nessuna modifica logica — continua a fare PUT/GET verso gli URL presigned; cambia **solo l'host**. Il formato streaming v1/v2 (#6) resta byte-identico: la migrazione copia byte, non ricifra.

---

### Epica E1 — Porta A: invio senza account, cifrato  · **P0** · ⚙️🖥️ · **XL**
> Il canale di acquisizione di massa. Cifrato E2E ma senza login. Riusa il lato ricezione esistente; costruisce il lato invio da zero con controlli anti-abuso.

**Backend ⚙️**
- [ ] Nuovo prefisso storage per gli invii senza account con **TTL/auto-scadenza** (es. `uploads/guest/{token}/`), separato da `uploads/files/{sub}/`. Configurare lifecycle S3 per cancellazione automatica.
- [ ] Endpoint di **upload senza autenticazione** (single + multipart) **senza `authenticateToken`**, ma con: rate limit per IP aggressivo, cap dimensione (es. 2–5 GB free), cap numero invii/IP/giorno.
- [ ] Endpoint **creazione link senza account** (variante no-auth di `POST /api/shared-links`): record `SharedLinks` **senza owner**, con scadenza breve di default (es. 3–7 gg) e `maxDownloads` opzionale.
- [ ] **Endpoint di segnalazione abuso** (`POST /report`) + meccanismo di **revoca rapida** e quarantena dei link segnalati.
- [ ] Metadati streaming (`formatVersion`/`chunkSize`/`originalSize`) gestiti anche per il flusso senza account.

**Frontend 🖥️**
- [ ] Generazione **chiave file casuale** lato client (non la coppia RSA utente) → cifra il file → chiave nel **fragment `#`** del link (riusa `createKeyHash`/pattern esistente).
- [ ] UI di invio "alla WeTransfer": drag-and-drop, progress, copia link — senza login. Riusa `useS3MultipartUpload` adattato al percorso senza account.
- [ ] Riuso della pagina di ricezione ([ShareAccessPage.vue](../vue-app/src/pages/ShareAccessPage.vue) + `usePublicLink`) per il download.
- [ ] Scansione anti-abuso **on-device pre-upload** (versione minima; la piena è E5): blocco tipi/pattern pericolosi prima della cifratura.

**DoD:** un utente non registrato manda un file cifrato e condivide un link funzionante; il server vede solo ciphertext; scadenza e cancellazione automatiche attive; rate limit e segnalazione/revoca funzionanti.

---

### Epica E2 — Privacy verificabile (il differenziatore)  · **P1** · 🖥️⚙️ · **L**
> Il verbo che ci distingue da tutti: **verificabile**. È il marketing dentro una feature. Trasforma il punto #5 da "rinviato" a strategico.

- [ ] **#5 — Fingerprint della chiave del destinatario**: UI che mostra il fingerprint SHA-256 della chiave pubblica JWK, verifica out-of-band, opt-in. Documentare il trust model. (Oggi in [SECURITY_PUNTI_RINVIATI.md](SECURITY_PUNTI_RINVIATI.md).) 🖥️
- [ ] **Ricevuta di privacy** per ogni invio: schermata/artefatto che mostra "il server ha visto solo ciphertext / non ha mai visto file, chiave, nome reale" + hash verificabile. 🖥️
- [ ] **Open-source del client-crypto**: estrarre `crypto.ts`, `streamingDownload.ts`, key store in un modulo pubblicabile + README del modello crittografico. 🖥️
- [ ] **Build riproducibili** (base): lockfile, build deterministico, hash pubblicato del bundle. 🌐
- [ ] **#9** già fatto (AAD `s3Key`); verificare copertura anche nel flusso senza account.

**DoD:** un destinatario può verificare il fingerprint del mittente; ogni trasferimento produce una ricevuta di privacy; il codice crittografico è pubblico e il bundle ha un hash verificabile.

---

### Epica E3 — Piani, limiti e funnel di conversione  · **P1** · ⚙️🖥️ · **M**
> Monetizzazione + il ponte senza-account → Free → Pro/Business.

- [ ] Definire limiti per tier (proposta in §4) e applicarli lato backend (dimensione, retention, n° trasferimenti, cronologia).
- [ ] **"Reclama il trasferimento"**: dopo un invio senza account, invito a creare account gratuito per estendere retention + notifiche di download + cronologia.
- [ ] Pagina **prezzi/piani** + gestione abbonamento (integrazione pagamenti, es. Stripe).
- [ ] Notifiche di download (email/in-app) per invii con account.
- [ ] Migrazione trasferimento senza account → account (associa il record `SharedLinks` all'utente al momento del claim).

**DoD:** i tre tier hanno limiti reali applicati; un utente senza account può convertirsi in Free e conservare il suo invio; il pagamento sblocca Pro/Business.

---

## 4. Orizzonte 2 — PROSSIMO (3–9 mesi): costruisci il fossato

### Epica E4 — Key-wrapping post-quantum  · **P1** · 🖥️⚙️ · **L**
> Titolo quasi inedito nel consumer: «file transfer zero-knowledge e quantum-safe». Sei già sul branch `feature/new-encryption`: momento perfetto. RSA-OAEP è ciò che ML-KEM sostituisce.

- [ ] Introdurre wrapping **ibrido ML-KEM-768 + X25519** in affiancamento a RSA-OAEP (libreria WASM PQC, es. basata su liboqs).
- [ ] **Versioning del formato chiavi** (come già fatto per lo streaming): campo che distingue wrap classico / ibrido → retrocompatibilità con le chiavi esistenti.
- [ ] Aggiornare `wrapFileKey`/`unwrapFileKey` e il backup keypair al nuovo schema con fallback.
- [ ] Bench prestazioni (dimensione chiavi, tempi) su file grandi e mobile.

**DoD:** i nuovi trasferimenti usano wrapping ibrido PQC; i vecchi restano leggibili; formato versionato.

---

### Epica E5 — AI on-device (WebGPU/WASM)  · **P1** · 🖥️ · **L**
> Feature "smart" senza mai vedere i file: la risposta esatta allo scandalo WeTransfer-AI. Gira sul device dell'utente.

- [ ] **Scansione malware/NSFW nel browser** prima dell'invio (modello WASM/WebGPU) — versione piena dell'anti-abuso minimo di E1.
- [ ] **Anteprime locali** (immagini/documenti) generate client-side, mai lato server.
- [ ] **Auto-tag / OCR locale** opzionale per organizzare i propri file (solo account).
- [ ] Fallback grazioso dove WebGPU non è disponibile (Firefox/Safari) — coerente con l'avviso già presente nello streaming download.

**DoD:** scan e anteprime funzionano interamente client-side; nessun contenuto in chiaro lascia il device; degradazione pulita sui browser senza WebGPU.

---

### Epica E6 — Pacchetto sovranità & compliance B2B  · **P1** · ⚙️🌐 · **L**
> Dove stanno i ricavi seri: professionisti regolamentati (avvocati, medici, giornalisti).

- [ ] **Audit log** immutabile degli accessi/eventi (per account Business).
- [ ] **Selettore di residenza dati** (UE / eventuale altra regione) a livello di workspace.
- [ ] **DPA GDPR** + predisposizione **BAA HIPAA**.
- [ ] Retention policy configurabili + export dei log.

**DoD:** un cliente Business sceglie la regione dati, ha un audit log esportabile, e riceve DPA/BAA.

---

## 5. Orizzonte 3 — DOPO (9+ mesi): scala e fiducia istituzionale

### Epica E7 — Key transparency + attestazione build  · **P2** · ⚙️🌐 · **XL**
- [ ] Log verificabile e append-only delle chiavi pubbliche (difesa MITM di livello superiore rispetto al fingerprint di E2).
- [ ] Build riproducibili **attestate** pubblicamente (supply-chain).

### Epica E8 — Team, SSO, SCIM  · **P2** · ⚙️🖥️ · **L**
- [ ] Workspace multi-utente, ruoli, provisioning SSO/SCIM per clienti Business.

### Epica E9 — Mobile & multi-device robusto  · **P2** · 🖥️ · **XL**
- [ ] App mobile.
- [ ] **Sync multi-device delle chiavi** affidabile — l'anello più delicato della UX E2E (vedi §7 rischi).

---

## 6. Fase finale — Ridisegno UI/UX ispirato a Proton

> Da fare **dopo** che le feature portanti sono in piedi: prima la sostanza (E0–E6), poi la forma coerente su tutto. Proton è il riferimento perché comunica privacy con **calma, chiarezza e fiducia**, non con allarmismo tecnico.

### Principi da adottare (lezione Proton)
- [ ] **Design system unico**: token di colore/tipografia/spaziatura, componenti coerenti (oggi PrimeVue v4 — consolidare preset + `pt`).
- [ ] **Calma e chiarezza**: gerarchia forte, molto respiro, azioni primarie evidenti, zero rumore.
- [ ] **La privacy è visibile ma serena**: badge "cifrato in questo browser", ricevuta di privacy (E2), fingerprint — presentati come rassicurazione, non come muro tecnico.
- [ ] **Identità coerente col dossier**: linguaggio visivo "sigillo/cifra" (mono per dati e fingerprint, accento singolo, neutri scelti) — vedi identità del dossier strategico.
- [ ] **Onboarding delle chiavi umano**: il recovery BIP39 e il backup spiegati in modo comprensibile (è qui che i prodotti E2E perdono utenti).

### Schermate da ridisegnare
- [ ] **Landing** ([LandingPage.vue](../vue-app/src/pages/LandingPage.vue)) — messaggio "impossibile da leggere, anche per noi".
- [ ] **Invio senza account** (nuovo, Porta A) — l'esperienza drag-and-drop "alla WeTransfer" ma cifrata.
- [ ] **Dashboard / file** ([Homepage.vue](../vue-app/src/pages/Homepage.vue), [FilesTable.vue](../vue-app/src/components/FilesTable.vue)).
- [ ] **Gestione link** ([SharedLinksTable.vue](../vue-app/src/components/SharedLinksTable.vue)) + modale condivisione ([ShareFileModal.vue](../vue-app/src/components/ShareFileModal.vue)).
- [ ] **Ricezione link** ([ShareAccessPage.vue](../vue-app/src/pages/ShareAccessPage.vue)) — anteprima + ricevuta di privacy.
- [ ] **Impostazioni / profilo / recovery** ([SettingsPage.vue](../vue-app/src/pages/SettingsPage.vue), [RecoveryKeySetup.vue](../vue-app/src/components/RecoveryKeySetup.vue)).
- [ ] **UI dell'AI on-device** (E5) rifatta nello stesso linguaggio: scansione/anteprime come momenti fluidi e chiari, non tecnici.

**DoD:** tutte le schermate condividono un unico design system; la privacy è comunicata con chiarezza e calma; l'esperienza regge il confronto con Proton.

---

## 7. Rischi trasversali (vincoli permanenti, non task)

| Rischio | Perché | Come lo gestiamo |
|---|---|---|
| **E2E vs feature server-side** | Il server vede solo ciphertext: niente ricerca/anteprima/dedup lato server | Tutto client-side → è il motivo per cui l'AI on-device (E5) è strategica, non un vezzo |
| **UX chiavi & multi-device** | È dove muoiono i prodotti E2E | Onboarding umano (§6), BIP39 + backup chiari, sync robusto (E9) progettato con cura |
| **PKI / MITM (#5)** | Chiave pubblica destinatario dal server senza verifica → MITM possibile | Fingerprint (E2) obbligatorio per poter dire "verificabile" con onestà; key transparency (E7) come evoluzione |
| **Abuso / malware** | Firefox Send è stato chiuso per questo; il canale senza account è il più esposto | Scan on-device pre-invio, rate limit, scadenze brevi, revoca rapida, segnalazione/quarantena (E1 + E5) |

---

## 8. Ordine consigliato di esecuzione

1. **Subito, in parallelo:** #15 (verifica firma JWT) + item **storage-agnostic** di **E0** (password policy #12, no error-leak #7). Sono i veri blocker di sicurezza: non aspettano R2.
2. **E0.5** (migrazione S3 → R2) — prima che il traffico cresca e prima di cablare l'host storage.
3. **E0 (resto)** — finalizzare CSP `connect-src` + residenza dati puntando all'host R2 (una volta sola).
4. **E1** (porta senza account) — apre il funnel di massa, già su egress-zero + CDN.
5. **E2** (privacy verificabile) — accende il differenziatore.
6. **E3** (piani + conversione) — inizia a monetizzare.
7. **E4 → E5 → E6** (post-quantum, AI on-device, compliance) — costruiscono il fossato.
8. **E7 → E8 → E9** (transparency, team, mobile) — scala e fiducia.
9. **§6 Ridisegno UI/UX** — la forma coerente, quando la sostanza c'è.

---

*Creato il 2026-07-23. Documento vivo: aggiornare le checkbox man mano che le epiche avanzano.*
