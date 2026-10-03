import { describe, it, expect, vi, afterEach } from 'vitest'
import { decryptToBlob, decryptToStream, decryptRangesToSink, PREVIEW_SIZE_LIMIT, DownloadError, DecryptionError, RangeNotSupported, downloadErrorMessage } from './streamingDownload'
import { generateAESKey, encryptChunkFramed } from './crypto'

/**
 * Test del giro completo download → decifratura.
 *
 * Qui si verifica che il **lettore** e lo **scrittore** del formato v2 siano d'accordo:
 * il file viene cifrato chunk per chunk come fa l'upload, servito come farebbe lo
 * storage, e riletto dal percorso di decifratura reale. È il test che accorgerebbe
 * di una divergenza fra i due lati prima che lo faccia un utente con un file illeggibile.
 */

const bytes = (n: number, seed = 3): Uint8Array => {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (i * 17 + seed) % 256
  return out
}

/** Cifra `plain` come farebbe l'upload: sequenza di chunk incorniciati. */
async function encryptWhole(plain: Uint8Array, key: CryptoKey, chunkSize: number): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  const total = Math.max(1, Math.ceil(plain.byteLength / chunkSize))
  for (let index = 0; index < total; index++) {
    const slice = plain.subarray(index * chunkSize, Math.min((index + 1) * chunkSize, plain.byteLength))
    parts.push(await encryptChunkFramed(slice.slice().buffer as ArrayBuffer, key, index))
  }
  const size = parts.reduce((acc, part) => acc + part.byteLength, 0)
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

/** Serve `payload` come farebbe lo storage, a pezzetti, per esercitare il buffering. */
function mockFetch(payload: Uint8Array, sliceSize = 1024) {
  globalThis.fetch = vi.fn(async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < payload.byteLength; offset += sliceSize) {
          controller.enqueue(payload.subarray(offset, Math.min(offset + sliceSize, payload.byteLength)))
        }
        controller.close()
      },
    })
    return new Response(stream, { status: 200 })
  }) as unknown as typeof fetch
}

afterEach(() => { vi.restoreAllMocks() })

