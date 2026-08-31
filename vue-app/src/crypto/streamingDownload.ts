import { decryptChunkFramed, encryptedChunkSizeV2 } from './crypto'

// Download + decifratura in STREAMING per i file in formato v2 (#6).
//
// L'oggetto remoto è la sequenza dei chunk [IV 12B][ciphertext+tag 16B]. Si legge lo stream della
// risposta, si bufferizza fino ad avere un chunk completo, lo si decifra e lo si scrive subito.
// RAM richiesta ≈ 1-2 chunk, indipendentemente dalla dimensione del file.
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
// Baseline decisa: FSA su Chromium + fallback Blob altrove. Il formato è specificato in README.md §3.

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

/** L'utente ha annullato il dialogo "salva con nome" (non è un errore). */
export class DownloadCancelled extends Error {
  constructor() {
    super('Download annullato')
    this.name = 'DownloadCancelled'
  }
}

export interface DownloadV2Options {
  url: string
  key: CryptoKey
  chunkSize: number // dimensione del chunk IN CHIARO
  originalSize: number
  fileName: string
  onProgress?: (decryptedBytes: number, totalBytes: number) => void
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

const saveBlob = (parts: BlobPart[], fileName: string) => {
  const blob = new Blob(parts)
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}

/**
 * Motore comune: scarica, decifra chunk per chunk e consegna il chiaro al chiamante.
 * Sta qui una volta sola perché download-su-disco e anteprima-in-memoria devono
 * decifrare **esattamente** allo stesso modo: duplicare questo ciclo significherebbe
 * prima o poi avere due interpretazioni diverse dello stesso formato.
 */
async function streamDecrypt(
  url: string,
  key: CryptoKey,
  chunkSize: number,
  originalSize: number,
  onPlainChunk: (plain: ArrayBuffer) => Promise<void> | void,
  onProgress?: (decryptedBytes: number, totalBytes: number) => void,
): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new Error('Download non riuscito')
  const reader = response.body.getReader()

  const totalChunks = Math.max(1, Math.ceil(originalSize / chunkSize))
  let buffer = new Uint8Array(0)
  let index = 0
  let decrypted = 0

  // Decifra tutti i chunk completi presenti nel buffer.
  const drain = async () => {
    while (index < totalChunks) {
      const size = encryptedChunkSizeV2(index, originalSize, chunkSize)
      if (buffer.length < size) break
      const plain = await decryptChunkFramed(buffer.subarray(0, size), key, index)
      await onPlainChunk(plain)
      decrypted += plain.byteLength
      onProgress?.(decrypted, originalSize)
      buffer = buffer.slice(size) // scarta il chunk consumato: il buffer resta ≈ 1 chunk
      index++
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (value) {
      buffer = concat(buffer, value)
      await drain()
    }
    if (done) break
  }
  await drain()

  // Se mancano chunk o avanzano byte, il file è troncato/corrotto (o il tag GCM non tornerebbe).
  if (index !== totalChunks) throw new Error('File incompleto o corrotto')
}

export async function downloadAndDecryptV2(options: DownloadV2Options): Promise<void> {
  const { url, key, chunkSize, originalSize, fileName, onProgress } = options

  // Se scriviamo su disco, chiediamo il file PRIMA di scaricare (il picker richiede un gesto utente).
  let writable: WritableFileStream | null = null
  if (supportsStreamingToDisk()) {
    try {
      const handle = await window.showSaveFilePicker!({ suggestedName: fileName })
      writable = await handle.createWritable()
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') throw new DownloadCancelled()
      throw err
    }
  }

  const blobParts: BlobPart[] = []

  try {
    await streamDecrypt(
      url,
      key,
      chunkSize,
      originalSize,
      async (plain) => {
        if (writable) await writable.write(plain)
        else blobParts.push(plain)
      },
      onProgress,
    )
    if (writable) await writable.close()
    else saveBlob(blobParts, fileName)
  } catch (err) {
    try { await writable?.abort?.() } catch { /* ignore */ }
    throw err
  }
}

/** Oltre questa soglia un'anteprima in memoria non si tenta nemmeno. */
export const PREVIEW_SIZE_LIMIT = 25 * 1024 * 1024 // 25 MB

export interface PreviewOptions {
  url: string
  key: CryptoKey
  chunkSize: number
  originalSize: number
  mimeType?: string
  onProgress?: (decryptedBytes: number, totalBytes: number) => void
}

/**
 * Decifra **in memoria** e restituisce un Blob, senza toccare il disco né avviare un
 * download. Serve alle anteprime locali: per un file cifrato il server non può
 * generare nessuna miniatura — non ha modo di guardarci dentro — quindi l'anteprima
 * o la fa il browser di chi riceve, o non esiste.
 *
 * ⚠️ A differenza del download, qui il file **sta tutto in RAM**: da usare solo sotto
 * `PREVIEW_SIZE_LIMIT`. Chi chiama deve revocare l'object URL quando ha finito.
 */
export async function decryptToBlob(options: PreviewOptions): Promise<Blob> {
  const { url, key, chunkSize, originalSize, mimeType, onProgress } = options

  if (originalSize > PREVIEW_SIZE_LIMIT) {
    throw new Error('File troppo grande per l’anteprima in memoria')
  }

  const parts: BlobPart[] = []
  await streamDecrypt(url, key, chunkSize, originalSize, (plain) => { parts.push(plain) }, onProgress)
  return new Blob(parts, mimeType ? { type: mimeType } : undefined)
}

export interface DecryptStreamOptions {
  url: string
  key: CryptoKey
  chunkSize: number
  originalSize: number
  onProgress?: (decryptedBytes: number, totalBytes: number) => void
}

/**
 * Decifra verso un **ReadableStream** di chiaro, senza scrivere su disco né riempire
 * la RAM: i chunk escono man mano che arrivano.
 *
 * Nasce per l'export "scarica tutto", dove il chiaro non è la destinazione finale ma
 * l'ingresso di un archivio zip prodotto anch'esso in streaming. È lo stesso motore
 * di `downloadAndDecryptV2` e `decryptToBlob` — cambia solo dove va a finire il chiaro,
 * ed è deliberato: tre interpretazioni diverse dello stesso formato sono tre occasioni
 * di divergere.
 *
 * **Contropressione.** `pull` decifra solo quando il consumatore chiede: se lo zip è
 * più lento della rete, la decifratura rallenta invece di accumulare in memoria.
 */
export function decryptToStream(options: DecryptStreamOptions): ReadableStream<Uint8Array> {
  const { url, key, chunkSize, originalSize, onProgress } = options

  let pump: Promise<void> | null = null

  return new ReadableStream<Uint8Array>({
    start(controller) {
      pump = streamDecrypt(
        url,
        key,
        chunkSize,
        originalSize,
        (plain) => { controller.enqueue(new Uint8Array(plain)) },
        onProgress,
      )
        .then(() => controller.close())
        .catch((err) => controller.error(err))
    },
    cancel() {
      // Il consumatore ha mollato (archivio annullato): non c'è niente da chiudere a
      // mano, ma teniamo il riferimento perché la promise non risulti non gestita.
      void pump
    },
  })
}
