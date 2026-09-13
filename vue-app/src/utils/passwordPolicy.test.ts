import { describe, it, expect } from 'vitest'
import { passwordRules, isPasswordValid } from './passwordPolicy'

/**
 * La policy mostrata nel form deve coincidere con quella del User Pool Cognito.
 *
 * Perché merita test: se il client è più permissivo del server, l'utente vede tutte le
 * spunte verdi e poi si prende un rifiuto generico che non dice cosa manca. È successo con
 * `Test1234#`: 9 caratteri, validi per il vecchio controllo a 8, rifiutati dal pool a 12.
 */

describe('passwordPolicy', () => {
  it('rifiuta la password che passava il form ma non Cognito', () => {
    expect(isPasswordValid('Test1234#')).toBe(false)
    const length = passwordRules('Test1234#').find((rule) => rule.label.includes('caratteri'))
    expect(length?.ok).toBe(false)
  })

  it('accetta una password che rispetta tutti i criteri del pool', () => {
    expect(isPasswordValid('Test1234#abc')).toBe(true)
  })

  it('conta come simbolo ogni carattere speciale che Cognito riconosce', () => {
    const symbols = ['^', '$', '*', '.', '[', ']', '{', '}', '(', ')', '?', '"', '!', '@', '#', '%', '&', '/', '\\', ',', '>', '<', "'", ':', ';', '|', '_', '~', '`', '=', '+', '-']
    for (const symbol of symbols) {
      expect(isPasswordValid(`Abcdefgh123${symbol}`), symbol).toBe(true)
    }
  })

  it('non conta come simbolo lettere accentate, € o spazi', () => {
    for (const notSymbol of ['è', '€', ' ']) {
      expect(isPasswordValid(`Abcdefgh123${notSymbol}`), JSON.stringify(notSymbol)).toBe(false)
    }
  })
})
