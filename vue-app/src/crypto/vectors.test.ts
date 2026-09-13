import { describe, it, expect, vi, afterEach } from 'vitest'
import vectors from './vectors/crypto-vectors.json'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  encryptChunkFramed,
  decryptChunkFramed,
  encryptFileName,
  decryptFileName,
  createKeyHash,
  parseKeyFromHash,
  importKeyFromBase64,
  exportKeyToBase64,
  wrapFileKey,
  unwrapFileKey,
  importPrivateKeyFromJWK,
  importPublicKeyFromJWK,
  unwrapKeyWithPrivateKey,
  unwrapPrivateKeyWithMasterKey,
  exportPrivateKeyToJWK,
} from './crypto'
import {
  entropyToMnemonic,
  validateRecoveryKey,
  deriveMasterKeyFromMnemonic,
  createVerificationHash,
  verifyMasterKey,
} from './recovery-key'
import { jwkThumbprint, hybridThumbprint } from './fingerprint'
import { decryptToBlob } from './streamingDownload'
import {
  wrapFileKeyHybrid,
  unwrapFileKeyHybrid,
  unwrapReceivedFileKey,
  wrapXWingSeedWithMasterKey,
  unwrapXWingSeedWithMasterKey,
  xwingPublicKeyFromSeed,
} from './hybrid'

/**
 * Vettori di test del nucleo crittografico (roadmap O3.1).
 *
 * ⚠️ Perché sono diversi dagli altri test. Gli altri fanno andata e ritorno con il NOSTRO codice:
 * passerebbero anche se cifratura e decifratura cambiassero formato insieme — e i file già
 * caricati smetterebbero di riaprirsi senza un test rosso. Qui ogni byte atteso l'ha calcolato
 * `node:crypto` (OpenSSL) da `scripts/generate-crypto-vectors.mjs`, a partire dalla specifica
 * in README.md: se questo file passa, il nostro codice produce e legge **esattamente** il formato
 * dichiarato. È la prova che dovrà superare ogni implementazione futura, e la rete di sicurezza
 * del passaggio al wrapping post-quantum.
 *
 * I vettori non si rigenerano: un vettore che cambia è un formato che cambia.
 */

const bytes = (base64url: string) => new Uint8Array(base64ToArrayBuffer(base64url))
const hexToBytes = (hex: string) => new Uint8Array((hex.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, 16)))
const toArrayBuffer = (view: Uint8Array) => view.slice().buffer as ArrayBuffer

