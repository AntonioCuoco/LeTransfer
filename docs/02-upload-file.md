# 📤 Sistema di Upload File

## Overview

LeTransfer supporta due modalità di upload:
1. **Upload Standard** - Per file piccoli (< 100MB)
2. **Multipart Upload** - Per file grandi (> 100MB), upload in chunks paralleli

---

## Architettura

```
CLIENT                                    AWS BACKEND
┌─────────────────────────┐              ┌──────────────────────┐
│  File < 100MB           │              │   API Gateway        │
│  useFileFromDynamoDB    │──────────────│   Lambda Upload      │
│  .uploadFile()          │              │   S3 Direct PUT      │
└─────────────────────────┘              └──────────────────────┘

┌─────────────────────────┐              ┌──────────────────────┐
│  File > 100MB           │              │  Multipart APIs:     │
│  useS3MultipartUpload   │              │  1. /init            │
│  0. Encrypt (AES-256)   │──────────────│  2. /urls            │
│  1. Init (w/ enc size)  │              │  3. /complete        │
│  2. Get URLs            │              │  4. /abort           │
│  3. Upload enc chunks   │              └──────────────────────┘
│  4. Store Key (Context) │
│  5. Complete            │
└─────────────────────────┘
```

---

## Hook: `useS3MultipartUpload`

### Configurazione

```typescript
interface MultipartUploadConfig {
    chunkSize: number;        // Default: 10MB
    concurrency: number;      // Default: 3
    apiBaseUrl: string;
    userId?: string;
    userEmail?: string;
}
```

### Stato

```typescript
interface MultipartUploadState {
    status: 'idle' | 'initializing' | 'uploading' | 'paused' | 
            'completing' | 'completed' | 'error';
    progress: {
        uploadedBytes: number;
        totalBytes: number;
        percentage: number;
        speed: number;
        eta: number;
    };
    uploadId: string | null;
    fileKey: string | null;
    error: Error | null;
}
```

### Utilizzo

```typescript
const { state, uploadFile, pauseUpload, resumeUpload, abortUpload } = 
    useS3MultipartUpload({
        apiBaseUrl: '/api/upload/multipart',
        chunkSize: 10 * 1024 * 1024,
        concurrency: 3
    });

// Upload
await uploadFile(selectedFile);

// Controlli
pauseUpload();
resumeUpload();
abortUpload();
```

---

## Backend Lambda Functions

### 1. Initiate Upload
- Crea multipart upload su S3
- Restituisce `uploadId` e `fileKey`

### 2. Get Presigned URLs
- Genera URL firmati per ogni chunk
- Validità: 1 ora

### 3. Complete Upload
- Assembla i chunks su S3
- Salva metadata in DynamoDB

### 4. Abort Upload
- Cancella upload incompleto
- Libera risorse S3

---

## Path S3

```
uploads/files/{userId}/{fileName}
```

---

## Limiti

| Parametro | Valore |
|-----------|--------|
| Min chunk | 5MB |
| Max chunk | 5GB |
| Max parti | 10.000 |
| Max file | 5TB |

---

## Drag & Drop Hooks

Il sistema usa due hook separati per gestire il drag & drop:

### `useFileDragAndDrop`

Hook per file singoli/multipli. Funziona su tutti i browser.

```typescript
import { useFileDragAndDrop } from '../hooks/useFileDragAndDrop';

const { isDragOver, dragProps, dropZoneRef } = useFileDragAndDrop({
    onFilesDropped: (files) => { /* gestisci file */ },
    accept: 'image/*,.pdf',  // opzionale
    multiple: true,          // default: true
    disabled: false          // default: false
});

// Applicare al container
<div ref={dropZoneRef} {...dragProps}>
    Drop files here
</div>
```

**Usato in:**
- `MultipartFileUploader.tsx` - Upload file grandi
- `FileSender.tsx` - Invio file via email

---

### `useFolderDragAndDrop`

Hook per cartelle con traversamento ricorsivo.

```typescript
import { useFolderDragAndDrop } from '../hooks/useFolderDragAndDrop';

const { isDragOver, supportsFolderDnD, dragProps, dropZoneRef } = useFolderDragAndDrop({
    onFilesDropped: (files) => { /* tutti i file dalla cartella */ },
    disabled: false
});
```

**Caratteristiche:**
- Controllo supporto browser (`webkitGetAsEntry`)
- Popup Swal se browser non supporta
- Traversamento ricorsivo delle sottocartelle
- Ritorna `supportsFolderDnD` per UI conditionale

**Usato in:**
- `Homepage.tsx` - Carica Cartella
