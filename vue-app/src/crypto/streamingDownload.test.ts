import { describe, it, expect, vi, afterEach } from 'vitest'
import { decryptToBlob, decryptToStream, PREVIEW_SIZE_LIMIT } from './streamingDownload'
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
