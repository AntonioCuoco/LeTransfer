import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { usePlan } from './usePlan'

/**
 * Il piano letto dal server, e il controllo preventivo dei tre limiti.
 *
 * Due cose qui sbagliano **in silenzio**, e sono il motivo di questi test:
 *
 * 1. **La forma della risposta.** Il client leggeva `data.plan` mentre il server manda
 *    `data.data.plan`, e `limits.maxFileBytes` mentre il server manda `maxFileSizeBytes`.
 *    Nessuna eccezione: solo un utente Pro trattato come Free, con `isAuthoritative` a
 *    `true` a giurare che il dato fosse certo.
 * 2. **Il conteggio cumulativo.** Dieci file da 2 GB stanno nella quota uno per uno, non
 *    insieme: senza sommarli la coda parte e si rompe a metà.
 */

const RESPONSE = {
  success: true,
  data: {
    plan: 'pro',
    limits: {
      maxFileSizeBytes: 20e9,
      maxExpiryHours: 720,
      maxStoredBytes: 200e9,
      maxMonthlyBytes: 200e9,
    },
    usage: {
      storedBytes: 190e9, // ne restano 10
      monthlyBytes: 100e9, // ne restano 100
      monthlyResetsAt: '2026-10-01T00:00:00.000Z',
      tracked: true,
    },
    billing: { status: 'active', hasBilling: true },
  },
}

/** Lo stato di `usePlan` vive a livello di modulo: va riletto a ogni test. */
async function freshPlan(payload: unknown) {
  vi.spyOn(axios, 'get').mockResolvedValue({ data: payload })
  const api = usePlan()
  await api.load(true)
  return api
}

describe('usePlan — lettura del contratto', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('legge piano, limiti e uso dalla forma vera della risposta', async () => {
    const { plan, limits, usage, isAuthoritative } = await freshPlan(RESPONSE)

    expect(plan.value).toBe('pro')
    // Il nome del campo lato server è `maxFileSizeBytes`, non `maxFileBytes`.
    expect(limits.value.maxFileBytes).toBe(20e9)
    expect(limits.value.maxStoredBytes).toBe(200e9)
    expect(usage.value?.storedBytes).toBe(190e9)
    expect(isAuthoritative.value).toBe(true)
  })

  it('una risposta di forma inattesa non si spaccia per autorevole', async () => {
    // È il caso che prima passava inosservato: nessun errore, dati inventati dal catalogo,
    // e `isAuthoritative` a `true` a dire che erano quelli veri.
    const { plan, isAuthoritative } = await freshPlan({ success: true })
    expect(plan.value).toBe('free')
    expect(isAuthoritative.value).toBe(false)
  })

  it('se la chiamata fallisce si ripiega su Free, dichiarandolo', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('rete giù'))
    const api = usePlan()
    await api.load(true)
    expect(api.plan.value).toBe('free')
    expect(api.isAuthoritative.value).toBe(false)
    expect(api.usage.value).toBeNull()
  })
})

describe('blockingLimitFor — il controllo preventivo', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('lascia passare un file che sta in tutti e tre i limiti', async () => {
    const { blockingLimitFor } = await freshPlan(RESPONSE)
    expect(blockingLimitFor(1e9)).toBeNull()
  })

  it('riconosce il file troppo grande', async () => {
    const { blockingLimitFor } = await freshPlan(RESPONSE)
    expect(blockingLimitFor(25e9)).toBe('file')
  })

  it('riconosce lo spazio esaurito, e non lo chiama "file troppo grande"', async () => {
    const { blockingLimitFor } = await freshPlan(RESPONSE)
    // 15 GB stanno nel cap per file (20) ma non nei 10 GB rimasti di quota.
    expect(blockingLimitFor(15e9)).toBe('quota')
  })

  it('riconosce il tetto mensile quando la quota basterebbe', async () => {
    const { blockingLimitFor } = await freshPlan({
      ...RESPONSE,
      data: {
        ...RESPONSE.data,
        usage: { ...RESPONSE.data.usage, storedBytes: 0, monthlyBytes: 199e9 },
      },
    })
    // Spazio libero in abbondanza, ma del mese resta 1 GB.
    expect(blockingLimitFor(5e9)).toBe('monthly')
  })

  it('la priorità è file → quota → mensile', async () => {
    const { blockingLimitFor } = await freshPlan({
      ...RESPONSE,
      data: {
        ...RESPONSE.data,
        usage: { ...RESPONSE.data.usage, storedBytes: 199e9, monthlyBytes: 199e9 },
      },
    })
    // Un file da 25 GB sfora tutti e tre: si dice quello che l'utente può capire per primo.
    expect(blockingLimitFor(25e9)).toBe('file')
  })

  it('senza conteggio non blocca niente: decide il server', async () => {
    const { blockingLimitFor, storedRemaining } = await freshPlan({
      ...RESPONSE,
      data: { ...RESPONSE.data, usage: { ...RESPONSE.data.usage, tracked: false } },
    })
    // `tracked: false` = non lo sappiamo. Bloccare su un dato che non c'è impedirebbe
    // upload legittimi; lasciar passare al massimo produce il `413`, che è recuperabile.
    expect(storedRemaining.value).toBeNull()
    expect(blockingLimitFor(15e9)).toBeNull()
  })
})
