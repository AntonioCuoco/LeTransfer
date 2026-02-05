# 🔄 Transfer Manager

## Overview

Il Transfer Manager è un sistema centralizzato per gestire tutti i trasferimenti (upload e download) con:
- **Code di attesa** per rispettare limiti di concorrenza
- **Controlli** (pausa, riprendi, annulla)
- **Progress tracking** in tempo reale

---

## Architettura

```
┌────────────────────────────────────────────────────────────┐
│                    TransferProvider                         │
│  ┌────────────────────────────────────────────────────┐    │
│  │              TransferContext                        │    │
│  │  - transfers: TransferItem[]                        │    │
│  │  - addUpload(file) → id                            │    │
│  │  - addDownload(url, name) → id                     │    │
│  │  - pauseTransfer(id)                               │    │
│  │  - resumeTransfer(id)                              │    │
│  │  - cancelTransfer(id)                              │    │
│  │  - clearCompleted()                                │    │
│  └────────────────────────────────────────────────────┘    │
│                           │                                 │
│           ┌───────────────┼───────────────┐                │
│           ▼               ▼               ▼                │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│   │ UploadRunner │ │ UploadRunner │ │DownloadRunner│       │
│   │  (hidden)    │ │  (hidden)    │ │   (hidden)   │       │
│   └──────────────┘ └──────────────┘ └──────────────┘       │
└────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────┐
│                 TransferStatusPanel                         │
│  - Lista trasferimenti attivi                              │
│  - Progress bars                                           │
│  - Controlli per ogni transfer                             │
└────────────────────────────────────────────────────────────┘
```

---

## Limiti di Concorrenza

```typescript
const LIMITS = {
    uploadLarge: {
        files: 3,    // Max 3 file grandi (>100MB) simultanei
        parts: 2     // Max 2 chunks paralleli per file
    },
    uploadSmall: {
        files: 6     // Max 6 file piccoli simultanei
    },
    download: {
        files: 2     // Max 2 download simultanei
    }
};
```

---

## Tipi

```typescript
type TransferStatus = 
    'queued' | 'initializing' | 'uploading' | 
    'downloading' | 'paused' | 'completed' | 
    'error' | 'cancelled';

interface TransferItem {
    id: string;
    type: 'upload' | 'download';
    name: string;
    size?: number;
    status: TransferStatus;
    progress: {
        percentage: number;
        loadedBytes: number;
        totalBytes: number;
        speed?: number;
        eta?: number;
    };
    error?: Error | null;
    fileOrUrl: File | string;
}
```

---

## Componenti

### TransferProvider

Context provider che wrappa l'applicazione:

```tsx
<TransferProvider apiBaseUrl={import.meta.env.VITE_API_MULTIPART_URL}>
    <App />
</TransferProvider>
```

### UploadRunner

Componente invisibile che esegue l'upload effettivo:

```typescript
// Quando status passa a 'initializing', il runner inizia
// Sincronizza lo stato con il context
// Registra i controlli (pause/resume/cancel)
```

### TransferStatusPanel

UI per visualizzare i trasferimenti:
- Progress bar per ogni file
- Pulsanti pausa/riprendi/annulla
- Velocità e tempo rimanente

---

## Utilizzo

```typescript
import { useTransfer } from './contexts/TransferContext';

const MyComponent = () => {
    const { 
        transfers, 
        addUpload, 
        pauseTransfer, 
        cancelTransfer 
    } = useTransfer();
    
    const handleUpload = (file: File) => {
        const id = addUpload(file);
        console.log('Transfer ID:', id);
    };
    
    return (
        <>
            <button onClick={() => handleUpload(myFile)}>
                Upload
            </button>
            <TransferStatusPanel />
        </>
    );
};
```

---

## Scheduler (Coda)

Lo scheduler automaticamente:
1. Conta trasferimenti attivi per tipo
2. Promuove trasferimenti dalla coda quando c'è spazio
3. Rispetta i limiti di concorrenza

```typescript
useEffect(() => {
    const activeUploadsLarge = transfers.filter(t =>
        t.type === 'upload' && 
        t.fileOrUrl.size > 100 * 1024 * 1024 &&
        ['initializing', 'uploading'].includes(t.status)
    ).length;

    const queuedItems = transfers.filter(t => t.status === 'queued');

    queuedItems.forEach(item => {
        if (item.type === 'upload' && item.fileOrUrl.size > 100 * 1024 * 1024) {
            if (activeUploadsLarge < LIMITS.uploadLarge.files) {
                updateTransfer(item.id, { status: 'initializing' });
            }
        }
    });
}, [transfers]);
```
