# Come si testa Novren

> Novren vive in **due repository**: il client (`LeTransfer`, questo) e il backend
> (`leTransferBackend`). Nessuno dei due, da solo, sa che l'altro è cambiato — ed è da
> quella crepa che è passato l'unico difetto grave trovato finora nel percorso di
> pagamento. Questo documento tiene insieme le due suite, e sta qui perché il criterio con
> cui si sceglie *cosa* testare conta più degli strumenti.

---

## 1. Il criterio: cosa merita un test

Uno solo, ed è ereditato dai commenti del nucleo crittografico:

> **Se sbaglia, sbaglia in silenzio.**

Un QR storto sembra un QR. Una barra di avanzamento sfasata sembra una barra. Un nome
cifrato che viene sanificato sembra un nome — e diventa illeggibile per sempre. Un
redirect verso una rotta che non esiste sembra un redirect, finché qualcuno non ha appena
pagato con la carta. Un limite che non scatta mai sembra un limite, **e nei log sembra
attivo**.

Sono tutti difetti che non producono un errore da nessuna parte e si scoprono a casa di
qualcun altro, giorni dopo. Quelli sono i test che valgono.

Il contrario, da non scrivere: test che ripetono l'implementazione riga per riga, che si
rompono a ogni refactor e non hanno mai trovato niente. Costano manutenzione e comprano
finta sicurezza.

---

## 2. La mappa

| Livello | Dove | Ambiente | Cosa risponde |
|---|---|---|---|
| **Logica** (client) | `vue-app/src/**/*.test.ts` | `node` | Il nucleo crypto, il QR, il progresso, i link. Codice che non tocca il DOM. |
| **Componenti** (client) | `vue-app/src/**/*.spec.ts` | `happy-dom` | Cosa si vede, cosa è disabilitato, cosa parte al click. |
| **E2E** (client) | `vue-app/e2e/*.spec.ts` | Chromium vero | Il percorso critico: cifra → carica → link → decifra. |
| **Unità** (backend) | `leTransferBackend/test/unit/**/*.test.js` | `node` | Funzioni pure: nomi dei file, chiavi storage, template email. |
| **Integrazione** (backend) | `leTransferBackend/test/integration/**/*.test.js` | `node` + `supertest` | Il contratto HTTP di una rotta: quale codice, quale corpo, quale redirect. |

**Perché l'estensione decide il progetto.** Nel client `.test.ts` e `.spec.ts` non sono
sinonimi: la prima gira in `node` senza impalcature, la seconda in un DOM simulato. È una
convenzione, ma è quella che permette al nucleo crittografico di girare **sul codice vero**
invece che su un rimpiazzo.

### Cosa NON coprono, oggi

Va detto per non credersi più coperti di quanto si è:

- **L'E2E stubba la rete** (`page.route`): niente backend, niente storage, niente
  Turnstile. Verifica il client, non il sistema. È una scelta — i test devono girare in CI
  senza infrastruttura — ma significa che **nessun test attraversa davvero i due repo**.
