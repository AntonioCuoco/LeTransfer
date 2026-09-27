# Novren CLI

Invia e ricevi file cifrati end-to-end con [Novren](https://novren.net), direttamente dal
terminale. I file vengono cifrati e decifrati sul tuo computer: la chiave non arriva mai ai
server di Novren. Ciò che invii dalla CLI si apre dal sito, e viceversa.

## Installazione

Serve Node.js 20.12 o più recente.

```bash
npm install -g @novren/cli
novren --help
```

## Comandi

### Inviare

```bash
novren send contratto.pdf                  # cifra, carica e stampa il link
novren send foto/ appunti.txt              # più file o cartelle partono come un unico .zip
novren send report.pdf --password          # protegge il link con una password
novren send report.pdf --expires 24        # scadenza in ore (massimo 7 giorni)
novren send report.pdf --max-downloads 3   # numero massimo di download
```

Dopo l'invio puoi scegliere come consegnare il link:

```bash
novren send contratto.pdf --copy                     # copialo negli appunti
novren send foto.zip --qr                            # mostralo come QR code
novren send preventivo.pdf --mail mario@example.com  # apri la posta con il messaggio pronto
```

### Ricevere

```bash
novren get "https://novren.net/share/…"    # scarica e decifra nella cartella corrente
novren get "<link>" -o ~/Scaricati         # in un'altra cartella
novren get                                 # senza link: te lo chiede
```

Metti il link fra virgolette, oppure lancia solo `novren get` e incollalo.

### Account

```bash
novren login     # collega questo computer, con il tuo account o senza
novren status    # mostra a cosa è collegato
novren logout    # scollega il computer
novren revoke    # elenca e ritira gli invii fatti senza account
```

Al primo invio, se il computer non è ancora collegato, la CLI apre il browser per farlo.

## Licenza

[FSL-1.1-ALv2](https://fsl.software): puoi usarla e modificarla, ma non per offrire un
prodotto concorrente. Ogni versione diventa Apache 2.0 due anni dopo l'uscita.
