# 📤 Condivisione File

## Overview

LeTransfer permette di condividere file con altri utenti tramite:
1. **Condivisione diretta** - Invio a utente registrato via email
2. **Link pubblico** - Generazione link scaricabile (vedi 05-shared-links.md)

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  ShareFileModal │────│  useShareFile hook              │ │
│  │  - Input email  │    │  1. Get File Key (Context)      │ │
│  │  - File preview │    │  2. Get Recipient Public Key    │ │
│  │  - E2E Badge    │    │  3. Wrap Key (RSA Encrypt)      │ │
│  └─────────────────┘    │  4. shareFile(..., encKey)      │ │
│                         └─────────────────────────────────┘ │
│                                     │                        │
│                                     ▼                        │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   FileSender    │    │          AWS BACKEND            │ │
│  │  (Multi file)   │    │  ┌──────────────────┐           │ │
│  └─────────────────┘    │  │   POST /share    │           │ │
│                         │  │                  │           │ │
│                         │  └──────────────────┘           │ │
└─────────────────────────────────────────────────────────────┘
```

---

## Hook: `useShareFile`

### Interfaccia

```typescript
interface UseShareFileReturn {
    isSharing: boolean;
    isLoadingShared: boolean;
    sharedFiles: SharedFile[];
    shareError: string | null;
    
    shareFile: (s3Key: string, targetEmail: string, options?) => Promise<ShareFileResponse>;
    getSharedWithMe: () => Promise<SharedFile[]>;
    reset: () => void;
}
```

### Utilizzo

```typescript
const { shareFile, getSharedWithMe, isSharing } = useShareFile();

// Condividi file
const result = await shareFile(
    'uploads/files/user123/document.pdf',
    'destinatario@email.com',
    {
        onSuccess: (response) => console.log('Condiviso!', response.shareId),
        onError: (error) => console.error(error)
    }
);

// Carica file ricevuti
const receivedFiles = await getSharedWithMe();
```

---

## API Endpoints

### POST /share

Condivide un file con un utente.

**Request:**
```json
{
    "s3Key": "uploads/files/user123/file.pdf",
    "type": "user",
    "targetEmail": "destinatario@email.com"
}
```

**Response:**
```json
{
    "message": "File condiviso con successo",
    "shareId": "share_abc123"
}
```

**Errori:**
- `404` - Utente non trovato
- `400` - Non puoi inviare a te stesso

### GET /shared-files

Recupera file condivisi con l'utente corrente.

**Response:**
```json
{
    "files": [
        {
            "shareId": "share_abc123",
            "s3Key": "uploads/files/sender/file.pdf",
            "ownerId": "user_sender",
            "ownerEmail": "mittente@email.com",
            "fileName": "file.pdf",
            "fileSize": 1024000,
            "fileType": "application/pdf",
            "createdAt": "2026-01-05T12:00:00Z",
            "s3Url": "https://presigned-url..."
        }
    ]
}
```

---

## Componente: ShareFileModal

Modal per condividere un singolo file:

```tsx
interface ShareFileModalProps {
    visible: boolean;
    file: DynamoDBFile | null;
    onClose: () => void;
    onSuccess?: () => void;
}
```

### Funzionalità
- Input email con validazione
- Preview file (nome, dimensione, tipo)
- Generazione presigned URL per preview
- Feedback visivo durante invio

---

## Componente: FileSender

Componente completo per invio file multipli a destinatari multipli:

### Features
- Selezione file da locale o da S3
- Drag & drop
- Destinatari multipli con tags
- Upload to S3 opzionale prima dell'invio
- Progress tracking per ogni file

### Flusso

```
1. Utente seleziona file (locali o S3)
2. Aggiunge uno o più destinatari
3. Opzionalmente carica file locali su S3
4. Invia a tutti i destinatari
5. Notifica successo/errore per ogni invio
```

---

## Tipi

```typescript
interface ShareFileRequest {
    s3Key: string;
    type: 'user';
    targetEmail: string;
}

interface ShareFileResponse {
    message: string;
    shareId: string;
}

interface SharedFile {
    shareId: string;
    s3Key: string;
    ownerId: string;
    ownerEmail?: string;
    fileName: string;
    fileSize: number | string;
    fileType: string;
    createdAt: string;
    s3Url: string;
}
```

---

## Gestione Errori

```typescript
// Nel hook useShareFile
if (error.response?.status === 404) {
    errorMessage = 'Utente non trovato. Verifica email.';
} else if (error.response?.status === 400) {
    errorMessage = 'Non puoi inviare un file a te stesso.';
}

Swal.fire({
    title: 'Errore!',
    text: errorMessage,
    icon: 'error'
});
```

---

## Considerazioni

1. **Presigned URLs** - Gli URL S3 sono temporanei (1h)
2. **Validazione Email** - Verifica che l'utente esista in Cognito
3. **Notifiche** - Il destinatario non riceve email automatiche
4. **Quota** - Non ci sono limiti sul numero di condivisioni
