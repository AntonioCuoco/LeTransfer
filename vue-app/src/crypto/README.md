# Modello crittografico di LeTransfer

> Specifica del nucleo crittografico che gira **nel browser**. Serve a rendere verificabili
> le affermazioni del prodotto: chi vuole controllarle legge questo documento e poi i file
> di questa cartella, senza dover attraversare il resto dell'applicazione.
>
> ⚠️ **Questo documento e il codice cambiano insieme.** Se modifichi un file di
> `src/crypto/`, aggiorna qui nello stesso commit. Una specifica che diverge dal codice è
> peggio di nessuna specifica.
>
> 📄 **Licenza: Apache-2.0** — solo questa cartella, a differenza del resto del
> repository (FSL-1.1-ALv2). Testo in [`LICENSE`](LICENSE). È deliberato: questo codice
> esiste per essere letto, verificato e riusato, e una licenza restrittiva renderebbe la
> verifica indipendente più difficile di quanto debba essere.

---

## 1. Cosa promettiamo, in una riga

Il server conserva **solo ciphertext** e **non possiede mai** una chiave capace di aprirlo.
Tutto ciò che segue esiste per rendere vera quella frase — e la §7 dice dove smette di esserlo.

---

## 2. Primitive

| Uso | Algoritmo | Parametri |
|---|---|---|
| Contenuto dei file | **AES-256-GCM** | chiave 256 bit, IV 96 bit, tag 128 bit |
| Chiavi tra utenti (v1) | **RSA-OAEP** | modulo 4096 bit, hash SHA-256 |
| Chiavi tra utenti (v2, post-quantum) | **RSA-OAEP** + **X-Wing** → **HKDF-SHA256** → **AES-256-GCM** | X-Wing = ML-KEM-768 + X25519, draft-connolly-cfrg-xwing-kem-10 (§4.5) |
| Derivazione da chiave di recupero | **PBKDF2-SHA256** | 100 000 iterazioni (`PBKDF2_ITER_RECOVERY`) |
| Impronta di chiave pubblica | **SHA-256** su JWK canonico; ibrida se c'è X-Wing | RFC 7638 (§5) |
| Generazione casuale | `crypto.getRandomValues` | CSPRNG del sistema operativo |

Tutto con **Web Crypto** della piattaforma, con **un'unica eccezione dichiarata**:
`@noble/post-quantum` per X-Wing, perché i browser non espongono ML-KEM (motivazione in §9).
L'unico dato statico incluso è la wordlist BIP39 (`bip39-wordlist.ts`).

> **Perché 100 000 iterazioni bastano per la recovery key.** PBKDF2 serve a rendere costoso
> il brute force di segreti a *bassa* entropia. La chiave di recupero è una mnemonica da
> **256 bit di entropia**: non è forzabile a nessun numero di iterazioni, quindi alzarle
> proteggerebbe da nulla e costerebbe solo attesa all'utente. Per i segreti scelti
> dall'umano (le password) il conteggio è invece molto più alto.

---

## 3. Formato dei file — v2 (a chunk, streaming)

L'oggetto salvato sullo storage è la **concatenazione dei chunk cifrati**, senza intestazione
globale. Ogni chunk:

```
┌──────────────┬───────────────────────────────────┐
│  IV  12 byte │  ciphertext + tag GCM (16 byte)   │
└──────────────┴───────────────────────────────────┘
```

- **IV diverso per ogni chunk**, generato dal CSPRNG. Mai riusato.
- **AAD = `chunk-<indice>`** (indice 0-based, codificato UTF-8). È il dettaglio che impedisce
  a chi controlla lo storage di **riordinare o sostituire** chunk: un blocco spostato di
  posizione fallisce la verifica del tag, perché l'AAD atteso non coincide più.
- Il chunk in chiaro è di `chunkSize` byte (10 MiB nel percorso guest); l'ultimo è più corto.
- Overhead: **28 byte per chunk** (`CHUNK_OVERHEAD`). `encryptedSizeV2()` calcola la dimensione
  finale in anticipo, perché serve a dichiarare la lunghezza prima di iniziare l'upload.

### 3-bis. Nome del file — `nameVersion 2`

Il nome è spesso **più rivelatore del contenuto**: `Ricorso_Rossi_vs_Bianchi_udienza_12_marzo.pdf`
dice tutto senza che nessuno apra niente. Fino alla v1 viaggiava in chiaro ed era l'ultima cosa
dei contenuti che il server vedeva.

