import { describe, it, expect } from 'vitest'
import { generateRecoveryKey, deriveMasterKeyFromMnemonic, createVerificationHash, verifyMasterKey } from './recovery-key'
import { wordlist } from './bip39-wordlist'
import { generateSalt } from './crypto'

/**
 * Test della chiave di recupero.
 *
 * Se la derivazione non fosse deterministica, un utente con le parole giuste si
 * ritroverebbe comunque fuori dai propri file — il peggior difetto immaginabile in
 * un prodotto E2E, e per giunta invisibile fino al giorno del bisogno.
 */

const encrypt = async (key: CryptoKey, iv: Uint8Array, text: string) =>
  crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text))

describe('generazione della mnemonica', () => {
  it('produce 24 parole', async () => {
    const words = (await generateRecoveryKey()).split(' ')

    expect(words).toHaveLength(24)
  })

  it('usa solo parole della wordlist BIP39', async () => {
    const words = (await generateRecoveryKey()).split(' ')

    words.forEach((word) => expect(wordlist).toContain(word))
  })

  it('due generazioni non coincidono mai', async () => {
    const [a, b] = await Promise.all([generateRecoveryKey(), generateRecoveryKey()])

    expect(a).not.toBe(b)
  })
})

describe('derivazione della master key', () => {
  it('è deterministica: stessa mnemonica e stesso salt → stessa chiave', async () => {
    const mnemonic = await generateRecoveryKey()
    const salt = generateSalt()
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const first = await deriveMasterKeyFromMnemonic(mnemonic, salt)
    const second = await deriveMasterKeyFromMnemonic(mnemonic, salt)

    // Non sono esportabili: si confrontano per ciò che sanno fare, non per i byte.
    const sealed = await encrypt(first, iv, 'VERIFY')
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, second, sealed)

    expect(new TextDecoder().decode(opened)).toBe('VERIFY')
  })

  it('un salt diverso produce una chiave diversa', async () => {
    const mnemonic = await generateRecoveryKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const withSaltA = await deriveMasterKeyFromMnemonic(mnemonic, generateSalt())
    const withSaltB = await deriveMasterKeyFromMnemonic(mnemonic, generateSalt())

    const sealed = await encrypt(withSaltA, iv, 'VERIFY')

    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, withSaltB, sealed)).rejects.toThrow()
  })

  it('una mnemonica diversa non apre ciò che ha chiuso l’altra', async () => {
    const salt = generateSalt()
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const mine = await deriveMasterKeyFromMnemonic(await generateRecoveryKey(), salt)
    const stranger = await deriveMasterKeyFromMnemonic(await generateRecoveryKey(), salt)

    const sealed = await encrypt(mine, iv, 'VERIFY')

    await expect(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, stranger, sealed)).rejects.toThrow()
  })
}, 30_000) // PBKDF2 a 100k iterazioni, più volte per test

/**
 * Il blob di verifica decide chi entra: le 24 parole digitate, e anche una master key
 * ricordata su questo dispositivo. Se accettasse la chiave sbagliata, il vault si
 * "sbloccherebbe" con una chiave che non apre nessun file.
 */
describe('verifica della master key', () => {
  const nuovaChiave = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])

  it('la chiave che ha creato il blob lo apre', async () => {
    const masterKey = await nuovaChiave()
    const hash = await createVerificationHash(masterKey)

    expect(await verifyMasterKey(masterKey, hash)).toBe(true)
  })

  it('un\'altra chiave no', async () => {
    const hash = await createVerificationHash(await nuovaChiave())

    expect(await verifyMasterKey(await nuovaChiave(), hash)).toBe(false)
  })

  it('un blob rovinato dà false, non un\'eccezione', async () => {
    expect(await verifyMasterKey(await nuovaChiave(), 'non-è-base64-valido')).toBe(false)
  })
})
