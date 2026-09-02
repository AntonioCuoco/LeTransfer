import { describe, it, expect } from 'vitest'
import {
  encryptFileName,
  decryptFileName,
  generateAESKey,
  encryptChunkFramed,
  arrayBufferToBase64,
} from './crypto'

/**
 * Nome del file cifrato (O2.2).
 *
 * Il nome è spesso più rivelatore del contenuto, ed era l'ultima cosa dei contenuti che il
 * server vedeva in chiaro. Questi test presidiano le due proprietà che, se saltano, saltano
 * **in silenzio**: il giro completo deve restituire il nome esatto (altrimenti l'utente
 * scarica file chiamati male e se ne accorge tardi), e la separazione di dominio deve
 * reggere.
 */

describe('nome del file cifrato', () => {
  it('torna identico dopo un giro completo', async () => {
    const key = await generateAESKey()
    const name = 'Ricorso Rossi vs Bianchi — udienza 12 marzo.pdf'
    expect(await decryptFileName(await encryptFileName(name, key), key)).toBe(name)
  })

  it('regge accenti, emoji e caratteri non latini', async () => {
    const key = await generateAESKey()
    for (const name of ['perizia_àèìòù.pdf', '契約書.docx', 'foto 📸 (1).jpeg', 'a'.repeat(255)]) {
      expect(await decryptFileName(await encryptFileName(name, key), key)).toBe(name)
    }
  })

  it('due cifrature dello stesso nome danno blob diversi', async () => {
    const key = await generateAESKey()
    const a = await encryptFileName('contratto.pdf', key)
    const b = await encryptFileName('contratto.pdf', key)
    // IV nuovo a ogni cifratura: senza, due file con lo stesso nome sarebbero
    // riconoscibili come tali da chi guarda soltanto lo storage.
    expect(a).not.toBe(b)
    expect(await decryptFileName(b, key)).toBe('contratto.pdf')
  })

  it('la chiave sbagliata non apre il nome', async () => {
    const key = await generateAESKey()
    const other = await generateAESKey()
    const blob = await encryptFileName('bilancio.xlsx', key)
    await expect(decryptFileName(blob, other)).rejects.toThrow()
  })

  it('un nome manomesso viene rifiutato invece di essere restituito storto', async () => {
    const key = await generateAESKey()
    const blob = await encryptFileName('verbale.pdf', key)
    const raw = new Uint8Array(Buffer.from(blob, 'base64'))
    raw[raw.length - 3] ^= 0xff
    await expect(decryptFileName(arrayBufferToBase64(raw.buffer), key)).rejects.toThrow()
  })

  it('un chunk del file non può essere spacciato per un nome', async () => {
    // È il motivo per cui l'AAD del nome è `filename` e non un indice: senza separazione di
    // dominio, chi controlla lo storage potrebbe scambiare i due campi — sarebbero entrambi
    // ciphertext valido sotto la stessa chiave — e il tag non se ne accorgerebbe.
    const key = await generateAESKey()
    const chunk = await encryptChunkFramed(new TextEncoder().encode('contenuto').buffer as ArrayBuffer, key, 0)
    await expect(decryptFileName(arrayBufferToBase64(chunk.buffer), key)).rejects.toThrow()
  })
})
