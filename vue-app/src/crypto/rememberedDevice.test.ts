import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * «Ricorda su questo dispositivo».
 *
 * Cosa difendono questi test: che la comodità non allarghi il rischio oltre quanto dichiarato.
 * La chiave ricordata deve scadere davvero, non deve passare a un altro account dello stesso
 * browser, e non deve mai poter essere salvata in forma esportabile.
 */

const { storage, user } = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  user: { current: { sub: 'sub-antonio' } as { sub: string } | null },
}))

// IndexedDB non esiste in node: al suo posto una mappa, con la stessa interfaccia.
vi.mock('./keyStore', () => ({
  idbSet: async (key: string, value: unknown) => { storage.set(key, value) },
  idbGet: async (key: string) => storage.get(key),
  idbDel: async (key: string) => { storage.delete(key) },
}))
vi.mock('@/src/utils/getCurrentUser', () => ({ getCurrentUser: () => user.current }))

import { rememberMasterKey, loadRememberedMasterKey, rememberedUntil, forgetMasterKey, REMEMBER_DAYS } from './rememberedDevice'

const DAY_MS = 24 * 60 * 60 * 1000
const ADESSO = Date.UTC(2026, 8, 13)

const chiave = (extractable = false) =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'])

beforeEach(() => {
  storage.clear()
  user.current = { sub: 'sub-antonio' }
})

describe('rememberedDevice', () => {
  it('ricorda la master key e la restituisce finché non scade', async () => {
    const masterKey = await chiave()

    const expiresAt = await rememberMasterKey(masterKey, ADESSO)

    expect(expiresAt).toBe(ADESSO + REMEMBER_DAYS * DAY_MS)
    expect(await loadRememberedMasterKey(ADESSO + (REMEMBER_DAYS - 1) * DAY_MS)).toBe(masterKey)
    expect(await rememberedUntil(ADESSO)).toBe(expiresAt)
  })

  it('scaduta non la restituisce più, e la cancella', async () => {
    await rememberMasterKey(await chiave(), ADESSO)

    expect(await loadRememberedMasterKey(ADESSO + REMEMBER_DAYS * DAY_MS)).toBeNull()
    expect(storage.size).toBe(0)
  })

  it('rifiuta una chiave esportabile e non salva niente', async () => {
    await expect(rememberMasterKey(await chiave(true), ADESSO)).rejects.toThrow(/esportabile/)
    expect(storage.size).toBe(0)
  })

  it('un altro account sullo stesso browser non la trova', async () => {
    await rememberMasterKey(await chiave(), ADESSO)

    user.current = { sub: 'sub-qualcun-altro' }

    expect(await loadRememberedMasterKey(ADESSO)).toBeNull()
  })

  it('dimenticata, alla sessione dopo non c\'è più', async () => {
    await rememberMasterKey(await chiave(), ADESSO)

    await forgetMasterKey()

    expect(await loadRememberedMasterKey(ADESSO)).toBeNull()
    expect(await rememberedUntil(ADESSO)).toBeNull()
  })

  it('senza un utente identificato non ricorda e non restituisce niente', async () => {
    user.current = null

    await expect(rememberMasterKey(await chiave(), ADESSO)).rejects.toThrow(/Utente non identificato/)
    expect(await loadRememberedMasterKey(ADESSO)).toBeNull()
  })
})
