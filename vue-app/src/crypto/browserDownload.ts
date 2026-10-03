import {
  decryptRangesToSink,
  decryptToSink,
  DownloadCancelled,
  RANGED_MIN_SIZE,
  RangeNotSupported,
  UserFacingError,
  technicalDetail,
  type PlaintextSink,
  type PositionalSink,
  type RangedSource,
} from './streamingDownload'

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
interface PositionedWrite {
  type: 'write'
  position: number
  data: BufferSource
}
interface WritableFileStream {
  write(data: BufferSource | Blob | PositionedWrite): Promise<void>
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

/**
 * Il file è stato decifrato, ma il browser non è riuscito a **salvarlo**.
 *
 * Perché serve una classe a parte: prima un guasto nel salvataggio arrivava al `catch` del
 * chiamante insieme a tutto il resto, e diventava «errore durante la decifratura». Sui browser
 * senza File System Access API (Firefox, Safari, e **tutti** i Chromium su Android, Samsung
 * Internet compreso) il file intero passa dalla RAM: lì il guasto tipico è la memoria, che con
 * la chiave non c'entra nulla.
 */
export class SaveError extends UserFacingError {
  constructor(message: string, readonly reason: unknown) {
    super(`${message} [${technicalDetail(reason)}]`)
    this.name = 'SaveError'
  }
}

const formatMB = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/**
 * Sink su disco. Il picker va aperto PRIMA di scaricare: il browser lo concede solo dopo un gesto
 * dell'utente. Scrive in fila (`write`) o a una posizione (`writeAt`, per il download a tratti).
 */
async function openDiskSink(fileName: string): Promise<PlaintextSink & PositionalSink> {
  let writable: WritableFileStream
  try {
    const handle = await window.showSaveFilePicker!({ suggestedName: fileName })
    writable = await handle.createWritable()
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw new DownloadCancelled()
    throw new SaveError('Il browser non ha concesso di scrivere il file sul disco.', err)
  }
  let written = 0
  let position = 0
  // Una scrittura alla volta: lo stream del file non ne accetta due insieme, e i tratti del
  // download parallelo arrivano quando vogliono. La coda tiene anche il passo: chi scarica aspetta
  // che il disco abbia scritto prima di decifrare altro.
  let queue: Promise<void> = Promise.resolve()
  const writeAt = (at: number, chunk: Uint8Array<ArrayBuffer>): Promise<void> => {
    const done = queue.then(async () => {
      try {
        await writable.write({ type: 'write', position: at, data: chunk })
      } catch (err) {
        // Disco pieno, permesso revocato, cartella sparita: il decifrato era giusto.
        throw new SaveError(`Scrittura sul disco interrotta dopo ${formatMB(written)} (disco pieno o permesso revocato?).`, err)
      }
      written += chunk.byteLength
    })
    queue = done.catch(() => {})
    return done
  }
  return {
    writeAt,
    write: async (chunk) => {
      const at = position
      position += chunk.byteLength
      await writeAt(at, chunk)
    },
    close: async () => {
      try {
        await writable.close()
      } catch (err) {
        throw new SaveError('Il file è stato decifrato ma il browser non è riuscito a chiuderlo sul disco.', err)
      }
    },
    abort: async () => { await writable.abort?.() },
  }
}

/** Sink Blob (Firefox/Safari/Android): accumula, e solo a file completo avvia il download con un link. */
function blobDownloadSink(fileName: string): PlaintextSink {
  const parts: BlobPart[] = []
  let accumulated = 0
  return {
    write: (chunk) => {
      try {
        parts.push(chunk)
      } catch (err) {
        throw new SaveError(`Memoria del browser esaurita dopo ${formatMB(accumulated)}: su questo dispositivo il file è troppo grande per il download in memoria. Prova da Chrome o Edge su computer.`, err)
      }
      accumulated += chunk.byteLength
    },
    close: () => {
      let objectUrl: string
      try {
        objectUrl = URL.createObjectURL(new Blob(parts))
      } catch (err) {
        // È qui che fallisce un telefono: il file intero in chiaro deve diventare un Blob.
        throw new SaveError(`Il file è stato decifrato (${formatMB(accumulated)}) ma il browser non ha memoria sufficiente per salvarlo. Prova da Chrome o Edge su computer.`, err)
      }
      try {
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        throw new SaveError('Il file è stato decifrato ma il browser ha bloccato l’avvio del download.', err)
      }
      // NON subito: su WebKit (Safari e ogni browser su iOS) revocare l'URL nello stesso tick
      // del click può annullare il download in silenzio — nessun errore, nessun file.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    },
  }
}

export interface DownloadV2Options extends RangedSource {
  fileName: string
}

/**
 * Scarica e decifra un file v2. Su Chrome/Edge, per i file grandi, a tratti su più connessioni,
 * scritti al loro posto sul disco; se il browser o lo storage non accettano le richieste `Range`,
 * in fila su una connessione, come prima. Altrove sempre in fila.
 */
export async function downloadAndDecryptV2(options: DownloadV2Options): Promise<void> {
  if (!supportsStreamingToDisk()) {
    await decryptToSink(options, blobDownloadSink(options.fileName))
    return
  }
  const sink = await openDiskSink(options.fileName)
  if (options.originalSize >= RANGED_MIN_SIZE) {
    try {
      await decryptRangesToSink(options, sink)
      return
    } catch (err) {
      if (!(err instanceof RangeNotSupported)) throw err
      console.info(`[download] ${err.message}: scarico su una connessione.`)
    }
  }
  await decryptToSink(options, sink)
}
