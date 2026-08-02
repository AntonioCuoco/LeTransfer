import { describe, it, expect } from 'vitest'
import {
  generateAESKey,
  generateIV,
  encryptChunkFramed,
  decryptChunkFramed,
  encryptedSizeV2,
  encryptedChunkSizeV2,
  CHUNK_OVERHEAD,
  CHUNK_IV_BYTES,
  exportKeyToBase64,
  importKeyFromBase64,
  createShareableKeyData,
  createKeyHash,
  parseKeyFromHash,
  generateRSAKeyPair,
  wrapKeyWithPublicKey,
  unwrapKeyWithPrivateKey,
} from './crypto'

/**
 * Test del formato dei file e delle primitive.
 *
 * Perché esistono: un difetto qui non si manifesta come un errore visibile, ma come
 * un file che **non si riapre più** — magari mesi dopo, quando è troppo tardi per
 * accorgersene. Sono i test che proteggono dalla perdita di dati, non dal layout storto.
 */

const bytes = (n: number, seed = 7): Uint8Array => {
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) out[i] = (i * 31 + seed) % 256
  return out
}

describe('formato v2 — chunk cifrati', () => {
  it('cifra e decifra un chunk mantenendo i byte identici', async () => {
    const key = await generateAESKey()
    const plain = bytes(5000)

    const framed = await encryptChunkFramed(plain.buffer as ArrayBuffer, key, 0)
    const back = await decryptChunkFramed(framed, key, 0)

    expect(new Uint8Array(back)).toEqual(plain)
  })

  it('il chunk cifrato è [IV 12B][ciphertext + tag 16B]', async () => {
    const key = await generateAESKey()
    const plain = bytes(1000)

    const framed = await encryptChunkFramed(plain.buffer as ArrayBuffer, key, 0)

    expect(framed.byteLength).toBe(plain.byteLength + CHUNK_OVERHEAD)
    expect(CHUNK_IV_BYTES).toBe(12)
  })

  it('usa un IV diverso per ogni chunk', async () => {
    const key = await generateAESKey()
    const plain = bytes(64)

    const a = await encryptChunkFramed(plain.buffer as ArrayBuffer, key, 0)
    const b = await encryptChunkFramed(plain.buffer as ArrayBuffer, key, 0)

    // Stesso chunk, stessa chiave, stesso indice → ciphertext comunque diverso.
    expect(a.subarray(0, CHUNK_IV_BYTES)).not.toEqual(b.subarray(0, CHUNK_IV_BYTES))
  })

  // ⚠️ È LA garanzia dell'AAD: chi controlla lo storage non può riordinare i blocchi.
  it('rifiuta un chunk decifrato con l’indice sbagliato (anti-riordino)', async () => {
    const key = await generateAESKey()
    const framed = await encryptChunkFramed(bytes(300).buffer as ArrayBuffer, key, 3)

    await expect(decryptChunkFramed(framed, key, 4)).rejects.toThrow()
  })

  it('rifiuta un chunk manomesso di un solo byte (tag GCM)', async () => {
    const key = await generateAESKey()
    const framed = await encryptChunkFramed(bytes(300).buffer as ArrayBuffer, key, 0)

    framed[CHUNK_IV_BYTES + 5] ^= 0x01 // un bit nel ciphertext

    await expect(decryptChunkFramed(framed, key, 0)).rejects.toThrow()
  })

  it('rifiuta un chunk cifrato con un’altra chiave', async () => {
    const key = await generateAESKey()
    const other = await generateAESKey()
    const framed = await encryptChunkFramed(bytes(300).buffer as ArrayBuffer, key, 0)

    await expect(decryptChunkFramed(framed, other, 0)).rejects.toThrow()
  })
})