describe('decryptToBlob — giro completo', () => {
  it('restituisce esattamente i byte originali su più chunk', async () => {
    const key = await generateAESKey()
    const chunkSize = 4096
    const plain = bytes(chunkSize * 3 + 137) // 4 chunk, l'ultimo corto
    mockFetch(await encryptWhole(plain, key, chunkSize))

    const blob = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.byteLength })

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(plain)
  })

  it('funziona quando il file sta in un chunk solo', async () => {
    const key = await generateAESKey()
    const plain = bytes(500)
    mockFetch(await encryptWhole(plain, key, 4096))

    const blob = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize: 4096, originalSize: plain.byteLength })

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(plain)
  })

  it('applica il tipo MIME richiesto (serve all’anteprima)', async () => {
    const key = await generateAESKey()
    const plain = bytes(200)
    mockFetch(await encryptWhole(plain, key, 4096))

    const blob = await decryptToBlob({
      url: 'https://storage.test/x', key, chunkSize: 4096, originalSize: plain.byteLength, mimeType: 'image/png',
    })

    expect(blob.type).toBe('image/png')
  })

  it('riporta l’avanzamento fino al totale', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const plain = bytes(chunkSize * 3)
    mockFetch(await encryptWhole(plain, key, chunkSize))

    const seen: number[] = []
    await decryptToBlob({
      url: 'https://storage.test/x', key, chunkSize, originalSize: plain.byteLength,
      onProgress: (done) => seen.push(done),
    })

    expect(seen.at(-1)).toBe(plain.byteLength)
    expect(seen).toEqual([...seen].sort((a, b) => a - b)) // monotono
  })

  it('fallisce su uno stream troncato invece di restituire dati parziali', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const plain = bytes(chunkSize * 3)
    const encrypted = await encryptWhole(plain, key, chunkSize)
    mockFetch(encrypted.subarray(0, encrypted.byteLength - 200)) // manca la coda

    await expect(
      decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.byteLength }),
    ).rejects.toThrow()
  })

  it('fallisce se un byte del ciphertext è stato manomesso', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const plain = bytes(chunkSize * 2)
    const encrypted = await encryptWhole(plain, key, chunkSize)
    encrypted[50] ^= 0xff
    mockFetch(encrypted)

    await expect(
      decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.byteLength }),
    ).rejects.toThrow()
  })

  it('rifiuta i file oltre il tetto dell’anteprima senza nemmeno scaricarli', async () => {
    const key = await generateAESKey()
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch

    await expect(
      decryptToBlob({ url: 'https://storage.test/x', key, chunkSize: 1024, originalSize: PREVIEW_SIZE_LIMIT + 1 }),
    ).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

/**
 * Il motivo di un download fallito deve arrivare all'utente com'è. Prima un link firmato
 * scaduto (403) diventava «Download non riuscito», e i chiamanti lo mostravano come «errore
 * durante la decifratura»: un'altra causa, che fa cercare il guasto dove non è.
 */
describe('errori del download — il motivo vero', () => {
  it('un link scaduto dice che il link è scaduto, non che la decifratura è fallita', async () => {
    const key = await generateAESKey()
    globalThis.fetch = vi.fn(async () => new Response('AccessDenied', { status: 403 })) as unknown as typeof fetch

    const error = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize: 1024, originalSize: 10 }).catch((e) => e)

    expect(error).toBeInstanceOf(DownloadError)
    expect(error.status).toBe(403)
    expect(downloadErrorMessage(error, 'Errore durante la decifratura del file.')).toMatch(/scaduto/)
  })

  it('senza rete parla di connessione', async () => {
    const key = await generateAESKey()
    globalThis.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch

    const error = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize: 1024, originalSize: 10 }).catch((e) => e)

    expect(downloadErrorMessage(error, 'ripiego')).toMatch(/connessione/)
  })

  it('il primo blocco che non si apre punta a chiave o metadati, e conserva il nome dell’errore', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const encrypted = await encryptWhole(bytes(chunkSize), key, chunkSize)
    encrypted[40] ^= 0xff
    mockFetch(encrypted)

    const error = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: chunkSize }).catch((e) => e)

    expect(error).toBeInstanceOf(DecryptionError)
    expect(error.chunkIndex).toBe(0)
    const message = downloadErrorMessage(error, 'ripiego')
    expect(message).toMatch(/chiave/)
    // Web Crypto non dà un messaggio: il nome della classe è tutto ciò che concede, e deve restare.
    expect(message).toMatch(/OperationError/)
  })

  it('un blocco in mezzo che non torna parla di file corrotto e dice quale', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const plain = bytes(chunkSize * 3)
    const encrypted = await encryptWhole(plain, key, chunkSize)
    encrypted[chunkSize + 28 + 100] ^= 0xff // dentro il secondo blocco (ogni blocco cifrato è chunkSize + 28)
    mockFetch(encrypted)

    const error = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.byteLength }).catch((e) => e)

    expect(error).toBeInstanceOf(DecryptionError)
    expect(error.chunkIndex).toBe(1)
    expect(downloadErrorMessage(error, 'ripiego')).toMatch(/blocco 2 di 3/)
  })

  it('metadati che non corrispondono all’oggetto lo dicono con i due numeri, prima di decifrare', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const encrypted = await encryptWhole(bytes(chunkSize), key, chunkSize)
    globalThis.fetch = vi.fn(async () => new Response(encrypted, {
      status: 200,
      headers: { 'content-length': String(encrypted.byteLength) },
    })) as unknown as typeof fetch

    // I metadati dichiarano un file grande il doppio di quello presente nello storage.
    const error = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: chunkSize * 2 }).catch((e) => e)

    expect(error).toBeInstanceOf(DownloadError)
    expect(error.message).toMatch(/non corrispondono/)
    expect(error.message).toMatch(String(encrypted.byteLength))
  })

  it('un errore sconosciuto tiene il testo del chiamante MA anche il dettaglio tecnico', () => {
    const message = downloadErrorMessage(new RangeError('Array buffer allocation failed'), 'Errore durante il download.')
    expect(message).toBe('Errore durante il download. [RangeError: Array buffer allocation failed]')
  })
})

describe('decryptToStream — il chiaro come stream', () => {
  /**
   * È il percorso usato dall'export "scarica tutto", dove il chiaro non finisce su disco
   * ma dentro uno zip prodotto in streaming. Deve dare **gli stessi identici byte** degli
   * altri due percorsi: se divergesse, l'archivio esportato conterrebbe file corrotti e
   * l'utente lo scoprirebbe solo dopo aver cancellato l'account.
   */
  it('produce gli stessi byte del percorso in memoria', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const plain = bytes(chunkSize * 3 + 77)
    mockFetch(await encryptWhole(plain, key, chunkSize))

    const stream = decryptToStream({ url: 'x', key, chunkSize, originalSize: plain.byteLength })
    const reader = stream.getReader()
    const parts: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) parts.push(value)
    }

    const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0))
    let offset = 0
    for (const part of parts) { out.set(part, offset); offset += part.byteLength }

    expect(out).toEqual(plain)
  })

  it('manda in errore lo stream se il file è troncato, invece di chiuderlo a metà', async () => {
    const key = await generateAESKey()
    const chunkSize = 1024
    const plain = bytes(chunkSize * 3)
    const full = await encryptWhole(plain, key, chunkSize)
    // Uno stream che si chiude presto senza segnalare nulla è il caso pericoloso: un
    // consumatore ingenuo scriverebbe un file parziale credendolo completo.
    mockFetch(full.subarray(0, full.byteLength - 200))

    const stream = decryptToStream({ url: 'x', key, chunkSize, originalSize: plain.byteLength })
    const reader = stream.getReader()

    await expect((async () => {
      for (;;) {
        const { done } = await reader.read()
        if (done) break
      }
    })()).rejects.toThrow()
  })
})

