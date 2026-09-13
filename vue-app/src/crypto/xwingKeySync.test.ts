import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncXWingKey, type PublishedXWingKey, type XWingKeySyncDeps } from './xwingKeySync'
import {
  generateXWingSeed,
  xwingPublicKeyFromSeed,
  xwingPublicKeyToBase64,
  wrapXWingSeedWithMasterKey,
  unwrapXWingSeedWithMasterKey,
} from './hybrid'

/**
 * Cosa difendono questi test: i file ricevuti su una chiave X-Wing devono restare apribili.
 * Si perdono in silenzio se un dispositivo genera una chiave nuova invece di ripristinare
 * quella dell'account, se una chiave va sul server senza il backup del seme, o se due
 * dispositivi pubblicano insieme e ciascuno si tiene la sua.
 */

let masterKey: CryptoKey

/** Un finto server + IndexedDB, con il registro di cosa è successo e in che ordine. */
function world(initial: { published?: PublishedXWingKey | null; local?: Uint8Array | null } = {}) {
  const state = {
    published: initial.published ?? null,
    local: initial.local ?? null,
    log: [] as string[],
  }
  const deps: XWingKeySyncDeps = {
    masterKey,
    loadLocalSeed: vi.fn(async () => state.local),
    saveLocalSeed: vi.fn(async (seed: Uint8Array) => { state.log.push('save'); state.local = seed }),
    fetchPublished: vi.fn(async () => state.published),
    publish: vi.fn(async (key: PublishedXWingKey) => {
      state.log.push('publish')
      if (state.published) return 'exists' as const
      state.published = key
      return 'published' as const
    }),
  }
  return { state, deps }
}

async function publishedFor(seed: Uint8Array): Promise<PublishedXWingKey> {
  return { xwingPublicKey: xwingPublicKeyToBase64(await xwingPublicKeyFromSeed(seed)), ...(await wrapXWingSeedWithMasterKey(seed, masterKey)) }
}

beforeEach(async () => {
  masterKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
})

describe('syncXWingKey', () => {
  it('su un account senza chiave la genera, la salva qui e la pubblica con un backup che la riapre', async () => {
    const { state, deps } = world()

    const key = await syncXWingKey(deps)

    expect(state.log).toEqual(['save', 'publish'])
    expect(state.local).toEqual(key.seed)
    expect(state.published!.xwingPublicKey).toBe(xwingPublicKeyToBase64(key.publicKey))
    expect(await unwrapXWingSeedWithMasterKey(state.published!, masterKey)).toEqual(key.seed)
  })

  it('se una pubblicazione precedente non è arrivata, ripubblica lo stesso seme invece di generarne un altro', async () => {
    const local = generateXWingSeed()
    const { state, deps } = world({ local })

    const key = await syncXWingKey(deps)

    expect(key.seed).toEqual(local)
    expect(state.log).toEqual(['publish'])
  })

  it('su un dispositivo già allineato non scrive niente', async () => {
    const seed = generateXWingSeed()
    const { state, deps } = world({ local: seed, published: await publishedFor(seed) })

    const key = await syncXWingKey(deps)

    expect(key.seed).toEqual(seed)
    expect(state.log).toEqual([])
  })

  it('su un dispositivo nuovo ripristina la chiave dell’account e non ne pubblica un’altra', async () => {
    const accountSeed = generateXWingSeed()
    const { state, deps } = world({ published: await publishedFor(accountSeed) })

    const key = await syncXWingKey(deps)

    expect(key.seed).toEqual(accountSeed)
    expect(state.log).toEqual(['save'])
    expect(deps.publish).not.toHaveBeenCalled()
  })

  it('se il seme locale non è quello dell’account, vince l’account', async () => {
    const accountSeed = generateXWingSeed()
    const { state, deps } = world({ local: generateXWingSeed(), published: await publishedFor(accountSeed) })

    const key = await syncXWingKey(deps)

    expect(key.seed).toEqual(accountSeed)
    expect(state.local).toEqual(accountSeed)
  })

  it('se un altro dispositivo pubblica nel mezzo, ripristina la sua chiave', async () => {
    const otherSeed = generateXWingSeed()
    const other = await publishedFor(otherSeed)
    const { state, deps } = world()
    vi.mocked(deps.publish).mockImplementationOnce(async () => {
      state.published = other // l'altro dispositivo è arrivato prima
      return 'exists'
    })

    const key = await syncXWingKey(deps)

    expect(key.seed).toEqual(otherSeed)
    expect(state.local).toEqual(otherSeed)
  })

  it('un backup che non corrisponde alla chiave pubblicata non viene salvato', async () => {
    const published = { ...(await publishedFor(generateXWingSeed())), xwingPublicKey: xwingPublicKeyToBase64(await xwingPublicKeyFromSeed(generateXWingSeed())) }
    const { state, deps } = world({ published })

    await expect(syncXWingKey(deps)).rejects.toThrow(/non corrisponde/)
    expect(state.log).toEqual([])
  })

  it('se il server non risponde non genera e non pubblica niente', async () => {
    const { state, deps } = world()
    vi.mocked(deps.fetchPublished).mockRejectedValue(new Error('rete giù'))

    await expect(syncXWingKey(deps)).rejects.toThrow('rete giù')
    expect(state.log).toEqual([])
  })
})
