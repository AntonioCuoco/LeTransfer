# Segnalare un problema di sicurezza

**security@novren.net**

Rispondiamo entro **72 ore**. Non mandiamo avvocati a chi segnala in buona fede.

Se il problema è nel nucleo crittografico, dillo pure senza girarci intorno: preferiamo
una figuraccia oggi a un incidente domani.

---

## Come segnalare

Scrivi a **security@novren.net** — oppure apri una
[Security Advisory privata](https://github.com/AntonioCuoco/LeTransfer/security/advisories/new)
su GitHub, se preferisci restare sulla piattaforma.

**Non aprire una issue pubblica** per un problema di sicurezza non ancora corretto.

Se puoi, includi: cosa hai trovato, come riprodurlo, quale versione o commit
(la pagina `/sicurezza` del sito dichiara il commit della build pubblicata), e cosa
secondo te un attaccante potrebbe ottenere.

Ti terremo aggiornato mentre lavoriamo alla correzione e, se vuoi, ti citiamo nel
rilascio che la contiene.

---

## Cosa ci interessa di più

In ordine di gravità per questo prodotto:

1. **Perdita di segretezza delle chiavi** — qualunque percorso in cui una chiave di
   file, la chiave privata di un utente o la chiave di recupero raggiunga il server,
   finisca in un log, in un URL o in una richiesta di rete.
2. **Rottura della cifratura** — errori nel formato v2 a chunk, riuso di IV, AAD
   aggirabile, downgrade al formato v1 legacy, manipolazione del ciphertext non
   rilevata.
3. **Sostituzione di chiave pubblica** — modi per aggirare o silenziare la verifica
   dell'impronta del destinatario.
4. **Accesso non autorizzato** — a file, link condivisi o metadati di altri utenti,
   incluso l'aggiramento di password, scadenze o limite di download.
5. **XSS e injection nel client** — su questo prodotto una XSS non è "solo" una XSS:
   il codice che cifra gira nella stessa pagina.
6. **Abuso del canale senza account** — modi per aggirare rate limit e Turnstile.

## Cosa invece sappiamo già

Non sono segnalazioni nuove; sono limiti dichiarati in
[`vue-app/src/crypto/README.md` §7](vue-app/src/crypto/README.md) e sulla pagina
`/sicurezza`:

- **Il codice che cifra lo serviamo noi.** È il limite strutturale di ogni E2E in un
  browser. Lo mitighiamo con sorgente pubblica e build riproducibili, che rendono una
  manomissione rilevabile da terzi — non impedita al singolo utente.
- **Chi ha il link ha il file.** La chiave sta nel frammento `#`: il link *è* una
  capability. Si governa con scadenza, limite di download, password e revoca.
- **Un dispositivo compromesso vince sempre.** I dati sono in chiaro prima della
  cifratura e dopo la decifratura.
- **La prima verifica di un'impronta è fiducia cieca** (trust on first use).
- **Il wrapping è ancora RSA-OAEP**, non post-quantum. La migrazione a uno schema
  ibrido è in roadmap e il formato è già versionato per accoglierla.

Se hai un modo per **peggiorare** uno di questi limiti, o per renderlo sfruttabile in
pratica dove noi lo diamo per teorico, quello ci interessa eccome.

---

## Fuori ambito

- Risultati di scanner automatici senza un impatto dimostrato.
- Attacchi che richiedono accesso fisico al dispositivo della vittima o un browser già
  compromesso.
- Denial of service per saturazione di banda o volume.
- Assenza di header su domini che non serviamo noi.
- Social engineering verso di noi o verso i nostri utenti.

---

## Verificare da te

Non serve fidarsi sulla parola:

- Il modello crittografico è descritto in
  [`vue-app/src/crypto/README.md`](vue-app/src/crypto/README.md), mantenuto nello stesso
  commit del codice che descrive.
- Il nucleo è di circa 660 righe, senza dipendenze crittografiche di terze parti: solo
  Web Crypto della piattaforma.
- Ogni rilascio pubblica il manifesto degli hash (`SHA256SUMS.txt`) e un'attestazione di
  provenienza. Puoi ricostruire dal tag e confrontare.

---

*Nessun programma di bug bounty in denaro, per ora: siamo un progetto piccolo. Il
riconoscimento pubblico e una risposta seria, quelli sì.*
