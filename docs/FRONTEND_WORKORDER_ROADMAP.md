# Frontend — Work order (roadmap prodotto)

> **Cos'è.** La specifica operativa, a step, del lavoro **frontend** (`vue-app/`) per realizzare la
> [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md). Gemello lato client del [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md):
> stesso contratto di API. Concept visivo del momento-firma → artifact linkato in fondo.
>
> **Stack reale** (verificato): Vue 3.5 + TS, **PrimeVue v4** (preset custom `theme/preset.ts` + PassThrough
> `theme/pt.ts`), **Tailwind v4**, Pinia, vue-router, @tanstack/vue-query, vee-validate+zod, **GSAP** e
> **three.js** (installati, oggi inutilizzati → pronti per il wow), sweetalert2.
> Dark mode via classe `.dark` (`stores/theme.ts`). Brand: **viola `#724cf9`** su shell `#2c2638`.

---

## 0. Stato attuale e DECISIONI da prendere prima

Fatti dal codice, che condizionano tutto:

1. **Non esiste una porta pubblica.** Il router ha `/landing` (ma [LandingPage.vue](../vue-app/src/pages/LandingPage.vue)
   è **uno stub** `TODO`) e la root `/` è **dietro `requiresAuth`** ([router/index.ts](../vue-app/src/router/index.ts)).
   → **Decisione routing (§A.0):** la porta pubblica di invio diventa la **facciata**.
2. **Il brand viola combacia con Proton.** → **Decisione design:** *evolvere* il viola, non sostituirlo.
   Consolidare i token (preset PrimeVue + Tailwind + CSS vars) in un unico design system.
3. **Crittografia client già pronta**: `utils/crypto.ts` (AES-GCM, `createKeyHash` per il fragment,
   `encryptChunkFramed`), `utils/streamingDownload.ts`, `utils/keyStore.ts`. Il guest-send **riusa** questi,
   generando una **chiave casuale** invece della coppia RSA utente.

### Nuova mappa delle rotte (proposta)

| Rotta | Oggi | Proposta | Auth |
|---|---|---|---|
| `/` | Homepage (dashboard) | **Invio senza account** (la facciata, il wow) | 🔓 pubblica |
| `/app` | — | Dashboard (ex `/`) | 🔒 |
| `/app/profile`, `/app/settings` | `/profile`, `/settings` | sotto `/app` | 🔒 |
| `/share/:token` | ShareAccessPage | invariata (ricezione) | 🔓 |
| `/pricing` | — | 🆕 piani (E3) | 🔓 |
| `/login`, `/register`, `/oauth2/callback` | invariate | invariate | 🔓 |

> Utente **loggato** che apre `/` → vede comunque la facciata di invio, ma con header "vai alla dashboard".
> `landing` stub → assorbito nella nuova facciata `/`.

---

## 📍 Stato al 2026-07-30

| Fase | Stato | Cosa resta |
|---|---|---|
| **F0** Design system | 🟡 in corso | Token unificati ✅ (`assets/tokens.css` + preset PrimeVue allineato + primitivi `.lt-*`). Restano: **font self-hosted**, **primitivi GSAP** (F0.2), ridefinizione `theme/pt.ts` (F0.4) |
| **F1** Invio senza account | 🟢 quasi chiusa | Routing, `SendBox`, cifratura+upload guest, ricezione ridisegnata, header/footer pubblici ✅. Restano: **progresso per-file**, **QR del link** |
| **F2** Privacy verificabile | 🟢 chiusa | `PrivacyReceipt` ✅, **impronta destinatario + rilevamento cambio chiave** ✅, la propria impronta in impostazioni ✅, pagina `/sicurezza` ✅. Resta: hash del bundle / build riproducibili |
| **F3** Piani e claim | 🟡 in corso | `/prezzi` ✅, **claim end-to-end** ✅. Restano: **prezzi da confermare**, limiti per tier in UI, checkout Stripe, notifiche di download |
| **F4** AI on-device | ⚪ non iniziata | tutto |
| **F5** Redesign schermate | 🟡 in corso | Auth ✅. Restano: dashboard, tabelle, layout app, profilo, onboarding chiavi |