describe('vettori — file a chunk, formato v2', () => {
  const v = vectors.chunkedFileV2

  it('cifra ogni chunk esattamente come la specifica', async () => {
    const key = await importKeyFromBase64(v.key)
    const plain = bytes(v.plaintext)

    for (const chunk of v.chunks) {
      const slice = plain.subarray(chunk.index * v.chunkSize, (chunk.index + 1) * v.chunkSize)
      const framed = await encryptChunkFramed(toArrayBuffer(slice), key, chunk.index, bytes(chunk.iv))
      expect(arrayBufferToBase64(framed), `chunk ${chunk.index}`).toBe(chunk.framed)
    }
  })

  it('decifra ogni chunk e rifiuta l’indice sbagliato', async () => {
    const key = await importKeyFromBase64(v.key)
    const plain = bytes(v.plaintext)

    for (const chunk of v.chunks) {
      const back = new Uint8Array(await decryptChunkFramed(bytes(chunk.framed), key, chunk.index))
      expect(back).toEqual(plain.subarray(chunk.index * v.chunkSize, (chunk.index + 1) * v.chunkSize))
    }
    await expect(decryptChunkFramed(bytes(v.chunks[1].framed), key, 0)).rejects.toThrow()
  })

  it('il motore di download ricostruisce il file intero dall’oggetto', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(bytes(v.object), { status: 200 })) as unknown as typeof fetch
    try {
      const blob = await decryptToBlob({
        url: 'https://storage.test/vettore',
        key: await importKeyFromBase64(v.key),
        chunkSize: v.chunkSize,
        originalSize: bytes(v.plaintext).byteLength,
      })
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes(v.plaintext))
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('vettori — nome del file, nameVersion 2', () => {
  const v = vectors.fileNameV2

  it('cifra e decifra ogni nome come la specifica', async () => {
    const key = await importKeyFromBase64(v.key)

    for (const entry of v.cases) {
      expect(await encryptFileName(entry.name, key, bytes(entry.iv)), entry.name).toBe(entry.blob)
      expect(await decryptFileName(entry.blob, key)).toBe(entry.name)
    }
  })
})

describe('vettori — chiave nel frammento del link', () => {
  const v = vectors.linkFragment

  it('produce e legge lo stesso frammento', () => {
    expect(createKeyHash({ key: v.key, iv: v.iv })).toBe(v.fragment)
    expect(parseKeyFromHash(v.fragment)).toEqual({ key: v.key, iv: v.iv })
  })
})

describe('vettori — chiave del file avvolta dalla master key', () => {
  const v = vectors.fileKeyWrap

  it('avvolge con AAD = s3Key esattamente come la specifica', async () => {
    const wrapped = await wrapFileKey(
      await importKeyFromBase64(v.fileKey),
      await importKeyFromBase64(v.wrappingKey),
      v.s3Key,
      bytes(v.wrapIV),
    )

    expect(wrapped).toEqual({ wrappedKey: v.wrappedKey, wrapIV: v.wrapIV })
  })

  it('apre sia il formato attuale sia quello pre-#9 senza AAD', async () => {
    const wrappingKey = await importKeyFromBase64(v.wrappingKey)

    const current = await unwrapFileKey(v.wrappedKey, v.wrapIV, wrappingKey, v.s3Key)
    const legacy = await unwrapFileKey(v.legacyWrappedKey, v.legacyWrapIV, wrappingKey, v.s3Key)

    expect(await exportKeyToBase64(current)).toBe(v.fileKey)
    expect(await exportKeyToBase64(legacy)).toBe(v.fileKey)
  })

  it('con un altro s3Key la chiave non si apre (l’AAD lega la chiave al file)', async () => {
    const wrappingKey = await importKeyFromBase64(v.wrappingKey)

    await expect(unwrapFileKey(v.wrappedKey, v.wrapIV, wrappingKey, `${v.s3Key}.altro`)).rejects.toThrow()
  })
})

describe('vettori — BIP39 e chiave di recupero', () => {
  it('riproduce i vettori ufficiali BIP39', async () => {
    for (const entry of vectors.bip39.official) {
      expect(await entropyToMnemonic(hexToBytes(entry.entropy))).toBe(entry.mnemonic)
      expect(await validateRecoveryKey(entry.mnemonic)).toBe(true)
    }
  })

  it('mnemonica → master key → blob di verifica, byte per byte', async () => {
    const v = vectors.recoveryKey
    expect(await entropyToMnemonic(hexToBytes(v.entropy))).toBe(v.mnemonic)

    const derived = await deriveMasterKeyFromMnemonic(v.mnemonic, bytes(v.salt))
    // La master key derivata non è esportabile: si confronta per ciò che produce.
    expect(await createVerificationHash(derived, bytes(v.verificationIV))).toBe(v.verificationHash)
    expect(await createVerificationHash(await importKeyFromBase64(v.masterKey), bytes(v.verificationIV))).toBe(v.verificationHash)
    expect(await verifyMasterKey(derived, v.verificationHash)).toBe(true)
  })
}, 30_000)

describe('vettori — RSA-OAEP fra utenti', () => {
  const v = vectors.rsaOaep

  it('apre la chiave del file cifrata da un’altra implementazione', async () => {
    const privateKey = await importPrivateKeyFromJWK(v.privateKeyJwk)

    const fileKey = await unwrapKeyWithPrivateKey(v.wrappedKey, privateKey)

    expect(await exportKeyToBase64(fileKey)).toBe(v.fileKey)
  })

  it('calcola la stessa impronta RFC 7638 e importa la chiave pubblica', async () => {
    expect(await jwkThumbprint(v.publicKeyJwk)).toBe(v.thumbprint)
    await expect(importPublicKeyFromJWK(v.publicKeyJwk)).resolves.toBeDefined()
  })

  it('apre il backup della chiave privata con la master key della chiave di recupero', async () => {
    const masterKey = await deriveMasterKeyFromMnemonic(vectors.recoveryKey.mnemonic, bytes(vectors.recoveryKey.salt))

    const restored = await unwrapPrivateKeyWithMasterKey(
      { encryptedPrivateKey: vectors.keyPairBackup.encryptedPrivateKey, iv: vectors.keyPairBackup.iv },
      masterKey,
    )
    const jwk = await exportPrivateKeyToJWK(restored)

    expect({ n: jwk.n, e: jwk.e, d: jwk.d }).toEqual({ n: v.privateKeyJwk.n, e: v.privateKeyJwk.e, d: v.privateKeyJwk.d })
  })
}, 30_000)

describe('vettori — X-Wing (draft-connolly-cfrg-xwing-kem-10)', () => {
  it('la libreria riproduce i vettori ufficiali del draft', async () => {
    const { ml_kem768_x25519: xwing } = await import('@noble/post-quantum/hybrid.js')

    for (const v of vectors.xwingDraft10.vectors) {
      expect(xwing.getPublicKey(hexToBytes(v.seed))).toEqual(hexToBytes(v.pk))
      const { cipherText, sharedSecret } = xwing.encapsulate(hexToBytes(v.pk), hexToBytes(v.eseed))
      expect(cipherText).toEqual(hexToBytes(v.ct))
      expect(sharedSecret).toEqual(hexToBytes(v.ss))
      expect(xwing.decapsulate(hexToBytes(v.ct), hexToBytes(v.sk))).toEqual(hexToBytes(v.ss))
    }
  })
})

describe('vettori — wrap ibrido RSA-OAEP + X-Wing (formato v2)', () => {
  const v = vectors.hybridKeyWrapV2
  const rsa = vectors.rsaOaep

  it('apre il blob calcolato da un’altra implementazione', async () => {
    const fileKey = await unwrapFileKeyHybrid(v.blob, await importPrivateKeyFromJWK(rsa.privateKeyJwk), bytes(v.xwingSeed))

    expect(await exportKeyToBase64(fileKey)).toBe(v.fileKey)
  })

  it('il punto unico di lettura riconosce il v2 dal blob, e il v1 resta leggibile', async () => {
    const privateKey = await importPrivateKeyFromJWK(rsa.privateKeyJwk)

    expect(await exportKeyToBase64(await unwrapReceivedFileKey(v.blob, privateKey, bytes(v.xwingSeed)))).toBe(v.fileKey)
    expect(await exportKeyToBase64(await unwrapReceivedFileKey(rsa.wrappedKey, privateKey, null))).toBe(rsa.fileKey)
    await expect(unwrapReceivedFileKey(v.blob, privateKey, null)).rejects.toThrow(/post-quantum/)
  })

  it('a parità di casualità produce la stessa parte X-Wing e lo stesso IV, e il giro torna', async () => {
    const blob = await wrapFileKeyHybrid(
      await importKeyFromBase64(v.fileKey),
      await importPublicKeyFromJWK(rsa.publicKeyJwk),
      bytes(v.xwingPublicKey),
      { rsaSecret: bytes(v.rsaSecret), eseed: bytes(v.eseed), iv: bytes(v.iv) },
    )
    const [version, , xwingPart, ivPart] = blob.split('.')
    const [, , expectedXWing, expectedIv] = v.blob.split('.')

    expect(version).toBe('v2')
    expect(xwingPart).toBe(expectedXWing)
    expect(ivPart).toBe(expectedIv)
    const back = await unwrapFileKeyHybrid(blob, await importPrivateKeyFromJWK(rsa.privateKeyJwk), bytes(v.xwingSeed))
    expect(await exportKeyToBase64(back)).toBe(v.fileKey)
  })

  it('rifiuta un blob con la parte RSA presa da un altro (niente taglia-e-cuci)', async () => {
    const publicKey = await importPublicKeyFromJWK(rsa.publicKeyJwk)
    const other = await wrapFileKeyHybrid(await importKeyFromBase64(v.fileKey), publicKey, bytes(v.xwingPublicKey))
    const parts = v.blob.split('.')
    parts[1] = other.split('.')[1]

    await expect(
      unwrapFileKeyHybrid(parts.join('.'), await importPrivateKeyFromJWK(rsa.privateKeyJwk), bytes(v.xwingSeed)),
    ).rejects.toThrow()
  })

  it('senza il seme X-Wing giusto non si apre, anche con la chiave RSA giusta', async () => {
    const wrongSeed = bytes(v.xwingSeed)
    wrongSeed[0] ^= 0xff

    await expect(unwrapFileKeyHybrid(v.blob, await importPrivateKeyFromJWK(rsa.privateKeyJwk), wrongSeed)).rejects.toThrow()
  })

  it('la chiave pubblica X-Wing si ricava dal seme', async () => {
    expect(arrayBufferToBase64((await xwingPublicKeyFromSeed(bytes(v.xwingSeed))).slice().buffer)).toBe(v.xwingPublicKey)
  })
}, 30_000)

describe('vettori — backup del seme X-Wing e impronta ibrida', () => {
  it('cifra e apre il seme con la master key esattamente come la specifica', async () => {
    const masterKey = await importKeyFromBase64(vectors.recoveryKey.masterKey)
    const backup = vectors.xwingSeedBackup

    expect(await wrapXWingSeedWithMasterKey(bytes(vectors.hybridKeyWrapV2.xwingSeed), masterKey, bytes(backup.seedIV)))
      .toEqual({ encryptedSeed: backup.encryptedSeed, seedIV: backup.seedIV })
    expect(await unwrapXWingSeedWithMasterKey(backup, masterKey)).toEqual(bytes(vectors.hybridKeyWrapV2.xwingSeed))
  })

  it('l’impronta impegna entrambe le chiavi, e senza X-Wing resta quella RFC 7638', async () => {
    const f = vectors.hybridFingerprint

    expect(await hybridThumbprint(vectors.rsaOaep.publicKeyJwk, bytes(f.xwingPublicKey))).toBe(f.thumbprint)
    expect(await hybridThumbprint(vectors.rsaOaep.publicKeyJwk, null)).toBe(vectors.rsaOaep.thumbprint)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
