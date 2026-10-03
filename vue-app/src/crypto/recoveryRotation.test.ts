import { describe, it, expect, vi, beforeAll } from 'vitest'
import {
  rotateRecoveryKey,
  RotationBlockedError,
  RotationError,
  ROTATION_BATCH,
  type RecoveryRotationDeps,
  type RotationBegin,
  type RotationFileKey,
  type RotationStage,
} from './recoveryRotation'
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateAESKey,
  generateIV,
  generateSalt,
  unwrapFileKey,
  wrapFileKey,
  type KeyPairBackup,
} from './crypto'
import { createVerificationHash, deriveMasterKeyFromMnemonic, generateRecoveryKey, verifyMasterKey } from './recovery-key'
import { generateXWingSeed, unwrapXWingSeedWithMasterKey, wrapXWingSeedWithMasterKey, type XWingSeedBackup } from './hybrid'

/**
 * Cosa difendono questi test: dopo il cambio delle 24 parole **tutto** deve aprirsi con le
 * nuove, e se il cambio non arriva in fondo **niente** deve essere cambiato. Un errore qui non
 * si vede: i file restano lì, e il giorno in cui servono non si aprono più.
 *
 * Il finto backend ha la semantica di `services/keyRotation.js`: chiavi in attesa accanto alle
 * attuali, e un commit che attiva tutto insieme o niente.
 */

const PASSWORD = 'giusta'
/** Il JSON della privata RSA: il contenuto non conta, conta che esca identico byte per byte. */
const PRIVATE_JWK = new TextEncoder().encode('{"kty":"RSA","n":"abc","d":"segreto","e":"AQAB"}')

let oldPhrase: string
let newPhrase: string

beforeAll(async () => {
  oldPhrase = await generateRecoveryKey()
  newPhrase = await generateRecoveryKey()
})

interface StoredKey extends RotationFileKey {
  next?: { rotationId: string; wrappedKey: string; wrapIV: string }
}

class FakeApiError extends Error {}

async function rawKey(key: CryptoKey): Promise<string> {
  return arrayBufferToBase64(await crypto.subtle.exportKey('raw', key))
}

/** Un account con le 24 parole vecchie, `files` chiavi di file e (di default) i due backup. */
async function account(options: { files?: number; legacyFiles?: number; backups?: boolean } = {}) {
  const salt = generateSalt()
  const master = await deriveMasterKeyFromMnemonic(oldPhrase, salt)
  const raw = new Map<string, string>()
  const keys = new Map<string, StoredKey>()

  for (let i = 0; i < (options.files ?? 3); i++) {
    const s3Key = `uploads/files/sub/${i}-file.bin`
    const fileKey = await generateAESKey()
    raw.set(s3Key, await rawKey(fileKey))
    keys.set(s3Key, { s3Key, ...(await wrapFileKey(fileKey, master, s3Key)) })
  }
  // Chiavi pre-#9: avvolte senza AAD.
  for (let i = 0; i < (options.legacyFiles ?? 0); i++) {
    const s3Key = `uploads/files/sub/legacy-${i}.bin`
    const fileKey = await generateAESKey()
    const iv = generateIV()
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, master, await crypto.subtle.exportKey('raw', fileKey))
    raw.set(s3Key, await rawKey(fileKey))
    keys.set(s3Key, { s3Key, wrappedKey: arrayBufferToBase64(sealed), wrapIV: arrayBufferToBase64(iv.buffer) })
  }

  const withBackups = options.backups ?? true
  const backupIV = generateIV()
  const keypair: KeyPairBackup | null = withBackups
    ? {
        encryptedPrivateKey: arrayBufferToBase64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: backupIV }, master, PRIVATE_JWK)),
        iv: arrayBufferToBase64(backupIV.buffer),
      }
    : null
  const seed = generateXWingSeed()
  const xwing: XWingSeedBackup | null = withBackups ? await wrapXWingSeedWithMasterKey(seed, master) : null

  const server = {
    salt: arrayBufferToBase64(salt.slice().buffer),
    verificationHash: await createVerificationHash(master),
    keys,
    keypair,
    xwing,
    pending: null as null | { id: string; salt: string; verificationHash: string; backups?: { keypair: KeyPairBackup | null; xwing: XWingSeedBackup | null } },
    rotations: 0,
    /** Gancio per i test: gira subito prima di ogni commit. */
    beforeCommit: async () => {},
  }

  const requirePending = (id: string) => {
    if (!server.pending || server.pending.id !== id) throw new FakeApiError('ROTATION_NOT_FOUND')
    return server.pending
  }

  const deps: RecoveryRotationDeps = {
    fetchStatus: vi.fn(async () => ({ hasRecoveryKey: true, verificationHash: server.verificationHash })),
    begin: vi.fn(async (request: RotationBegin) => {
      if (request.password !== PASSWORD) throw new FakeApiError('INVALID_PASSWORD')
      if (request.currentVerificationHash !== server.verificationHash) throw new FakeApiError('STALE_STATE')
      if (server.pending) throw new FakeApiError('ROTATION_IN_PROGRESS')
      const id = `rot-${++server.rotations}`
      server.pending = { id, salt: request.salt, verificationHash: request.verificationHash }
      return id
    }),
    listFileKeys: vi.fn(async () => [...server.keys.values()].map(({ s3Key, wrappedKey, wrapIV }) => ({ s3Key, wrappedKey, wrapIV }))),
    stageFileKeys: vi.fn(async (id: string, items: RotationFileKey[]) => {
      requirePending(id)
      if (items.length === 0 || items.length > ROTATION_BATCH) throw new FakeApiError('INVALID_BATCH')
      for (const item of items) {
        const stored = server.keys.get(item.s3Key)
        if (stored) stored.next = { rotationId: id, wrappedKey: item.wrappedKey, wrapIV: item.wrapIV }
      }
    }),
    fetchKeyPairBackup: vi.fn(async () => server.keypair),
    fetchXWingBackup: vi.fn(async () => server.xwing),
    stageBackups: vi.fn(async (id: string, backups: { keypair: KeyPairBackup | null; xwing: XWingSeedBackup | null }) => {
      const pending = requirePending(id)
      if (server.keypair && !backups.keypair) throw new FakeApiError('KEYPAIR_BACKUP_REQUIRED')
      if (server.xwing && !backups.xwing) throw new FakeApiError('XWING_BACKUP_REQUIRED')
      pending.backups = backups
    }),
    commit: vi.fn(async (id: string) => {
      await server.beforeCommit()
      const pending = requirePending(id)
      const keysReady = [...server.keys.values()].every((key) => key.next?.rotationId === id)
      const backupsReady = (!server.keypair || pending.backups?.keypair) && (!server.xwing || pending.backups?.xwing)
      if (!keysReady || !backupsReady) return 'incomplete' as const
      server.salt = pending.salt
      server.verificationHash = pending.verificationHash
      for (const key of server.keys.values()) {
        Object.assign(key, { wrappedKey: key.next!.wrappedKey, wrapIV: key.next!.wrapIV })
        delete key.next
      }
      if (server.keypair) server.keypair = pending.backups!.keypair
      if (server.xwing) server.xwing = pending.backups!.xwing
      server.pending = null
      return 'committed' as const
    }),
    cancel: vi.fn(async () => {
      server.pending = null
    }),
  }

  return { master, server, deps, raw, seed }
}