Formato, uguale nello spirito a quello dei chunk, in base64:

```
┌──────────────┬───────────────────────────────────┐
│  IV  12 byte │  ciphertext + tag GCM (16 byte)   │
└──────────────┴───────────────────────────────────┘
```

- Stessa chiave del contenuto: chi può aprire il file può leggerne il nome, e nessun altro.
- **AAD = `filename`**, non un indice. È separazione di dominio: senza, chi controlla lo
  storage potrebbe scambiare un chunk con il campo del nome — sarebbero entrambi ciphertext
  valido sotto la stessa chiave — e il tag non se ne accorgerebbe.
- IV nuovo a ogni cifratura: due file omonimi non producono lo stesso blob, altrimenti
  l'omonimia sarebbe visibile a chi guarda soltanto lo storage.

Il discriminante è il campo **`nameVersion`** nel record: assente o `1` = nome in chiaro,
`2` = cifrato. È un campo a sé e non un incremento di `formatVersion`, perché nome e contenuto
possono evolvere separatamente: un file v2 può avere il nome in chiaro (tutti quelli caricati
prima di O2.2) e la combinazione dev'essere rappresentabile.

⚠️ **Si legge sempre, si scrive solo quando l'interruttore è acceso.** Il client sa già
interpretare `nameVersion: 2`; la *scrittura* è dietro `ENCRYPT_FILENAMES`, che resta spenta
finché il backend non smette di sanificare quel campo — una sanificazione su un blob cifrato
lo distruggerebbe in modo irreversibile. Si insegna prima a leggere, poi a scrivere.

Codice: `crypto.ts` → `encryptFileName` / `decryptFileName`; politica di lettura in
`utils/fileNames.ts`.

---

**v1 (legacy):** un unico blob GCM con un solo IV, senza AAD. Ancora leggibile in decifratura,
mai più prodotto in scrittura. Il discriminante è `formatVersion` nel record del trasferimento.

Codice: `crypto.ts` → `encryptChunkFramed` / `decryptChunkFramed`, `streamingDownload.ts`.

---

## 4. Il ciclo di vita delle chiavi

### 4.1 Chiave del file (AES-256)
Nasce nel browser a ogni trasferimento, con `generateAESKey()`. Non lascia mai il dispositivo
in chiaro. Due destini possibili:

- **Link pubblico** → finisce nel **frammento `#`** dell'URL (`createKeyHash()`), nella forma
  `#key=<base64>&iv=<base64>`. Il frammento, per come è definito HTTP, **non viene inviato al
  server dal browser**: è il fondamento dello schema, non un trucco.
- **Condivisione utente-a-utente e richieste file** → viene **wrappata** sulle chiavi
  pubbliche del destinatario (`wrapFileKeyForRecipient`): formato v2 ibrido se il destinatario
  ha una chiave X-Wing, v1 RSA altrimenti (§4.5). Il server trasporta un blob che non sa aprire.

### 4.2 Coppia RSA dell'utente
Generata nel browser. La **privata è `extractable: false`** e vive in IndexedDB
(`keyStore.ts`, database `letransfer-keys`): può decifrare e fare unwrap, ma **non può essere
esportata**, nemmeno da codice JavaScript che girasse sulla pagina. La pubblica va al server,
che la distribuisce a chi vuole inviarti file — ed è esattamente il punto verificato dal
fingerprint (§5).

### 4.3 Chiave di recupero (24 parole)
Mnemonica BIP39 da 256 bit di entropia. Da essa si deriva, con PBKDF2, la **master key** che
cifra il backup della chiave privata RSA. Al server vanno **solo** il `salt` e un piccolo blob
di verifica (il testo `VERIFY` cifrato con la master key): serve a dire "questa mnemonica è
quella giusta" senza che il server possa risalire a nulla.

⚠️ Il backup della privata è cifrato **direttamente con la master key**, senza ulteriore
PBKDF2: la master key ha già entropia piena, quindi il blob resta inattaccabile anche se il
server viene compromesso.