describe('calcolo delle dimensioni', () => {
  it('encryptedSizeV2 somma l’overhead di ogni chunk', () => {
    // 25 MB con chunk da 10 MB → 3 chunk (10 + 10 + 5)
    const chunkSize = 10 * 1024 * 1024
    const originalSize = 25 * 1024 * 1024

    expect(encryptedSizeV2(originalSize, chunkSize)).toBe(originalSize + 3 * CHUNK_OVERHEAD)
  })

  it('un file vuoto conta comunque come un chunk', () => {
    expect(encryptedSizeV2(0, 1024)).toBe(CHUNK_OVERHEAD)
  })

  it('l’ultimo chunk è più corto e la somma torna', () => {
    const chunkSize = 1000
    const originalSize = 2500
    const sizes = [0, 1, 2].map((i) => encryptedChunkSizeV2(i, originalSize, chunkSize))

    expect(sizes).toEqual([1000 + CHUNK_OVERHEAD, 1000 + CHUNK_OVERHEAD, 500 + CHUNK_OVERHEAD])
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(encryptedSizeV2(originalSize, chunkSize))
  })
})

describe('chiave nel frammento del link', () => {
  it('sopravvive al giro export → frammento → parse → import', async () => {
    const key = await generateAESKey()
    const iv = generateIV()

    const keyData = await createShareableKeyData(key, iv)
    const hash = createKeyHash(keyData)

    expect(hash.startsWith('#key=')).toBe(true)

    const parsed = parseKeyFromHash(hash)
    expect(parsed).not.toBeNull()
    expect(parsed!.key).toBe(keyData.key)
    expect(parsed!.iv).toBe(keyData.iv)

    // La chiave reimportata deve decifrare ciò che ha cifrato l'originale.
    const reimported = await importKeyFromBase64(parsed!.key)
    const framed = await encryptChunkFramed(bytes(128).buffer as ArrayBuffer, key, 0)
    const back = await decryptChunkFramed(framed, reimported, 0)
    expect(new Uint8Array(back)).toEqual(bytes(128))
  })

  it('gestisce i caratteri base64 che vanno codificati nell’URL (+ / =)', async () => {
    // Serve a coprire il caso in cui la chiave contenga '+' o '/': senza
    // encodeURIComponent il '+' diventerebbe uno spazio e la chiave sarebbe persa.
    for (let attempt = 0; attempt < 25; attempt++) {
      const key = await generateAESKey()
      const iv = generateIV()
      const keyData = await createShareableKeyData(key, iv)
      const parsed = parseKeyFromHash(createKeyHash(keyData))
      expect(parsed!.key).toBe(keyData.key)
    }
  })

  it('restituisce null su frammenti assenti o incompleti', () => {
    expect(parseKeyFromHash('')).toBeNull()
    expect(parseKeyFromHash('#')).toBeNull()
    expect(parseKeyFromHash('#key=abc')).toBeNull() // manca iv
    expect(parseKeyFromHash('#iv=abc')).toBeNull() // manca key
  })

  it('esporta e reimporta una chiave AES senza alterarla', async () => {
    const key = await generateAESKey()
    const base64 = await exportKeyToBase64(key)
    const back = await importKeyFromBase64(base64)

    expect(await exportKeyToBase64(back)).toBe(base64)
  })
})

describe('wrapping della chiave per un altro utente (RSA-OAEP)', () => {
  it('la chiave sopravvive al wrap e all’unwrap', async () => {
    const pair = await generateRSAKeyPair()
    const fileKey = await generateAESKey()

    const wrapped = await wrapKeyWithPublicKey(fileKey, pair.publicKey)
    const unwrapped = await unwrapKeyWithPrivateKey(wrapped, pair.privateKey)

    // La chiave sbustata deve decifrare ciò che ha cifrato l'originale.
    const framed = await encryptChunkFramed(bytes(256).buffer as ArrayBuffer, fileKey, 0)
    const back = await decryptChunkFramed(framed, unwrapped, 0)
    expect(new Uint8Array(back)).toEqual(bytes(256))
  })

  it('la chiave privata sbagliata non apre il wrap', async () => {
    const pair = await generateRSAKeyPair()
    const stranger = await generateRSAKeyPair()
    const fileKey = await generateAESKey()

    const wrapped = await wrapKeyWithPublicKey(fileKey, pair.publicKey)

    await expect(unwrapKeyWithPrivateKey(wrapped, stranger.privateKey)).rejects.toThrow()
  })
}, 30_000) // la generazione di due coppie RSA-4096 è lenta
