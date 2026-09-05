# Novren — trasferimento file cifrato end-to-end

**Novren** (nome pubblico; nel codice e nel repository l'identificatore storico resta
`LeTransfer`) è una piattaforma di trasferimento file semplice come WeTransfer ma
**zero-knowledge sul serio**: i file vengono cifrati nel browser e il server conserva solo
ciphertext, senza possedere mai una chiave capace di aprirlo.

Nasce per chi tratta documenti che non può permettersi di lasciare leggibili a un
intermediario — avvocati, commercialisti, professionisti sanitari, chiunque scambi
materiale riservato — offrendo lo stesso gesto immediato di un servizio come WeTransfer:
trascini un file, ottieni un link, nessuna procedura macchinosa. La differenza è che qui
"cifrato" non è una casella spuntata nel marketing: la chiave nasce e resta nel browser di
chi invia, viaggia nel link o wrappata sulla chiave del destinatario, e il server non la
vede mai in nessuna delle due forme.

Il differenziatore non è la promessa, è la **verificabilità**: crittografia interamente
client-side, build riproducibile pubblicata dalla pipeline, impronta della chiave del
destinatario confrontabile a voce, e una pagina `/sicurezza` che dichiara anche dove quella
promessa incontra i suoi limiti strutturali.

---

## 📦 Cosa contiene questo repository

Solo il **frontend**. Il backend Express vive in un repository separato ed è deployato su
Fly.io (app `novrenbackend`) dietro `api.novren.net`.

```
vue-app/            l'applicazione Vue 3 — tutto il codice di prodotto
  src/crypto/       il nucleo crittografico e la sua specifica
  public/           _headers (CSP), _redirects (fallback SPA), captcha.html
docs/               documentazione di lavoro
.github/workflows/  build riproducibile e pubblicazione sui tag
```

---

## ✨ Funzionalità

### 🚀 Invio

- **Senza account**: dalla facciata si invia subito — chiave generata nel browser, link
  pronto, nessuna registrazione. Protetto da rate limit per IP e **Cloudflare Turnstile**.
- **Più file o una cartella** → **zip in streaming** (`client-zip`): l'archivio viene
  prodotto e cifrato al volo, senza mai stare in RAM. Un solo link.
- **Upload multipart** con caricamento parallelo a chunk, riprendibile, e code per gestire
  più trasferimenti insieme senza saturare la banda.
- **Claim**: un invio da guest può essere rivendicato in un account, che ne assume la
  proprietà e ne estende la conservazione.

### 📥 Ricezione — richiesta file

- **Richieste file** (`/app/richieste`): un utente registrato apre un link di raccolta e lo
  manda a chi deve inviargli documenti. Chi carica **non ha bisogno di un account**.
- La chiave nasce nel browser di chi carica e viene **wrappata sulla chiave pubblica del
  destinatario**: il server trasporta un blob che non può aprire, esattamente come per un
  invio diretto.
- **Impronta del destinatario ricalcolata lato client**, mai fidata di quella dichiarata dal
  server: chi carica può confrontarla se il destinatario l'ha pubblicata altrove.
- Ogni richiesta ha una scadenza e un numero massimo di caricamenti, entrambi impostati da
  chi la apre.

### 🔒 Sicurezza e privacy

- **AES-256-GCM** sul contenuto, formato **v2 a chunk**: IV diverso per ogni chunk e
  `AAD = chunk-<indice>`, così un blocco riordinato o sostituito non si apre.
- **Nome del file cifrato**: stessa chiave del contenuto, AAD separato (`filename`) per
  impedire che un chunk venga scambiato per un nome. Resta leggibile solo da chi ha la
  chiave — il server vede un blob, non un nome di file.
- **Chiave nel fragment**: nei link pubblici la chiave sta dopo `#`, che per come è definito
  HTTP il browser non invia al server.
- **Condivisione utente→utente** con wrapping **RSA-OAEP 4096**; la chiave privata vive in
  IndexedDB come `extractable: false` — nemmeno il JavaScript della pagina può esportarla.