### 4.4 Chiave X-Wing dell'utente (post-quantum)
Un **seme di 32 byte** generato nel browser: è l'intera chiave segreta, e la chiave pubblica
(1216 byte) se ne ricava. Il seme vive in IndexedDB (`letransfer_xwing_seed_<sub>`) e sul server
c'è un **backup cifrato con la master key** (AES-256-GCM, AAD `novren/xwing-seed-backup/v1`).

⚠️ **Il seme è leggibile da uno script nella pagina**, a differenza della privata RSA: Web Crypto
non conosce X-Wing, quindi non esiste una `CryptoKey` non estraibile che lo contenga. È accettato
perché il formato v2 richiede **entrambe** le chiavi: col solo seme non si apre nulla (§4.5).

Regole di allineamento fra dispositivo e server (`xwingKeySync.ts`), perché sbagliarne una fa
perdere file già ricevuti senza alcun errore:
1. **prima si ripristina, poi si genera** — se l'account ha già una chiave X-Wing, il dispositivo
   usa quella dal backup;
2. **mai una chiave pubblica senza il backup del seme** — viaggiano nella stessa richiesta, e il
   server (`POST /api/user/xwing-key`) li salva insieme o per niente;
3. **il server non sostituisce mai una chiave X-Wing diversa** (409 `XWING_KEY_EXISTS`): se due
   dispositivi generano insieme vince il primo, e l'altro ripristina la sua.

La sincronizzazione richiede la master key, quindi avviene allo sblocco. Finché non è avvenuta,
chi ti manda file vede solo la chiave RSA e cifra in v1: nulla si rompe, si perde solo la
protezione post-quantum per quei file.

### 4.5 Chiave del file wrappata per un utente — v1 e v2
Campo `encryptedAESKey`. La versione sta **nel valore stesso**: la v1 è base64url puro, che non
contiene mai un punto, la v2 inizia con `v2.`. Il lettore (`unwrapReceivedFileKey`) le riconosce
senza campi accanto, e i record esistenti restano leggibili.

**v1** — `base64url( RSA-OAEP-SHA256(pk RSA, chiave del file raw) )`.

**v2 (ibrido post-quantum)**:

```
"v2." b64u(cRsa) "." b64u(cXWing) "." b64u(iv) "." b64u(sealed)

kRsa       = 32 byte casuali
cRsa       = RSA-OAEP-SHA256(pk RSA, kRsa)                          512 byte
cXWing, ss = X-Wing.Encapsulate(pk X-Wing)                          1120 + 32 byte
KEK        = HKDF-SHA256(ikm  = kRsa || ss,
                         salt = "novren/key-wrap/v2",
                         info = SHA-256(cRsa || cXWing || pk X-Wing))   32 byte
sealed     = AES-256-GCM(KEK, iv 12 byte, chiave del file raw, AAD = "novren/key-wrap/v2")
```

Perché così:
- **La KEK nasce da entrambi i segreti.** Chi rompe RSA con un computer quantistico non ha `ss`;
  chi ruba il seme X-Wing non ha `kRsa`, che si ottiene solo *usando* la privata RSA non
  estraibile; un difetto di ML-KEM o della libreria lascia intatta la sicurezza della v1. X-Wing
  stesso regge se regge almeno uno fra ML-KEM-768 e X25519.
- **L'`info` di HKDF impegna entrambi i ciphertext e la chiave X-Wing:** una parte presa da un
  altro blob, o cifrata per un'altra chiave, cambia la KEK e il tag GCM rifiuta.
- **Si scrive v2 solo se il destinatario ha una chiave X-Wing**, e solo con l'interruttore
  `HYBRID_KEY_WRAP` acceso: spegnerlo riporta i nuovi invii alla v1 senza toccare nulla di già
  scritto. La lettura della v2 c'è sempre.

La libreria X-Wing si carica con un `import()` dinamico: chi usa solo i link pubblici non la
scarica. Codice: `hybrid.ts`.

---

## 5. Verifica del destinatario (RFC 7638)

Quando invii a un altro utente, la sua chiave pubblica arriva **dal nostro server**. Se il
server mentisse restituendo un'altra chiave, cifreresti per l'attaccante senza accorgertene:
è la debolezza strutturale di ogni rubrica di chiavi centralizzata.