> ⚠️ **Da decidere prima del pubblico**: i prezzi in `/prezzi` sono segnaposto (i *limiti* sono reali,
> presi dai default del backend); `security@letransfer.app` deve esistere prima di pubblicare `/sicurezza`.
> `AppSlider.vue` e `PasswordInput.vue` sono rimasti orfani dopo il redesign auth.

---

## Fasi (a step, per una modifica grossa)

**F0 — Design system** · **F1 — Invio senza account (E1)** · **F2 — Privacy verificabile (E2)** ·
**F3 — Piani + claim (E3)** · **F4 — AI on-device (E5)** · **F5 — Redesign schermate residue (§6 roadmap)**

Ordine: **F0 prima** (fondamenta di tutto). Poi F1 (facciata + wow). F2 aggancia il differenziatore. F3
monetizza. F4/F5 rifiniscono. F4 (post-quantum E4) è quasi tutto in `crypto.ts` → tocco UI minimo, non ha fase.

---

## F0 — Design system: la base "verifiable zero-knowledge"

> Obiettivo: un linguaggio visivo unico, premium, calmo come Proton ma con un'**identità propria** (la
> privacy resa *visibile*: cifra/sigillo, fingerprint, ricevuta). È la fondazione di ogni schermata.

### F0.1 Token unificati
- [x] **Colore.** Scale `brand` (viola), `verified` (menta — solo stati di fiducia), `deep`/`haze` (mondo
  scuro), `lilac`/`ink` (carta chiara), semantici `warn`/`crit`/`info` separati dal brand, `shell` per la
  dashboard legacy. Tutto in [tokens.css](../vue-app/src/assets/tokens.css).
- [ ] **Tipografia.** Token `--font-display|sans|mono` definiti, ma con **fallback di sistema**: mancano i
  file dei font veri, da caricare come `@font-face` self-hosted (niente CDN → CSP).
- [x] **Spazio/raggi/ombre/motion**: `--radius-*`, `--shadow-*`, `--ease-soft`, `--duration-*`.
- [x] Esposto tutto come **CSS custom properties** (`@theme` di Tailwind v4 → genera anche le utility) e
  **preset PrimeVue** che referenzia le stesse variabili (`var(--color-brand-500)`): una sola fonte di verità.
  ⚠️ `tailwind.config.js` era **morto** (v4 lo legge solo con `@config`) → neutralizzato con una nota.

### F0.2 Primitivi di movimento (GSAP)
- [ ] Wrapper/composables per: **page-load orchestrato**, **scroll-reveal**, **micro-interazioni** hover/press.
- [ ] Rispettare **`prefers-reduced-motion`** ovunque (fallback statico).

### F0.3 Motivo "cifra/sigillo" (l'identità)
- [x] Componente **fingerprint** ([KeyFingerprint.vue](../vue-app/src/components/ui/KeyFingerprint.vue)):
  digest SHA-256 **intero** in coppie esadecimali su griglia — troncarlo starebbe più comodo ma renderebbe
  il confronto a voce meno solido. Impronta canonica **RFC 7638** ([fingerprint.ts](../vue-app/src/utils/fingerprint.ts)).
- [x] Badge "cifrato in questo browser" + campo generativo `CipherField` + climax del sigillo.
- [x] Componente **`PrivacyReceipt`** riusabile: variante `send` (link pronto) e `receive` (dopo la decifratura).

### F0.4 Componenti base (su PrimeVue v4 via `pt`/`:pt`)
- [ ] Bottoni, input, dialog, toast, progress, tabella, card, tooltip — ridefiniti nei token nuovi in `theme/pt.ts`.

---

## F1 — Invio senza account (E1): la facciata + il momento wow

> È **la** schermata del prodotto. Riusa la crittografia esistente + gli endpoint `/api/guest/*` del backend
> work order. **Il wow**: rendere *visibile e bella* la cifratura nel browser (nessun concorrente lo fa).

