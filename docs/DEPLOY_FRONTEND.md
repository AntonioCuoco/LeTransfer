# Deploy del frontend — Novren su Cloudflare Pages

> **Cos'è.** La procedura per portare online il frontend, in ordine di esecuzione, con
> **come si verifica** ogni passo. Scritta per essere seguita una riga alla volta.
>
> **Decisioni già prese** (2026-08-13): hosting **Cloudflare Pages**; origine unica
> **`novren.net`**, con `novren.it` e le varianti `www` che fanno **301** verso di essa;
> captcha su origine dedicata **`captcha.novren.net`**.
>
> Il backend è fuori dallo scope di questo documento salvo due variabili, segnalate dove
> servono. Lo stato del backend è in [BACKEND_HANDOFF.md](BACKEND_HANDOFF.md).

---

## 0. Prima di iniziare — l'ordine conta

Tre passi dipendono l'uno dall'altro e sbagliarne l'ordine costa un giro di deploy:

1. **Il captcha va in piedi prima di accendere Turnstile.** Se imposti `TURNSTILE_SECRET`
   sul backend prima che il widget funzioni in produzione, **ogni upload guest va in 403**.
2. **Le callback Cognito prima del primo login.** Registrarle dopo significa che il primo
   utente che prova Google riceve un errore di `redirect_uri`.
3. **La CORS del bucket R2 prima di provare un upload**, altrimenti la PUT firmata viene
   bloccata dal browser e sembra un problema dell'app.

---

## 1. Riempire `.env.production`

> 🔖 **Deciso il 2026-08-13: primo deploy SENZA backend.**
> `VITE_API_URL` resta **vuota** finché il prodotto non è pronto. Il sito pubblicato è quindi una
> **vetrina statica**: facciata, pagine, routing, header e CSP si collaudano; login, registrazione,
> upload e link condivisi **no**, perché non c'è nessuna API da chiamare.
>
> Lasciala vuota e non `http://localhost:3000/api`: una pagina HTTPS che chiama `http://localhost`
> viene bloccata come *mixed content*, e la console si riempie di errori che nascondono quelli veri
> — comprese le violazioni CSP, che sono esattamente ciò che vuoi leggere in questa fase.
>
> **Da fare quando la roadmap è completa:** deployare il backend su Fly, metterci davanti
> `api.novren.net` (CNAME → Fly, vedi §8 e [BACKEND_WORKORDER_AUTH_COOKIES.md](BACKEND_WORKORDER_AUTH_COOKIES.md)),
> riempire `VITE_API_URL`, **ricostruire e ridiployare** il frontend, e aggiungere quell'host a
> `connect-src` in `_headers`. Il valore è incorporato nel bundle: senza un nuovo build non cambia niente.

Il file è in [vue-app/.env.production](../vue-app/.env.production), già commentato variabile
per variabile. **Non è in `.gitignore` ed è giusto committarlo**: sono valori pubblici, che
finiscono comunque dentro il bundle. Committandoli, il build su Pages li trova da solo senza
doverli reinserire nel pannello.

| Variabile | Valore |
|---|---|
| `VITE_API_URL` | URL dell'Express **con `/api`** |
| `VITE_FRONTEND_URL` | `https://novren.net` |
| `VITE_COGNITO_CLIENT_ID` | App Client ID della User Pool |
| `VITE_AWS_REGION` | la regione della User Pool |
| `VITE_COGNITO_DOMAIN` | Hosted UI, `https://<prefisso>.auth.<regione>.amazoncognito.com` |
| `VITE_COGNITO_REDIRECT_URI` | **lascia vuota** (vedi il commento nel file) |
| `VITE_TURNSTILE_SITE_KEY` | site key del widget |
| `VITE_CAPTCHA_ORIGIN` | `https://captcha.novren.net` |

⚠️ Le variabili sono **incorporate nel bundle al build**. Cambiarle dopo non ha effetto
finché non ricostruisci: è la causa numero uno di "ho cambiato la config e non succede niente".

