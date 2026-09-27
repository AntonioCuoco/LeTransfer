import { decryptChunkFramed, encryptedChunkSizeV2, encryptedSizeV2 } from './crypto'

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
 * Il dettaglio tecnico di un errore, da mettere **in coda** al messaggio mostrato.
 *
 * Non è cosmesi. Un download cifrato fallisce in un posto che nessun log può raggiungere: il
 * server ha già fatto il suo lavoro (firma l'URL e non vede altro), quindi nei log di Fly non
 * comparirà mai niente. Il toast è l'**unico** punto in cui quell'informazione esiste, e se lo
 * si sostituisce con una frase generica l'errore non è più diagnosticabile da nessuna parte.
 *
 * Vale doppio per Web Crypto: `decryptChunkFramed` fallisce con un `OperationError` **senza
 * messaggio**, quindi il nome della classe è letteralmente tutto ciò che il browser concede.
 */
export function technicalDetail(error: unknown): string {
  if (error instanceof Error) return error.message ? `${error.name}: ${error.message}` : error.name
  return String(error)
}

/**
 * Base di tutti gli errori che portano un motivo **già scritto per chi legge**.
 *
 * L'esistenza di questa base è la regola: un errore o sa dire perché è successo — e allora il
 * suo messaggio arriva intatto all'utente — oppure non lo sa, e allora chi lo mostra ci mette
 * il proprio testo **più** il dettaglio tecnico. Quello che non deve più succedere è la terza
 * via di prima: un errore che sapeva il motivo, coperto da una frase generica del chiamante.
 */
export class UserFacingError extends Error {}

/**
 * Un errore del download con un motivo **da dire all'utente così com'è**: risposta dello
 * storage, rete assente, file troncato, metadati che non corrispondono all'oggetto.
 *
 * Perché esiste: prima lo storage che rispondeva 403 (link firmato scaduto) diventava un
 * generico «Download non riuscito», e i chiamanti lo coprivano con «errore durante la
 * decifratura» — un'altra causa, che manda a cercare il guasto dove non è.
 */
export class DownloadError extends UserFacingError {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'DownloadError'
  }
}

/**
 * La decifratura di un chunk è fallita: il tag GCM non torna.
 *
 * Perché merita una classe propria: **quale** chunk non torna separa due cause lontanissime,
 * e senza l'indice restano indistinguibili sotto lo stesso «errore di decifratura».
 *  • fallisce il **primo** chunk → la chiave nel link non è quella del file, oppure
 *    `chunkSize`/`originalSize` non sono quelli con cui è stato cifrato (metadati disallineati);
 *  • fallisce un chunk **in mezzo** → i byte sono corrotti o manomessi, e la chiave va bene.
 */
export class DecryptionError extends UserFacingError {
  constructor(readonly chunkIndex: number, readonly totalChunks: number, readonly reason: unknown) {
    super(
      chunkIndex === 0
        ? `Il primo blocco non si apre con questa chiave: o la chiave nel link non è quella del file, o i metadati (dimensione e dimensione del blocco) non corrispondono all'oggetto cifrato. [${technicalDetail(reason)}]`
        : `File corrotto: il blocco ${chunkIndex + 1} di ${totalChunks} non ha superato il controllo di integrità — la chiave è giusta, i byte no. [${technicalDetail(reason)}]`,
    )
    this.name = 'DecryptionError'
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

/**
 * Il testo da mostrare per un errore di download, decifratura o salvataggio.
 *
 * Chi sa dire il motivo passa intatto; chi non lo sa conserva la frase del chiamante **ma si
 * porta dietro il dettaglio tecnico fra parentesi quadre**. Nessun errore arriva più all'utente
 * spogliato di tutto: un toast che dice solo «errore durante la decifratura» non lascia niente
 * su cui indagare, e fuori dal browser quel dato non esiste da nessuna parte.
 */
export function downloadErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message
  return `${fallback} [${technicalDetail(error)}]`
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
    if (!response.body) {
      // Nessun body leggibile: su un browser vecchio significa che `fetch` non espone lo
      // stream della risposta. È un limite della piattaforma, non un file rotto — e dirlo
      // evita di mandare a cercare il guasto nella chiave.
      throw new DownloadError('Questo browser non espone il contenuto della risposta in streaming: aprilo con Chrome, Edge o Firefox aggiornati.')
    }
    const reader = response.body.getReader()

    // Coerenza fra metadati e oggetto, PRIMA di decifrare. Se l'oggetto non è grande quanto i
    // metadati prevedono, la decifratura fallirebbe comunque — ma con un «la chiave non apre
    // il file», che manda a cercare il guasto sulla chiave invece che sui metadati. Qui si
    // dicono i due numeri e la diagnosi è immediata.
    // Solo su 200 e solo se l'header c'è: con una risposta chunked non arriva, e va bene così.
    const declaredLength = response.status === 200 ? response.headers.get('content-length') : null
    if (declaredLength !== null) {
      const actual = Number(declaredLength)
      const expected = encryptedSizeV2(originalSize, chunkSize)
      if (Number.isFinite(actual) && actual !== expected) {
        throw new DownloadError(
          `L'oggetto cifrato è di ${actual} byte, ma i metadati ne prevedono ${expected} ` +
          `(dimensione in chiaro ${originalSize}, blocco ${chunkSize}): i metadati non corrispondono all'oggetto nello storage.`,
        )
      }
    }

    const totalChunks = Math.max(1, Math.ceil(originalSize / chunkSize))
    let buffer = new Uint8Array(0)
    let index = 0
    let decrypted = 0

    // Decifra tutti i chunk completi presenti nel buffer.
    const drain = async () => {
      while (index < totalChunks) {
        const size = encryptedChunkSizeV2(index, originalSize, chunkSize)
        if (buffer.length < size) break
        let plain: ArrayBuffer
        try {
          plain = await decryptChunkFramed(buffer.subarray(0, size), key, index)
        } catch (err) {
          // Web Crypto lancia un OperationError muto: qui prende l'indice del chunk, che è
          // l'unico dato in grado di separare «chiave sbagliata» da «file corrotto».
          throw new DecryptionError(index, totalChunks, err)
        }
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
