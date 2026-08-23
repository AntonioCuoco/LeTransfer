# Comandi — cosa lanciare, e quando

> **Cos'è.** Il prontuario operativo quotidiano: cosa si lancia, da quale cartella, e in
> quale momento. Pensato per essere seguito senza doverci ragionare sopra.
>
> Per la **configurazione iniziale** (domini, Pages, Turnstile, R2, posta) vedi invece
> [DEPLOY_FRONTEND.md](DEPLOY_FRONTEND.md): quelle sono cose che si fanno una volta sola.
>
> ⚠️ **Shell: PowerShell.** Dove serve `curl` va scritto **`curl.exe`**, con l'estensione:
> in PowerShell `curl` è un alias di `Invoke-WebRequest`, che ha una sintassi diversa e
> rifiuta i flag di curl.

---

## Sviluppo quotidiano

Tutto da `vue-app/`.

| Cosa vuoi | Comando |
|---|---|
| Avviare l'app in locale | `npm run dev` |
| Test una volta | `npm test` |
| Test che si rilanciano da soli mentre scrivi | `npm run test:watch` |
| Solo i test di logica / dei componenti | `npm run test:logica` · `npm run test:componenti` |
| Test end-to-end (Playwright) | `npm run test:e2e` |
| Controllo dei tipi | `npx vue-tsc --noEmit` |
| Lint | `npm run lint` |
| Provare il build di produzione in locale | `npm run build` poi `npm run preview` |

> L'app di sviluppo risponde su `http://localhost:5173`, e **anche** sull'IP della LAN
> (`server.host: true` in `vite.config.ts`). Serve al captcha, che ha bisogno di
> un'origine diversa da quella dell'app — vedi `VITE_CAPTCHA_ORIGIN` in `.env`.

---

## Prima di committare

```powershell
cd vue-app
npm test
npx vue-tsc --noEmit
```

Non è cerimoniale: la pipeline di rilascio lancia gli stessi due controlli e **si rifiuta
di pubblicare** se falliscono. Scoprirlo qui costa trenta secondi, scoprirlo là costa un
tag bruciato.

---

## Rilascio

**È il tag a pubblicare, non il push.** Un `git push` normale non fa partire niente: il
workflow si attiva sui tag `v*`.

### Il flusso normale

```powershell
git add -A
git commit -m "descrizione di cosa cambia"
git tag -a v0.1.1 -m "release 0.1.1"
git push --follow-tags
```

Il numero lo scegli tu: guarda l'ultimo con `git tag -l --sort=-v:refname` e incrementa.

- **terza cifra** (`0.1.1` → `0.1.2`): correzioni
- **seconda** (`0.1.1` → `0.2.0`): funzionalità nuove
- **prima** (`1.0.0`): quando decidi che il prodotto è quello

⚠️ **Il `-a` è obbligatorio.** Crea un tag *annotato*: `--follow-tags` manda solo quelli.
Con `git tag v0.1.1` (senza `-a`) il tag resta in locale, il push dice
*"Everything up-to-date"* e non parte niente — senza spiegare perché.

> **Perché non `npm version`.** Fa tre cose in una (incrementa, committa, tagga) e se una
> fallisce — tipicamente perché il working tree non era pulito — ti lascia a metà: la
> versione cambiata, nessun commit, nessun tag, e nessun messaggio che lo dica. È già
> successo due volte. Due comandi espliciti non hanno stati intermedi.
>
> La `version` in `package.json` non la usa nessuno: il progetto non viene pubblicato su
> npm, e il manifesto della build si basa sul commit, non su quel campo. Tenerla allineata
> è igiene, non un requisito — se resta indietro non si rompe niente.

### Cosa fa la pipeline

Install dal lockfile → typecheck → test del nucleo crittografico → build → **doppia build
e confronto degli hash** → manifesto `SHA256SUMS.txt` → attestazione di provenienza →
**deploy su Cloudflare Pages** → release pubblica col manifesto.

Se una qualsiasi verifica fallisce **non pubblica niente**. È il punto: la pipeline può
rifiutarsi di rilasciare.

### Dove si guarda

Tab **Actions** del repository. Il primo rilascio guardalo scorrere: se qualcosa va
aggiustato, è al primo colpo.

---

## Verifiche dopo il rilascio

```powershell
# la CSP live cita l'API giusta?
curl.exe -sI https://novren.net | Select-String "api.novren.net"

# il fallback SPA regge? (deve rispondere 200, non 404)
curl.exe -s -o NUL -w "%{http_code}`n" https://novren.net/prezzi

# il captcha è ancora incorporabile? (NON deve comparire X-Frame-Options)
curl.exe -sI https://captcha.novren.net/captcha | Select-String "frame"
```

Poi **il giro che conta**, che nessun comando può sostituire: registrazione → upload →
genera link → **aprilo in un altro browser** → il file si decifra.

E apri la **console del browser**: una violazione CSP non blocca la pagina, blocca *una
richiesta*. L'app resta in piedi e una funzione smette di esistere senza dirlo a nessuno.

---

## Backend

Dal repo del backend, non da questo:

```powershell
fly deploy -a novrenbackend
fly logs -a novrenbackend                    # cosa sta succedendo adesso
fly secrets list -a novrenbackend            # quali variabili esistono (non i valori)
fly secrets set NOME=valore -a novrenbackend # impostarne una
```

⚠️ Il backend gira **a consumo**. Evita di interrogarlo con sonde e `curl` ripetuti per
curiosità: ogni richiesta ha un costo.

---

## Cose da NON fare

**Non deployare il frontend a mano.**

```powershell
npx wrangler pages deploy dist --project-name=novren   # ❌ non più
```

Funzionerebbe, ma pubblicheresti byte di cui nessuno ha l'hash — e la pagina `/sicurezza`
dichiara pubblicamente che ciò che servi è verificabile. Sarebbe una promessa falsa.
Resta buono solo per un'emergenza in cui la pipeline è rotta e devi rimettere online
qualcosa; in quel caso sappi che stai temporaneamente sospendendo quella garanzia.

**Non cambiare una `VITE_*` senza ricostruire.** Quei valori vengono incollati dentro il
bundle al momento del build: modificarli senza un nuovo build non ha alcun effetto. È già
successo una volta — il sito è rimasto puntato al vecchio backend.

---

## Emergenze

**Tornare alla versione precedente.** Cloudflare Pages tiene lo storico: dashboard →
Workers & Pages → `novren` → *Deployments* → sul deploy buono, **Rollback to this
deployment**. È immediato e non richiede un build.

```powershell
# vedere cosa è pubblicato adesso
npx wrangler pages deployment list --project-name=novren
```

**Un tag sbagliato.** Cancellalo in locale e sul remoto, poi rifai:

```powershell
git tag -d v0.1.1
git push origin :refs/tags/v0.1.1
```

⚠️ Se quel tag aveva già pubblicato, cancellarlo **non** ritira il deploy: serve il
rollback qui sopra.

---

## Riferimento rapido

| Situazione | Comando |
|---|---|
| Sto sviluppando | `npm run dev` |
| Ho finito una modifica | `npm test` + `npx vue-tsc --noEmit` |
| Voglio pubblicare | `git tag -a vX.Y.Z -m "release X.Y.Z"` + `git push --follow-tags` |
| Voglio sapere a che versione sono | `git tag -l --sort=-v:refname \| Select-Object -First 1` |
| Il sito è rotto | Rollback dal pannello Pages |
| Ho cambiato una variabile d'ambiente | Ricostruire, sempre |

---

*Creato il 2026-08-16, quando il rilascio è passato dal deploy manuale alla pipeline.*
