import { describe, it, expect, beforeEach } from 'vitest'
import { rememberMasterKey, loadRememberedMasterKey, rememberedUntil, forgetMasterKey, REMEMBER_DAYS, type DeviceContext } from './rememberedDevice'
import { memoryKeyStorage, type KeyStorage } from './storage'

/**
 * «Ricorda su questo dispositivo».
 *
 * Cosa difendono questi test: che la comodità non allarghi il rischio oltre quanto dichiarato.
 * La chiave ricordata deve scadere davvero, non deve passare a un altro account dello stesso
 * browser, e non deve mai poter essere salvata in forma esportabile.
 *
 * Nessun mock: IndexedDB non esiste in Node, e al suo posto c'è l'adattatore in memoria —
 * la stessa sostituzione che farebbe un client desktop o una CLI (O3.1).
 */

const DAY_MS = 24 * 60 * 60 * 1000
const ADESSO = Date.UTC(2026, 8, 13)

let storage: KeyStorage
let antonio: DeviceContext

const chiave = (extractable = false) =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'])

const record = (sub: string) => storage.get(`letransfer_master_key_${sub}`)

beforeEach(() => {
  storage = memoryKeyStorage()
  antonio = { sub: 'sub-antonio', storage }
})

describe('rememberedDevice', () => {
  it('ricorda la master key e la restituisce finché non scade', async () => {
    const masterKey = await chiave()

    const expiresAt = await rememberMasterKey(masterKey, antonio, ADESSO)

    expect(expiresAt).toBe(ADESSO + REMEMBER_DAYS * DAY_MS)
    expect(await loadRememberedMasterKey(antonio, ADESSO + (REMEMBER_DAYS - 1) * DAY_MS)).toBe(masterKey)
    expect(await rememberedUntil(antonio, ADESSO)).toBe(expiresAt)
  })

  it('scaduta non la restituisce più, e la cancella', async () => {
    await rememberMasterKey(await chiave(), antonio, ADESSO)

    expect(await loadRememberedMasterKey(antonio, ADESSO + REMEMBER_DAYS * DAY_MS)).toBeNull()
    expect(await record('sub-antonio')).toBeUndefined()
  })

  it('rifiuta una chiave esportabile e non salva niente', async () => {
    await expect(rememberMasterKey(await chiave(true), antonio, ADESSO)).rejects.toThrow(/esportabile/)
    expect(await record('sub-antonio')).toBeUndefined()
  })

  it('un altro account sullo stesso browser non la trova', async () => {
    await rememberMasterKey(await chiave(), antonio, ADESSO)

    expect(await loadRememberedMasterKey({ sub: 'sub-qualcun-altro', storage }, ADESSO)).toBeNull()
  })

  it('dimenticata, alla sessione dopo non c\'è più', async () => {
    await rememberMasterKey(await chiave(), antonio, ADESSO)

    await forgetMasterKey(antonio)

    expect(await loadRememberedMasterKey(antonio, ADESSO)).toBeNull()
    expect(await rememberedUntil(antonio, ADESSO)).toBeNull()
  })

  it('senza un utente identificato non ricorda e non restituisce niente', async () => {
    const nessuno = { sub: null, storage }

    await expect(rememberMasterKey(await chiave(), nessuno, ADESSO)).rejects.toThrow(/Utente non identificato/)
    expect(await loadRememberedMasterKey(nessuno, ADESSO)).toBeNull()
  })
})