**Verifica.** Dopo il build: `grep -r "novren.net" dist/assets/*.js | head` deve trovare
qualcosa. Se non trova nulla, il file non è stato letto.

> 💡 **Con le variabili ancora vuote il build riesce lo stesso**, ma produce un'app che non
> parla con nessuno. Verificato: i valori vuoti di `.env.production` **sovrascrivono** quelli
> di `.env`, quindi almeno non rischi di pubblicare un bundle che punta a `localhost` — è
> stato controllato sul build reale, `dist/` non contiene nessun riferimento a localhost.

---

## 2. Creare il progetto su Cloudflare Pages

Collega il repository e imposta:

- **Root directory**: `vue-app`
- **Build command**: `npm run build`
- **Output directory**: `dist`
- **Node version**: 20 o superiore

⚠️ Se il build fallisce su `vue-tsc`, controlla che la versione di Node su Pages combaci con
quella locale. In locale il progetto compila pulito.

**Verifica.** Il primo deploy produce un URL `*.pages.dev`: aprilo. L'app deve caricarsi.
A questo punto **non** funzioneranno né login né upload — è atteso, mancano ancora domini,
CORS e CSP.

---

## 3. Domini

### 3.0 Prima: spostare i nameserver su Cloudflare

I domini sono registrati su **GoDaddy**. Va cambiato dove risponde il DNS.

> **Perché è obbligatorio, non consigliato.** Dalla documentazione Cloudflare Pages:
> *«To use a custom apex domain with Cloudflare Pages, the domain must be added as a Cloudflare
> zone within the same account as your project. You must configure your domain's nameservers to
> point to Cloudflare.»*
>
> I **sottodomini** funzionano anche con DNS esterno (basta un `CNAME` verso `<progetto>.pages.dev`),
> ma l'**apex** — `novren.net` senza `www`, che è l'origine che abbiamo scelto — no. Il motivo
> tecnico è che all'apex il DNS non ammette un `CNAME`, e serve la CNAME-flattening che GoDaddy
> non offre.

**Cosa NON stai facendo:** non stai trasferendo il dominio. Resta registrato su GoDaddy, con le
sue scadenze e il suo pagamento. Cambia solo **chi risponde alle query DNS**.

> 🚨 **L'ordine è questo, non l'inverso: prima i nameserver, poi i record.**
>
> La delega dei nameserver vale per l'**intera zona**, non per un singolo nome: dire "per
> `novren.net` chiedete a Cloudflare" significa dirlo anche per *ogni* sottodominio, presente e
> futuro. Da quel momento **i record rimasti su GoDaddy non vengono più consultati da nessuno**.
>
> Conseguenza pratica: **non creare `captcha.novren.net` su GoDaddy.** Se lo fai e poi sposti i
> nameserver, quel record smette di esistere — a meno che Cloudflare non lo copi nella scansione
> iniziale, il che lo rende un passaggio inutile con una possibilità di errore in più.
>
> E non serve crearlo nemmeno su Cloudflare a mano: a zona già attiva, **è Pages a creare il
> record CNAME** quando aggiungi il dominio fra i Custom domains (§3.1). L'unica cosa che fai su
> GoDaddy è cambiare i nameserver.

> ⚠️ **I nameserver NON te li dà Pages.** Te li dà **«Add a site»**, che è un'operazione a livello
> di account, in un'altra sezione del pannello rispetto a Workers & Pages. Pages sa gestire solo i
> domini di zone **già presenti** nel tuo account: se ci aggiungi `novren.net` prima di aver creato
> la zona, ti risponde che il dominio non è nel tuo account e nameserver non ne vedi.
>
> Sono due operazioni indipendenti che si incontrano solo alla fine:
> **«Add a site»** importa i record da GoDaddy e consegna i nameserver · **Workers & Pages** ospita
> il build. Puoi fare la seconda mentre la prima propaga.

Passi:

1. Su Cloudflare → **Add a site** (non da Workers & Pages) → `novren.net` (piano Free).
2. Cloudflare legge i record esistenti: **controlla che li abbia presi tutti** prima di procedere,
   soprattutto eventuali `MX` se hai già la posta attiva su quel dominio. Un `MX` perso significa
   email che smettono di arrivare senza errori visibili.