/** Lo sblocco di un altro dispositivo: parole + sale del server, verificati col blob. */
async function unlockWith(phrase: string, server: { salt: string; verificationHash: string }) {
  const master = await deriveMasterKeyFromMnemonic(phrase, new Uint8Array(base64ToArrayBuffer(server.salt)))
  return (await verifyMasterKey(master, server.verificationHash)) ? master : null
}

describe('cambio delle 24 parole', () => {
  it('dopo il cambio tutto si apre con le parole nuove, e niente con le vecchie', async () => {
    const { master, server, deps, raw, seed } = await account({ files: 3, legacyFiles: 1 })

    await rotateRecoveryKey(deps, master, PASSWORD, newPhrase)

    expect(await unlockWith(oldPhrase, server)).toBeNull()
    const unlocked = await unlockWith(newPhrase, server)
    expect(unlocked).not.toBeNull()

    for (const key of server.keys.values()) {
      expect(await rawKey(await unwrapFileKey(key.wrappedKey, key.wrapIV, unlocked!, key.s3Key))).toBe(raw.get(key.s3Key))
      // Anche la chiave pre-#9 esce legata al suo file: si apre solo con l'AAD giusto.
      await expect(crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToArrayBuffer(key.wrapIV), additionalData: new TextEncoder().encode(key.s3Key) },
        unlocked!,
        base64ToArrayBuffer(key.wrappedKey),
      )).resolves.toBeDefined()
    }

    const jwk = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToArrayBuffer(server.keypair!.iv) },
      unlocked!,
      base64ToArrayBuffer(server.keypair!.encryptedPrivateKey),
    )
    expect(new Uint8Array(jwk)).toEqual(PRIVATE_JWK)
    expect(await unwrapXWingSeedWithMasterKey(server.xwing!, unlocked!)).toEqual(seed)
  })

  it('restituisce la master key nuova, non esportabile, già valida per il blob di verifica', async () => {
    const { master, server, deps } = await account()

    const next = await rotateRecoveryKey(deps, master, PASSWORD, newPhrase)

    expect(next.extractable).toBe(false)
    expect(await verifyMasterKey(next, server.verificationHash)).toBe(true)
  })

  it('segnala le fasi in ordine, con le chiavi contate', async () => {
    const { master, deps } = await account({ files: 2 })
    const seen: [RotationStage, number, number][] = []

    await rotateRecoveryKey(deps, master, PASSWORD, newPhrase, (p) => seen.push([p.stage, p.done, p.total]))

    expect(seen).toEqual([
      ['preparing', 0, 0],
      ['fileKeys', 0, 2],
      ['fileKeys', 2, 2],
      ['backups', 0, 2],
      ['backups', 1, 2],
      ['backups', 2, 2],
      ['activating', 0, 0],
    ])
  })

  it('manda le chiavi a lotti entro il tetto del backend', async () => {
    const { master, deps } = await account({ files: ROTATION_BATCH + 20 })

    await rotateRecoveryKey(deps, master, PASSWORD, newPhrase)

    const sizes = vi.mocked(deps.stageFileKeys).mock.calls.map(([, items]) => items.length)
    expect(sizes).toEqual([ROTATION_BATCH, 20])
  })

  it('un account senza backup ruota lo stesso', async () => {
    const { master, server, deps } = await account({ backups: false })

    await rotateRecoveryKey(deps, master, PASSWORD, newPhrase)

    expect(deps.stageBackups).toHaveBeenCalledWith(expect.any(String), { keypair: null, xwing: null })
    expect(await unlockWith(newPhrase, server)).not.toBeNull()
  })

  it('una chiave che le parole attuali non aprono blocca tutto, e non cambia niente', async () => {
    const { master, server, deps } = await account({ files: 2 })
    const stranger = await deriveMasterKeyFromMnemonic(newPhrase, generateSalt())
    const s3Key = 'uploads/files/sub/altrui.bin'
    server.keys.set(s3Key, { s3Key, ...(await wrapFileKey(await generateAESKey(), stranger, s3Key)) })
    const before = server.verificationHash

    const error = await rotateRecoveryKey(deps, master, PASSWORD, newPhrase).catch((e) => e)

    expect(error).toBeInstanceOf(RotationBlockedError)
    expect((error as RotationBlockedError).unreadable).toBe(1)
    expect(deps.cancel).toHaveBeenCalled()
    expect(server.pending).toBeNull()
    expect(server.verificationHash).toBe(before)
    expect(await unlockWith(oldPhrase, server)).not.toBeNull()
  })

  it('se le parole sono già cambiate altrove, si ferma prima di aprire la rotazione', async () => {
    const { deps } = await account()
    const stale = await deriveMasterKeyFromMnemonic(oldPhrase, generateSalt())

    await expect(rotateRecoveryKey(deps, stale, PASSWORD, newPhrase)).rejects.toBeInstanceOf(RotationError)
    expect(deps.begin).not.toHaveBeenCalled()
  })

  it('con la password sbagliata non cambia niente', async () => {
    const { master, server, deps } = await account()
    const before = server.verificationHash

    await expect(rotateRecoveryKey(deps, master, 'sbagliata', newPhrase)).rejects.toThrow('INVALID_PASSWORD')

    expect(deps.stageFileKeys).not.toHaveBeenCalled()
    expect(server.verificationHash).toBe(before)
  })

  it('un errore a metà annulla la rotazione: valgono ancora le parole vecchie', async () => {
    const { master, server, deps } = await account()
    vi.mocked(deps.stageBackups).mockRejectedValueOnce(new FakeApiError('rete giù'))

    await expect(rotateRecoveryKey(deps, master, PASSWORD, newPhrase)).rejects.toThrow('rete giù')

    expect(deps.cancel).toHaveBeenCalled()
    expect(server.pending).toBeNull()
    expect(await unlockWith(oldPhrase, server)).not.toBeNull()
    expect(await unlockWith(newPhrase, server)).toBeNull()
  })

  it('una chiave arrivata fra l\'elenco e il commit si ricifra al secondo giro', async () => {
    const { master, server, deps, raw } = await account({ files: 1 })
    const s3Key = 'uploads/files/sub/arrivata-dopo.bin'
    const late = await generateAESKey()
    raw.set(s3Key, await rawKey(late))
    const lateWrapped = await wrapFileKey(late, master, s3Key)
    let first = true
    server.beforeCommit = async () => {
      if (first) server.keys.set(s3Key, { s3Key, ...lateWrapped })
      first = false
    }

    await rotateRecoveryKey(deps, master, PASSWORD, newPhrase)

    expect(deps.commit).toHaveBeenCalledTimes(2)
    const unlocked = await unlockWith(newPhrase, server)
    const stored = server.keys.get(s3Key)!
    expect(await rawKey(await unwrapFileKey(stored.wrappedKey, stored.wrapIV, unlocked!, s3Key))).toBe(raw.get(s3Key))
  })
})
