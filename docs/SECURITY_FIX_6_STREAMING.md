# Design #6 — Streaming encryption (formato file "v2")

Documento di design (non ancora implementato) per il punto #6 di [SECURITY_IMPROVEMENTS.md](SECURITY_IMPROVEMENTS.md):
cifratura/decifratura **a chunk in streaming**, per supportare file di grandi dimensioni senza OOM e
con integrità per-chunk. Da leggere prima di implementare.

---

## 0. Il problema (stato attuale)

Oggi il file viene cifrato/decifrato **interamente in RAM**:

- **Upload** — [useS3MultipartUpload.ts](../vue-app/src/composables/useS3MultipartUpload.ts): `encryptFile` fa
  `file.arrayBuffer()` → intero file in RAM, cifrato come **un unico blob GCM**, poi affettato in parti.
- **Download** — [useFileFromDynamoDB.ts](../vue-app/src/composables/useFileFromDynamoDB.ts),
  [ShareAccessPage.vue](../vue-app/src/pages/ShareAccessPage.vue), [useShareFile.ts](../vue-app/src/composables/useShareFile.ts):
  `response.blob()` + `decryptFile` → intero file in RAM.

Conseguenze:
- **OOM su file grandi**: la tab crasha tra ~qualche centinaio di MB e ~1 GB (dipende dalla RAM), su
  **tutti** i browser. Il multipart esiste proprio per non tenere file grandi in RAM: cifrare-tutto-poi-affettare
  annulla il vantaggio.
- **Nessuna integrità per-chunk**: un unico tag GCM sull'intero file → un chunk corrotto/sostituito si
  scopre solo alla fine. Esistono già `encryptChunk`/`decryptChunk` (con AAD = indice chunk,
  anti-riordino) in [crypto.ts](../vue-app/src/utils/crypto.ts) ma **non sono collegati**.

---

## 1. Obiettivi

1. **Upload senza OOM, illimitato, su tutti i browser.**
2. **Download senza OOM** dove il browser lo consente (progressive enhancement).
3. **Integrità per-chunk** (anti-riordino/sostituzione via AAD = indice).
4. **Retrocompatibilità**: i file già caricati (formato "v1") restano leggibili.

---

## 2. Formato file "v2"

L'oggetto su S3 diventa una **sequenza di chunk cifrati indipendenti**, ognuno:

```
[ IV 12 byte ][ ciphertext + tag GCM 16 byte ]
```

- **IV unico per chunk** (prefisso, così il downloader sa quale usare).
- **AAD = indice del chunk** (`chunk-${i}`) → previene riordino e sostituzione di un chunk con un altro.
- Un'unica **file key AES** per tutto il file (invariata rispetto a oggi); cambiano solo gli IV per chunk.
- Dimensione chunk = dimensione parte multipart (**10 MB**), così **1 chunk crypto = 1 parte S3**.
- Overhead: `+28 byte per chunk` (12 IV + 16 tag). La dimensione cifrata = `originalSize + numChunks·28`.

### Metadati (in DynamoDB, scritti da `complete`)

```
formatVersion: 2
chunkSize:     10485760      // 10 MB, dimensione del chunk in CHIARO
originalSize:  <byte>        // dimensione file originale
```

Servono al download per calcolare i confini dei chunk (ogni chunk cifrato = `12 + min(chunkSize, resto) + 16`).

---

## 3. Upload (streaming — illimitato, ovunque)

`file.slice(start, end)` **non** carica in RAM finché non chiami `.arrayBuffer()`. Quindi si processa
**un chunk alla volta**:

```
per ogni parte i:
  rawChunk = await file.slice(i*chunkSize, (i+1)*chunkSize).arrayBuffer()   // carica SOLO questo chunk
  iv = generateIV()
  enc = await encryptChunk(rawChunk, fileKey, iv, i)                         // già esistente
  payload = [iv (12B)] ++ [enc]
  uploadPart(payload)                                                        // carica su S3
  // rawChunk/enc vengono rilasciati → prossimo
```

- Picco RAM ≈ **un chunk** (~10 MB) → nessun OOM, **qualsiasi dimensione**, **tutti i browser**.
- Riusa `encryptChunk` già presente in [crypto.ts](../vue-app/src/utils/crypto.ts).

---

## 4. Download (progressive enhancement)

L'oggetto S3 è la concatenazione dei chunk `[IV||ciphertext]`. Si legge lo stream (`fetch(s3Url).body`,
`ReadableStream` — supportato ovunque), si bufferizza fino ad avere un chunk completo, si decifra con
`decryptChunk`, si scrive, si ripete. RAM ≈ 1-2 chunk.

**Dove scrivere il decifrato** — due strade, scelte a runtime:

- **Chrome/Edge/Opera** → **File System Access API** (`showSaveFilePicker()` + `createWritable()`):
  scrittura **diretta su disco** in streaming → RAM minima, **dimensione illimitata**.
- **Firefox/Safari** (niente File System Access API) → **fallback Blob**: si accumulano i chunk
  decifrati come Blob (che il browser tiene su disco) e si scarica alla fine.

