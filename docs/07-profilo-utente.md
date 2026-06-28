# 👤 Profilo Utente

## Overview

La pagina profilo (`/profile` → `vue-app/src/pages/Profile.vue`) mostra:
- Header con info utente e immagine profilo
- Statistiche file (caricati, ricevuti, etc.)
- Tabella file con tabs e filtri
- Gestione link condivisi

---

## Architettura

```
┌─────────────────────────────────────────────────────────────┐
│                      Profile.vue                             │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  ProfileHeader                          │ │
│  │  - Avatar con upload immagine · Nome · Email           │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  FileStatsGrid                          │ │
│  │  [Caricati] [Inviati] [Ricevuti] [Eliminati]           │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Tabs: [I Miei File] [Ricevuti] [Link Condivisi]       │ │
│  │  Filtro tipo + FilesTable / SharedLinksTable.vue       │ │
│  │  Paginazione                                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Componente: Profile.vue

### Stato (`ref`)

In React era `useState`; in Vue sono `ref`:

```ts
import { ref } from 'vue'

const activeTab = ref('uploaded')
const selectedFileType = ref('all')
const currentPage = ref(1)
const stats = ref<FileStats>({
  uploaded: 0, downloaded: 0, sent: 0, received: 0, archived: 0, deleted: 0,
})
```

### Composable utilizzati

```ts
const { files, isLoading, loadFiles, deleteFile, downloadFile } = useFileFromDynamoDB()
const { sharedFiles, getSharedWithMe, isLoadingShared } = useShareFile()
const { links, fetchLinks, revokeLink, regenerateLink, updateLink } = useSharedLinks()
```

---

## Tabs

### Tab 1 — I Miei File

```ts
const loadMyFiles = async (page = 1) => {
  const result = await loadFiles({
    limit: ITEMS_PER_PAGE,
    fileType: selectedFileType.value !== 'all' ? selectedFileType.value : undefined,
    onlyOwned: true,
  })
  updateStats(result.length, sharedFiles.value.length)
}
```

### Tab 2 — File Ricevuti

```ts
const loadSharedFiles = async () => {
  await getSharedWithMe() // popola sharedFiles (ref) nel composable
}
```

### Tab 3 — Link Condivisi

Componente Vue con props/eventi (non JSX):

```vue
<SharedLinksTable
  :links="links"
  @revoke="revokeLink"
  @regenerate="regenerateLink"
  @update="updateLink"
/>
```

---

## Componente: ProfileHeader

`React.FC<Props>` diventa un SFC con `defineProps`:

```vue
<script setup lang="ts">
import { useProfileImage } from '@/src/composables/useProfileImage'

defineProps<{ user: { name: string; email: string; avatarUrl?: string } }>()
const { uploadProfileImage, profileImageUrl } = useProfileImage()
</script>

<template>
  <div class="profile-header">
    <Avatar :image="profileImageUrl ?? undefined" @click="handleAvatarClick" />
    <div>
      <h1>{{ user.name }}</h1>
      <p>{{ user.email }}</p>
    </div>
  </div>
</template>
```

---

## Componente: FileStatsGrid

```vue
<script setup lang="ts">
const props = defineProps<{ stats: FileStats }>()

const items = computed(() => [
  { label: 'Caricati', value: props.stats.uploaded, icon: 'pi pi-upload' },
  { label: 'Inviati',  value: props.stats.sent,     icon: 'pi pi-send' },
  { label: 'Ricevuti', value: props.stats.received, icon: 'pi pi-inbox' },
  { label: 'Eliminati',value: props.stats.deleted,  icon: 'pi pi-trash' },
])
</script>

<template>
  <div class="stats-grid">
    <StatCard v-for="item in items" :key="item.label" v-bind="item" />
  </div>
</template>
```

---

## Filtro Tipo File

```ts
const FILE_TYPE_FILTERS = [
  { value: 'all', label: 'Tutti' },
  { value: 'image', label: 'Immagini' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documenti' },
  { value: 'archive', label: 'Archivi' },
  { value: 'application', label: 'Applicazioni' },
]

const handleFileTypeChange = (fileType: string) => {
  selectedFileType.value = fileType
  currentPage.value = 1
  loadMyFiles(1)
}
```

---

## Paginazione

```ts
const ITEMS_PER_PAGE = 10

const currentPageFiles = computed(() => {
  const start = (currentPage.value - 1) * ITEMS_PER_PAGE
  return filteredFiles.value.slice(start, start + ITEMS_PER_PAGE)
})

const handlePageChange = (page: number) => { currentPage.value = page }
```
> Paginazione lato client per i file già caricati; per dataset grandi usare la paginazione lato
> server con cursor (vedi `docs/06-gestione-file-dynamodb.md`).

---

## Composable: useProfileImage

File: `vue-app/src/composables/useProfileImage.ts`.

```ts
const {
  profileImageUrl,     // Ref<string | null>
  isUploading,         // Ref<boolean>
  uploadProfileImage,  // (file: File) => Promise<void>
  fetchProfileImage,   // () => Promise<void>
} = useProfileImage()
```

L'immagine viene salvata in `uploads/profiles/{userId}/...` (vedi `BACKEND_API_DOCS.md` §3, struttura key S3).

---

## Conversione Dati per Tabella

```ts
const toTableFile = (file: DynamoDBFile): TableFile => ({
  id: file.fileId,
  name: file.fileName,
  type: file.fileType,
  size: file.fileSize,
  status: file.isShared ? 'sent' : 'uploaded',
  date: file.uploadedAt,
  originalFile: file,
  isShared: file.isShared,
})

const sharedToTableFile = (file: SharedFile): TableFile => ({
  id: file.shareId,
  name: file.fileName,
  type: file.fileType,
  size: formatFileSize(file.fileSize),
  status: 'received',
  date: file.createdAt,
  isReceived: true,
  senderEmail: file.senderEmail,
})
```

---

## Azioni File

```ts
const handleDownloadFile = (file: DynamoDBFile) => downloadFile(file)

const handleShareFile = (file: DynamoDBFile) => {
  selectedFileForShare.value = file
  shareModalVisible.value = true
}

const handleDeleteFile = async (fileId: string) => {
  try {
    await deleteFile(fileId)
    Swal.fire('Eliminato!', '', 'success')
    loadMyFiles(currentPage.value)
  } catch (e) {
    Swal.fire('Errore', (e as Error).message, 'error')
  }
}
```

---

## Refresh

```ts
const handleRefreshAll = () => {
  loadMyFiles(currentPage.value)
  loadSharedFiles()
  fetchLinks()
}
```
