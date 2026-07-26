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
- [ ] **Colore.** Primary = viola evoluto (`#724cf9` → scala già nel preset). Neutri viola-tinti (già:
  `#1e1a2a`/`#2c2638`/`#3c364c`). 🆕 **accento "verified"** distinto dal brand (mint/teal freddo) per gli
  stati di fiducia (cifrato/verificato). Semantici (good/warn/crit) separati dal brand.
- [ ] **Tipografia.** Display grotesque moderno + body leggibile + **mono** per fingerprint/ciphertext/dati
  (la "firma" visiva). Caricare i font come `@font-face` self-hosted (niente CDN → CSP).
- [ ] **Spazio/raggi/ombre/motion**: scala di spaziatura, raggi, ombre soft "premium", durate/easing standard.
- [ ] Esporre tutto come **CSS custom properties** + allineare **preset PrimeVue** e **tailwind.config** agli
  stessi valori (oggi il preset ha la palette, Tailwind quasi nulla → unificare).

### F0.2 Primitivi di movimento (GSAP)
- [ ] Wrapper/composables per: **page-load orchestrato**, **scroll-reveal**, **micro-interazioni** hover/press.
- [ ] Rispettare **`prefers-reduced-motion`** ovunque (fallback statico).

### F0.3 Motivo "cifra/sigillo" (l'identità)
- [ ] Componente **fingerprint** (hex `A3:F1:…` in mono), **ciphertext shimmer**, badge **"cifrato in questo browser"**.
- [ ] Componente **`PrivacyReceipt`** riusabile (vedi F2) — è il cuore dell'identità.

### F0.4 Componenti base (su PrimeVue v4 via `pt`/`:pt`)
- [ ] Bottoni, input, dialog, toast, progress, tabella, card, tooltip — ridefiniti nei token nuovi in `theme/pt.ts`.

---

## F1 — Invio senza account (E1): la facciata + il momento wow

> È **la** schermata del prodotto. Riusa la crittografia esistente + gli endpoint `/api/guest/*` del backend
> work order. **Il wow**: rendere *visibile e bella* la cifratura nel browser (nessun concorrente lo fa).

### F1.0 Routing + shell pubblica
- [ ] Applicare la nuova mappa rotte (§0): `/` pubblica, dashboard → `/app`, aggiornare `beforeEach`.
- [ ] Header pubblico (logo, "Come funziona", "Prezzi", "Accedi") + footer con i **trust signal** (open-source, EU, no-log).

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
- [ ] `/share/:token` ([ShareAccessPage.vue](../vue-app/src/pages/ShareAccessPage.vue)) resta il flusso info→access→file:
  rifinirla nel nuovo design + mostrare la `PrivacyReceipt` anche in download. Legge la chiave dal fragment (già).

---

## F2 — Privacy verificabile (E2): il differenziatore reso UI

- [ ] **`PrivacyReceipt`** (componente riusabile in F1 e F1.4): "il server ha visto **solo ciphertext** ·
  non ha mai visto file/chiave/nome · chiave nata nel tuo browser · hash verificabile ✓". Mono + motivo cifra.
- [ ] **Verifica fingerprint destinatario (#5)**: nel flusso di condivisione **utente-a-utente**, modale che
  mostra il fingerprint SHA-256 della chiave pubblica JWK del destinatario + verifica out-of-band opt-in.
  Aggancia `useUserKeyPair`/`useShareFile`.
- [ ] **Badge di fiducia** coerenti ("cifrato in questo browser", "zero-knowledge") come rassicurazione calma
  (lezione Proton), non muro tecnico.
- [ ] Link **"Come lo verifichi"** → client open-source + hash del bundle (build riproducibili).

---

## F3 — Piani, claim e conversione (E3)

- [ ] **Pagina `/pricing`**: Free / Pro / Business, con i limiti reali (allineati al backend §D.1).
- [ ] **Flusso "Reclama l'invio"**: dopo un guest-send, CTA → registrazione → `POST /api/share/claim`
  (passa `publicToken` + `manageToken` conservati lato client). Feedback: "invio salvato nel tuo account".
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
- [ ] **Auth** ([LoginPage.vue](../vue-app/src/pages/LoginPage.vue), [RegisterPage.vue](../vue-app/src/pages/RegisterPage.vue)).
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
