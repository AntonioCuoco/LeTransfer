# 💾 Gestione File DynamoDB

## Overview

Sistema per gestire i file dell'utente con sincronizzazione tra S3 (storage) e DynamoDB (metadata). Fornisce operazioni CRUD complete.

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                                │
├─────────────────────────────────────────────────────────────┤
│           useFileFromDynamoDB hook                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  loadFiles() → Lista file utente                      │   │
│  │  uploadFile(file) → Carica nuovo file                 │   │
│  │  deleteFile(fileId) → Elimina file                    │   │
│  │  downloadFile(file) → Download con presigned URL      │   │
│  │  sendFileEmail(options) → Invia via email             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      AWS BACKEND                             │
│                                                              │
│  ┌──────────────────────┐      ┌────────────────────────┐   │
│  │     API Gateway      │      │       DynamoDB         │   │
│  │                      │      │     SharedFiles        │   │
│  │  /user/files/dynamo  │◄────▶│  ┌──────────────────┐  │   │
│  │  /user/files/:id     │      │  │ fileId (PK)      │  │   │
│  │  /upload             │      │  │ ownerUserId (SK) │  │   │
│  └──────────────────────┘      │  │ fileName         │  │   │
│                                │  │ fileSize         │  │   │
│  ┌──────────────────────┐      │  │ s3Key            │  │   │
│  │         S3           │      │  │ uploadedAt       │  │   │
│  │   letransferbucket   │      │  │ isShared         │  │   │
│  │                      │      │  └──────────────────┘  │   │
│  │  uploads/files/      │      └────────────────────────┘   │
│  │    {userId}/         │                                   │
│  │      {fileName}      │                                   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tipo DynamoDBFile

```typescript
interface DynamoDBFile {
    fileId: string;
    fileName: string;
    originalName: string;
    fileSize: string;      // Formattata (es: "1.5 MB")
    size: string;          // Alias di fileSize
    fileType: string;
    isEncrypted: boolean;  // True se cifrato client-side
    s3Key: string;
    s3Url: string | null;  // Presigned URL (temporaneo)
    urlExpires: string | null;
    ownerUserId: string;
    uploadedAt: string;
    metadata?: Record<string, string>;
    
    // File condivisi
    sharedWith?: SharedRecipient[];
    isShared?: boolean;
    
    // File ricevuti
    isReceived?: boolean;
    senderEmail?: string;
    senderId?: string;
    shareId?: string;
    sharedAt?: string;
}
```

---

## Hook: `useFileFromDynamoDB`

### Interfaccia

```typescript
const useFileFromDynamoDB = () => {
    return {
        // State
        files: DynamoDBFile[],
        isLoading: boolean,
        error: string | null,
        uploadProgress: number,
        
        // Actions
        loadFiles: (options?: LoadFilesOptions) => Promise<DynamoDBFile[]>,
        uploadFile: (file: File, options?: UploadFileOptions) => Promise<void>,
        deleteFile: (fileId: string, options?: DeleteFileOptions) => Promise<void>,
        downloadFile: (file: DynamoDBFile) => Promise<void>,
        sendFileEmail: (options: SendEmailOptions) => Promise<EmailResponse | null>
    };
};
```

### Opzioni Load Files

```typescript
interface LoadFilesOptions {
    limit?: number;        // Default: 50
    lastKey?: string;      // Per paginazione
    fileType?: string;     // Filtro tipo (image, video, etc)
    onlyOwned?: boolean;   // Solo file caricati dall'utente
}
```

---

## API Endpoints

### GET /user/files/dynamo

Lista file dell'utente con paginazione.

**Query Params:**
- `limit` - Numero file per pagina
- `lastKey` - Chiave per paginazione
- `fileType` - Filtro tipo file

**Response:**
```json
{
    "success": true,
    "files": [...],
    "count": 50,
    "nextKey": "abc123",
    "hasMore": true
}
```

### POST /upload

Upload file (standard, non multipart).

**Request:** `multipart/form-data`
```
file: <binary>
```

**Response:**
```json
{
    "success": true,
    "file": { /* DynamoDBFile */ },
    "key": "uploads/files/user123/file.pdf"
}
```

### DELETE /user/files/:fileId

Elimina file da S3 e DynamoDB.

**Response:**
```json
{
    "success": true,
    "message": "File eliminato"
}
```

---

## Download File

```typescript
const downloadFile = async (file: DynamoDBFile) => {
    // 1. Genera/usa presigned URL
    let url = file.s3Url;
    
    if (!url || isUrlExpired(file.urlExpires)) {
        url = await getPresignedUrl(file.s3Key);
    }
    
    // 2. Avvia download
    const link = document.createElement('a');
    link.href = url;
    link.download = file.fileName;
    link.click();
};
```

---

## Hook: `usePresignedUrl`

Genera URL temporanei per accesso S3.

```typescript
const { generateUrl, isLoading } = usePresignedUrl();

const url = await generateUrl(file.s3Key, {
    expiresIn: 3600 // 1 ora
});
```

---

## Componente: FilesTable

Tabella per visualizzare e gestire i file.

### Props

```typescript
interface FilesTableProps {
    files: TableFile[];
    hideHeader?: boolean;
    onDeleteFile?: (fileId: string) => void;
    onDownloadFile?: (file: DynamoDBFile) => void;
    onShareFile?: (file: DynamoDBFile) => void;
}
```

### Colonne

| Colonna | Descrizione |
|---------|-------------|
| Nome | Nome file con icona tipo |
| Tipo | Tipo MIME |
| Dimensione | Formattata (KB, MB, GB) |
| Data | Data upload/ricezione |
| Stato | uploaded, sent, received |
| Azioni | Download, Share, Delete |

---

## Sincronizzazione S3-DynamoDB

Quando un file viene caricato su S3:

1. **Upload Standard**: La Lambda salva metadata in DynamoDB
2. **Multipart Upload**: `complete-upload` Lambda salva metadata

```javascript
// Lambda complete-upload.js
const putCmd = new PutItemCommand({
    TableName: process.env.SHARED_TABLE_NAME,
    Item: {
        id: { S: crypto.randomUUID() },
        s3Key: { S: Key },
        fileName: { S: sanitize(fileName) },
        fileSize: { N: String(fileSize) },
        formattedSize: { S: formatBytes(fileSize) },
        fileType: { S: fileType },
        ownerUserId: { S: userId },
        uploadedAt: { S: new Date().toISOString() },
        status: { S: 'uploaded' },
        isShared: { BOOL: false }
    }
});
```

---

## Formato File Size

```typescript
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
```

---

## Considerazioni

1. **Presigned URLs** - Scadono dopo 1 ora, rigenerati on-demand
2. **Sanitizzazione Nomi** - URL decode per nomi file leggibili
3. **Paginazione** - Cursore per grandi dataset
4. **Soft Delete** - Opzionale, per recupero file