### F1.0 Routing + shell pubblica
- [x] Nuova mappa rotte applicata: `/` pubblica, dashboard sotto `/app`, `beforeEach` aggiornato.
      🆕 `/come-funziona`, `/prezzi`, `/sicurezza` (prima erano `href="#"` morti).
- [x] Header e footer pubblici in **[PublicShell.vue](../vue-app/src/components/landing/PublicShell.vue)**,
      condiviso da landing, ricezione, auth e pagine di contenuto: il "mondo viola" sta in un posto solo.
      Footer sotto la piega, così l'hero resta esattamente un viewport.

### F1.1 Componente `SendBox` (drop zone)
- [ ] Drop zone grande con **doppia interazione** (drag-and-drop **+** "Scegli file") e stato hover evidente
  (bordo/colore che reagisce) — pattern standard del settore.
- [ ] **Coda multi-file** con progresso **per-file** reale (no spinner indeterminato) e upload in background.
- [ ] Opzioni invio: password (opz.), scadenza (clamp lato UI ai limiti guest), max download.
- [ ] Riuso di `useFileDragAndDrop` / `useFolderDragAndDrop` esistenti.

### F1.2 Cifratura client + upload guest
- [ ] Generare **chiave file casuale** (non la coppia RSA) → cifrare a chunk con `encryptChunkFramed`
  (formato v2, riuso `crypto.ts`).
- [ ] **Turnstile**: caricare il widget, ottenere il token, passarlo a `guest/upload/init`.
- [ ] Flusso `init → urls → PUT ciphertext su S3/R2 → complete` verso `/api/guest/upload/*`
  (adattare `useS3MultipartUpload` in un `useGuestUpload`).
- [ ] Costruire il link finale con la **chiave nel fragment** (`createKeyHash`): `…/share/<token>#<chiave>`.
- [ ] Gestione errori/abuso: `413` (troppo grande), rate limit, Turnstile fallito → messaggi chiari e umani.

> **Multi-file / cartelle → un solo link.** Il backend guest fa *un oggetto = un link*, quindi più file
> vanno impacchettati in un archivio. **Scelto: zip in streaming** (`client-zip` in modalità `.body`, un
> `ReadableStream`): l'archivio viene prodotto e cifrato a chunk **al volo**, senza mai tenerlo in RAM
> (un file singolo grande resta invece su upload diretto streamato). Sicuro (E2E per-chunk), efficiente
> (RAM costante), un solo link.
>
> **Evoluzione futura da valutare — "modello a collezione" (opzione 3):** ogni file caricato come oggetto
> **separato** (streamato, resume per-file) + un **manifest**; la pagina di ricezione elenca i singoli file
> e può zipparli al download. Più scalabile e robusto (resume/anteprime per-file), ma richiede modifiche al
> **backend** (un invio = N oggetti + record manifest) e alla **pagina di download**. Non ora: si valuta
> come evoluzione quando servirà.

### F1.3 Il momento wow — "cifratura visibile"
- [ ] Animazione (Canvas/GSAP) allo start upload: i byte del file **diventano ciphertext**, la **chiave nasce
  nel browser** e "cade" nel fragment del link, il server mostra di ricevere **solo blocchi cifrati**.
- [ ] Alla fine → **`PrivacyReceipt`** (F2) + link pronto con **copia** e QR.
- [ ] CTA soft di conversione: "**Reclama questo invio**" → account (F3), niente muro.
- [ ] **Concept visivo di riferimento** (direzione approvata): https://claude.ai/code/artifact/19c6b6b2-dc22-40bb-b34b-cb2da34979ec — mondo viola pieno, campo generativo di "ciphertext" alla WeTransfer, widget d'invio umile, firma viola→menta, climax del "sigillo". Ricrearlo con GSAP + Canvas, `reduced-motion` a norma.

