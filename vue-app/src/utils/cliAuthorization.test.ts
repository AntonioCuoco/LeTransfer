import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseLoopbackRequest,
  loopbackCallbackUrl,
  verificationCode,
  normalizeUserCode,
  savePendingCliRequest,
  loadPendingCliRequest,
  clearPendingCliRequest,
  postLoginPath,
  cleanDeviceName,
} from './cliAuthorization'

/**
 * La logica dell'autorizzazione della CLI.
 *
 * Il test che conta di più è quello sull'URL di ritorno: la pagina consegna un codice a un
 * indirizzo che le arriva nella query. Se l'host potesse venire da lì, un link costruito ad
 * arte farebbe consegnare codici a un computer qualsiasi.
 */

// sessionStorage in memoria: l'ambiente `logica` è Node, senza DOM.
const store = new Map<string, string>()
globalThis.sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as unknown as Storage

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const valid = { port: '49152', state: 'abcdefghijklmnop1234', challenge: CHALLENGE, device: 'portatile' }

beforeEach(() => store.clear())

describe('parametri della CLI', () => {
  it('accetta una richiesta valida', () => {
    expect(parseLoopbackRequest(valid)).toEqual({
      mode: 'loopback',
      port: 49152,
      state: 'abcdefghijklmnop1234',
      codeChallenge: CHALLENGE,
      deviceName: 'portatile',
    })
  })

  it.each([
    ['porta non numerica', { port: 'abc' }],
    ['porta privilegiata', { port: '80' }],
    ['porta fuori scala', { port: '70000' }],
    ['state troppo corto', { state: 'corto' }],
    ['state con caratteri strani', { state: 'abcdefghijklmnop<script>' }],
    ['sfida PKCE della lunghezza sbagliata', { challenge: 'abc' }],
  ])('rifiuta: %s', (_label, change) => {
    expect(parseLoopbackRequest({ ...valid, ...change })).toBeNull()
  })

  it('il nome del dispositivo si ripulisce ma non blocca', () => {
    expect(cleanDeviceName('porta\u0000tile\n')).toBe('portatile')
    expect(cleanDeviceName('')).toBe('CLI')
    expect(cleanDeviceName('x'.repeat(200))).toHaveLength(80)
  })
})

describe('URL di ritorno', () => {
  it('va SOLO su 127.0.0.1, con la porta validata', () => {
    const url = new URL(loopbackCallbackUrl(parseLoopbackRequest(valid)!, 'codice-123'))
    expect(url.protocol).toBe('http:')
    expect(url.hostname).toBe('127.0.0.1')
    expect(url.port).toBe('49152')
    expect(url.pathname).toBe('/callback')
    expect(url.searchParams.get('code')).toBe('codice-123')
    expect(url.searchParams.get('state')).toBe('abcdefghijklmnop1234')
  })

  it('nessun parametro della query può cambiare l’host', () => {
    // Non esiste un parametro «host»: anche se qualcuno lo aggiunge, viene ignorato.
    const request = parseLoopbackRequest({ ...valid, host: 'attaccante.example', redirect_uri: 'https://attaccante.example' })!
    expect(new URL(loopbackCallbackUrl(request, 'c')).hostname).toBe('127.0.0.1')
  })
})

describe('codici', () => {
  it('il codice di controllo è l’inizio della sfida, in due gruppi', () => {
    expect(verificationCode(CHALLENGE)).toBe('E9Me-lhoa')
  })

  it.each([
    ['bcdf ghjk', 'BCDF-GHJK'],
    ['BCDFGHJK', 'BCDF-GHJK'],
    ['bcdf-ghjk', 'BCDF-GHJK'],
  ])('normalizza il codice breve «%s»', (input, expected) => {
    expect(normalizeUserCode(input)).toBe(expected)
  })

  it.each(['ABCDEFGH', 'BCDF', 'BCDF-GHJ0'])('rifiuta «%s» (vocali, lunghezza, 0)', (input) => {
    expect(normalizeUserCode(input)).toBeNull()
  })
})

describe('richiesta in sospeso attraverso il login', () => {
  it('senza richiesta, dopo il login si va in /app come sempre', () => {
    expect(postLoginPath()).toBe('/app')
  })

  it('con una richiesta in sospeso si torna alla pagina giusta', () => {
    savePendingCliRequest(parseLoopbackRequest(valid)!)
    expect(postLoginPath()).toBe('/cli/authorize')
    clearPendingCliRequest()
    savePendingCliRequest({ mode: 'device', userCode: 'BCDF-GHJK' })
    expect(postLoginPath()).toBe('/cli/device')
  })

  it('scade dopo dieci minuti: la CLI dall’altra parte non aspetta per sempre', () => {
    savePendingCliRequest(parseLoopbackRequest(valid)!, 0)
    expect(loadPendingCliRequest(11 * 60 * 1000)).toBeNull()
    expect(postLoginPath(11 * 60 * 1000)).toBe('/app')
  })

  it('si rivalida alla lettura: un valore manomesso non passa', () => {
    store.set('novren_pending_cli_request', JSON.stringify({ mode: 'loopback', port: 80, state: 'x', codeChallenge: 'y', savedAt: Date.now() }))
    expect(loadPendingCliRequest()).toBeNull()
    expect(postLoginPath()).toBe('/app')
  })
})