3. Cloudflare ti dà due nameserver. Su GoDaddy → DNS → Nameservers → "I'll use my own" → inseriscili.
4. Ripeti per `novren.it`.
5. La propagazione richiede da qualche minuto a qualche ora. Cloudflare manda un'email a zona attiva.

**Verifica.** `nslookup -type=NS novren.net` deve rispondere con i nameserver di Cloudflare.

⚠️ **Ricaduta sul backend.** Se poi metti il traffico dietro il proxy Cloudflare (nuvoletta
arancione), gli hop di proxy diventano **2** e `TRUST_PROXY_HOPS` sul backend va aggiornato,
altrimenti il rate limit conta l'IP del proxy invece del client — nessuna protezione, con l'aria
di averla. Procedura di verifica in [DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md).

### 3.1 Domini su Pages

Su Pages → Custom domains, aggiungi:

- **`novren.net`** — l'origine reale
- **`captcha.novren.net`** — l'origine isolata del captcha

> **A cosa serve `captcha.novren.net`, in una riga:** lo script di Turnstile viene da Cloudflare
> e gira con accesso pieno alla pagina che lo ospita. La pagina dell'invio guest è quella in cui
> nasce la chiave AES del file. Su un'origine diversa, è il **browser** a impedirgli di leggere
> la pagina genitore: esce solo un token monouso via `postMessage`. Sullo stesso dominio l'iframe
> ci sarebbe ancora, ma l'isolamento sarebbe **zero** — un iframe same-origin legge il genitore.
> Un sottodominio è il modo più economico di avere un'origine diversa.

### 3.2 Il redirect verso l'origine unica

`novren.it` va aggiunto a Cloudflare **con la stessa procedura del §3.0** (Add a site +
nameserver). Non è facoltativo: una Redirect Rule scatta solo sul traffico che **arriva** a
Cloudflare, e se i nameserver del `.it` restano su GoDaddy quelle richieste Cloudflare non le
vede mai.

**Prima i record.** Un dominio che non ospita niente deve comunque risolvere verso Cloudflare,
altrimenti non c'è nessuna richiesta da intercettare. Dalla documentazione: *«Use the IP address
`192.0.2.1` for the A record. This address does not route traffic to an origin server but allows
Cloudflare to apply rules, redirects, and Workers to incoming traffic.»* (`192.0.2.1` è un
indirizzo riservato alla documentazione, non instradabile.)

Nella zona `novren.it`:

| Tipo | Nome | Valore | Proxy |
|---|---|---|---|
| A | `@` | `192.0.2.1` | **Proxied** |
| A | `www` | `192.0.2.1` | **Proxied** |

🚨 **Proxied (nuvoletta arancione) è obbligatorio.** In "DNS only" Cloudflare non tocca il
traffico, la regola non scatta e il browser tenta davvero di raggiungere `192.0.2.1`, che non
risponde: il dominio sembra semplicemente morto.

**Poi la regola.** Rules → Redirect Rules → Create, con l'editor di espressioni:

- **Quando**: `(http.host eq "novren.it" or http.host eq "www.novren.it")`
- **Target URL** (dynamic): `concat("https://novren.net", http.request.uri.path)`
- **Status**: `301` · **Preserve query string**: attivo

⚠️ Il `concat` con `http.request.uri.path` serve a **conservare il percorso**. Con un redirect
statico alla sola home, chi apre `novren.it/share/<token>` finisce sulla homepage e il file non
lo vede mai. Su un prodotto in cui il link *è* il prodotto, è la differenza fra un redirect e un
link rotto.

**Stessa cosa per `www.novren.net`**, ma nella zona `.net`: record `www` proxied verso
`192.0.2.1` e regola con `http.host eq "www.novren.net"`.

**Verifica.**

```bash
curl -sI https://novren.it/share/test | grep -iE "^(HTTP|location)"
```

