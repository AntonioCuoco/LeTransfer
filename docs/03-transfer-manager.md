# 🔄 Transfer Manager

## Overview

Il Transfer Manager è un sistema centralizzato per gestire tutti i trasferimenti (upload e download) con:
- **Code di attesa** per rispettare limiti di concorrenza
- **Controlli** (pausa, riprendi, annulla)
- **Progress tracking** in tempo reale

Implementato con uno **store Pinia** (`useTransferStore`) che mantiene lo stato e lo scheduler,
più un componente invisibile (`UploadQueueManager`) che esegue gli upload reali tramite un pool di
istanze del composable `useS3MultipartUpload`.

---

## Architettura

```
┌────────────────────────────────────────────────────────────┐
│              useTransferStore (Pinia store)                 │
│  - transfers: TransferItem[]                                │
│  - addUpload(file) → id                                     │
│  - addDownload(url, name, size?) → id                       │
│  - pauseTransfer(id) / resumeTransfer(id)                   │
│  - cancelTransfer(id)                                        │
│  - clearCompleted()                                         │
│  - watch(transfers) → scheduler (promuove la coda)          │
│  - DownloadRunner (classe interna allo store)               │
└────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                        ▼
┌────────────────────────────┐        ┌────────────────────────┐
│   UploadQueueManager.vue    │        │  TransferStatusPanel.vue│
│  (invisibile, montato 1x)   │        │  - lista trasferimenti  │
│  pool di useS3MultipartUpload│       │  - progress bar         │
│  slot → transferId           │       │  - controlli per item   │
└────────────────────────────┘        └────────────────────────┘
```

> A differenza di React non c'è un `Provider` che wrappa l'app: lo store Pinia è accessibile
> ovunque con `useTransferStore()`. Basta montare **una sola volta** `<UploadQueueManager />`
> (tipicamente in `App.vue` o nella pagina principale) perché gli upload partano.

---

## Limiti di Concorrenza

```ts
// stores/transfer.ts
const LIMITS = {
  uploadLarge: { files: 3, parts: 2 }, // max 3 file grandi (>100MB), 2 chunk paralleli per file
  uploadSmall: { files: 6 },           // max 6 file piccoli simultanei
  download:    { files: 2 },           // max 2 download simultanei
}
```

Il pool di `UploadQueueManager` è dimensionato di conseguenza: `MAX_SLOTS = 9` (3 grandi + 6 piccoli).

---

## Tipi

```ts
// types/transfer.ts
type TransferStatus =
  | 'queued' | 'initializing' | 'uploading'
  | 'downloading' | 'paused' | 'completed'
  | 'error' | 'cancelled'

interface TransferProgress {
  percentage: number
  loadedBytes: number
  totalBytes: number
  speed?: number
  eta?: number
}

interface TransferItem {
  id: string
  type: 'upload' | 'download'
  name: string
  size?: number
  mimeType?: string
  status: TransferStatus
  progress: TransferProgress
  fileOrUrl: File | string
  createdAt: number
  controls?: TransferControl   // { pause, resume, cancel }
}
```

---

## Componenti e store

### useTransferStore (Pinia)

Sostituisce il `TransferContext`/`TransferProvider` di React. Espone stato e azioni:

```ts
import { useTransferStore } from '@/src/stores/transfer'

const store = useTransferStore()
const id = store.addUpload(file)       // accoda un upload → ritorna l'id
store.pauseTransfer(id)
store.cancelTransfer(id)
```

### UploadQueueManager.vue

Componente **invisibile** che esegue gli upload. Pre-alloca a setup time un pool di istanze
`useS3MultipartUpload()` (i composable non si possono chiamare dentro funzioni/classi), assegna uno
slot libero a ogni transfer in stato `initializing`, registra i controlli (pause/resume/cancel) sullo
store e sincronizza `instance.state` → `store.updateTransfer` via `watch`.

```ts
const pool = Array.from({ length: MAX_SLOTS }, () => useS3MultipartUpload())
// watch(store.transfers) → per ogni upload 'initializing' senza slot:
//   getFreeSlot() → assignments.set(slot, transfer.id)
//   store.registerControls(id, { pause, resume, cancel })
//   instance.uploadFile(file)
```

> Nota: nello store `transfer.ts` la classe `UploadRunner` è solo un **segnaposto**; la logica di
> upload reale vive in `UploadQueueManager.vue` tramite il pool di composable. La logica di
> **download** invece sta nella classe `DownloadRunner` interna allo store.

### TransferStatusPanel.vue

UI per visualizzare i trasferimenti: progress bar per file, pulsanti pausa/riprendi/annulla,
velocità e tempo rimanente. Legge direttamente `store.transfers`.

---

## Utilizzo

```vue
<script setup lang="ts">
import { useTransferStore } from '@/src/stores/transfer'
import TransferStatusPanel from '@/src/components/TransferStatusPanel.vue'

const store = useTransferStore()

const handleUpload = (file: File) => {
  const id = store.addUpload(file)
  console.log('Transfer ID:', id)
}
</script>

<template>
  <button @click="handleUpload(myFile)">Upload</button>
  <TransferStatusPanel />
</template>
```

> `<UploadQueueManager />` va montato una sola volta a livello app perché gli upload accodati
> partano effettivamente.

---

## Scheduler (Coda)

Lo scheduler sostituisce lo `useEffect` di React con un `watch(transfers, …, { deep: true })`
**dentro lo store**. Automaticamente:
1. Conta i trasferimenti attivi per tipo (upload grandi/piccoli, download).
2. Promuove gli elementi `queued` a `initializing` quando c'è spazio.
3. Rispetta i limiti di concorrenza e ripulisce i runner dei transfer conclusi.

```ts
// stores/transfer.ts
watch(transfers, (list) => {
  const activeUploadsLarge = list.filter(t =>
    t.type === 'upload' && t.fileOrUrl instanceof File &&
    t.fileOrUrl.size > 100 * 1024 * 1024 &&
    ['initializing', 'uploading'].includes(t.status)
  ).length

  const queued = [...list].reverse().filter(t => t.status === 'queued')

  queued.forEach(item => {
    if (runners.value.has(item.id)) return
    if (item.type === 'upload' && item.fileOrUrl instanceof File) {
      const isLarge = item.fileOrUrl.size > 100 * 1024 * 1024
      const canStart = isLarge
        ? activeUploadsLarge < LIMITS.uploadLarge.files
        : activeUploadsSmall < LIMITS.uploadSmall.files
      if (canStart) updateTransfer(item.id, { status: 'initializing' })
    }
    // ... download: new DownloadRunner(item, updateTransfer, registerControls)
  })
}, { deep: true })
```