- **Chiave di recupero BIP39** (24 parole, 256 bit di entropia): da essa si deriva via
  PBKDF2 la master key che cifra il backup della chiave privata. Al server vanno solo il
  salt e un piccolo blob di verifica.
- **Verifica in due passaggi** (TOTP) sull'accesso all'account, indipendente dalla
  crittografia dei file: protegge contro chi ruba una password, non sostituisce le chiavi.
- **Impronta del destinatario** (JWK Thumbprint, RFC 7638) con trust-on-first-use: se la
  chiave pubblica restituita dal server cambia, l'utente lo vede.
- **Ricevuta di privacy**: cosa è stato cifrato e cosa il server ha visto, mostrata sia a
  chi invia sia a chi riceve.
- Nessuna libreria crittografica di terze parti: solo **Web Crypto** della piattaforma.

### 🛠 Gestione dell'account

- **Account** su AWS Cognito, incluso login Google, con cronologia dei trasferimenti.
- **Link personalizzabili**: scadenza, password (Argon2 lato server), numero massimo di
  download, revoca.
- **File manager**: dashboard per cercare, gestire ed eliminare i file inviati e ricevuti,
  con l'attività di download.
- **Anteprima** integrata per immagini, PDF, video e audio.
- **Piani** Free / Pro, con limiti applicati sia nell'interfaccia sia lato backend su tre
  assi: dimensione del singolo trasferimento, spazio archiviato complessivo e volume
  trasferibile al mese.
- **Esportazione completa** dei propri dati (portabilità, art. 20 GDPR): un unico archivio
  con tutti i file, decifrati nel browser e impacchettati in streaming.
- **Cancellazione dell'account** (diritto all'oblio, art. 17 GDPR): distruzione
  crittografica immediata delle chiavi, confermata con password e frase digitata. Da quel
  momento i file sono illeggibili per chiunque — anche per chi li aveva caricati.

### 🎨 Interfaccia

- Pagine pubbliche `/`, `/come-funziona`, `/prezzi`, `/sicurezza`, `/richiesta/:token`; area
  autenticata sotto `/app`.
- Design "Premium Geometric", animazioni GSAP, tema chiaro/scuro, font self-hosted.
- Progresso **per-file** misurato sui byte accettati dallo storage, notifiche toast, stati
  di cifratura e decifratura espliciti.

---

## 🏗 Tech stack

### Frontend (`vue-app/`)

| Ambito | Scelta |
|---|---|
| Framework | Vue 3 (`<script setup>`) + TypeScript + Vite 6 |
| UI | PrimeVue 4 (preset + PassThrough) su TailwindCSS 4 |
| Stato | Pinia + composable dedicati |
| Routing | Vue Router, guard `requiresAuth` sulle route `/app` |
| Form | VeeValidate + Zod |
| Animazioni | GSAP |
| Rete | Axios con interceptor di auth · TanStack Query |
| Crypto | Web Crypto API — nessuna dipendenza crittografica esterna |
| Test | Vitest (logica e componenti) · Playwright (end-to-end) |

### Servizi

| Ambito | Scelta |
|---|---|
| API | Node.js + Express 5 su **Fly.io** (`api.novren.net`), repository separato |
| Auth | AWS Cognito, con verifica vera della firma dell'access token e 2FA opzionale |
| Storage | **Cloudflare R2** (bucket EU), con switch automatico verso S3 via env |
| Database | AWS DynamoDB — metadati file, link condivisi, chiavi pubbliche |
| Anti-abuso | Cloudflare Turnstile su origine dedicata + rate limit per IP |
| Hosting frontend | Cloudflare Pages |

---

## 🚀 Setup sviluppo

Serve **Node 22.20.0** (vedi `vue-app/.nvmrc`).

```bash
git clone https://github.com/AntonioCuoco/LeTransfer.git
cd LeTransfer/vue-app
npm ci
```

Poi crea `vue-app/.env` — non è versionato:

