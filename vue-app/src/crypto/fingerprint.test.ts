import { describe, it, expect } from 'vitest'
import { jwkThumbprint, keyThumbprint, fingerprintGroups, shortFingerprint } from './fingerprint'
import { generateRSAKeyPair } from './crypto'

/**
 * Test dell'impronta di chiave pubblica.
 *
 * La proprietà che conta è la **riproducibilità**: se due implementazioni calcolassero
 * impronte diverse per la stessa chiave, il confronto a voce fra mittente e destinatario
 * non avrebbe alcun valore e la verifica anti-MITM sarebbe teatro.
 */

// Vettore ufficiale RFC 7638 §3.1: se questo passa, la nostra canonicalizzazione è
// quella dello standard e non una convenzione nostra.
// `kid` non è nel tipo `JsonWebKey` del DOM ma è parte del vettore della RFC:
// lo teniamo perché serve a dimostrare che i membri extra non entrano nell'impronta.
type JwkWithKid = JsonWebKey & { kid?: string }

const RFC7638_JWK: JwkWithKid = {
  kty: 'RSA',
  n:
    '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3okn' +
    'jhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6q' +
    'MQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awap' +
    'JzKnqDKgw',
  e: 'AQAB',
  alg: 'RS256',
  kid: '2011-04-29',
}

const RFC7638_THUMBPRINT_B64URL = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs'

const base64UrlToHex = (value: string): string => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Array.from(binary, (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')
}

describe('JWK Thumbprint (RFC 7638)', () => {
  it('riproduce il vettore ufficiale della RFC', async () => {
    expect(await jwkThumbprint(RFC7638_JWK)).toBe(base64UrlToHex(RFC7638_THUMBPRINT_B64URL))
  })

  // È il motivo per cui esiste la canonicalizzazione: senza, la stessa chiave
  // serializzata in ordine diverso darebbe impronte diverse.
  it('non cambia se i membri della JWK sono in ordine diverso o ce ne sono altri', async () => {
    const reordered: JwkWithKid = {
      kid: '2011-04-29',
      e: RFC7638_JWK.e,
      alg: 'RS256',
      kty: 'RSA',
      n: RFC7638_JWK.n,
    }

    expect(await jwkThumbprint(reordered)).toBe(await jwkThumbprint(RFC7638_JWK))
  })

  it('due chiavi diverse hanno impronte diverse', async () => {
    const [a, b] = await Promise.all([generateRSAKeyPair(), generateRSAKeyPair()])

    expect(await keyThumbprint(a.publicKey)).not.toBe(await keyThumbprint(b.publicKey))
  })

  it('produce 64 caratteri esadecimali (SHA-256 intero)', async () => {
    const hex = await jwkThumbprint(RFC7638_JWK)

    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rifiuta una chiave non RSA invece di produrre un’impronta senza senso', async () => {
    await expect(jwkThumbprint({ kty: 'EC', crv: 'P-256', x: 'a', y: 'b' })).rejects.toThrow()
  })
}, 30_000)

describe('formattazione leggibile', () => {
  it('divide in 32 coppie maiuscole', async () => {
    const groups = fingerprintGroups(await jwkThumbprint(RFC7638_JWK))

    expect(groups).toHaveLength(32)
    groups.forEach((group) => expect(group).toMatch(/^[0-9A-F]{2}$/))
  })

  it('la forma corta sono le prime quattro coppie separate da due punti', () => {
    expect(shortFingerprint('a3f19c2d55667788')).toBe('A3:F1:9C:2D')
  })
})
