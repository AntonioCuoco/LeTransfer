# Frontend — Work order (roadmap prodotto)

> **Cos'è.** La specifica operativa, a step, del lavoro **frontend** (`vue-app/`) per realizzare la
> [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md). Gemello lato client del [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md):
> stesso contratto di API. Concept visivo del momento-firma → artifact linkato in fondo.
>
> **Stack reale** (verificato): Vue 3.5 + TS, **PrimeVue v4** (preset custom `theme/preset.ts` + PassThrough
> `theme/pt.ts`), **Tailwind v4**, Pinia, vue-router, @tanstack/vue-query, vee-validate+zod, **GSAP**
> (primitivi di movimento, F0.2), sweetalert2. **three.js rimosso** il 2026-08-02: installato e mai usato,
> l'ambient dell'hero lo fa già `CipherField` in canvas 2D. Una dipendenza inerte non pesa nel bundle ma
> pesa nel lockfile, negli audit e nella superficie della build riproducibile — che qui è un claim pubblico.
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

## 📍 Stato al 2026-08-02

| Fase | Stato | Cosa resta |
|---|---|---|
| **F0** Design system | 🟢 chiusa | Token unificati ✅, **font self-hosted** ✅, **primitivi GSAP** ✅ (F0.2), **pelle PrimeVue** ✅ (F0.4: raggi/focus/motion nel preset, voce tipografica in `pt.ts`) |
| **F1** Invio senza account | 🟢 chiusa | Routing, `SendBox`, cifratura+upload guest, ricezione ridisegnata, header/footer pubblici, **progresso per-file**, **QR del link**, **upload in background**, drop delle cartelle ✅ |
| **F2** Privacy verificabile | 🟢 chiusa | `PrivacyReceipt` ✅, **impronta destinatario + rilevamento cambio chiave** ✅, la propria impronta in impostazioni ✅, pagina `/sicurezza` ✅. Resta: hash del bundle / build riproducibili |
| **F3** Piani e claim | 🟡 in corso | `/prezzi` ✅, **claim end-to-end** ✅. Restano: **prezzi da confermare**, limiti per tier in UI, checkout Stripe, notifiche di download |
| **F4** AI on-device | ⚪ non iniziata | tutto |
| **F5** Redesign schermate | 🟢 chiusa | Auth, dashboard, tabelle, layout app, profilo, impostazioni, onboarding chiavi ✅. Palette legacy azzerata, 5 componenti orfani rimossi |

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

> **Stato F0**: chiusa il 2026-08-02. Cosa c'è ora: token unici applicati a PrimeVue e
> Tailwind, tre famiglie di font servite dal nostro origin, tre primitivi di movimento
> con `reduced-motion` rispettato per costruzione.

### F0.1 Token unificati
- [x] **Colore.** Scale `brand` (viola), `verified` (menta — solo stati di fiducia), `deep`/`haze` (mondo
  scuro), `lilac`/`ink` (carta chiara), semantici `warn`/`crit`/`info` separati dal brand, `shell` per la
  dashboard legacy. Tutto in [tokens.css](../vue-app/src/assets/tokens.css).
