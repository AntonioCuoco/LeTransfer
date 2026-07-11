# Fix #1 — Private key RSA: da localStorage a IndexedDB non-estraibile

Spiegazione della modifica #1 di [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md): come funziona adesso,
quali sono i trade-off, cosa resta eventualmente da modificare.

---

## 0. Prima cosa: QUALE chiave stiamo proteggendo

Nel progetto ci sono **due sistemi di chiavi separati**. Il #1 tocca **solo il secondo**.

| Sistema | A cosa serve | Da dove nasce | Dove sta |
|---------|--------------|---------------|----------|
| **Master key** (AES) | wrappare le **file key** dei file caricati (E2E a riposo) | derivata dalla *Recovery Key* (24 parole) via PBKDF2 | solo in memoria (Pinia `encryption` store), mai persistita |
| **Keypair RSA** ← *questo* | condivisione **utente→utente** (wrappare la file key con la chiave pubblica del destinatario) | generata in `useUserKeyPair` | **prima:** localStorage · **ora:** IndexedDB |

> ⚠️ Il #1 **non tocca** la master key né i file già cifrati. Cambia solo dove/come vive la
> **private key RSA di condivisione**. Non c'è rischio di rendere illeggibili i file esistenti.

---

## 1. Il problema (prima)

La private key RSA veniva esportata in **JWK (JSON)** e scritta in `localStorage` **in chiaro**:

```ts
localStorage.setItem('letransfer_private_key', JSON.stringify(privateKeyJWK))
```

`localStorage` è leggibile da **qualsiasi** script sul dominio. Un XSS (anche da una dipendenza npm
compromessa) può leggerla ed esfiltrarla **in modo permanente**: la chiave resta lì tra le sessioni,
quindi un singolo XSS la ruba "per sempre". Con quella chiave l'attaccante decifra tutti i file
condivisi via email e impersona l'utente nelle condivisioni. → Annulla l'E2E sulla condivisione.

---

## 2. Come funziona ADESSO

### 2.1 Idea centrale: `CryptoKey` non estraibile in IndexedDB

- **IndexedDB** può salvare un oggetto `CryptoKey` **nativo** (via *structured clone*), senza mai
  esportarlo in JWK. localStorage invece salva solo stringhe → obbligava a esportare la chiave.
- La private key viene salvata con **`extractable: false`**. Una chiave non-estraibile **non può
  essere esportata** dal codice JS: `exportKey`/`wrapKey` su di essa lanciano `InvalidAccessError`.
- Risultato: anche se un XSS legge la chiave da IndexedDB, ottiene un handle `CryptoKey` che può
  **usare** finché la sessione è viva (es. decifrare), ma **non può esfiltrare** il materiale grezzo.
  E soprattutto **non c'è più niente di esportabile che persiste tra le sessioni**.

### 2.2 I file coinvolti

| File | Ruolo |
|------|-------|
| [utils/keyStore.ts](../vue-app/src/utils/keyStore.ts) | mini-wrapper IndexedDB (`idbGet`/`idbSet`/`idbDel`) per `CryptoKey`. Nessuna dipendenza esterna. |
| [utils/crypto.ts](../vue-app/src/utils/crypto.ts) | `importPrivateKeyFromJWK(jwk, extractable = true)` — aggiunto il parametro `extractable`. |
| [composables/useUserKeyPair.ts](../vue-app/src/composables/useUserKeyPair.ts) | tutta la logica di storage/migrazione/backup riscritta. |

`keyStore.ts` in breve: apre un DB `letransfer-keys`, object store `keys`, e fa put/get/delete di un
`CryptoKey` per chiave-stringa. Tre funzioni, zero dipendenze.

### 2.3 I flussi (cosa succede quando)

**A) Avvio / `initializeKeyPair`** (chiamato in `onMounted` se c'è l'accessToken):
1. prova a caricare la coppia da **IndexedDB** → se c'è, la usa e finisce;
2. altrimenti **migrazione** da localStorage (vedi §2.4) → se trova le vecchie JWK, migra e finisce;
3. altrimenti controlla se c'è un **backup sul server** → se sì, chiede la password (`needsPasswordForRestore`);
4. altrimenti **genera** una nuova coppia.

**B) Generazione nuova coppia:**
```
genera coppia ESTRAIBILE (transitoria, solo in RAM)
  → persistKeys(): esporta la private in JWK, la RE-IMPORTA come NON estraibile, salva in IDB
  → carica la public key sul server
  → runtime: privateKey = versione NON estraibile
  → exportablePrivateKey = copia estraibile (solo in memoria, per il backup di questa sessione)
```

**C) `persistKeys(pub, extractablePriv)`** — il cuore della conversione:
```ts
const privJWK = await exportPrivateKeyToJWK(extractablePriv)   // serve una chiave estraibile qui
const nonExtractablePriv = await importPrivateKeyFromJWK(privJWK, false)  // ← non estraibile
await idbSet(PUBLIC_KEY_IDB, pubKey)
await idbSet(PRIVATE_KEY_IDB, nonExtractablePriv)
return nonExtractablePriv
```

