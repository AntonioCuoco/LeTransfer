# 👤 Profilo Utente

## Overview

La pagina profilo (`/profile`) mostra:
- Header con info utente e immagine profilo
- Statistiche file (caricati, ricevuti, etc.)
- Tabella file con tabs e filtri
- Gestione link condivisi

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                      Profile Page                            │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  ProfileHeader                          │ │
│  │  - Avatar con upload immagine                          │ │
│  │  - Nome utente                                         │ │
│  │  - Email                                               │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  FileStatsGrid                          │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │ │
│  │  │Caricati │  │ Inviati │  │Ricevuti │  │Eliminati│   │ │
│  │  │   15    │  │    8    │  │    3    │  │    2    │   │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Tabs: [I Miei File] [Ricevuti] [Link Condivisi]       │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │  Filtro tipo: [Tutti ▼]  [Immagini] [Video]...   │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │  ┌──────────────────────────────────────────────────┐  │ │
│  │  │              FilesTable / SharedLinksTable        │  │ │
│  │  └──────────────────────────────────────────────────┘  │ │
│  │                                                        │ │
│  │  [◄ Prev] [1] [2] [3] [Next ►]                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Componente: Profile

### State

```typescript
const [activeTab, setActiveTab] = useState('uploaded');
const [selectedFileType, setSelectedFileType] = useState('all');
const [currentPage, setCurrentPage] = useState(1);
const [stats, setStats] = useState<FileStats>({
    uploaded: 0,
    downloaded: 0,
    sent: 0,
    received: 0,
    archived: 0,
    deleted: 0
});
```

### Hooks Utilizzati

```typescript
const {
    files,
    isLoading,
    loadFiles,
    deleteFile,
    downloadFile
} = useFileFromDynamoDB();

const {
    sharedFiles,
    getSharedWithMe,
    isLoadingShared
} = useShareFile();

const {
    links,
    fetchLinks,
    revokeLink,
    updateLink
} = useSharedLinks();
```

---

## Tabs

### Tab 1: I Miei File

File caricati dall'utente.

```typescript
const loadFiles = async (page: number = 1) => {
    const result = await loadFilesHook({
        limit: ITEMS_PER_PAGE,
        fileType: selectedFileType !== 'all' ? selectedFileType : undefined,
        onlyOwned: true
    });
    
    setFiles(result);
    updateStats(result.length, sharedFiles.length);
};
```

### Tab 2: File Ricevuti

File condivisi da altri utenti.

```typescript
const loadSharedFiles = async () => {
    const received = await getSharedWithMe();
    setSharedFiles(received);
};
```

### Tab 3: Link Condivisi

Gestione link pubblici creati.

```typescript
// Usa SharedLinksTable
<SharedLinksTable
    links={links}
    onRevoke={revokeLink}
    onRegenerate={regenerateLink}
    onUpdate={updateLink}
/>
```

---

## Componente: ProfileHeader

```tsx
interface ProfileHeaderProps {
    user: {
        name: string;
        email: string;
        avatarUrl?: string;
    };
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({ user }) => {
    const { uploadProfileImage, profileImageUrl } = useProfileImage();
    
    return (
        <div className="profile-header">
            <Avatar 
                src={profileImageUrl} 
                onClick={handleAvatarClick}
            />
            <div>
                <h1>{user.name}</h1>
                <p>{user.email}</p>
            </div>
        </div>
    );
};
```

---

## Componente: FileStatsGrid

```tsx
interface FileStatsGridProps {
    stats: FileStats;
}

const FileStatsGrid: React.FC<FileStatsGridProps> = ({ stats }) => {
    const items = [
        { label: 'Caricati', value: stats.uploaded, icon: UploadIcon },
        { label: 'Inviati', value: stats.sent, icon: SendIcon },
        { label: 'Ricevuti', value: stats.received, icon: InboxIcon },
        { label: 'Eliminati', value: stats.deleted, icon: TrashIcon }
    ];
    
    return (
        <div className="stats-grid">
            {items.map(item => (
                <StatCard key={item.label} {...item} />
            ))}
        </div>
    );
};
```

---

## Filtro Tipo File

```typescript
const FILE_TYPE_FILTERS = [
    { value: 'all', label: 'Tutti' },
    { value: 'image', label: 'Immagini' },
    { value: 'video', label: 'Video' },
    { value: 'audio', label: 'Audio' },
    { value: 'document', label: 'Documenti' },
    { value: 'archive', label: 'Archivi' },
    { value: 'application', label: 'Applicazioni' }
];

const handleFileTypeChange = (fileType: string) => {
    setSelectedFileType(fileType);
    setCurrentPage(1);
    loadFiles(1);
};
```

---

## Paginazione

```typescript
const ITEMS_PER_PAGE = 10;

const getCurrentPageFiles = () => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredFiles.slice(startIndex, startIndex + ITEMS_PER_PAGE);
};

const handlePageChange = (page: number) => {
    setCurrentPage(page);
};

// Paginazione lato client per i file già caricati
// Per dataset grandi, usare paginazione lato server con cursor
```

---

## Hook: useProfileImage

Gestione immagine profilo.

```typescript
const useProfileImage = () => {
    return {
        profileImageUrl: string | null,
        isUploading: boolean,
        uploadProfileImage: (file: File) => Promise<void>,
        refreshProfileImage: () => void
    };
};
```

L'immagine viene salvata in:
```
uploads/profiles/{userId}/avatar.{ext}
```

---

## Conversione Dati per Tabella

```typescript
const convertFilesToTableFormat = (dynamoDBFiles: DynamoDBFile[]): TableFile[] => {
    return dynamoDBFiles.map(file => ({
        id: file.fileId,
        name: file.fileName,
        type: file.fileType,
        size: file.fileSize,
        status: file.isShared ? 'sent' : 'uploaded',
        date: file.uploadedAt,
        originalFile: file,
        sharedWith: file.sharedWith,
        isShared: file.isShared
    }));
};

const convertSharedFilesToTableFormat = (files: SharedFile[]): TableFile[] => {
    return files.map(file => ({
        id: file.shareId,
        name: file.fileName,
        type: file.fileType,
        size: formatFileSize(file.fileSize),
        status: 'received',
        date: file.createdAt,
        isReceived: true,
        senderEmail: file.ownerEmail
    }));
};
```

---

## Azioni File

```typescript
// Download
const handleDownloadFile = (file: DynamoDBFile) => {
    downloadFile(file);
};

// Share
const handleShareFile = (file: DynamoDBFile) => {
    setSelectedFileForShare(file);
    setShareModalVisible(true);
};

// Delete
const handleDeleteFile = async (fileId: string) => {
    await deleteFile(fileId, {
        onSuccess: () => {
            Swal.fire('Eliminato!', '', 'success');
            loadFiles(currentPage);
        },
        onError: (error) => {
            Swal.fire('Errore', error.message, 'error');
        }
    });
};
```

---

## Refresh

```typescript
const handleRefreshAll = () => {
    loadFiles(currentPage);
    loadSharedFiles();
    fetchLinks();
};
```
