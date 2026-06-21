import { ref } from 'vue'

interface UseFileDragAndDropOptions {
  onFilesDropped: (files: File[]) => void
  accept?: string
  multiple?: boolean
  disabled?: boolean
}

export const useFileDragAndDrop = ({ onFilesDropped, accept, multiple = true, disabled = false }: UseFileDragAndDropOptions) => {
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

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (disabled) return
    isDragOver.value = false; dragCounter = 0
    const dropped = Array.from(e.dataTransfer?.files || [])
    if (!dropped.length) return
    const valid = dropped.filter(isValidFileType)
    if (!valid.length) return
    onFilesDropped(multiple ? valid : [valid[0]])
  }

  return { isDragOver, dropZoneRef, dragProps: { onDragEnter, onDragLeave, onDragOver, onDrop } }
}
