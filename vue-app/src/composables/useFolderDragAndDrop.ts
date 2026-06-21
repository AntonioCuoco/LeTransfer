import { ref } from 'vue'
import Swal from 'sweetalert2'

interface UseFolderDragAndDropOptions {
  onFilesDropped: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
}

const supportsFolderDnD = 'DataTransferItem' in window && 'webkitGetAsEntry' in DataTransferItem.prototype

const traverseFileTree = async (item: FileSystemEntry): Promise<File[]> => {
  if (item.isFile) {
    return new Promise((resolve) => {
      (item as FileSystemFileEntry).file(file => resolve([file]), () => resolve([]))
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
      return (await Promise.all(entries.map(e => traverseFileTree(e)))).flat()
    } catch { return [] }
  }
  return []
}

export const useFolderDragAndDrop = ({ onFilesDropped, accept, multiple = true, disabled = false }: UseFolderDragAndDropOptions) => {
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

    if (!supportsFolderDnD) {
      Swal.fire({ icon: 'info', title: 'Browser non supportato', text: "Questo browser non supporta il drag & drop delle cartelle.", confirmButtonColor: '#724CF9' })
      return
    }

    const items = e.dataTransfer?.items
    let files: File[] = []
    if (items?.length) {
      const promises: Promise<File[]>[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry()
        if (entry) promises.push(traverseFileTree(entry))
      }
      files = (await Promise.all(promises)).flat()
    }

    const valid = files.filter(isValidFileType)
    if (!valid.length) return
    onFilesDropped(multiple ? valid : [valid[0]])
  }

  return { isDragOver, supportsFolderDnD, dropZoneRef, dragProps: { onDragEnter, onDragLeave, onDragOver, onDrop } }
}