### F1.4 Ricezione (riuso)
- [x] `/share/:token` ([ShareAccessPage.vue](../vue-app/src/pages/ShareAccessPage.vue)) rifatta nel nuovo mondo:
  stessa carta chiara del widget d'invio, nome del file come elemento più grande, mittente in cima,
  metadati mono (peso · tipo · scadenza), **progresso reale della decifratura**, `PrivacyReceipt` variante
  `receive` e **sigillo che si stampa** a fine decifratura — il rituale si chiude su entrambi i lati.
  Anche gli stati "link morto" ([LinkExpiredError.vue](../vue-app/src/components/LinkAccess/LinkExpiredError.vue))
  vivono nel mondo pubblico, con un invito a mandarne uno.

---

## F2 — Privacy verificabile (E2): il differenziatore reso UI

- [x] **`PrivacyReceipt`** in invio e in ricezione (varianti `send`/`receive`).
- [x] **Verifica fingerprint destinatario (#5)**: [RecipientFingerprintDialog.vue](../vue-app/src/components/RecipientFingerprintDialog.vue)
  si interpone tra "chiave pubblica scaricata" e "chiave del file wrappata" (gancio `verifyRecipient` in
  `useShareFile`). Tre stati: `new` (invito calmo), `known` (conferma discreta), **`changed` (allarme, con
  conferma esplicita obbligatoria)** — il caso `changed` è l'unica ragione per cui la funzione esiste:
  è il solo punto in cui l'utente può accorgersi di una chiave sostituita. Memoria TOFU in
  [useVerifiedKeys.ts](../vue-app/src/composables/useVerifiedKeys.ts).
- [x] **La propria impronta** in Impostazioni ([MyKeyFingerprint.vue](../vue-app/src/components/settings/MyKeyFingerprint.vue)):
  senza, la verifica sarebbe monca — l'altra parte non avrebbe nulla da leggere a voce.
- [x] **Badge di fiducia** calmi (striscia landing, riga "si decifra nel tuo browser", stati mono).
- [x] Link **"Come lo verifichi"** → pagina [/sicurezza](../vue-app/src/pages/SecurityPage.vue), con la
  sezione "da cosa **non** ti protegge" e lo stato dichiarato (audit: non ancora).
- [ ] Hash del bundle / **build riproducibili** — l'unico pezzo di F2 ancora aperto.

---

## F3 — Piani, claim e conversione (E3)

- [x] **Pagina [`/prezzi`](../vue-app/src/pages/PricingPage.vue)**: Free / Pro / Business con i **limiti reali**
  (2/20/100 GB, 168/720 h — default backend §5). ⚠️ Gli **importi sono segnaposto**, da confermare.
- [x] **Flusso "Reclama l'invio"** ([usePendingClaim.ts](../vue-app/src/composables/usePendingClaim.ts)):
  il widget mette da parte `publicToken` + `manageToken` in **sessionStorage** (non localStorage: il
  manageToken è una capability e l'intero percorso avviene nella stessa scheda, anche col redirect OAuth),
  e `AppLayout` riscatta all'ingresso nell'area autenticata — un punto solo per password, registrazione e Google.
- [ ] **Limiti per tier nella UI**: mostrare dimensione/retention/quota, con upgrade prompt quando si superano.
- [ ] **Checkout** (Stripe) + gestione abbonamento nelle impostazioni.
- [ ] **Notifiche di download** (per invii con account): impostazioni + badge in dashboard.

---

## F4 — AI on-device (E5)

- [ ] **Scansione pre-invio** (malware/NSFW) via **WebGPU/WASM**, *prima* della cifratura, con UI di stato
  fluida (non tecnica): "controllo il file sul tuo dispositivo…". Blocco con messaggio chiaro se sospetto.
- [ ] **Anteprime locali** (immagini/PDF) generate client-side, mai server.
- [ ] **Fallback grazioso** dove WebGPU non c'è (Firefox/Safari) — coerente con l'avviso già presente nello
  streaming download.

---

## F5 — Redesign delle schermate residue (§6 roadmap)

Applicare il design system (F0) a tutto il resto, schermata per schermata:
- [ ] **Dashboard** ([Homepage.vue](../vue-app/src/pages/Homepage.vue), [FilesTable.vue](../vue-app/src/components/FilesTable.vue), [FileStatsGrid.vue](../vue-app/src/components/FileStatsGrid.vue)).
- [ ] **Gestione link** ([SharedLinksTable.vue](../vue-app/src/components/SharedLinksTable.vue)) + modale condivisione ([ShareFileModal.vue](../vue-app/src/components/ShareFileModal.vue)).
- [ ] **Layout app** ([AppHeader.vue](../vue-app/src/components/layout/AppHeader.vue), [AppSidebar.vue](../vue-app/src/components/layout/AppSidebar.vue), [AppFooter.vue](../vue-app/src/components/layout/AppFooter.vue)).
- [x] **Auth** ([LoginPage.vue](../vue-app/src/pages/LoginPage.vue), [RegisterPage.vue](../vue-app/src/pages/RegisterPage.vue)):
  dentro `PublicShell` e la carta chiara condivisa; campi numerati, avviso BLOC MAIUSC, criteri password live,
  conferma del codice come **vista della carta** invece che dialog. Logica Cognito invariata.
  → `AppSlider.vue` e `PasswordInput.vue` sono rimasti **orfani**.
- [ ] **Impostazioni/profilo** ([SettingsPage.vue](../vue-app/src/pages/SettingsPage.vue), [Profile.vue](../vue-app/src/pages/Profile.vue)).
- [ ] **Onboarding chiavi/recovery** ([RecoveryKeySetup.vue](../vue-app/src/components/RecoveryKeySetup.vue), [AppSecurityPrompt.vue](../vue-app/src/components/AppSecurityPrompt.vue)) — spiegato in modo umano (dove si perdono gli utenti E2E).

---

## Componenti nuovi vs riuso

| Nuovi (da creare) | Riuso/refactor |
|---|---|
| `SendBox`, `EncryptingViz`, `PrivacyReceipt`, `RecipientFingerprintDialog`, `PricingTable`, `ClaimTransferDialog`, `OnDeviceScanStatus`, `TrustBadges`, header/footer pubblici | `crypto.ts`, `streamingDownload.ts`, `keyStore.ts`, `useFileDragAndDrop`, `useS3MultipartUpload`→`useGuestUpload`, `ShareAccessPage`, `SharedLinksTable`, `ShareFileModal`, `RecoveryKeySetup` |

---

## Direzione UI (sintesi — dettaglio visivo nell'artifact)

- **Identità**: viola premium (evoluzione del brand) + neutri viola-tinti + accento "verified" freddo; **mono**
  per fingerprint/ciphertext = la firma. Calma e chiarezza alla Proton, ma con la privacy **resa visibile**.
- **Il wow è concettuale, non decorativo**: mostrare la **cifratura che accade nel browser** e la **ricevuta di
  privacy**. È il messaggio di marketing dentro un'interazione — nessun concorrente lo fa.
- **Pattern di settore adottati**: drop zone con hover evidente, doppia interazione, progresso per-file reale,
  upload in background, feedback istantaneo.
- **Motion**: GSAP per page-load orchestrato, reveal, micro-interazioni; three.js opzionale per un'ambient hero
  discreta. Sempre `prefers-reduced-motion`.

---

## Criteri di accettazione (per fase)

- [ ] **F0**: token unici applicati a PrimeVue + Tailwind; light/dark curati; `reduced-motion` ok.
- [ ] **F1**: da sloggato carico un file, vedo la cifratura visibile, ottengo un link `/share/:token#chiave`
  funzionante; errori/abuso gestiti con messaggi umani.
- [ ] **F2**: `PrivacyReceipt` in invio e download; fingerprint destinatario verificabile nella condivisione.
- [ ] **F3**: `/pricing` + claim end-to-end (guest → account) + limiti mostrati.
- [ ] **F4**: scan on-device + anteprime locali con fallback pulito.
- [ ] **F5**: tutte le schermate sul nuovo design system, esperienza coerente e "premium".

---

*Creato il 2026-07-23. Contratto API allineato al [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md).
Concept visivo del momento-firma (facciata + cifratura visibile + ricevuta): artifact linkato in chat.*
