/**
 * LeTransfer — nucleo crittografico del client.
 *
 * Tutto ciò che tocca chiavi o ciphertext vive QUI e da nessun'altra parte. È un
 * confine deliberato: chi vuole verificare le affermazioni del prodotto deve poter
 * leggere una sola cartella, non rincorrere la crittografia sparsa tra i componenti.
 *
 * Il modello (algoritmi, formati byte per byte, ciclo di vita delle chiavi, cosa
 * vede il server, cosa NON copriamo) è specificato in ./README.md. Se cambi il
 * comportamento di un file di questa cartella, aggiorna il README nello stesso commit:
 * una specifica che diverge dal codice è peggio di nessuna specifica.
 *
 * Regole della cartella:
 *  • nessuna dipendenza da Vue, dallo store, dalla rete o dal DOM applicativo (DOM e IndexedDB
 *    solo negli adattatori browser, browserDownload.ts e keyStore.ts — lo verifica boundaries.test.ts)
 *  • nessun `console.log` di chiavi, mnemoniche o materiale derivato
 *  • solo API di piattaforma (Web Crypto, IndexedDB): niente librerie crypto di terzi,
 *    con un'unica eccezione dichiarata — @noble/post-quantum per X-Wing (README §9)
 */

// Primitive e formato dei file (AES-256-GCM, formato a chunk v2, chiavi RSA, PBKDF2)
export * from './crypto'

// Download + decifratura in streaming verso un sink qualunque (nucleo, senza browser)
export * from './streamingDownload'

// Sink del browser: scrittura diretta su disco dove supportata, altrimenti Blob (adattatore browser)
export * from './browserDownload'

// Adattatore di storage delle chiavi: interfaccia + implementazione in memoria
export * from './storage'

// Persistenza delle CryptoKey non estraibili in IndexedDB (adattatore browser)
export * from './keyStore'

// Master key ricordata su questo dispositivo, con scadenza
export * from './rememberedDevice'

// Chiave di recupero BIP39 a 24 parole → master key
export * from './recovery-key'

// Impronta di una chiave pubblica (JWK Thumbprint, RFC 7638) e impronta ibrida
export * from './fingerprint'

// Wrapping ibrido post-quantum della chiave del file (RSA-OAEP + X-Wing), formato v2
export * from './hybrid'

// Allineamento della chiave X-Wing fra dispositivo e server (rete e storage iniettati)
export * from './xwingKeySync'
