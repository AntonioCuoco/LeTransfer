import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

/**
 * Lettura di una richiesta file, lato di chi carica — `/richiesta/:publicToken`.
 *
 * Cosa difendono questi test: che la pagina pubblica legga la risposta **nella forma in cui il
 * backend la manda**. Il router `requests` risponde con i campi piatti; qui si leggeva
 * `data.data`, che non esiste. La lettura falliva sempre, e siccome quell'errore non ha uno
 * status HTTP finiva nel ramo «network»: chi riceveva il link vedeva «Non siamo riusciti a
 * contattare il servizio» mentre il server rispondeva 200 con tutto il necessario. Un difetto
 * che dal lato server sembra inesistente — nei log è un 200 — e che rende la funzionalità
 * inutilizzabile per l'unica persona che la usa: quella senza account.
 *
 * Difendono anche i tre esiti distinti (404, 410, rete): sono messaggi diversi in pagina, e
 * confonderli manda a chiedere «un link nuovo» chi invece deve solo riprovare.
 */

const { http } = vi.hoisted(() => ({ http: { get: vi.fn(), post: vi.fn(), create: vi.fn() } }))

vi.mock('axios', () => ({ default: http }))

import { useRequestUpload } from './useRequestUpload'
import { hybridThumbprint } from '@/src/crypto/fingerprint'

const TOKEN = '0qumVjA5VtvAPbhQjeJmv'

let ownerJwk: JsonWebKey

/** La risposta del backend, così com'è: campi piatti, nessun involucro. */
const risposta = () => ({
  data: {
    title: 'documenti',
    note: 'istruzioni',
    expiresAt: '2026-09-23T21:25:37.033Z',
    closed: false,
    uploadsLeft: 1,
    ownerPublicKeyJWK: ownerJwk,
    ownerXWingPublicKey: null,
  },
})

const httpError = (status: number) => Object.assign(new Error(String(status)), { response: { status } })

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt'],
  )
  ownerJwk = await crypto.subtle.exportKey('jwk', pair.publicKey)
})

beforeEach(() => {
  http.get.mockReset()
  http.create.mockReset().mockReturnValue({ put: vi.fn() })
})

describe('useRequestUpload — apertura della pagina pubblica', () => {
  it('legge i campi piatti della risposta e mostra la richiesta', async () => {
    http.get.mockResolvedValue(risposta())
    const { loadInfo, info, loadError, isLoadingInfo } = useRequestUpload(TOKEN)

    await loadInfo()

    expect(loadError.value).toBeNull()
    expect(isLoadingInfo.value).toBe(false)
    expect(info.value).toMatchObject({ title: 'documenti', note: 'istruzioni', uploadsLeft: 1, ownerXWingPublicKey: null })
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining(`/requests/${TOKEN}`))
  })

  it('ricalcola l’impronta sulle chiavi ricevute, invece di fidarsi del server', async () => {
    http.get.mockResolvedValue(risposta())
    const { loadInfo, info } = useRequestUpload(TOKEN)

    await loadInfo()

    expect(info.value!.fingerprint).toBe(await hybridThumbprint(ownerJwk, null))
  })

  it('una risposta senza la chiave pubblica non diventa una pagina di caricamento', async () => {
    http.get.mockResolvedValue({ data: { title: 'documenti', closed: false } })
    const { loadInfo, info, loadError } = useRequestUpload(TOKEN)

    await loadInfo()

    expect(info.value).toBeNull()
    expect(loadError.value).toBe('network')
  })

  it.each([
    [404, 'missing'],
    [410, 'gone'],
    [500, 'network'],
  ])('con HTTP %i lo dice nel modo giusto: %s', async (status, atteso) => {
    http.get.mockRejectedValue(httpError(status))
    const { loadInfo, loadError } = useRequestUpload(TOKEN)

    await loadInfo()

    expect(loadError.value).toBe(atteso)
  })

  it('se la rete cade è «network», non «richiesta inesistente»', async () => {
    http.get.mockRejectedValue(new Error('Network Error'))
    const { loadInfo, loadError } = useRequestUpload(TOKEN)

    await loadInfo()

    expect(loadError.value).toBe('network')
  })
})
