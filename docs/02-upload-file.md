# 📤 Sistema di Upload File

## Overview

LeTransfer supporta due modalità di upload:
1. **Upload Standard** - Per file piccoli (< 100MB)
2. **Multipart Upload** - Per file grandi (> 100MB), upload in chunks paralleli

---

## Architettura

```
CLIENT (Vue)                              BACKEND (Express unico)
┌─────────────────────────┐              ┌──────────────────────┐
│  File < 100MB           │              │   POST /api/upload/* │
│  useFileFromDynamoDB    │──────────────│   S3 Direct PUT      │
│  + presigned URL        │              │                      │
└─────────────────────────┘              └──────────────────────┘

┌─────────────────────────┐              ┌──────────────────────┐
│  File > 100MB           │              │ /api/upload/multipart│
│  useS3MultipartUpload   │              │  1. /init            │
│  0. Encrypt (AES-256)   │──────────────│  2. /urls            │
│  1. Init (w/ enc size)  │              │  3. /complete        │
│  2. Get URLs            │              │  4. /abort           │
│  3. Upload enc chunks   │              └──────────────────────┘
│  4. Store Key (Pinia)   │
│  5. Complete            │
└─────────────────────────┘
```

> Nota: in passato il multipart era servito da AWS Lambda + API Gateway, ora dismesse. Tutto passa
> dall'unico Express (`/api/upload/multipart/*`) — vedi [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md)
> §4.3-bis. Lato frontend la base URL è `VITE_API_URL`.

---

## Composable: `useS3MultipartUpload`

File: `vue-app/src/composables/useS3MultipartUpload.ts`.

### Configurazione

```ts
interface MultipartUploadConfig {
  chunkSize: number          // Default: 10MB
  concurrency: number        // Default: 3
  apiBaseUrl: string         // Default: import.meta.env.VITE_API_URL
  userId?: string
  userEmail?: string
  getAuthToken?: () => Promise<string | null>
}
```

### Stato (reattivo)

Lo stato è un `ref<MultipartUploadState>`:

```ts
interface MultipartUploadState {
  status: 'idle' | 'initializing' | 'uploading' | 'paused' |
          'completing' | 'completed' | 'error' | 'aborted'
  progress: {
    uploadedBytes: number
    totalBytes: number
    percentage: number
    speed: number
    eta: number
  }
  uploadId: string | null
  fileKey: string | null
  encryptionKey: CryptoKey | null
  encryptionIV: Uint8Array | null
  error: Error | null
}
```

### Utilizzo

```ts
const { state, uploadFile, pauseUpload, resumeUpload, abortUpload, resetUpload, getEncryptionData } =
  useS3MultipartUpload({
    apiBaseUrl: import.meta.env.VITE_API_URL,
    chunkSize: 10 * 1024 * 1024,
    concurrency: 3,
  })

await uploadFile(selectedFile)   // cifra (AES-256) → init → upload chunk → complete

pauseUpload(); resumeUpload(); abortUpload()

// state.value.status / state.value.progress.percentage sono reattivi
```

> Le chiavi di cifratura del file vengono salvate (wrapped con la master key) tramite lo **store
> Pinia** `useEncryptionStore` (`stores/encryption.ts`), non un Context React. Vedi
> [crypto/README.md](../vue-app/src/crypto/README.md), che è mantenuto nello stesso commit del codice.
>
> Per la gestione della **coda** e dei limiti di concorrenza tra più upload vedi
> `docs/03-transfer-manager.md` (store `useTransferStore` + `UploadQueueManager.vue`).

---

## Backend: route multipart

Endpoint serviti dall'Express (riferimento completo: [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §4.3-bis):

1. **`POST /api/upload/multipart/init`** — crea il multipart su S3, ritorna `uploadId` e `fileKey`.
2. **`POST /api/upload/multipart/urls`** — genera gli URL firmati per ogni chunk (validità 1h).
3. **`POST /api/upload/multipart/complete`** — assembla i chunk su S3 e salva i metadati in DynamoDB.
4. **`POST /api/upload/multipart/abort`** — annulla l'upload incompleto e libera le risorse S3.

---

## Path S3

```
uploads/files/{userId}/{fileName}
```
> La key reale include timestamp e uuid per evitare collisioni di nome, ed è costruita dal backend
> a partire dal `sub` del token (mai dal body) — vedi [BACKEND_API_DOCS.md](BACKEND_API_DOCS.md) §4.3-bis.

---

## Limiti

| Parametro | Valore |
|-----------|--------|
| Min chunk | 5MB |
| Max chunk | 5GB |
| Max parti | 10.000 |
| Max file | 5TB |

---

## Composable drag & drop

Il sistema usa due composable separati per il drag & drop.

### `useFileDragAndDrop`

File: `vue-app/src/composables/useFileDragAndDrop.ts`. Per file singoli/multipli, tutti i browser.

```ts
import { useFileDragAndDrop } from '@/src/composables/useFileDragAndDrop'

const { isDragOver, dropZoneRef, dragProps } = useFileDragAndDrop({
  onFilesDropped: (files: File[]) => { /* gestisci file */ },
  accept: 'image/*,.pdf',  // opzionale
  multiple: true,          // default: true
  disabled: false,         // default: false
})
```

Applicazione nel template (le chiavi di `dragProps` sono `onDragEnter/onDragLeave/onDragOver/onDrop`,
quindi si bindano con `v-bind`):

```vue
<div ref="dropZoneRef" v-bind="dragProps" :class="{ 'drag-over': isDragOver }">
  Drop files here
</div>
```

**Usato in:**
- `MultipartFileUploader.vue` — upload file grandi
- `FileSender/FileSender.vue` — invio file via email

---

### `useFolderDragAndDrop`

File: `vue-app/src/composables/useFolderDragAndDrop.ts`. Per cartelle con traversamento ricorsivo.

```ts
import { useFolderDragAndDrop } from '@/src/composables/useFolderDragAndDrop'

const { isDragOver, supportsFolderDnD, dropZoneRef, dragProps } = useFolderDragAndDrop({
  onFilesDropped: (files: File[]) => { /* tutti i file dalla cartella */ },
  disabled: false,
})
```

**Caratteristiche:**
- Controllo supporto browser (`webkitGetAsEntry`)
- Popup SweetAlert se il browser non supporta
- Traversamento ricorsivo delle sottocartelle
- Ritorna `supportsFolderDnD` per UI condizionale

**Usato in:**
- `pages/Homepage.vue` — Carica Cartella