Deve rispondere `301` con `location: https://novren.net/share/test` — **col percorso conservato**.

> **Perché `captcha.novren.net` sullo stesso progetto.** Serve la stessa `captcha.html` da
> un'origine diversa, che è tutto ciò che conta per l'isolamento: lo script di Cloudflare
> non deve girare nell'origine che genera le chiavi. Effetto collaterale: anche l'app è
> raggiungibile da quell'hostname. Non è un buco — chi la aprisse da lì troverebbe il
> captcha che rifiuta di dargli un token, perché `captcha.novren.net` **non** è in
> `ALLOWED_PARENTS` — ma se vuoi pulizia, aggiungi una Redirect Rule che manda
> `captcha.novren.net/*` (escluso `/captcha.html`) su `novren.net`.
>
> L'alternativa più netta è un secondo progetto Pages che serva **solo** `captcha.html`.
> In quel caso il blocco `/captcha.html` di `_headers` va spostato in quel progetto.

---

## 3-bis. Cosa puoi fare mentre il DNS propaga

Il cambio di nameserver è l'unica cosa che ti fa aspettare (da minuti a qualche ora). Non è un
tempo morto:

- **Il progetto Pages puoi crearlo e deployarlo subito**: l'URL `*.pages.dev` non dipende dal tuo
  DNS. Da lì collaudi già registrazione, login, upload, generazione e apertura dei link.
- **L'unica cosa che non puoi provare è il captcha**, perché ha bisogno della sua origine dedicata.
- **Collegare i domini custom invece richiede la zona attiva**: Pages verifica che sia nel tuo
  account, e finché i nameserver non sono propagati non lo è.

---

## 4. Sostituire i segnaposto negli header

In [vue-app/public/_headers](../vue-app/public/_headers) ci sono **sei** segnaposto da
sostituire prima del deploy definitivo. Il file spiega uno per uno cosa metterci.

```bash
# Elencali per non dimenticarne nessuno:
grep -oE "<<<[A-Z0-9_]+>>>" vue-app/public/_headers | sort -u
```

`<<<API_ORIGIN>>>` · `<<<COGNITO_IDP>>>` · `<<<COGNITO_HOSTED_UI>>>` · `<<<R2_HOST>>>` ·
`<<<CAPTCHA_ORIGIN>>>` nella CSP dell'app, e `<<<FRONTEND_ORIGIN>>>` in quella del captcha.

⚠️ Un segnaposto dimenticato rende invalida quella direttiva e il browser blocca le
richieste corrispondenti — con l'app che sembra rotta senza dire perché.

**Verifica.** Dopo il deploy:

```bash
curl -sI https://novren.net | grep -i content-security-policy
curl -sI https://captcha.novren.net/captcha.html | grep -iE "frame-ancestors|x-frame-options"
```

La prima deve contenere `frame-ancestors 'none'` e **nessun** `<<<`.
La seconda deve contenere `frame-ancestors https://novren.net` e **non** deve contenere
`X-Frame-Options`. Se `X-Frame-Options: DENY` è ancora lì, la direttiva `! X-Frame-Options`
non ha funzionato: togli `X-Frame-Options` dal blocco `/*` e affidati a `frame-ancestors 'none'`,
che i browser moderni onorano comunque.

Poi apri il sito e **guarda la console**: le violazioni CSP si leggono lì, e sono l'unico modo
per accorgersi di un host dimenticato in `connect-src` prima che lo faccia un utente.

---

## 5. Cognito — callback

Nel pannello Cognito → User pool → App client → Hosted UI:

- **Allowed callback URLs**: `https://novren.net/oauth2/callback`
- **Allowed sign-out URLs**: `https://novren.net`

⚠️ Lascia anche `http://localhost:5173/oauth2/callback` per lo sviluppo.

> Se non aggiungi `VITE_COGNITO_DOMAIN` in `.env.production`, il bottone "Continua con
> Google" **non viene mostrato** e si accede solo con email e password. È voluto: meglio
> nascondere un metodo che non può funzionare che offrirlo e farlo fallire.

