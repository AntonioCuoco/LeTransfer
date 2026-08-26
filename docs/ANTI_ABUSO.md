# Anti-abuso di un canale zero-knowledge — architettura e evoluzione

> **Cos'è.** Come si difende dagli abusi un servizio che **per costruzione non può guardare
> dentro ai file**. Stato attuale, cosa stiamo aggiungendo ora, e come diventa un sistema
> serio se il traffico cresce.
>
> Documenti collegati: [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md) §7 (rischi) ·
> [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §4.9 e §5-quater · [BACKEND_WORKORDER_ROADMAP.md](BACKEND_WORKORDER_ROADMAP.md) §C.7

---

## 0. Il problema, e perché non è quello che sembra

Firefox Send è morto nel 2020 perché era diventato un canale di distribuzione di malware. La
lezione che si cita di solito ("serviva uno scanner") è **sbagliata**. Mozilla uno scanner non
poteva metterlo: i file erano cifrati end-to-end, esattamente come i nostri. È morto perché non
aveva la **macchina operativa** per accorgersi degli abusi e rimuoverli in fretta.

Il rischio reale per noi, in ordine di gravità:

1. **Blocklisting del dominio** — Google Safe Browsing, SmartScreen, i gateway di posta. Se
   `novren.net` finisce in quelle liste, smettono di arrivare *tutti* i link, anche quelli
   legittimi. Per un prodotto di trasferimento file è una condanna a morte, ed è **reversibile
   solo lentamente**.
2. **Pressione di provider e registrar** — abuse complaint verso Cloudflare/R2 e verso il registrar.
3. **Esposizione legale** — la posizione di "hosting provider passivo" regge finché si dimostra di
   avere un processo di rimozione che funziona. Non è la cifratura a proteggerci: è il processo.
4. **Costo** — banda e storage bruciati da chi distribuisce payload.

Nessuno di questi quattro si risolve guardando dentro ai file. Si risolvono **accorgendosene in
fretta e rimuovendo in fretta**.

---

## 1. Il principio che ordina tutto il resto

Ci sono solo tre posti dove può stare un controllo, e vedono cose diverse:

| Dove | Cosa vede | Chi lo controlla | Vale contro l'abuso deliberato? |
|---|---|---|---|
| **Nel browser di chi invia** | Il file **in chiaro** | 😈 **L'attaccante** | ❌ **No**. Chi abusa non esegue il nostro JavaScript: chiama `/api/guest/upload/init` con `curl` |
| **Sul nostro server** | Solo **ciphertext** + metadati + **comportamento** | ✅ Noi | ✅ Sì, ma senza mai vedere il contenuto |
| **Nel browser di chi riceve** | Il file **in chiaro** | 🙂 Un umano non complice | ✅ Sì — è l'**unico** controllo di contenuto reale che abbiamo |

Da qui discende tutto:

- I controlli **client-side non sono anti-abuso**. Sono un servizio a chi invia per sbaglio
  qualcosa di infetto — caso comune e vero, ma un'altra cosa. Chiamarli anti-abuso significa
  mentire a noi stessi sul livello di protezione.
- La difesa vera sta nel **comportamento osservabile sul ciphertext** e nella **segnalazione di chi
  riceve**. Sono le due cose su cui investire.

---

## 2. Livello 0 — cosa c'è già (2026-08-02)

Backend (già implementato, [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §4.9, §5-quater):

| Controllo | Stato | Valutazione onesta |
|---|---|---|
| **Turnstile** su `init` | ✅ codice pronto | Alza il costo dell'automazione di massa. Non ferma chi ha budget: i solver a pagamento costano ~1-3 $/1000 |
| **Rate limit per IP** (`init`/h e richieste/h) | ✅ | ⚠️ Vale **solo** se `TRUST_PROXY_HOPS` è corretto in prod. Sbagliato = conta l'IP del proxy e non protegge niente, sembrando attivo. **Da verificare** |
| **Cap dimensione**, rivalidato sull'oggetto reale (`HeadObject`) | ✅ | Buono: non si fida della dimensione dichiarata |
| **Scadenza breve** (`GUEST_MAX_EXPIRY` 168h) | ✅ | Il decadimento automatico è la difesa passiva più efficace che abbiamo |
| **Revoca** col `manageToken` (confronto a tempo costante) | ✅ backend | Nessun bottone finora |
| **Report → quarantena a soglia** | ✅ backend | Nessun bottone finora → **la soglia non poteva essere raggiunta da nessuno** |
| **Lifecycle di cancellazione su `uploads/guest/`** | ❌ **non configurata** | Alla scadenza muore il link, **i byte restano**. È la differenza fra "non funziona più" e "non c'è più", e noi promettiamo la seconda |

**Il buco più grosso del livello 0 non era il codice: era una leva scollegata.**

---

## 3. Livello 1 — quello che stiamo facendo ora (il "basilare")

### 1a. Collegare la leva ✅ (fatto)

- **Segnalazione** sulla pagina di ricezione ([ReportLinkDialog.vue](../vue-app/src/components/LinkAccess/ReportLinkDialog.vue)):
  chi riceve è l'unico che il file lo vede davvero.
- **Revoca** nella carta del mittente: sbagliato file, lo ritiro.
- La UI **non promette la rimozione immediata**: la quarantena scatta a soglia. Promettere
  "rimosso" trasformerebbe il bottone in un modo per censurare il link di un altro.

### 1b. Controllo strutturale pre-invio ✅ (fatto)

Implementato in [fileInspection.ts](../vue-app/src/utils/fileInspection.ts) — modulo puro, 19 test.
Chunk separato da **2,5 kB gzip**, caricato al primo file aggiunto.

Analisi **statica e locale** del file prima della cifratura, su fette (`slice`) e non sul file
intero — la RAM costante è una proprietà di progetto dell'uploader e non va persa:

- **tipo reale contro estensione dichiarata** (magic bytes: `MZ`, `\x7fELF`, Mach-O, OLE2…);
  un `.jpg` che comincia con `MZ` non ha spiegazioni innocenti;
- **trucchi nel nome**: doppia estensione, carattere **RLO `U+202E`** (fa leggere `exe.pdf` come PDF);
- **dentro gli archivi** (dal central directory): eseguibili, archivi annidati, **voci cifrate con password**;
- **macro** (`vbaProject.bin` negli OOXML) e **PDF con `/JavaScript`, `/OpenAction`, `/Launch`**;
- **contenitori `.iso`/`.img`**, trucco standard per aggirare il Mark-of-the-Web.

Tre regole non negoziabili:

1. **Avvisa, non bloccare.** Gli sviluppatori mandano `.exe` e build tutto il giorno: è un caso d'uso
   centrale, non un abuso. Conferma esplicita solo per le categorie senza spiegazione innocente.
2. **Il risultato non lascia il dispositivo.** Mai. Mandare al server "questo utente ha provato a
   caricare un PE" sarebbe leak di metadati di contenuto: romperebbe la promessa per difenderla.
3. **Caricamento pigro**, in un chunk a parte: non deve pesare finché non trascini un file.

Costo: 1-2 giorni. Valore: reale per il mittente disattento, **nullo** contro l'abuso deliberato.

---

## 4. Livello 2 — quando il traffico cresce: il comportamento

È qui che sta la difesa seria, ed è tutta lato server **senza mai vedere un byte in chiaro**.
Il ciphertext non parla, ma il **comportamento intorno al ciphertext** parla moltissimo.

Segnali disponibili oggi, gratis:

| Segnale | Cosa suggerisce |
|---|---|
| **Fan-out**: N download distinti da M paesi in pochi minuti | Distribuzione di massa, non "mando un file a un collega" |
| **Latenza primo download**: pochi secondi dall'upload | Automazione: un umano il link deve ancora mandarlo |
| **Rapporto invii/IP e invii/ASN** | Gli abusi arrivano da IP di datacenter, non da linee residenziali |
| **Profilo dimensione + tipo dichiarato** | I payload malware stanno quasi sempre sotto i pochi MB |
| **Ripetizione di forma** dallo stesso IP | Stessa dimensione, stessa estensione, stessa scadenza = campagna |
| **User-agent / referrer dei download** | Client non-browser su un link "personale" |

Cosa costruire, in ordine di rapporto valore/costo:

1. **Scoring + azioni graduate** invece del binario attivo/revocato: `challenge` (Turnstile **sul
   download**), `throttle`, `quarantena`, `revoca`. Un link sospetto che rallenta danneggia una
   campagna e quasi non tocca un utente vero.
2. **Rate limit per ASN e per range**, non solo per IP: cambiare IP dentro un cloud provider costa zero.
3. **Reputazione del richiedente** (bot score di Cloudflare se si passa dal loro proxy: è già nello stack per R2/Turnstile).
4. **Proof-of-work sul canale anonimo** per gli invii grandi: qualche secondo di CPU è invisibile a
   una persona e devastante per chi ne fa diecimila. Alza il costo **senza chiedere identità**.
5. **Soglia di identità progressiva**: sopra una certa dimensione/frequenza si chiede un account con
   email verificata. Non è un muro sul prodotto — è un muro sull'*industrializzazione* del prodotto,
   ed è di fatto ciò che fanno tutti i concorrenti.

---

## 5. Livello 3 — quando diventa un obiettivo: processo, non codice

Quello che separa una feature da un sistema che regge è **operativo**, e oggi manca del tutto.

- **Deduplicazione e peso delle segnalazioni.** ⚠️ **Difetto attuale da correggere**: la quarantena
  scatta alla soglia `ABUSE_AUTO_QUARANTINE_THRESHOLD` e l'endpoint `report` **non ha
  captcha**. Chiunque conosca un link può ucciderlo con tre richieste da tre IP. Serve almeno:
  deduplicazione per (IP, token), **Turnstile anche su `report`**, e una soglia **relativa** ai
  download (3 segnalazioni su 5 download è un segnale; su 5000 è rumore o sabotaggio).
- **Appello.** Chi ha il `manageToken` deve poter contestare una quarantena. Senza, la moderazione
  automatica è solo censura più veloce.
- **Canale abuse pubblico** (`abuse@`) con un tempo di risposta **dichiarato**. È la prima cosa che
  guardano registrar e provider quando arriva un reclamo.
- **Registro delle azioni di moderazione** → **transparency report**: quante quarantene, quante
  revoche, quanti ripristini. Per noi non è burocrazia: è la stessa promessa di `/sicurezza` applicata
  a noi stessi, ed è materiale di marketing che i concorrenti non possono copiare senza dati veri.
- **Conservazione delle prove**: il backend già conserva l'oggetto in quarantena invece di
  cancellarlo. Giusto — ma va accompagnato da una policy scritta di **chi** può vederlo e **quando**
  (e con la chiave nel fragment, di fatto: nessuno).
- **Runbook per la richiesta legale**: cosa possiamo consegnare (metadati, log IP), cosa non
  possiamo (il contenuto), e chi risponde. Va scritto **prima** che serva.

---

## 6. Le tre opzioni che rifiutiamo, e perché

Vanno messe nero su bianco, perché prima o poi qualcuno le proporrà.

1. **Scansione lato server del contenuto.** Impossibile per costruzione: abbiamo solo ciphertext.
   L'unico modo sarebbe conservare le chiavi — cioè smettere di essere il prodotto che siamo.
2. **Reputazione per hash** (VirusTotal & co.) calcolata sul client. L'hash di un file lo
   **identifica**: mandarlo a un terzo è esattamente ciò che promettiamo di non fare. Inoltre non
   funziona: ogni campione di malware moderno è unico.
3. **Scansione percettiva client-side** stile PhotoDNA/CSAM (il tentativo Apple del 2021, ritirato).
   Falsi positivi con collisioni **costruibili**, e soprattutto: una volta che l'infrastruttura di
   scansione lato client esiste, la lista di cosa cercare la decide qualcun altro. Per un prodotto
   che vende "impossibile da leggere, anche per noi", costruirla sarebbe una contraddizione in atto.

La nostra risposta onesta a chi chiede "e allora i contenuti illegali?" è: **decadimento rapido,
segnalazione di chi riceve, rimozione veloce, e nessuna pretesa di onniscienza.** È anche la risposta
di Signal, e regge perché è vera.

---

## 7. Sequenza consigliata

| # | Cosa | Quando | Perché ora/dopo |
|---|---|---|---|
| 1 | **UI di report e revoca** | ✅ fatto | Senza, la quarantena era irraggiungibile |
| 2 | **Lifecycle su `uploads/guest/`** + TTL DynamoDB | **subito, prima del pubblico** | Oggi promettiamo una cancellazione che non avviene |
| 3 | **Verifica `TRUST_PROXY_HOPS`** in prod | subito | Un rate limit che conta l'IP sbagliato è peggio di nessun rate limit: dà una falsa sicurezza |
| 4 | **Turnstile su `report`** + dedup per IP + soglia relativa | prima del lancio | Altrimenti abbiamo costruito uno strumento di censura |
| 5 | **Controllo strutturale pre-invio** | ✅ fatto | Aiuta il mittente onesto; è anche il contenuto di marketing di E5 |
| 6 | **Scoring comportamentale + azioni graduate** | al primo segnale di abuso reale | Prima è ingegneria su un problema che non hai ancora |
| 7 | **Processo: abuse@, appello, transparency report** | quando il canale pubblico è aperto | È ciò che guardano registrar e provider |
| 8 | **PoW / soglia di identità progressiva** | se l'abuso industriale arriva | Alza il costo senza chiedere identità a tutti |

---

*Creato il 2026-08-02. Il criterio con cui è ordinato: prima ciò che rende **vera** una promessa che
stiamo già facendo, poi ciò che ci difende, poi ciò che ci fa sembrare difesi.*
