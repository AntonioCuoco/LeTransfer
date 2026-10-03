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

const chunkCount = (originalSize: number, chunkSize: number): number => Math.max(1, Math.ceil(originalSize / chunkSize))

/** Byte di ogni chunk oltre al chiaro: IV (12) + tag GCM (16). */
const CHUNK_OVERHEAD = 28

/** Dove inizia il chunk `index` nell'oggetto cifrato: tutti i chunk prima dell'ultimo sono pieni. */
const encryptedChunkOffset = (index: number, chunkSize: number): number => index * (chunkSize + CHUNK_OVERHEAD)

/** Decifra un chunk incorniciato; un tag che non torna diventa un errore che dice quale chunk. */
async function openChunk(framed: Uint8Array, key: CryptoKey, index: number, totalChunks: number): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(await decryptChunkFramed(framed, key, index))
  } catch (err) {
    // Web Crypto lancia un OperationError muto: qui prende l'indice del chunk, che è
    // l'unico dato in grado di separare «chiave sbagliata» da «file corrotto».
    throw new DecryptionError(index, totalChunks, err)
  }
}

/**
 * Ricompone i chunk cifrati `[first, end)` dai pezzi che arrivano dalla rete, di qualunque
 * dimensione, e li consegna interi a `onChunk`, in ordine.
 *
 * ⚡ Ogni byte si copia al più UNA volta. Prima ogni pezzo arrivato dalla rete (~16–64 KB) si
 * concatenava a tutto il già ricevuto: per comporre un chunk da 10 MB si ricopiavano ~800 MB di
 * memoria e si creavano ~160 array temporanei, e su una connessione veloce il browser non stava
 * dietro alla rete (misurato: ~40 MB/s contro ~600 MB/s di adesso). Ora c'è un solo spazio grande
 * quanto un chunk cifrato (il primo è il più grande), riempito al suo posto; e un chunk che arriva
 * intero in un solo pezzo si consegna direttamente da lì, senza copie.
 */
class ChunkAssembler {
  private readonly frame: Uint8Array
  private filled = 0
  private index: number

  constructor(
    private readonly meta: { chunkSize: number; originalSize: number },
    first: number,
    private readonly end: number,
    private readonly onChunk: (framed: Uint8Array, index: number) => Promise<void>,
  ) {
    this.index = first
    this.frame = new Uint8Array(encryptedChunkSizeV2(0, meta.originalSize, meta.chunkSize))
  }

  /** Il prossimo chunk atteso: dopo un'interruzione, da qui riparte la richiesta. */
  get next(): number {
    return this.index
  }

  get complete(): boolean {
    return this.index >= this.end
  }

  /** Un pezzo dalla rete. I byte oltre l'ultimo chunk si ignorano. */
  async feed(piece: Uint8Array): Promise<void> {
    let offset = 0
    while (offset < piece.length && this.index < this.end) {
      const size = encryptedChunkSizeV2(this.index, this.meta.originalSize, this.meta.chunkSize)
      const take = Math.min(size - this.filled, piece.length - offset)
      if (this.filled === 0 && take === size) {
        await this.onChunk(piece.subarray(offset, offset + size), this.index)
        this.index++
      } else {
        this.frame.set(piece.subarray(offset, offset + take), this.filled)
        this.filled += take
        if (this.filled === size) {
          this.filled = 0
          await this.onChunk(this.frame.subarray(0, size), this.index)
          this.index++
        }
      }
      offset += take
    }
  }

  /** Dopo un'interruzione: un chunk a metà si butta, e la richiesta nuova lo riprende da capo. */
  reset(): void {
    this.filled = 0
  }
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

    const totalChunks = chunkCount(originalSize, chunkSize)
    let decrypted = 0
    const assembler = new ChunkAssembler(source, 0, totalChunks, async (framed, index) => {
      const plain = await openChunk(framed, key, index, totalChunks)
      await sink.write(plain)
      decrypted += plain.byteLength
      onProgress?.(decrypted, originalSize)
    })

    for (;;) {
      const { done, value } = await reader.read()
      if (value) await assembler.feed(value)
      if (done) break
    }

    // Se mancano chunk o avanzano byte, il file è troncato/corrotto (o il tag GCM non tornerebbe).
    if (!assembler.complete) throw new DownloadError('Il file è arrivato incompleto o corrotto: riprova a scaricarlo.')
    await sink.close()
  } catch (err) {
    try { await sink.abort?.(err) } catch { /* l'errore da riportare è quello originale */ }
    throw err
  }
}

// ─── Download a tratti, su più connessioni ────────────────────────────────────────────────────
//
// Una connessione sola verso lo storage spesso si ferma a qualche decina di MB/s anche su una
// linea veloce. Qui il file si divide in tratti contigui di chunk, uno per connessione, e ognuno
// si scarica con una sola richiesta `Range`, si decifra e si scrive **al suo posto** nel file.
// Serve un sink che sappia scrivere a una posizione: oggi il disco di Chrome/Edge (File System
// Access API). Gli altri browser restano sul download in fila, che è già quello di prima.
//
// Tutte le richieste partono subito, finché l'indirizzo firmato è valido: un trasferimento già
// avviato continua anche dopo la scadenza, come fa il download in fila. Solo una connessione che
// cade va riaperta: dal chunk dove si era fermata, con lo stesso indirizzo se è ancora buono,
// altrimenti con uno nuovo da `refreshUrl` (che per un link non conta un download in più).
//
// Se il browser o lo storage non accettano le richieste `Range` (CORS, o una risposta 200 invece
// di 206) si lancia `RangeNotSupported` prima di aver scritto qualcosa: chi chiama ripiega sul
// download in fila. Nel caso peggiore, quindi, va come prima.