**Verifica.** Login con Google da `https://novren.net`: deve tornare su `/oauth2/callback`
e finire nella dashboard.

---

## 6. Turnstile — l'hostname giusto

Nel dashboard Turnstile, negli **Hostnames** del widget, aggiungi **`captcha.novren.net`**.

🚨 **Non `novren.net`.** Turnstile valida l'hostname della pagina in cui il widget
**renderizza**, che è `captcha.html` — servita dall'origine del captcha, non dall'app.
È lo stesso motivo per cui in sviluppo va registrato l'IP della LAN e non `localhost`.
Se in lista c'è solo il dominio dell'app, il widget riceve `401` da Cloudflare e non compare.

Lascia anche `localhost` e `127.0.0.1` per lo sviluppo.

**Verifica.** Apri la facciata pubblica: il widget deve **comparire**. Se resta il riquadro
vuoto o "Verifica anti-bot non disponibile", l'hostname è sbagliato o la CSP del captcha
blocca `challenges.cloudflare.com`.

---

## 7. CORS del bucket R2

Aggiungi `https://novren.net` alla CORS policy del bucket (oggi ci sono solo gli origin di
sviluppo). Metodi `GET/PUT/HEAD`, header `*`, **expose `ETag`**.

🚨 Senza `ETag` esposto **il multipart si rompe**: il client legge quell'header per
completare l'upload, e senza fallisce a metà su ogni file grande.

**Verifica.** Carica un file > 100 MB dalla dashboard: deve arrivare al 100% e comparire
nell'elenco.

---

## 8. Sul backend — le due variabili che riguardano il frontend

Sono lavoro backend ma senza di esse il frontend non funziona:

- **`FRONTEND_URL=https://novren.net`** su Fly. Serve a due cose insieme: costruire gli URL
  `/share/:token` **e** fare da whitelist CORS. Se resta al default, i link nascono col
  dominio sbagliato **e** le richieste del frontend vero vengono respinte.
- **`TRUST_PROXY_HOPS`**: `1` se il traffico va dritto a Fly, `2` se passa dal proxy
  Cloudflare (arancione). Sbagliato = rate limit che conta l'IP del proxy, cioè nessuna
  protezione con l'aria di averla. Procedura in [DA_CONTROLLARE_QUANDO.md](DA_CONTROLLARE_QUANDO.md).

---

## 9. Collaudo finale — il percorso che conta

Da una finestra anonima, su `https://novren.net`:

- [ ] La facciata carica e il **widget anti-bot compare**.
- [ ] Invio senza account: file cifrato, caricato, link generato con la chiave nel `#`.
- [ ] Il link aperto **in un altro browser** scarica e decifra il file.
- [ ] Ricaricare la pagina su `/prezzi` e su un `/share/...` **non dà 404** (fallback SPA).
- [ ] Registrazione + login con email e password.
- [ ] Login con Google (se hai configurato il dominio Cognito).
- [ ] Upload da dashboard di un file **oltre 100 MB** (multipart + CORS + ETag).
- [ ] Console del browser **senza violazioni CSP**.

L'ultimo punto è quello che si dimentica ed è quello che tradisce: una violazione CSP non
blocca la pagina, blocca *una richiesta*. L'app resta in piedi e una funzione smette di
esistere senza dirlo a nessuno.

---

## Cosa resta spento dopo questo deploy, e va bene

- **Piani e pagamenti**: la UI c'è, gli endpoint no. Il piano risulta `free` per tutti,
  che è anche ciò che il backend applica davvero. Nessun errore a schermo.
  Vedi [BACKEND_HANDOFF §13-bis](BACKEND_HANDOFF.md).
- **Email**: nessuna notifica parte. Le impostazioni lo dichiarano apertamente.
- **`security@novren.net`**: la casella è pubblicata su due pagine. **Deve esistere e
  qualcuno deve leggerla** prima di considerare il sito davvero aperto (voce 9 dell'handoff).

---

*Creato il 2026-08-13, insieme a `.env.production`, `public/_headers` e `public/_redirects`.*