- **I test di integrazione montano i singoli router**, non `app.js`. Quindi **l'ordine di
  montaggio non è coperto**, e in `app.js` è significativo: `shareRoutes` e `guestRoutes`
  stanno prima di `filesRoutes` per non essere intercettati dal prefisso generico
  `/api/*`. Sbagliarlo è un difetto reale che questa suite non vedrebbe.
  Sbloccarlo costa poco: separare `app.js` (costruisce ed **esporta** l'app) da
  `server.js` (la avvia). Oggi `app.js` chiama `startServer()` in fondo e non esporta
  niente, quindi caricarlo da un test farebbe partire il server e, al primo errore AWS,
  `process.exit(1)` — che in vitest uccide il worker.
- **Nessun test tocca AWS, R2, Stripe o Cognito veri**, di proposito. Un test che passa
  solo su chi ha le credenziali giuste non è un test, è un promemoria.

---

## 3. Come si lancia

```bash
# client — da vue-app/
npm test                 # logica + componenti
npm run test:watch       # in ascolto, durante lo sviluppo
npm run test:e2e         # Playwright (fa build e preview da solo)
npm run test:tutto       # tutto

# backend — da leTransferBackend/
npm test                 # unità + integrazione
npm run test:unita
npm run test:integrazione
npm run test:watch
```

---

## 4. Dove va un test nuovo

| Se stai toccando… | Scrivi un test… |
|---|---|
| `vue-app/src/crypto/` | **obbligatorio**, in `*.test.ts` accanto. Vedi CONTRIBUTING §3. |
| una funzione pura (client) | `*.test.ts` accanto al file |
| una schermata, un dialog, un form | `*.spec.ts` accanto al componente |
| una funzione pura (backend) | `test/unit/` |
| una **rotta** Express | `test/integration/` |
| il formato di un file cifrato | `*.test.ts` **e** una nota in `crypto/README.md` |
| un contratto fra client e backend | **integrazione lato backend** + il valore atteso scritto nel test, non dedotto |

L'ultima riga è la lezione del difetto del checkout: il backend rimandava a `/account`,
il client monta `/app/abbonamento/esito`. Nessuna delle due parti era sbagliata da sola.
Quando un valore è un **accordo fra i due repo**, va scritto per esteso in un test, con
accanto il perché — così chi lo cambia trova una frase, non solo una stringa rossa.

---

## 5. Regole di manutenzione

Sono tre, e valgono più dell'infrastruttura descritta sopra.

**1. Una correzione di bug porta con sé il test che l'avrebbe presa.**
Non «un test», *quello*: si scrive prima, lo si vede **fallire sul codice rotto**, poi si
corregge. Un test di regressione che non è mai stato rosso non ha dimostrato niente. Nel
dubbio, si reintroduce il difetto per trenta secondi e si guarda.

**2. Un test che non è mai fallito è un sospetto, non un vanto.**
Se non riesci a immaginare la modifica che lo farebbe diventare rosso, probabilmente sta
verificando che il codice sia il codice.

**3. Quando un test fallisce, il primo sospettato è il test.**
Questa suite ha già trovato tre volte che l'asserzione era sbagliata e il codice giusto:
`sanitizeFileName('../..')` lascia i punti (e va bene: a fermare il traversal sono le
barre, e comunque la chiave di storage la costruisce un'altra funzione, più severa); il
ripiego su `'file'` scatta solo con nome vuoto. **Ogni volta l'esito è stato un commento
che spiega il comportamento reale**, non un'asserzione ammorbidita per farla passare. Un
test corretto a forza finché non diventa verde è peggio di nessun test: certifica il falso.

---

## 6. Scrivere test nel backend — le due trappole

**`vi.mock` non funziona qui.** Il backend è CommonJS e le rotte fanno `require()`;
`vi.mock` sostituisce moduli nel grafo ESM di Vitest. I due registri non si parlano e il
modulo vero viene caricato lo stesso. Il modo in cui fallisce è ingannevole: il test
restituisce **401**, quindi sembra un problema di autenticazione, e ci si perde un'ora
prima di sospettare il mock.

Si usa `test/helpers/moduli.js`, che scrive in `require.cache` — il registro che i
`require` consultano davvero:

```js
const { autenticaComeSempre, sostituisciModulo, scaricaModulo } = require('../helpers/moduli');

function creaApp() {
    autenticaComeSempre({ sub: 'utente-di-prova' });
    sostituisciModulo('services/dynamo', { getSubscription: async () => ({ /* … */ }) });
    scaricaModulo('routes/billing');          // ⚠️ prima di ricaricarlo
    const app = express();
    app.use(express.json());
    app.use('/api/billing', require('../../routes/billing'));
    return app;
}
```

**L'ordine è tutto.** Un modulo già caricato resta quello: le sostituzioni vanno fatte
*prima* del `require` di ciò che le usa. Per questo le rotte si caricano dentro
`creaApp()` e mai in cima al file.

**Diversi moduli lavorano al `require`, non alla prima chiamata.** `middleware/auth.js`
costruisce il verificatore Cognito a livello di modulo e senza `USER_POOL_ID` **lancia**,
facendo fallire il file prima che un `it` parta — e la catena si allunga da sola, perché
`services/email.js` richiede `middleware/auth`. Le variabili stanno in
`test/helpers/setup.js`, che gira per **entrambi** i progetti proprio per questo.

---

## 7. Da fare, in ordine di valore

- [ ] **Separare `app.js` da `server.js`** — sblocca i test sull'app intera, quindi
      sull'ordine di montaggio delle rotte e sui middleware globali (CORS, helmet,
      `trust proxy`). È il singolo cambiamento che allarga di più la copertura utile.
- [ ] **Integrazione sulle rotte più a rischio**, nell'ordine: `guest` (l'unico canale
      senza autenticazione), `multipart` (i tre `413` di quota, che oggi nessun test
      distingue), `admin` (il cancello `requireAdmin`: gruppo **e** 2FA), `requests`.
- [ ] **Un test che attraversa i due repo davvero.** Oggi non esiste. Anche solo un
      contratto verificato da entrambe le parti sugli stessi valori sarebbe un salto.
- [ ] **CI sul backend.** Il client ha già la sua pipeline; il backend non ha niente che
      lanci `npm test` prima di un deploy su Fly.
- [ ] **Test sul percorso di `nameVersion: 2` end-to-end**, non solo sulla funzione di
      policy: dal `complete` del multipart fino a cosa torna la lista file.

---

*Creato il 2026-09-06, insieme alla prima suite del backend. Prima di quel giorno il
backend non aveva un test framework, e la logica dei nomi cifrati — quella che se sbaglia
corrompe i nomi in modo irreversibile — non era coperta da niente.*