**D) `restoreFromBackup(password)`:** decifra la private key dal backup (ottenendo una copia
**estraibile**), la ripersiste come **non estraibile** in IDB, e tiene la copia estraibile in
`exportablePrivateKey` per l'eventuale ri-backup nella stessa sessione.

**E) `backupToServer(password)`:** usa `exportablePrivateKey` (estraibile). Se è `null` (es. dopo un
reload, quando in IDB c'è solo la non-estraibile) → **errore controllato**: "ripristina prima dal
backup o rigenera". Il formato del backup **non è cambiato** → i backup restano compatibili.

### 2.4 Migrazione automatica (utenti esistenti)

Chi ha già la chiave in localStorage: al primo avvio dopo il deploy, `migrateFromLocalStorage()`:
1. legge le JWK vecchie da localStorage;
2. le re-importa come `CryptoKey` (private **non estraibile**) e le salva in IndexedDB;
3. **cancella** le voci da localStorage.

È una-tantum e trasparente. Il backup sul server, se presente, resta valido così com'è.

---

## 3. Trade-off (da capire bene)

1. **`exportablePrivateKey` in memoria per la sessione.**
   Il backup *deve* poter esportare la chiave, ma la chiave in IDB è non-estraibile. Perciò teniamo
   una **copia estraibile in RAM**, ma **solo** nella sessione in cui la coppia è stata *generata* o
   *ripristinata*, e **solo in memoria** (mai persistita).
   - *Costo:* un XSS attivo **durante quella sessione** potrebbe esportarla.
   - *Guadagno rispetto a prima:* enorme. Prima la chiave estraibile stava in localStorage **per
     sempre** (un XSS una-tantum bastava). Ora la finestra è limitata a una singola sessione e solo
     se l'utente ha appena generato/ripristinato. Dopo un reload non esiste più nulla di esportabile.
   - *Possibile stretta futura:* azzerare `exportablePrivateKey` subito dopo il backup, o legare il
     backup unicamente al flusso di setup.

2. **Dopo un reload il backup non è disponibile** finché non si fa un restore.
   Conseguenza diretta del punto 1. Oggi è **irrilevante** perché il backup/restore è codice
   dormiente (vedi §4). Quando verrà collegato a una UI, il flusso naturale è "genera → fai subito
   il backup con una password", che funziona in-sessione.

3. **La public key resta estraibile.** È corretto e inevitabile: per specifica Web Crypto la chiave
   pubblica di una coppia è **sempre** estraibile (e ci serve esportarla per mandarla al server).
   Non è un problema: è *pubblica*.

4. **Se IndexedDB non è disponibile** (modalità privata aggressiva, storage disabilitato): la coppia
   non si persiste → verrebbe rigenerata a ogni sessione → le condivisioni già ricevute non si
   decifrerebbero più. È un caso limite raro; era un rischio analogo anche con localStorage. Da
   valutare se aggiungere un avviso esplicito all'utente.

---

## 4. Cosa resta da modificare / verificare

### Lato backend (Express)
- **Backup keypair + campo `iterations` (#4):** quando il backup verrà usato, l'endpoint
  `/user/keypair-backup` deve **salvare e restituire** il campo `iterations` (già in
  [BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md) §1). Non impatta il #1 di per sé, ma i due si
  incrociano nel flusso di backup.
- Nessun'altra modifica backend necessaria per il #1: la public key inviata al server è invariata
  (JWK), il formato del backup è invariato.

### Lato frontend (follow-up consigliati, non bloccanti)
- **Collegare `clearKeys()` al logout.** Ho aggiunto `clearKeys()` (svuota memoria + IndexedDB) ma
  **non è ancora richiamato** al logout. Senza, se sullo stesso browser si logga un altro utente,
  caricherebbe la coppia del precedente da IDB → chiavi sbagliate. *(Nota: era così anche prima con
  localStorage — non è una regressione, ma è il momento giusto per sistemarlo.)*
- **Backup/restore UI:** `backupToServer`/`restoreFromBackup`/`needsPasswordForRestore` sono
  **dormienti** (nessuna UI li richiama oggi). Quando li colleghi, ricorda il trade-off §3.2.
- **Prompt IndexedDB non disponibile:** valutare un messaggio se la persistenza fallisce.

### Verifiche manuali (DevTools)
- **Application → IndexedDB → `letransfer-keys` → `keys`**: dopo il primo avvio devono esserci
  `letransfer_public_key` e `letransfer_private_key` (come CryptoKey).
- **Application → Local Storage**: dopo la migrazione, `letransfer_private_key`/`_public_key`
  **non** devono più esistere.
- Prova a esportare la private key dalla console: `await crypto.subtle.exportKey('jwk', <priv>)`
  deve **fallire** con `InvalidAccessError` (conferma che è non-estraibile).
- Flusso condivisione end-to-end (mandare e ricevere un file condiviso) ancora funzionante.

---

## 5. Riassunto in una frase

La private key RSA di condivisione non vive più come JSON esportabile e permanente in localStorage,
ma come `CryptoKey` **non estraibile** in IndexedDB: un XSS non può più rubarla in modo persistente.
L'unica copia estraibile esiste in memoria per la sola sessione di generazione/ripristino, al solo
scopo del backup (oggi dormiente), con migrazione automatica per gli utenti esistenti.