Per questo `fingerprint.ts` calcola il **JWK Thumbprint (RFC 7638)**: SHA-256 sul JSON
canonico dei soli membri obbligatori, in ordine lessicografico — per RSA esattamente
`{"e":…,"kty":"RSA","n":…}`. La canonicalizzazione è ciò che rende l'impronta riproducibile
da client indipendenti: senza, due implementazioni che serializzano diversamente
otterrebbero digest diversi e il confronto a voce non avrebbe senso.

L'applicazione confronta l'impronta con quella annotata al primo scambio e **segnala i
cambiamenti** (trust on first use). Il caso "impronta cambiata" è l'unico momento in cui una
sostituzione di chiave diventa visibile all'utente.

**Impronta ibrida.** Se il destinatario ha una chiave X-Wing, l'impronta deve coprire anche
quella: altrimenti il server potrebbe sostituire la sola chiave post-quantum senza che nulla
cambi sullo schermo (`hybridThumbprint`):

```
SHA-256( {"rsa":"<RFC 7638 della RSA, hex>","xwing":"<SHA-256 della chiave X-Wing, hex>"} )
```

JSON canonico, chiavi in ordine e senza spazi, per la stessa ragione della RFC 7638. Senza
chiave X-Wing l'impronta è quella RFC 7638 di sempre. Quando un destinatario aggiunge la chiave
X-Wing la sua impronta cambia e l'app lo segnala: è corretto, le chiavi su cui si cifra sono
cambiate. La propria impronta (impostazioni) usa la chiave X-Wing **di questo dispositivo**, mai
quella dichiarata dal server.

---

## 6. Cosa vede il server

| Dato | Il server lo vede? |
|---|---|
| Byte dei file | **No** — solo ciphertext |
| Chiave del file | **No** — frammento `#` o blob wrappato (v1 RSA, v2 ibrido) |
| Chiave privata dell'utente | **No** — non estraibile, backup cifrato |
| Seme X-Wing dell'utente | **No** — solo il backup cifrato con la master key |
| Chiave di recupero | **No** — solo `salt` + blob di verifica |
| Nome del file | **No** con `nameVersion: 2` — cifrato con la chiave del file (§3-bis). Sì sui record precedenti, che restano leggibili |
| Tipo MIME del file | **Sì** — serve ad anteprime, icone e filtri. Rivela molto meno del nome, ma è un'eccezione e va contata come tale |
| Dimensione, orario, IP | **Sì** — servono a scadenze, quote e anti-abuso |

---

## 7. Dove la promessa si ferma

Scritto qui perché un modello crittografico senza i suoi limiti è pubblicità.

1. **Il codice che cifra ve lo serviamo noi.** È il limite strutturale di ogni E2E dentro un
   browser: chi controllasse la nostra distribuzione potrebbe servire un client ostile.
   Si mitiga con sorgente pubblico e **build riproducibili** (hash degli artefatti pubblicato
   a ogni release), che rendono la manomissione *rilevabile da terzi* — non impedita al
   singolo utente, perché il browser non confronta hash di bundle.
2. **Chi ha il link, ha il file.** La chiave sta nel frammento: il link è una capability. Si
   governa con scadenza, numero massimo di download, password e revoca.
3. **Il dispositivo compromesso vince sempre.** I dati sono in chiaro prima della cifratura e
   dopo la decifratura: la crittografia non protegge da un browser infetto.
4. **La prima verifica è fiducia cieca.** Il trust on first use rileva i *cambiamenti* di
   chiave; se la prima chiave servita è già falsa, solo il confronto fuori banda lo scopre.
5. **Post-quantum: sì per le chiavi fra utenti, con tre limiti.** Il wrapping v2 (§4.5)
   protegge dal «raccogli oggi, decifra domani». Ma: (a) **i file condivisi prima**, o con
   destinatari che non hanno ancora una chiave X-Wing, restano in v1 RSA — un blob già scritto
   non si può ricifrare senza il destinatario; (b) i **link pubblici** non usano chiavi
   pubbliche (la chiave è nel frammento, AES-256 è già considerato resistente); (c) la libreria
   X-Wing **non ha ancora un audit indipendente** — per questo la v2 non scende mai sotto la v1.

---

## 8. I file