| Variabile | A cosa serve |
|---|---|
| `VITE_API_URL` | Base URL del backend Express; in locale `http://localhost:3000/api` |
| `VITE_FRONTEND_URL` | Origine dell'app, usata per costruire i link condivisibili |
| `VITE_AWS_REGION` | Regione del User Pool Cognito |
| `VITE_COGNITO_CLIENT_ID` | Client ID del User Pool |
| `VITE_COGNITO_DOMAIN` | Dominio della hosted UI Cognito (OAuth Google) |
| `VITE_COGNITO_REDIRECT_URI` | Callback OAuth (`/oauth2/callback`) |
| `VITE_TURNSTILE_SITE_KEY` | Site key Turnstile per l'invio senza account |
| `VITE_CAPTCHA_ORIGIN` | Origine **diversa** da quella dell'app che serve `captcha.html` |

`vue-app/.env.production` è versionato e documenta i valori usati in produzione: è il
riferimento da cui partire.

⚠️ **Le `VITE_*` finiscono nel bundle al momento del build.** Cambiarne una senza
ricostruire non ha alcun effetto — è l'errore che costa mezz'ora ogni volta.

Poi, da `vue-app/`:

```bash
npm run dev     # http://localhost:5173, e anche sull'IP di LAN: serve al captcha
```

---

## ✅ Test e controlli

Tutto da `vue-app/`:

```bash
npm test                 # Vitest, una volta sola
npm run test:watch       # in watch
npm run test:logica      # solo la logica, crittografia compresa
npm run test:componenti  # solo i componenti
npm run test:e2e         # Playwright, percorso critico
npx vue-tsc --noEmit     # controllo dei tipi
npm run lint             # ESLint
```

Prima di committare conviene lanciare `npm test` e `npx vue-tsc --noEmit`: sono gli stessi
due controlli che la pipeline rilancia, e senza i quali **si rifiuta di pubblicare**.

---

## 📦 Build e rilascio

**È il tag a pubblicare, non il push.** Il workflow si attiva sui tag `v*`:

```bash
git tag -a v0.7.0 -m "release 0.7.0"
git push --follow-tags
```

La pipeline esegue, in ordine: install dal lockfile → type-check → test del nucleo
crittografico → build → **seconda build e confronto degli hash** → manifesto
`SHA256SUMS.txt` → attestazione di provenienza → deploy su Cloudflare Pages → release
pubblica con il manifesto. Se una qualsiasi verifica fallisce, **non pubblica niente**.

La doppia build non è cerimoniale: la cifratura avviene dentro il codice che serviamo noi,
quindi l'unica difesa possibile contro una distribuzione manomessa è renderla
**ricostruibile e confrontabile da terzi**. La pagina `/sicurezza` dichiara pubblicamente
quale commit stai eseguendo — ed è il motivo per cui il frontend **non va mai deployato a
mano**.

---

## 📄 Licenza

Il repository ha **due licenze**, ed è una scelta deliberata.

| Cosa | Licenza | Perché |
|---|---|---|
| `vue-app/src/crypto/` | **Apache-2.0** | È il codice su cui poggiano le affermazioni di sicurezza: deve poter essere letto, verificato e riusato senza attriti |
| Tutto il resto | **FSL-1.1-ALv2** | Puoi leggerlo, modificarlo, ricostruirlo e auto-ospitarlo; non puoi usarlo per offrire un servizio concorrente. Ogni versione diventa **Apache-2.0 due anni** dopo la pubblicazione |

Il sorgente è pubblico perché la promessa del prodotto lo richiede: la pagina
`/sicurezza` invita chiunque a ricostruire la build dal tag e confrontare gli hash, e
senza codice leggibile quell'invito sarebbe vuoto. La FSL preserva interamente questa
verificabilità — limita la concorrenza, non l'ispezione.

Il nome **Novren**, il logo e l'identità visiva non sono coperti da nessuna delle due
licenze: vedi [TRADEMARK.md](TRADEMARK.md).

Per contribuire (serve il sign-off DCO) vedi [CONTRIBUTING.md](CONTRIBUTING.md); per
segnalare un problema di sicurezza, [SECURITY.md](SECURITY.md).

---

*Progetto sviluppato con ❤️ con tecnologie web moderne.*