describe('decryptToSink — come arrivano i byte dalla rete non conta', () => {
  // La rete consegna pezzi di qualunque dimensione: un chunk può arrivare in mille pezzi, intero
  // in un pezzo solo, o insieme ad altri. Il risultato deve essere sempre lo stesso.
  const chunkSize = 4096
  const framed = chunkSize + 28

  it.each([
    ['1 byte alla volta', 1],
    ['pezzi più piccoli di un chunk', 1000],
    ['esattamente un chunk cifrato', framed],
    ['un chunk e un byte (a cavallo)', framed + 1],
    ['più chunk in un pezzo solo', framed * 2 + 7],
    ['tutto in un pezzo', 1 << 20],
  ])('%s', async (_, sliceSize) => {
    const key = await generateAESKey()
    const plain = bytes(chunkSize * 5 + 333, 9)
    mockFetch(await encryptWhole(plain, key, chunkSize), sliceSize)

    const blob = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.byteLength })

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(plain)
  })

  it('un file vuoto è un solo chunk di soli IV e tag', async () => {
    const key = await generateAESKey()
    mockFetch(await encryptWhole(new Uint8Array(0), key, chunkSize), 5)

    const blob = await decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: 0 })

    expect(blob.size).toBe(0)
  })

  it('un chunk manomesso dopo uno decifrato senza copie dice ancora quale', async () => {
    const key = await generateAESKey()
    const plain = bytes(chunkSize * 3, 5)
    const payload = await encryptWhole(plain, key, chunkSize)
    payload[framed * 2 + 40] ^= 0xff
    mockFetch(payload, framed * 3)

    await expect(decryptToBlob({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.byteLength })).rejects.toMatchObject({
      name: 'DecryptionError',
      chunkIndex: 2,
    })
  })
})