/** Un sink che scrive alla posizione indicata: i tratti arrivano in qualunque ordine. */
export interface PositionalSink {
  writeAt(position: number, chunk: Uint8Array<ArrayBuffer>): Promise<void> | void
  close(): Promise<void> | void
  abort?(reason: unknown): Promise<void> | void
}

export interface RangedSource extends EncryptedSource {
  /** Un indirizzo nuovo quando quello attuale è scaduto (403). Senza, l'errore resta quello. */
  refreshUrl?: () => Promise<string>
  /** Connessioni contemporanee. Default 6, come i browser per un singolo host. */
  connections?: number
}

/** Le richieste `Range` non passano: chi chiama ripiega sul download in fila. */
export class RangeNotSupported extends Error {
  constructor(readonly reason: string) {
    super(`Download a tratti non disponibile: ${reason}`)
    this.name = 'RangeNotSupported'
  }
}

/** Sotto questa dimensione più connessioni non servono: costano più di quanto rendono. */
export const RANGED_MIN_SIZE = 32 * 1024 * 1024

const MAX_ATTEMPTS = 4

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function decryptRangesToSink(source: RangedSource, sink: PositionalSink): Promise<void> {
  const { key, chunkSize, originalSize, onProgress, refreshUrl } = source
  const totalChunks = chunkCount(originalSize, chunkSize)
  const lanes = Math.max(1, Math.min(source.connections ?? 6, totalChunks))
  const stop = new AbortController()

  // L'indirizzo è condiviso: se scade, lo rinnova una connessione sola e le altre lo riusano.
  let url = source.url
  let generation = 0
  let renewing: Promise<void> | null = null
  const renew = async (seen: number) => {
    if (generation !== seen) return
    if (!refreshUrl) throw new DownloadError(storageErrorMessage(403), 403)
    renewing ??= refreshUrl().then((fresh) => {
      url = fresh
      generation++
    }).finally(() => { renewing = null })
    await renewing
  }

  let decrypted = 0
  let anyResponse = false

  const runLane = async (first: number, end: number) => {
    const assembler = new ChunkAssembler(source, first, end, async (framed, index) => {
      const plain = await openChunk(framed, key, index, totalChunks)
      await sink.writeAt(index * chunkSize, plain)
      decrypted += plain.byteLength
      onProgress?.(decrypted, originalSize)
    })
    let attempt = 0
    while (!assembler.complete) {
      attempt++
      const from = encryptedChunkOffset(assembler.next, chunkSize)
      const to = encryptedChunkOffset(end - 1, chunkSize) + encryptedChunkSizeV2(end - 1, originalSize, chunkSize) - 1
      const seen = generation
      let response: Response
      try {
        response = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, signal: stop.signal })
      } catch (err) {
        if (stop.signal.aborted) throw err
        // Nessuna risposta mai arrivata: con ogni probabilità il CORS non ammette `Range`.
        if (!anyResponse) throw new RangeNotSupported(technicalDetail(err))
        if (attempt >= MAX_ATTEMPTS) throw new DownloadError('La connessione con lo storage si è interrotta più volte: riprova.')
        await pause(500 * attempt)
        continue
      }
      anyResponse = true
      if (response.status === 403 && attempt < MAX_ATTEMPTS) {
        await renew(seen)
        continue
      }
      if (response.status >= 500 && attempt < MAX_ATTEMPTS) {
        await pause(500 * attempt)
        continue
      }
      assertStorageResponse(response)
      if (response.status !== 206) throw new RangeNotSupported(`lo storage ha risposto ${response.status} a una richiesta Range`)
      if (!response.body) throw new RangeNotSupported('risposta senza corpo leggibile')

      const reader = response.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (value) await assembler.feed(value)
          if (done) break
        }
      } catch (err) {
        // Decifratura o disco: errori veri, si fermano tutti. La rete che cade: si riprende.
        if (err instanceof UserFacingError || stop.signal.aborted || attempt >= MAX_ATTEMPTS) throw err
        assembler.reset()
        await pause(500 * attempt)
        continue
      }
      if (!assembler.complete) {
        // Il tratto è finito prima del previsto: si riprende dal chunk mancante.
        if (attempt >= MAX_ATTEMPTS) throw new DownloadError('Il file è arrivato incompleto o corrotto: riprova a scaricarlo.')
        assembler.reset()
      } else {
        attempt = 0
      }
    }
  }

  try {
    // Tratti contigui e quasi uguali: i primi `extra` hanno un chunk in più.
    const base = Math.floor(totalChunks / lanes)
    const extra = totalChunks % lanes
    const spans: Promise<void>[] = []
    let first = 0
    for (let lane = 0; lane < lanes; lane++) {
      const size = base + (lane < extra ? 1 : 0)
      spans.push(runLane(first, first + size))
      first += size
    }
    await Promise.all(spans)
    await sink.close()
  } catch (err) {
    stop.abort()
    // Un ripiego sul download in fila riusa lo stesso sink: non lo si chiude.
    if (!(err instanceof RangeNotSupported)) {
      try { await sink.abort?.(err) } catch { /* l'errore da riportare è quello originale */ }
    }
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