```
if ('showSaveFilePicker' in window) {  // Chromium
  streaming-to-disk (illimitato)
} else {                                // Firefox / Safari
  fallback Blob (~2 GB)
}
```

> ⚠️ **Limite noto — Firefox/Safari:** con il fallback Blob il download di file **oltre ~2 GB** può
> fallire (tetto pratico del Blob, dipendente da browser/RAM). Su Chromium non c'è limite. **Vedi §7
> per l'avviso da mostrare all'utente e §8 per il miglioramento futuro.**

---

## 5. Retrocompatibilità (file "v1")

- I file già caricati sono **v1** (unico blob GCM, con `encryptionIV` nei metadati).
- Il download legge `formatVersion`:
  - **assente / 1** → percorso vecchio (`decryptFile` con l'unico IV);
  - **2** → percorso a chunk.
- **Nessuna migrazione** dei file esistenti (restano leggibili così come sono). Solo i **nuovi** upload
  usano v2.
- Il wrapping della file key (store `encryption`) è **invariato**: cambia solo il formato del *contenuto*.

---

## 6. Impatto backend (Express)

Minimo: la route `complete` deve **salvare** e la lista/get **restituire** tre campi nei metadati del file:
`formatVersion` (number), `chunkSize` (number), `originalSize` (number). I file senza `formatVersion`
sono v1. Già anticipato in [BACKEND_SECURITY_TODO.md](BACKEND_SECURITY_TODO.md) §7.

---

## 7. File impattati (frontend) + avviso utente

| File | Modifica |
|------|----------|
| [crypto.ts](../vue-app/src/utils/crypto.ts) | usa `encryptChunk`/`decryptChunk` (già presenti); eventuali helper di framing IV. |
| [useS3MultipartUpload.ts](../vue-app/src/composables/useS3MultipartUpload.ts) | cifratura per-chunk nel loop di preparazione parti (niente più `encryptFile`). |
| Nuovo `utils/streamingDownload.ts` | lettura stream + decrypt per-chunk + scrittura (File System Access API con fallback Blob). |
| [useFileFromDynamoDB.ts](../vue-app/src/composables/useFileFromDynamoDB.ts) | download: instrada v1 (vecchio) vs v2 (streaming). |
| [useShareFile.ts](../vue-app/src/composables/useShareFile.ts) | `downloadSharedFile`: stessa logica v1/v2 per i file ricevuti. |
| [ShareAccessPage.vue](../vue-app/src/pages/ShareAccessPage.vue) | download da link pubblico: idem. |
| **Nuovo avviso UI** | banner/dialog quando si è su **Firefox/Safari** e il file supera una soglia (~2 GB): informare che su questo browser i file molto grandi potrebbero non scaricarsi e suggerire Chrome/Edge. |

> **⚠️ Requisito UX (richiesto):** su Firefox/Safari, prima di scaricare un file oltre ~2 GB, mostrare
> un **avviso esplicito** all'utente ("Su questo browser i file oltre ~2 GB potrebbero non essere
> scaricabili: usa Chrome o Edge"). Non fallire in silenzio.

---

## 8. ⚠️ Punti aperti / da migliorare in futuro

- **Superare il limite ~2 GB su Firefox/Safari** (TODO futuro). Opzioni da valutare:
  - **StreamSaver.js** come secondo fallback (Service Worker): sblocca Firefox oltre i 2 GB; **Safari
    resta il caso ostico** (streaming download via SW storicamente problematico).
  - Rivalutare quando/se Firefox e Safari adotteranno la File System Access API (in evoluzione).
  - Monitorare l'Origin Private File System (OPFS) come storage intermedio.
- **Decisione presa (baseline):** File System Access API su Chromium + fallback Blob altrove. Copre
  "funziona ovunque" + "grandi file" (illimitato su Chrome, ~2 GB su Firefox/Safari). Il miglioramento
  di Firefox/Safari è rimandato e **va tracciato**.

---

## 9. Note di design / edge case

- **Chunk size** = 10 MB (allineato al multipart). Un chunk crypto = una parte S3.
- **Boundaries in download**: chunk cifrato i-esimo = `12 + min(chunkSize, originalSize - i·chunkSize) + 16`
  byte → deterministico da `chunkSize` + `originalSize`.
- **Progress/size**: la dimensione cifrata è `originalSize + numChunks·28` → aggiornare i calcoli di
  progresso/`fileSize` (oggi usano `encryptedBlob.size`).
- **Resume upload**: il codice supporta `existingParts`. Con v2 ogni parte è auto-consistente
  (IV+tag propri) → il resume resta valido, purché la mappatura parte↔chunk sia stabile.
- **Breaking change**: è una modifica coordinata upload + download + preview + backend (`formatVersion`).
  Va rilasciata insieme, e i file v1 restano gestiti dal percorso legacy.

---

*Design creato il 2026-06-27. Da implementare come Fase 2 del binario DEV, dopo conferma dell'approccio.
Baseline: streaming-to-disk su Chromium + fallback Blob (~2 GB) su Firefox/Safari, con avviso utente;
miglioramento del limite Firefox/Safari tracciato come TODO futuro (§8).*