describe('decryptRangesToSink — download a tratti su più connessioni', () => {
  const chunkSize = 4096
  const framed = chunkSize + 28

  interface Storage {
    /** Richieste ricevute: indirizzo e intervallo. */
    requests: { url: string; range: string | null }[]
    inFlight: number
    maxInFlight: number
  }

  type Behaviour = 'ok' | 'ignore-range' | 'drop' | 'expired' | 'cors'

  /**
   * Uno storage finto che rispetta `Range`. `behave` decide, per ogni richiesta, se rispondere
   * normalmente o simulare un guasto.
   */
  function rangedStorage(payload: Uint8Array, behave: (n: number, url: string) => Behaviour = () => 'ok') {
    const storage: Storage = { requests: [], inFlight: 0, maxInFlight: 0 }
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const range = (init?.headers as Record<string, string> | undefined)?.Range ?? null
      const n = storage.requests.push({ url, range }) - 1
      const [from, to] = range ? range.replace('bytes=', '').split('-').map(Number) : [0, payload.length - 1]
      const what = behave(n, url)
      if (what === 'cors') throw new TypeError('Failed to fetch')
      if (what === 'expired') return new Response(null, { status: 403 })
      const body = what === 'ignore-range' ? payload : payload.subarray(from, to + 1)
      storage.inFlight++
      storage.maxInFlight = Math.max(storage.maxInFlight, storage.inFlight)
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (let offset = 0; offset < body.length; offset += 1500) {
            if (what === 'drop' && offset >= framed + 100) {
              storage.inFlight--
              controller.error(new TypeError('network error'))
              return
            }
            controller.enqueue(body.subarray(offset, Math.min(offset + 1500, body.length)))
            await new Promise((resolve) => setTimeout(resolve, 0))
          }
          storage.inFlight--
          controller.close()
        },
      })
      return new Response(stream, { status: what === 'ignore-range' ? 200 : 206 })
    }) as unknown as typeof fetch
    return storage
  }

  /** Un file su «disco» che accetta scritture in qualunque ordine. */
  function positionalSink(size: number) {
    const file = new Uint8Array(size)
    const state = { closed: false, aborted: false }
    return {
      file,
      state,
      sink: {
        writeAt: (position: number, chunk: Uint8Array) => { file.set(chunk, position) },
        close: () => { state.closed = true },
        abort: () => { state.aborted = true },
      },
    }
  }

  async function encrypted(chunks: number, extra = 333) {
    const key = await generateAESKey()
    const plain = bytes(chunkSize * chunks + extra, 11)
    return { key, plain, payload: await encryptWhole(plain, key, chunkSize) }
  }

  const startOf = (range: string | null) => Number(range!.replace('bytes=', '').split('-')[0])

  it('ricompone il file da tratti scaricati insieme, ognuno con una richiesta Range', async () => {
    const { key, plain, payload } = await encrypted(20)
    const storage = rangedStorage(payload)
    const disk = positionalSink(plain.length)

    await decryptRangesToSink({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.length, connections: 4 }, disk.sink)

    expect(disk.file).toEqual(plain)
    expect(disk.state.closed).toBe(true)
    expect(storage.requests).toHaveLength(4)
    expect(storage.maxInFlight).toBeGreaterThan(1)
    // I tratti coprono tutto l'oggetto, senza buchi né sovrapposizioni.
    const covered = storage.requests.map((r) => r.range!.replace('bytes=', '').split('-').map(Number)).sort((a, b) => a[0] - b[0])
    expect(covered[0][0]).toBe(0)
    expect(covered.at(-1)![1]).toBe(payload.length - 1)
    covered.slice(1).forEach(([from], i) => expect(from).toBe(covered[i][1] + 1))
  })

  it('una connessione che cade riprende dal chunk mancante, non da capo', async () => {
    const { key, plain, payload } = await encrypted(12)
    const storage = rangedStorage(payload, (n) => (n === 1 ? 'drop' : 'ok'))
    const disk = positionalSink(plain.length)

    await decryptRangesToSink({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.length, connections: 3 }, disk.sink)

    expect(disk.file).toEqual(plain)
    expect(storage.requests).toHaveLength(4)
    expect(startOf(storage.requests[3].range)).toBe(startOf(storage.requests[1].range) + framed)
  })

  it('un indirizzo scaduto si rinnova una volta sola, anche se se ne accorgono tutte le connessioni', async () => {
    const { key, plain, payload } = await encrypted(12)
    const storage = rangedStorage(payload, (_, url) => (url.endsWith('vecchio') ? 'expired' : 'ok'))
    const disk = positionalSink(plain.length)
    const refreshUrl = vi.fn(async () => 'https://storage.test/nuovo')

    await decryptRangesToSink({ url: 'https://storage.test/vecchio', key, chunkSize, originalSize: plain.length, connections: 3, refreshUrl }, disk.sink)

    expect(disk.file).toEqual(plain)
    expect(refreshUrl).toHaveBeenCalledTimes(1)
    expect(storage.requests.filter((r) => r.url.endsWith('nuovo'))).toHaveLength(3)
  })

  it('senza rinnovo, l’indirizzo scaduto lo dice, e il file a metà si butta', async () => {
    const { key, plain, payload } = await encrypted(6)
    rangedStorage(payload, () => 'expired')
    const disk = positionalSink(plain.length)

    await expect(decryptRangesToSink({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.length, connections: 2 }, disk.sink))
      .rejects.toMatchObject({ name: 'DownloadError', status: 403 })
    expect(disk.state.aborted).toBe(true)
  })

  it.each([
    ['lo storage ignora Range e manda tutto (200)', 'ignore-range' as const],
    ['il browser blocca la richiesta (CORS)', 'cors' as const],
  ])('%s: RangeNotSupported, e il file non si butta (si ripiega in fila)', async (_, guasto) => {
    const { key, plain, payload } = await encrypted(6)
    rangedStorage(payload, () => guasto)
    const disk = positionalSink(plain.length)

    await expect(decryptRangesToSink({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.length, connections: 3 }, disk.sink))
      .rejects.toBeInstanceOf(RangeNotSupported)
    expect(disk.state.aborted).toBe(false)
  })

  it('un chunk manomesso ferma tutto e dice quale', async () => {
    const { key, plain, payload } = await encrypted(9)
    payload[framed * 7 + 50] ^= 0xff
    rangedStorage(payload)
    const disk = positionalSink(plain.length)

    await expect(decryptRangesToSink({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.length, connections: 3 }, disk.sink))
      .rejects.toMatchObject({ name: 'DecryptionError', chunkIndex: 7 })
    expect(disk.state.aborted).toBe(true)
  })

  it('con più connessioni che chunk, una connessione per chunk', async () => {
    const { key, plain, payload } = await encrypted(1, 10)
    const storage = rangedStorage(payload)
    const disk = positionalSink(plain.length)

    await decryptRangesToSink({ url: 'https://storage.test/x', key, chunkSize, originalSize: plain.length, connections: 6 }, disk.sink)

    expect(disk.file).toEqual(plain)
    expect(storage.requests).toHaveLength(2)
  })
})
