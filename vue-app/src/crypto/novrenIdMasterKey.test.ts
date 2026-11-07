import { describe, expect, it } from 'vitest'
import { wrapFileKey, unwrapFileKey } from './crypto'
import { createMasterKey, masterKeyMatches, openMasterKey, openProof } from './novrenIdMasterKey'

/**
 * La master key sotto la chiave del prodotto di Novren ID. La `productKey` arriva all'app non
 * estraibile: i test la usano nello stesso modo.
 */

const productKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
const sha256 = async (b64u: string) => {
  const bytes = Uint8Array.from(atob(b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4)), (c) => c.charCodeAt(0))
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
}

describe('master key con Novren ID', () => {
  it('nasce, si avvolge, si riapre: le chiavi dei file avvolte prima si aprono dopo', async () => {
    const product = await productKey()
    const { masterKey, setup } = await createMasterKey(product, 'acc-1')
    expect(setup.wrappedMasterKey).toMatch(/^p1\.[A-Za-z0-9_-]+$/)
    expect(setup.wrappedProof).toMatch(/^p1\.[A-Za-z0-9_-]+$/)
    expect(setup.proofHash).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(masterKey.extractable).toBe(false)

    const fileKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
    const { wrappedKey, wrapIV } = await wrapFileKey(fileKey, masterKey, 'uploads/files/a/x')
    const reopened = await openMasterKey(setup.wrappedMasterKey, product, 'acc-1')
    const unwrapped = await unwrapFileKey(wrappedKey, wrapIV, reopened, 'uploads/files/a/x')
    expect(new Uint8Array(await crypto.subtle.exportKey('raw', unwrapped))).toEqual(new Uint8Array(await crypto.subtle.exportKey('raw', fileKey)))
  })

  it('la prova si apre solo con la master key, e il suo hash è quello mandato al server', async () => {
    const product = await productKey()
    const { masterKey, setup } = await createMasterKey(product, 'acc-1')
    const proof = await openProof(setup.wrappedProof, masterKey, 'acc-1')
    const hash = await sha256(proof)
    expect(btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')).toBe(setup.proofHash)

    const altra = await createMasterKey(product, 'acc-1')
    expect(await masterKeyMatches(altra.masterKey, setup.wrappedProof, 'acc-1')).toBe(false)
    expect(await masterKeyMatches(masterKey, setup.wrappedProof, 'acc-1')).toBe(true)
  })

  it('una busta di un altro account, o la chiave di un altro prodotto, non apre niente', async () => {
    const product = await productKey()
    const { setup } = await createMasterKey(product, 'acc-1')
    await expect(openMasterKey(setup.wrappedMasterKey, product, 'acc-2')).rejects.toThrow()
    await expect(openMasterKey(setup.wrappedMasterKey, await productKey(), 'acc-1')).rejects.toThrow()
    await expect(openMasterKey(setup.wrappedMasterKey.slice(3), product, 'acc-1')).rejects.toThrow(/formato/)
  })
})
