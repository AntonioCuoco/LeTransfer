# Contribuire a Novren

Grazie per l'interesse. Due cose da sapere prima di aprire una pull request: come si
firmano i commit, e quali parti del codice hanno regole più severe.

> **Problemi di sicurezza:** non aprire una issue. Vedi [SECURITY.md](SECURITY.md).

---

## 1. Firma dei commit (DCO) — obbligatoria

Ogni commit deve avere in fondo al messaggio:

```
Signed-off-by: Nome Cognome <email@esempio.it>
```

Si aggiunge da solo con:

```bash
git commit -s -m "descrizione della modifica"
```

Firmando dichiari quanto scritto nel
[Developer Certificate of Origin 1.1](https://developercertificate.org/): in sostanza,
che hai il diritto di contribuire quel codice e che accetti che venga distribuito sotto
la licenza del progetto.

**Perché lo chiediamo.** Senza, ogni contributo resterebbe in comproprietà di chi lo ha
scritto: il progetto non potrebbe più cambiare licenza, né rilasciare parti sotto una
licenza diversa, senza rintracciare e ottenere il consenso di ogni singolo contributore.
È una formalità di trenta secondi che tiene aperte porte che altrimenti si chiudono per
sempre.

Le PR senza sign-off non vengono unite. Se te ne dimentichi:
`git commit --amend -s` (oppure `git rebase --signoff` per più commit).

---

## 2. Licenze — dove finisce quello che scrivi

Il repository ha **due licenze**:

| Cosa | Licenza |
|---|---|
| `vue-app/src/crypto/` | **Apache-2.0** |
| Tutto il resto | **FSL-1.1-ALv2** (diventa Apache-2.0 dopo due anni) |

Contribuendo accetti che la tua modifica sia distribuita sotto la licenza della parte che
tocchi. Il nome e l'identità visiva del progetto non sono coperti da nessuna delle due:
vedi [TRADEMARK.md](TRADEMARK.md).

---

## 3. Il nucleo crittografico ha regole sue

Se tocchi `vue-app/src/crypto/`:

- **La specifica cambia nello stesso commit del codice.** `vue-app/src/crypto/README.md`
  dichiara di seguire il codice: una spec che diverge è peggio di nessuna spec.
- **Nessuna dipendenza crittografica di terze parti.** Solo Web Crypto della piattaforma.
  Oggi quella cartella ha **zero** import esterni, ed è una proprietà da mantenere: è ciò
  che rende la verifica indipendente realistica.
- **Niente cambi al formato dei file senza versionarlo.** Esiste `formatVersion` proprio
  per questo: i file già caricati devono restare apribili.
- **Ogni modifica va accompagnata da test.** Quella cartella ha i suoi, e girano nella
  pipeline *prima* della build: un difetto lì non produce una schermata sbagliata,
  produce file che non si riaprono più.

---

## 4. Prima di aprire la PR

Da `vue-app/`:

```bash
npm test                 # test di logica e componenti
npx vue-tsc --noEmit     # controllo dei tipi
npm run lint             # ESLint
```

Sono gli stessi controlli che la pipeline rilancia, e senza i quali **si rifiuta di
pubblicare**. Scoprirlo in locale costa trenta secondi.

Su *cosa* merita un test, dove va messo e le regole di manutenzione della suite —
comprese le due trappole dei test sul backend — vedi **[TESTING.md](TESTING.md)**.

Per modifiche non banali, apri prima una issue e parliamone: è più veloce scoprire lì che
una strada non ci convince, piuttosto che dopo che l'hai percorsa.

---

## 5. Stile

Non c'è una guida formale. La regola è una sola: **scrivi codice che somigli a quello
intorno**. In questo progetto significa in particolare commentare il *perché* di una
scelta non ovvia, non il *cosa* — il cosa si legge dal codice.
