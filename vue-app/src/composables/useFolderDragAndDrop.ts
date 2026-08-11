import { ref } from 'vue'

interface UseFolderDragAndDropOptions {
  onFilesDropped: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
  /**
   * Rimette il **percorso relativo** dentro il nome del file (`foto/mare/uno.jpg`).
   * Serve a chi impacchetta i file in un archivio: senza, l'albero delle cartelle si
   * appiattisce e due `uno.jpg` in sottocartelle diverse si sovrascrivono a vicenda.
   * Default `false` per non cambiare sotto i piedi ai chiamanti che i percorsi non li usano.
   */
  preserveRelativePath?: boolean
}

const supportsFolderDnD = 'DataTransferItem' in window && 'webkitGetAsEntry' in DataTransferItem.prototype

/**
 * `webkitRelativePath` è di sola lettura e per i file **trascinati** resta vuoto (lo
 * valorizza solo `<input webkitdirectory>`): l'unico modo di conservare il percorso è
 * ribattezzare il file. `new File([file], …)` non legge né copia il contenuto — avvolge
 * lo stesso blob, esattamente come fa `file.slice()` nel multipart — quindi resta
 * praticabile anche su una cartella da gigabyte.
 */
const withPathAsName = (file: File, fullPath: string): File => {
  const relative = fullPath.replace(/^\//, '')
  if (!relative || relative === file.name) return file
  return new File([file], relative, { type: file.type, lastModified: file.lastModified })
}

const traverseFileTree = async (item: FileSystemEntry, preservePath: boolean): Promise<File[]> => {
  if (item.isFile) {
    return new Promise((resolve) => {
      (item as FileSystemFileEntry).file(
        file => resolve([preservePath ? withPathAsName(file, item.fullPath) : file]),
        () => resolve([]),
      )
    })
  }
  if (item.isDirectory) {
    const dirReader = (item as FileSystemDirectoryEntry).createReader()
    const getAllEntries = async (): Promise<FileSystemEntry[]> => {
      let all: FileSystemEntry[] = []
      let batch: FileSystemEntry[]
      do {
        batch = await new Promise((res, rej) => dirReader.readEntries(res, rej))
        if (batch.length) all = all.concat(batch)
      } while (batch.length > 0)
      return all
    }
    try {
      const entries = await getAllEntries()
      return (await Promise.all(entries.map(e => traverseFileTree(e, preservePath)))).flat()
    } catch { return [] }
  }
  return []
}

export const useFolderDragAndDrop = ({ onFilesDropped, accept, multiple = true, disabled = false, preserveRelativePath = false }: UseFolderDragAndDropOptions) => {
  const isDragOver = ref(false)
  const dropZoneRef = ref<HTMLDivElement | null>(null)
  let dragCounter = 0

  const isValidFileType = (file: File): boolean => {
    if (!accept) return true
    return accept.split(',').map(t => t.trim()).some(type => {
      if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type.toLowerCase())
      if (type.includes('*')) return file.type.split('/')[0] === type.split('/')[0]
      return file.type === type
    })
  }

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (disabled) return
    dragCounter++
    if (e.dataTransfer?.items?.length) isDragOver.value = true
  }

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (disabled) return
    if (--dragCounter === 0) isDragOver.value = false
  }

  const onDragOver = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (disabled) return
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (disabled) return
    isDragOver.value = false; dragCounter = 0

    // Dove la traversata delle cartelle non esiste, si ripiega sui file semplici:
    // prima qui si apriva una modale "browser non supportato" che rifiutava anche il
    // trascinamento di un singolo file, cioè puniva l'utente per una cosa che
    // funzionava benissimo.
    if (!supportsFolderDnD) {
      const plain = Array.from(e.dataTransfer?.files ?? []).filter(isValidFileType)
      if (plain.length) onFilesDropped(multiple ? plain : [plain[0]])
      return
    }

    const items = e.dataTransfer?.items
    let files: File[] = []
    if (items?.length) {
      const promises: Promise<File[]>[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry()
        if (entry) promises.push(traverseFileTree(entry, preserveRelativePath))
      }
      files = (await Promise.all(promises)).flat()
    }

    const valid = files.filter(isValidFileType)
    if (!valid.length) return
    onFilesDropped(multiple ? valid : [valid[0]])
  }

  return { isDragOver, supportsFolderDnD, dropZoneRef, dragProps: { onDragEnter, onDragLeave, onDragOver, onDrop } }
}
