import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

/**
 * Condivisione utente → utente: cosa parte, e soprattutto cosa NON parte.
 *
 * Cosa difendono questi test: che al destinatario non arrivi mai un file che non può aprire.
 * Prima, con il vault chiuso, la condivisione partiva senza la chiave del file — il
 * destinatario vedeva il file fra i ricevuti e non riusciva ad aprirlo, senza un errore da
 * nessuna parte. E che la chiave consegnata sia davvero apribile solo con la sua chiave privata.
 */

const { http, store, keyPair } = vi.hoisted(() => ({
  http: { post: vi.fn(), get: vi.fn() },
  store: { isUnlocked: true, getKey: vi.fn() },
  keyPair: { getRecipientPublicKey: vi.fn() },
}))

vi.mock('axios', () => ({ default: http }))
vi.mock('js-cookie', () => ({ default: { get: () => 'id-token' } }))
vi.mock('sweetalert2', () => ({ default: { fire: vi.fn() } }))
vi.mock('@/src/stores/encryption', () => ({ useEncryptionStore: () => store }))
vi.mock('@/src/composables/useUserKeyPair', () => ({
  useUserKeyPair: () => ({ getRecipientPublicKey: keyPair.getRecipientPublicKey, privateKey: { value: null } }),
}))
vi.mock('@/src/crypto/streamingDownload', () => ({
  downloadAndDecryptV2: vi.fn(),
  shouldWarnLargeDownload: () => false,
  DownloadCancelled: class DownloadCancelled extends Error {},
}))
vi.mock('@/src/utils/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

import { useShareFile } from './useShareFile'
import {
  generateRSAKeyPair,
  generateAESKey,
  generateIV,
  exportKeyToBase64,
  exportIVToBase64,
  importKeyFromBase64,
  unwrapKeyWithPrivateKey,
} from '@/src/crypto/crypto'

const FILE = 'uploads/files/sub-antonio/1700000000000-uuid-contratto'

let recipient: CryptoKeyPair
let fileKey: { key: string; iv: string }

beforeAll(async () => {
  recipient = await generateRSAKeyPair()
  fileKey = { key: await exportKeyToBase64(await generateAESKey()), iv: exportIVToBase64(generateIV()) }
}, 60_000) // RSA a 4096 bit

beforeEach(() => {
  http.post.mockReset().mockResolvedValue({ data: { message: 'File shared successfully', shareId: 'share-1' } })
  store.isUnlocked = true
  store.getKey.mockReset().mockResolvedValue(fileKey)
  keyPair.getRecipientPublicKey.mockReset().mockResolvedValue(recipient.publicKey)
})

describe('useShareFile', () => {
  it('con il vault chiuso non chiede il destinatario e non condivide', async () => {
    store.isUnlocked = false
    const verifyRecipient = vi.fn()

    const result = await useShareFile().shareFile(FILE, 'bob@esempio.it', { verifyRecipient })

    expect(result).toBeNull()
    expect(keyPair.getRecipientPublicKey).not.toHaveBeenCalled()
    expect(verifyRecipient).not.toHaveBeenCalled()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('senza la chiave del file non disturba con la verifica dell\'impronta', async () => {
    store.getKey.mockResolvedValue(null)
    const verifyRecipient = vi.fn()

    const result = await useShareFile().shareFile(FILE, 'bob@esempio.it', { verifyRecipient })

    expect(result).toBeNull()
    expect(verifyRecipient).not.toHaveBeenCalled()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('se l\'impronta non viene confermata non consegna niente', async () => {
    const result = await useShareFile().shareFile(FILE, 'bob@esempio.it', { verifyRecipient: async () => false })

    expect(result).toBeNull()
    expect(http.post).not.toHaveBeenCalled()
  })

  it('consegna la chiave del file chiusa nella chiave pubblica del destinatario', async () => {
    const result = await useShareFile().shareFile(FILE, '  bob@esempio.it ', { verifyRecipient: async () => true })

    expect(result).toEqual({ message: 'File shared successfully', shareId: 'share-1' })
    const body = http.post.mock.calls[0][1]
    expect(body).toMatchObject({ s3Key: FILE, type: 'user', targetEmail: 'bob@esempio.it', encryptionIV: fileKey.iv })

    // La prova vera: con la sua chiave privata il destinatario ottiene la stessa chiave del file.
    const original = await importKeyFromBase64(fileKey.key)
    const unwrapped = await unwrapKeyWithPrivateKey(body.encryptedAESKey, recipient.privateKey)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, original, new TextEncoder().encode('contratto'))
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, unwrapped, sealed)
    expect(new TextDecoder().decode(opened)).toBe('contratto')
  })
})
