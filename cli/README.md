# Novren CLI

Novren da terminale. I file si cifrano e si decifrano **su questo computer**, con lo stesso
codice del sito: la chiave non lascia mai la macchina e non arriva mai ai server di Novren.

> `send` e `login` funzionano solo con un backend che ha `CLI_AUTH_ENABLED=true`
> (vedi il README di leTransferBackend). Se il flag è spento, la CLI lo dice e non invia.

## Inviare

```bash
novren send contratto.pdf                 # stampa il link su stdout
novren send foto/ appunti.txt             # più file o cartelle → un unico .zip, come dal sito
novren send report.pdf --password         # chiede una password per il link (nascosta)
novren send report.pdf --expires 24 --max-downloads 3
```

- Al primo invio da un terminale si apre il browser per collegare il computer, **una volta
  sola**: con il tuo account oppure senza. Negli script serve prima `novren login`.
- Il file si cifra qui, a chunk da 10 MiB, con lo stesso formato del sito; anche il nome
  viaggia cifrato. Il link porta la chiave nel frammento `#key=…`, che non arriva mai al server.
- Con un account collegato l'invio compare fra i tuoi link sul sito. Senza account ci sono
  al massimo 20 invii al giorno da questo computer.
- `novren revoke` elenca gli invii senza account fatti da qui; `novren revoke <codice|link>`
  ne ritira uno. Quelli nel tuo account si gestiscono dal sito.

## Collegare il computer

```bash
novren login                  # apre il browser: accedi, registrati o continua senza account
novren login --device-code    # su un server via SSH: codice da inserire da un altro dispositivo
novren status                 # a cosa è collegato
novren logout                 # revoca l'accesso e cancella il token da qui
```

- Nel browser **controlla che il codice mostrato dalla pagina sia quello del terminale**.
- La password dell'account non passa mai dal terminale. La CLI riceve un token suo, che vedi e
  revochi dalle impostazioni del sito ("Dispositivi collegati alla CLI"). Il token permette di inviare, non
  apre nessun file.
- Il token sta in `%APPDATA%\novren` su Windows e in `~/.config/novren` su Linux/macOS
  (permessi `0600`). Lì c'è anche l'elenco degli invii, con i codici per ritirarli: **mai le
  chiavi**.

## Ricevere

```bash
novren get "https://novren.net/share/…#key=…&iv=…"
novren get                       # senza link: te lo chiede, e lo incolli
novren get "<link>" -o ~/Scaricati
```

- **Il link va fra virgolette.** Contiene una `&`: in bash senza virgolette il comando viene
  tagliato lì, in PowerShell è un errore. Oppure scrivi solo `novren get` e incollalo.
- Su **stdout** esce solo il percorso del file salvato; tutto il resto va su stderr. Così si
  compone in uno script: `open "$(novren get "$LINK")"`.
- **Link protetti da password:** la CLI la chiede senza mostrarla. Negli script si legge da
  `NOVREN_LINK_PASSWORD`. Mai come argomento: finirebbe nella cronologia della shell e
  nell'elenco dei processi.

Codici d'uscita: `0` riuscito · `1` errore (link, rete, decifratura) · `2` uso sbagliato.

## Cosa fa per te, senza che tu lo chieda

- **Decifra in streaming.** Un file da 10 GB non passa dalla memoria: si legge un chunk,
  lo si verifica, lo si scrive.
- **Non lascia mai un file a metà.** Scrive su `<nome>.novren-part` e rinomina solo quando
  l'ultimo chunk ha superato la verifica. Se qualcosa va storto — un chunk alterato, la rete
  che cade — il parziale si cancella: un contratto senza le ultime pagine, con il nome giusto,
  è peggio di nessun file.
- **Non sovrascrive.** Un file omonimo diventa `nome (1).pdf`.
- **Non si fida del nome del file.** Lo sceglie chi invia e arriva cifrato, quindi nessuno lo
  ha controllato prima: un nome come `../../.bashrc` scriverebbe fuori dalla cartella.
  La CLI tiene solo l'ultimo componente, toglie i caratteri pericolosi ed evita i nomi
  riservati di Windows.
- **File ricevuti leggibili solo da te** (permessi `0600`, su Linux e macOS).

## Configurazione

| Variabile | A cosa serve |
|---|---|
| `NOVREN_API_URL` | un backend diverso da produzione (staging, locale) |
| `NOVREN_WEB_URL` | il sito per il login e per i link (default `https://novren.net`) |
| `NOVREN_LINK_PASSWORD` | la password di un link, per gli script (in `get` e in `send --password`) |
| `NOVREN_CONFIG_DIR` | dove tenere token e cronologia degli invii |
| `NOVREN_OPEN_BROWSER=0` | non aprire il browser: la CLI stampa l'indirizzo da copiare |
| `NOVREN_DEBUG` | dettagli tecnici sugli errori inattesi |

## Sviluppo

```bash
npm install
npm run verify      # typecheck + build + test
```

- **Un solo file, nessuna dipendenza a runtime.** esbuild impacchetta la CLI e il nucleo
  crittografico in `dist/novren.mjs`, lasciato leggibile di proposito: chi installa uno
  strumento crittografico deve poterlo aprire e leggere.
- **Nessuna copia della crittografia.** La CLI importa il nucleo direttamente da
  `vue-app/src/crypto/`: un file cifrato dalla CLI si apre nel browser perché è lo stesso codice.
- **I test lanciano il binario compilato** contro un Novren finto con la forma del backend
  vero, e file cifrati dal nucleo reale. Un errore di impacchettamento non passerebbe
  inosservato. Per `send` il test è il giro completo: ciò che si invia, `get` lo riapre
  identico byte per byte. Il test sul path traversal lavora in una sandbox annidata: anche se la
  protezione si rompesse, non potrebbe scrivere fuori.