| File | Responsabilità |
|---|---|
| `crypto.ts` | Primitive, formato v2 a chunk, **nome del file cifrato**, chiavi RSA, PBKDF2, frammento del link |
| `streamingDownload.ts` | Download + decifratura a chunk verso un **`PlaintextSink`** (adattatore di sink): un solo motore (`decryptToSink`) per tutte le destinazioni, perché interpretazioni diverse dello stesso formato sono occasioni di divergere. Include i sink **memoria** (`decryptToBlob`, anteprime) e **stream** (`decryptToStream`, export zip). Errori tipizzati sotto `UserFacingError`: `DownloadError` (storage, rete, metadati che non corrispondono all'oggetto — controllati via `content-length` prima di decifrare) e `DecryptionError` (tag GCM, con l'indice del chunk: il primo = chiave o metadati, uno in mezzo = file corrotto). `downloadErrorMessage` non restituisce mai il solo testo di ripiego: un errore sconosciuto porta con sé il dettaglio tecnico. Nessun DOM: gira in Node |
| `browserDownload.ts` | Adattatore browser del sink: **disco** con la File System Access API, Blob altrove (`downloadAndDecryptV2`). I guasti del salvataggio sono `SaveError`, distinti dalla decifratura: sul fallback Blob il file intero passa dalla RAM, e su un telefono il limite è la memoria, non la chiave |
| `storage.ts` | Adattatore di storage delle chiavi (`KeyStorage`) e implementazione in memoria per Node e test |
| `keyStore.ts` | Adattatore browser dello storage: `CryptoKey` non estraibili in IndexedDB |
| `recovery-key.ts` | Mnemonica BIP39 a 24 parole → master key |
| `fingerprint.ts` | JWK Thumbprint RFC 7638, impronta ibrida RSA + X-Wing, formattazione leggibile |
| `hybrid.ts` | Wrapping v2 ibrido post-quantum, lettura v1/v2, seme X-Wing e suo backup |
| `xwingKeySync.ts` | Regole di allineamento della chiave X-Wing fra dispositivo e server (rete iniettata) |
| `rememberedDevice.ts` | Master key ricordata su questo dispositivo, con scadenza |
| `bip39-wordlist.ts` | Wordlist BIP39 (dato statico) |

---

## 8-bis. Test

`npm test` (Vitest, ambiente Node — Node 22 espone le stesse Web Crypto del browser,
quindi si testa il codice vero e non un rimpiazzo). Coprono ciò che, se si rompe, non
produce una schermata sbagliata ma **file che non si riaprono**:

- round-trip cifra→decifra sul formato a chunk, e la garanzia dell'AAD (un chunk
  decifrato con l'indice sbagliato **deve** fallire);
- manomissione di un singolo byte → tag GCM che rifiuta;
- aritmetica delle dimensioni (`encryptedSizeV2`, ultimo chunk più corto);
- chiave nel frammento: export → URL → parse → import, inclusi i caratteri base64
  che vanno codificati;
- wrap/unwrap RSA fra utenti;
- impronta: **vettore ufficiale RFC 7638** più l'invarianza rispetto all'ordine dei
  membri della JWK;
- derivazione dalla mnemonica: determinismo e dipendenza dal salt;
- giro completo download→decifratura con stream simulato, incluso il rifiuto di uno
  stream troncato;
