import { decryptChunkFramed, encryptedChunkSizeV2 } from './crypto'

// Download + decifratura in STREAMING per i file in formato v2 (#6) — il NUCLEO, senza browser.
//
// L'oggetto remoto è la sequenza dei chunk [IV 12B][ciphertext+tag 16B]. Si legge lo stream della
// risposta, si bufferizza fino ad avere un chunk completo, lo si decifra e lo si consegna subito.
// RAM richiesta ≈ 1-2 chunk, indipendentemente dalla dimensione del file.
//
// Dove finisce il decifrato non è affare di questo file (roadmap O3.1): lo decide un
// `PlaintextSink`. Nel browser: disco o Blob (browserDownload.ts), memoria per le anteprime,
// stream per l'export zip. In Node: un file, lo stdout, un array nei test. Qui ci sono solo
// `fetch` e Web Crypto, che Node 22 ha già. Il formato è specificato in README.md §3.

/** L'utente ha annullato il dialogo "salva con nome" (non è un errore). */
export class DownloadCancelled extends Error {
  constructor() {
    super('Download annullato')
    this.name = 'DownloadCancelled'
  }
}

/**
 * Un errore del download con un motivo **da dire all'utente così com'è**: risposta dello
 * storage, rete assente, file troncato, limite dell'anteprima.
 *
 * Perché esiste: prima lo storage che rispondeva 403 (link firmato scaduto) diventava un
 * generico «Download non riuscito», e i chiamanti lo coprivano con «errore durante la
 * decifratura» — un'altra causa, che manda a cercare il guasto dove non è. Tutto ciò che NON
 * è un DownloadError (es. un `OperationError` di Web Crypto, testo tecnico) resta al testo
 * di ripiego del chiamante.
 */
export class DownloadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'DownloadError'
  }
}

function storageErrorMessage(status: number): string {
  if (status === 403) return 'Il link per scaricare il file è scaduto o non è più valido: riprova.'
  if (status === 404) return 'Il file non è più presente nello storage.'
  if (status >= 500) return `Lo storage ha risposto con un errore (HTTP ${status}): riprova tra poco.`
  return `Lo storage ha rifiutato il download (HTTP ${status}).`
}

/** Lancia un DownloadError se lo storage non ha risposto con successo. `fetch` da solo non lo fa. */
export function assertStorageResponse(response: Response): void {
  if (!response.ok) throw new DownloadError(storageErrorMessage(response.status), response.status)
}

/** Il testo da mostrare per un errore di download o decifratura. */
export function downloadErrorMessage(error: unknown, fallback: string): string {
  return error instanceof DownloadError ? error.message : fallback
}

/** Un file v2 da scaricare e decifrare. */
export interface EncryptedSource {
  url: string
  key: CryptoKey
  chunkSize: number // dimensione del chunk IN CHIARO
  originalSize: number
  onProgress?: (decryptedBytes: number, totalBytes: number) => void
}

/**
 * Adattatore di sink (roadmap O3.1): **dove finiscono i byte decifrati**.
 *
 * `write` riceve i chunk in chiaro nell'ordine giusto e già autenticati dal tag GCM; `close`
 * arriva solo se il file è completo. Se qualcosa va storto a metà arriva invece `abort`: un sink
 * che scrive su disco deve scartare quanto scritto, perché un file troncato che sembra intero è
 * peggio di nessun file.
 */
export interface PlaintextSink {
  write(chunk: Uint8Array<ArrayBuffer>): Promise<void> | void
  close(): Promise<void> | void
  abort?(reason: unknown): Promise<void> | void
}

const concat = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/**
 * Il motore unico: scarica, decifra chunk per chunk e consegna il chiaro al sink.
 * Sta qui una volta sola perché disco, anteprima ed export devono decifrare **esattamente**
 * allo stesso modo: duplicare questo ciclo significherebbe prima o poi avere interpretazioni
 * diverse dello stesso formato.
 */
export async function decryptToSink(source: EncryptedSource, sink: PlaintextSink): Promise<void> {
  const { url, key, chunkSize, originalSize, onProgress } = source
  try {
    let response: Response
    try {
      response = await fetch(url)
    } catch {
      throw new DownloadError('Non riusciamo a raggiungere lo storage: controlla la connessione e riprova.')
    }
    assertStorageResponse(response)
    if (!response.body) throw new DownloadError('Lo storage non ha restituito il contenuto del file.')
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
        await sink.write(new Uint8Array(plain))
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
    if (index !== totalChunks) throw new DownloadError('Il file è arrivato incompleto o corrotto: riprova a scaricarlo.')
    await sink.close()
  } catch (err) {
    try { await sink.abort?.(err) } catch { /* l'errore da riportare è quello originale */ }
    throw err
  }
}

/** Oltre questa soglia un'anteprima in memoria non si tenta nemmeno. */
export const PREVIEW_SIZE_LIMIT = 25 * 1024 * 1024 // 25 MB

export interface PreviewOptions extends EncryptedSource {
  mimeType?: string
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
  if (options.originalSize > PREVIEW_SIZE_LIMIT) {
    throw new DownloadError('Il file è troppo grande per l’anteprima: scaricalo per aprirlo.')
  }

  const parts: BlobPart[] = []
  await decryptToSink(options, { write: (chunk) => { parts.push(chunk) }, close: () => {} })
  return new Blob(parts, options.mimeType ? { type: options.mimeType } : undefined)
}

export type DecryptStreamOptions = EncryptedSource

/**
 * Decifra verso un **ReadableStream** di chiaro, senza scrivere su disco né riempire
 * la RAM: i chunk escono man mano che arrivano.
 *
 * Nasce per l'export "scarica tutto", dove il chiaro non è la destinazione finale ma
 * l'ingresso di un archivio zip prodotto anch'esso in streaming. Stesso motore degli altri
 * sink — cambia solo dove va a finire il chiaro.
 */
export function decryptToStream(options: DecryptStreamOptions): ReadableStream<Uint8Array> {
  let pump: Promise<void> | null = null

  return new ReadableStream<Uint8Array>({
    start(controller) {
      pump = decryptToSink(options, {
        write: (chunk) => { controller.enqueue(chunk) },
        close: () => { controller.close() },
      }).catch((err) => controller.error(err))
    },
    cancel() {
      // Il consumatore ha mollato (archivio annullato): non c'è niente da chiudere a
      // mano, ma teniamo il riferimento perché la promise non risulti non gestita.
      void pump
    },
  })
}
