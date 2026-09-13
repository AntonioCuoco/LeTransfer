import { decryptToSink, DownloadCancelled, type EncryptedSource, type PlaintextSink } from './streamingDownload'

// I sink del BROWSER per il download di un file v2 (roadmap O3.1): l'unica parte del download che
// conosce `window` e `document`. Il motore di decifratura è in streamingDownload.ts e non ne sa nulla.
//
// Dove si scrive il decifrato — progressive enhancement:
//  • Chromium (File System Access API): scrittura DIRETTA su disco → nessun limite di dimensione.
//  • Firefox/Safari (fallback Blob): il browser tiene il Blob su disco → limite pratico ~2 GB.
//
// ⚠️ TODO — superare il limite ~2 GB su Firefox/Safari. Opzioni da valutare:
//  • StreamSaver.js come secondo fallback (Service Worker): sblocca Firefox oltre i 2 GB; Safari
//    resta il caso ostico (streaming download via SW storicamente problematico).
//  • Rivalutare quando/se Firefox e Safari adotteranno la File System Access API.
//  • Monitorare l'Origin Private File System (OPFS) come storage intermedio.
// Baseline decisa: FSA su Chromium + fallback Blob altrove.

interface SaveFilePickerOptions {
  suggestedName?: string
}
interface WritableFileStream {
  write(data: BufferSource | Blob): Promise<void>
  close(): Promise<void>
  abort?(): Promise<void>
}
interface SaveFileHandle {
  createWritable(): Promise<WritableFileStream>
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>
  }
}

/** true se il browser sa scrivere in streaming su disco (Chrome/Edge/Opera). */
export const supportsStreamingToDisk = (): boolean =>
  typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'

/** Limite pratico del fallback Blob (Firefox/Safari): oltre, il download può fallire. */
export const BLOB_DOWNLOAD_LIMIT = 2 * 1024 * 1024 * 1024 // ~2 GB

/**
 * true se stiamo per scaricare un file troppo grande per il fallback Blob del browser corrente.
 * I chiamanti DEVONO avvisare l'utente invece di fallire in silenzio.
 */
export const shouldWarnLargeDownload = (originalSize: number): boolean =>
  !supportsStreamingToDisk() && originalSize > BLOB_DOWNLOAD_LIMIT

/** Sink su disco. Il picker va aperto PRIMA di scaricare: il browser lo concede solo dopo un gesto dell'utente. */
async function openDiskSink(fileName: string): Promise<PlaintextSink> {
  let writable: WritableFileStream
  try {
    const handle = await window.showSaveFilePicker!({ suggestedName: fileName })
    writable = await handle.createWritable()
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw new DownloadCancelled()
    throw err
  }
  return {
    write: (chunk) => writable.write(chunk),
    close: () => writable.close(),
    abort: async () => { await writable.abort?.() },
  }
}

/** Sink Blob (Firefox/Safari): accumula, e solo a file completo avvia il download con un link. */
function blobDownloadSink(fileName: string): PlaintextSink {
  const parts: BlobPart[] = []
  return {
    write: (chunk) => { parts.push(chunk) },
    close: () => {
      const objectUrl = URL.createObjectURL(new Blob(parts))
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    },
  }
}

export interface DownloadV2Options extends EncryptedSource {
  fileName: string
}

export async function downloadAndDecryptV2(options: DownloadV2Options): Promise<void> {
  const sink = supportsStreamingToDisk() ? await openDiskSink(options.fileName) : blobDownloadSink(options.fileName)
  await decryptToSink(options, sink)
}