- [x] **Tipografia.** Tre **variable font self-hosted** in [assets/fonts/](../vue-app/src/assets/fonts/),
  dichiarate in [fonts.css](../vue-app/src/assets/fonts.css): **Inter Tight** (display), **Inter** (sans),
  **JetBrains Mono** (la firma: impronte, ciphertext, metadati — scelto perché 0/O e 1/l/I non si
  confondono quando un'impronta si confronta a voce). Nessun CDN → `font-src 'self'` regge, e il browser
  di chi riceve un link non racconta a terzi che quel link esiste. Sottoinsiemi latini con `unicode-range`
  (latin-ext solo per il corpo: i nomi dei file non sono solo italiani), `font-display: swap`,
  preload dei due sopra la piega. Provenienza, versioni e **SHA-256** in
  [fonts/NOTICE.md](../vue-app/src/assets/fonts/NOTICE.md) — i font sono byte che finiscono nel bundle,
  quindi rientrano nel discorso build riproducibili (F2). Licenza OFL 1.1 per tutte e tre.
- [x] **Spazio/raggi/ombre/motion**: `--radius-*`, `--shadow-*`, `--ease-soft`, `--duration-*`.
- [x] Esposto tutto come **CSS custom properties** (`@theme` di Tailwind v4 → genera anche le utility) e
  **preset PrimeVue** che referenzia le stesse variabili (`var(--color-brand-500)`): una sola fonte di verità.
  ⚠️ `tailwind.config.js` era **morto** (v4 lo legge solo con `@config`) → neutralizzato con una nota.

### F0.2 Primitivi di movimento (GSAP)
- [x] Tre gesti soli, in [useMotion.ts](../vue-app/src/composables/useMotion.ts) — di più non sarebbe
  un linguaggio, sarebbe rumore:
  - **`usePageEnter()`** — entrata orchestrata: gli elementi marcati `data-enter` salgono in sequenza.
    Usa `gsap.from`, così lo stato finale è quello del markup: se il codice non gira, la pagina resta giusta.
    Montata su facciata, `/come-funziona`, `/sicurezza`, `/prezzi`.
  - **`v-reveal`** — appare allo scroll, una volta sola (con `{ stagger }` tocca ai figli diretti).
    `IntersectionObserver`, non ScrollTrigger: per un "appari una volta" è la primitiva nativa giusta.
  - **`v-lift`** — hover *e* **press**. Il press è la ragione d'essere della direttiva: l'hover lo fa già
    il CSS dei primitivi `.lt-*`, il "cede sotto il dito" no — e sul bottone che avvia una cifratura
    lunga "ho premuto davvero?" è una domanda vera.
- [x] **`prefers-reduced-motion`** rispettato **per costruzione**: ogni primitivo interroga la preferenza
  *prima* di scrivere `opacity: 0`, quindi il caso ridotto non nasconde mai contenuto — non è una
  variante da ricordarsi, è il ramo di partenza. La preferenza è anche reattiva (`useReducedMotion`):
  chi la attiva a pagina aperta lo fa perché qualcosa gli dà fastidio *ora*.
- [x] L'ease JS è la **stessa cubica** di `--ease-soft` (via `CustomEase`): movimento CSS e movimento
  GSAP sulla stessa pagina non devono sembrare di due mani diverse.

### F0.3 Motivo "cifra/sigillo" (l'identità)
- [x] Componente **fingerprint** ([KeyFingerprint.vue](../vue-app/src/components/ui/KeyFingerprint.vue)):
  digest SHA-256 **intero** in coppie esadecimali su griglia — troncarlo starebbe più comodo ma renderebbe
  il confronto a voce meno solido. Impronta canonica **RFC 7638** ([fingerprint.ts](../vue-app/src/utils/fingerprint.ts)).
- [x] Badge "cifrato in questo browser" + campo generativo `CipherField` + climax del sigillo.
- [x] Componente **`PrivacyReceipt`** riusabile: variante `send` (link pronto) e `receive` (dopo la decifratura).

### F0.4 Componenti base (su PrimeVue v4 via `pt`/`:pt`)
- [x] **Divisione del lavoro**, che è la parte che conta: i **token** stanno in
  [preset.ts](../vue-app/src/theme/preset.ts), le **classi** in [pt.ts](../vue-app/src/theme/pt.ts).
  - Nel preset: la scala dei raggi primitiva riscritta sui nostri `--radius-*` (Aura ne fa derivare
    *ogni* angolo: campi, pannelli, modali, chip — un token invece di una classe per componente, e
    zero litigi di specificità con le utility Tailwind), `transitionDuration` da `--duration-quick`,
    e un **focus ring da 2px** nel viola del brand: su un prodotto dove si digitano password e si
    confrontano impronte, chi naviga da tastiera deve vedere senza sforzo dove si trova.
  - In `pt.ts`: solo ciò che un token non sa dire — la **voce tipografica**. Peso e spaziatura dei
    bottoni uguali a `.lt-btn`; **mono** dove il testo è un dato (intestazioni di colonna, paginatore,
    chip, tooltip, password, numeri); barra di progresso nella rampa **viola → menta**, la stessa
    della cifratura nel widget: il progresso, qui, significa qualcosa.

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
- [x] Drop zone grande con **doppia interazione** (drag-and-drop **+** "Scegli file") e stato hover evidente
  (bordo/colore che reagisce) — pattern standard del settore.
- [x] **Coda multi-file** con progresso **per-file** reale (no spinner indeterminato).
  La matematica sta in [transferProgress.ts](../vue-app/src/utils/transferProgress.ts) — modulo puro,
  quindi **testato** ([transferProgress.test.ts](../vue-app/src/utils/transferProgress.test.ts)) — ed è
  calcolata sui **byte di ciphertext accettati dallo storage**, non sul tempo: i file dello zip occupano
  intervalli noti del flusso, e i byte caricati dicono a che punto è ciascuno. Aggiunto anche
  `onUploadProgress` sul percorso zip, che prima avanzava a scatti da 10 MB — con pochi file piccoli
  l'invio è una parte sola e le barre sarebbero saltate da 0 a 100 senza dire niente.
  I test hanno trovato un difetto vero: si mostrava **100% su un file ancora in volo** (arrotondamento
  per eccesso). Ora la percentuale è troncata: il 100% è una promessa e non si fa prima che sia vera.
  ⚠️ Approssimazione dichiarata: le intestazioni zip (~30 byte per file) non sono contate.
- [x] Opzioni invio: password (opz.), scadenza (clamp lato UI ai limiti guest), max download.
- [x] **Upload in background.** Lo stato dell'invio è passato da composable a **store Pinia**
  ([stores/guestUpload.ts](../vue-app/src/stores/guestUpload.ts)): prima viveva quanto il componente,
  quindi cambiare pagina durante la cifratura smontava il widget e **il link finiva nel vuoto** — il
  trasferimento riusciva davvero, ma non lo sapeva più nessuno. Ora si può navigare mentre si cifra;
  al ritorno la carta ritrova il suo stato (per questo `summary` e `claimName` stanno nello store: i
  `File` originali a quel punto non esistono più). Una **pillola**
  ([GuestTransferPill.vue](../vue-app/src/components/landing/GuestTransferPill.vue)) segue l'invio
  sulle altre pagine pubbliche e annuncia il link pronto — senza, "in background" vorrebbe dire solo
  "invisibile". Non compare sulla facciata: lì la carta racconta già tutto.
  Resta la guardia `beforeunload`: navigare ora è sicuro, **chiudere la scheda no** e su quello
  possiamo solo chiedere conferma.
  ⚠️ La pillola vive in `PublicShell`: se l'utente entra nell'area autenticata (`/app`) durante un
  invio, l'upload continua ma l'indicatore sparisce. Da coprire quando si unificherà con
  [stores/transfer.ts](../vue-app/src/stores/transfer.ts), che per l'area autenticata fa già code e concorrenza.
- [x] **Riuso di `useFolderDragAndDrop`** — non per eleganza: il widget leggeva `dataTransfer.files`,
  che su una **cartella trascinata non restituisce il contenuto**. Si offrivano le cartelle col bottone
  e le si rifiutava col trascinamento, sotto la scritta "trascina qui". Ora il drop passa dal composable
  condiviso, l'unico che entra nelle cartelle (`webkitGetAsEntry` ricorsivo). Aggiunta l'opzione
  `preserveRelativePath`: senza, l'albero si appiattirebbe e due `foto.jpg` in sottocartelle diverse si
  sovrascriverebbero dentro lo zip. Tolto anche il vicolo cieco "browser non supportato", che rifiutava
  pure il trascinamento di un singolo file: ora ripiega sui file semplici.

### F1.2 Cifratura client + upload guest
- [x] Generare **chiave file casuale** (non la coppia RSA) → cifrare a chunk con `encryptChunkFramed`
  (formato v2, riuso `crypto.ts`).
- [x] **Turnstile**: caricare il widget, ottenere il token, passarlo a `guest/upload/init`.
- [x] Flusso `init → urls → PUT ciphertext su S3/R2 → complete` verso `/api/guest/upload/*`
  ([stores/guestUpload.ts](../vue-app/src/stores/guestUpload.ts), con istanze axios dedicate:
  nessun interceptor globale, così un URL presigned non riceve mai un header `Authorization`).
- [x] Costruire il link finale con la **chiave nel fragment** (`createKeyHash`): `…/share/<token>#<chiave>`.
- [x] Gestione errori/abuso: `413` (troppo grande), rate limit, Turnstile fallito → messaggi chiari e umani.

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
- [x] Animazione (Canvas) allo start upload: il campo generativo `CipherField` accelera e vira al menta
  (`surge`/`settle`/`calm`), il sigillo si stampa a fine cifratura.
- [x] Alla fine → **`PrivacyReceipt`** (F2) + link pronto con **copia** e **QR**.
  Il QR è generato in locale da [utils/qr.ts](../vue-app/src/utils/qr.ts) — ~250 righe di aritmetica
  ISO/IEC 18004, modalità byte, correzione M — e **non** da una libreria o da un servizio: quel codice
  contiene la chiave dell'invio, quindi è codice che tocca materiale crittografico. Un servizio esterno
  sarebbe l'esatto contrario di ciò che promettiamo; una dipendenza in più sarebbe superficie in più da
  far fidare a chi ci legge. Correttezza verificata **matrice per matrice contro un'implementazione
  indipendente** a maschera forzata (versioni 1–37): i fixture di riferimento vivono in
  [qr.test.ts](../vue-app/src/utils/qr.test.ts), perché un QR sbagliato "sembra funzionare" e il
  difetto si scopre sul telefono di qualcun altro.
- [x] CTA soft di conversione: "**Reclama questo invio**" → account (F3), niente muro.
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
- [x] **Nucleo crittografico isolato e specificato**: i sei file che toccano chiavi o ciphertext
  vivono in [src/crypto/](../vue-app/src/crypto/) — fuori da `utils/`, senza dipendenze da Vue,
  store, rete o DOM — con [README.md](../vue-app/src/crypto/README.md) che specifica primitive,
  formato byte per byte, ciclo di vita delle chiavi, cosa vede il server e **dove la promessa si
  ferma**. Chi vuole verificare le nostre affermazioni legge una cartella, non tutta l'app.
- [ ] Hash del bundle / **build riproducibili** — il workflow esiste ([reproducible-build.yml](../.github/workflows/reproducible-build.yml))
  ma non è mai girato: finché non è verde, `/sicurezza` dichiara onestamente "in lavorazione".

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
- [x] **Anteprime locali** (immagini/PDF/audio/video) generate client-side, mai server.
  `decryptToBlob()` in [streamingDownload.ts](../vue-app/src/crypto/streamingDownload.ts) decifra
  **in memoria** (tetto: 25 MB) e la pagina di ricezione offre "guardalo prima di scaricarlo".
  Copre il buco vero: per un file cifrato il server **non può** generare miniature — non ha modo
  di guardarci dentro — quindi prima i file E2E non avevano anteprima affatto.
  Il motore di decifratura è condiviso col download (`streamDecrypt`): due percorsi, una sola
  interpretazione del formato.
- [ ] **Fallback grazioso** dove WebGPU non c'è (Firefox/Safari) — coerente con l'avviso già presente nello
  streaming download.

---

## F5 — Redesign delle schermate residue (§6 roadmap)

Applicare il design system (F0) a tutto il resto, schermata per schermata:
- [ ] **Dashboard** ([Homepage.vue](../vue-app/src/pages/Homepage.vue), [FilesTable.vue](../vue-app/src/components/FilesTable.vue), [FileStatsGrid.vue](../vue-app/src/components/FileStatsGrid.vue)).
- [ ] **Gestione link** ([SharedLinksTable.vue](../vue-app/src/components/SharedLinksTable.vue)) + modale condivisione ([ShareFileModal.vue](../vue-app/src/components/ShareFileModal.vue)).
  Vestito ancora da fare; nel merito è arrivato il **QR** anche qui (2026-08-02), con un prerequisito
  che valeva più della feature: la ricostruzione del link con la chiave dal vault è stata estratta in
  [useShareLink.ts](../vue-app/src/composables/useShareLink.ts). Prima quella regola viveva dentro
  l'handler di "copia"; ogni nuovo modo di consegnare un link avrebbe dovuto reimpararla, e bastava
  dimenticarne un pezzo per rimettere in giro link senza chiave. Ora c'è **un posto solo** che sa
  costruire un link completo — o rifiutarsi, spiegando perché — ed è
  [testato](../vue-app/src/composables/useShareLink.test.ts) proprio sul caso negativo.
  Nella modale di condivisione il QR non passa dal vault: lì il link è appena nato e ha già il frammento.
- [ ] **Layout app** ([AppHeader.vue](../vue-app/src/components/layout/AppHeader.vue), [AppSidebar.vue](../vue-app/src/components/layout/AppSidebar.vue), [AppFooter.vue](../vue-app/src/components/layout/AppFooter.vue)).
- [x] **Auth** ([LoginPage.vue](../vue-app/src/pages/LoginPage.vue), [RegisterPage.vue](../vue-app/src/pages/RegisterPage.vue)):
  dentro `PublicShell` e la carta chiara condivisa; campi numerati, avviso BLOC MAIUSC, criteri password live,
  conferma del codice come **vista della carta** invece che dialog. Logica Cognito invariata.
  → `AppSlider.vue` e `PasswordInput.vue` sono rimasti **orfani**.
- [ ] **Impostazioni/profilo** ([SettingsPage.vue](../vue-app/src/pages/SettingsPage.vue), [Profile.vue](../vue-app/src/pages/Profile.vue)).
- [x] **Onboarding chiavi/recovery** ([RecoveryKeySetup.vue](../vue-app/src/components/RecoveryKeySetup.vue), [AppSecurityPrompt.vue](../vue-app/src/components/AppSecurityPrompt.vue)).
  Oltre al vestito, tre difetti sostanziali corretti:
  - la **verifica non verificava**: chiedeva di incollare le 24 parole subito dopo aver offerto "copia
    tutto", e un `Ctrl+V` la superava. Ora chiede **tre parole a caso per posizione, digitate**
    (schema dei portafogli hardware). Nel prompt di sblocco l'incolla resta: lì sono materiale crittografico.
  - **nessun rientro dopo la chiusura** del dialogo di sblocco: si restava con i file illeggibili fino al
    refresh. Ora il rientro è l'indicatore del vault nella barra laterale ([useSecurityPrompt.ts](../vue-app/src/composables/useSecurityPrompt.ts)).
  - parole **coperte all'apertura**, download del file come azione principale e appunti come ripiego avvisato.

### Difetti trovati e corretti durante F5
- **"Copia link" consegnava link rotti** ([SharedLinksTable.vue](../vue-app/src/components/SharedLinksTable.vue)):
  il frammento `#key=…` esiste solo alla creazione, il record del server no — dopo un refresh si copiava
  un URL senza chiave e il destinatario scaricava ciphertext inservibile. Ora il frammento viene
  ricostruito dal vault locale, e se il vault è chiuso si rifiuta di copiare invece di sbagliare in silenzio.
- **Numeri inventati** in dashboard (`+12%`, "di 10 GB disponibili") e tre statistiche sempre a zero
  (`downloaded`/`archived`/`deleted`): rimosse insieme alle prop che le rendevano possibili.
- **"Membro dal"** era calcolato da `auth_time` = ultimo accesso, quindi mostrava sempre oggi. Rimosso:
  nel token non esiste la data di iscrizione.
- **Tab "Organizzazione"** renderizzava lo stesso componente di "Integrazioni". Rimossa.
- **Bottoni finti** (2FA, elimina account) senza alcun handler: ora dichiarati "non ancora disponibile".
- **`isEncrypted` non era mai mostrato**: la proprietà centrale del prodotto ora ha una colonna sua.

---

## Componenti nuovi vs riuso

| Nuovi (da creare) | Riuso/refactor |
|---|---|
| `SendBox`, `EncryptingViz`, `PrivacyReceipt`, `RecipientFingerprintDialog`, `PricingTable`, `ClaimTransferDialog`, `OnDeviceScanStatus`, `TrustBadges`, header/footer pubblici, `QrCode`, `GuestTransferPill` | `crypto.ts`, `streamingDownload.ts`, `keyStore.ts`, `useFolderDragAndDrop` (anche nel widget guest), `useS3MultipartUpload`→`stores/guestUpload`, `ShareAccessPage`, `SharedLinksTable`, `ShareFileModal`, `RecoveryKeySetup` |

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

- [x] **F0**: token unici applicati a PrimeVue + Tailwind; light/dark curati; `reduced-motion` ok.
- [x] **F1**: da sloggato carico un file, vedo la cifratura visibile, ottengo un link `/share/:token#chiave`
  funzionante (con QR); errori/abuso gestiti con messaggi umani.
- [ ] **F2**: `PrivacyReceipt` in invio e download; fingerprint destinatario verificabile nella condivisione.
- [ ] **F3**: `/pricing` + claim end-to-end (guest → account) + limiti mostrati.
- [ ] **F4**: scan on-device + anteprime locali con fallback pulito.
- [ ] **F5**: tutte le schermate sul nuovo design system, esperienza coerente e "premium".

---

*Creato il 2026-07-23. Contratto API allineato al [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md).
Concept visivo del momento-firma (facciata + cifratura visibile + ricevuta): artifact linkato in chat.*