- **invarianti della wordlist**: 2048 voci, nessun duplicato, ordine alfabetico;
- **nome del file**: giro completo, caratteri non latini ed emoji, IV diverso a ogni
  cifratura, rifiuto con chiave sbagliata o nome manomesso, e **un chunk non spacciabile
  per un nome** (la prova che l'AAD separa davvero i due domini);
- **wrapping v2**: si apre solo con RSA *e* seme X-Wing giusti, rifiuta una parte presa da un
  altro blob; la v1 resta leggibile dallo stesso punto di lettura;
- **allineamento X-Wing** (`xwingKeySync.test.ts`): ripristino invece di generazione su un
  dispositivo nuovo, nessuna pubblicazione senza backup, corsa fra due dispositivi, backup che
  non corrisponde alla chiave pubblicata.

⚠️ **Nota sulla wordlist.** La lista era corrotta due volte. Prima `"night"` compariva
due volte (circa una frase su 86 risultava invalida per l'applicazione stessa); poi,
confrontandola con l'originale, è emerso che **non era proprio la lista ufficiale**: 10
parole estranee e 1014 indici spostati. Il 2026-09-13 è stata sostituita con la **wordlist
inglese ufficiale BIP39**, verificata contro `bitcoin/bips` e `@scure/bip39`, e un test ne
controlla l'hash SHA-256. In produzione esisteva una sola frase generata con la lista vecchia
(account di prova), azzerata. Da ora le 24 parole sono BIP39 standard.

---

## 8-ter. Vettori di test

`vectors/crypto-vectors.json` è la **specifica eseguibile** dei formati di questo documento:
chunk v2, nome del file cifrato, frammento del link, chiave del file avvolta dalla master key
(anche nel formato pre-#9 senza AAD), BIP39 con i vettori ufficiali, mnemonica → master key →
blob di verifica, RSA-OAEP con impronta RFC 7638, backup della chiave privata. Dalla versione 2
del file: i **vettori ufficiali X-Wing** del draft IETF, il **wrapping v2 ibrido**, il **backup del
seme X-Wing** e l'**impronta ibrida**.

- **Chi li calcola.** `scripts/generate-crypto-vectors.mjs`, con `node:crypto` (OpenSSL) e non
  con il codice di questa cartella: un vettore prodotto dall'implementazione che deve
  verificare proverebbe solo che è coerente con sé stessa. ⚠️ Eccezione: `node:crypto` non ha
  ML-KEM, quindi la parte X-Wing delle sezioni v2 usa `@noble/post-quantum` — ma solo **dopo**
  che il generatore le ha fatto riprodurre i vettori ufficiali del draft, e si ferma se non ci
  riesce. RSA-OAEP, HKDF, AES-GCM e SHA-256 della v2 restano calcolati da OpenSSL.
- **Chi li verifica.** `vectors.test.ts`, dentro `npm test`, quindi anche in CI. Dove il
  formato è deterministico si controllano entrambe le direzioni (a parità di IV); RSA-OAEP e il
  backup (JSON non canonico) si verificano in decifratura.
- **L'IV iniettabile.** `encryptChunkFramed`, `encryptFileName`, `wrapFileKey`,
  `wrapPrivateKeyWithMasterKey` e `createVerificationHash` accettano un `iv` facoltativo **solo
  per i vettori**. In produzione non si passa mai: in GCM un IV riusato rompe tutto.
- ⚠️ **Non si rigenerano.** Un vettore che cambia è un formato che cambia, e i file già cifrati
  potrebbero non riaprirsi. Un formato nuovo — il wrapping post-quantum, per esempio — si
  aggiunge come **sezione nuova**, lasciando intatte le esistenti. Il generatore carica il file
  così com'è e aggiunge solo le sezioni mancanti; `--force` riscrive tutto, e va usato solo
  prima che esista un file cifrato in produzione.
- Ogni implementazione futura (desktop, CLI, SDK) deve superare **questo** file prima di
  scrivere il suo primo byte in produzione.

---

## 9. Regole per chi modifica questa cartella

- Nessuna dipendenza da Vue, dagli store, dalla sessione o dal DOM applicativo. DOM e IndexedDB
  vivono **solo negli adattatori browser** (`browserDownload.ts`, `keyStore.ts`); chi ha bisogno
  dell'utente corrente lo riceve come parametro. `boundaries.test.ts` lo verifica a ogni `npm test`,
  e controlla che il nucleo si carichi in Node (roadmap O3.1).
- Nessuna libreria crittografica di terze parti: solo API di piattaforma. **Unica eccezione
  dichiarata: `@noble/post-quantum`** (versione fissata, esatta), per X-Wing. Perché è
  accettabile: i browser non offrono ML-KEM; la libreria è JavaScript puro e senza dipendenze
  oltre `@noble/curves` e `@noble/hashes` (queste sì, con audit indipendenti); riproduce i
  vettori ufficiali del draft in ogni esecuzione dei test; e il formato v2 è costruito perché un
  suo difetto non porti mai la sicurezza sotto la v1 (§4.5). Quando i browser esporranno ML-KEM
  in Web Crypto, l'eccezione va tolta. Nessun'altra libreria si aggiunge per analogia.
- Mai un `console.log` di chiavi, mnemoniche, frammenti di URL o materiale derivato.
- Ogni cambiamento di formato passa da un **numero di versione**, mai da un'interpretazione
  implicita dei byte: i file già caricati devono restare leggibili.
- Un formato nuovo porta con sé i suoi **vettori** (§8-ter); quelli esistenti non si toccano.
- Aggiorna questo README nello stesso commit.
