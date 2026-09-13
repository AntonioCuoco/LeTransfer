import { describe, it, expect } from 'vitest'
import { wordlist } from './bip39-wordlist'

/**
 * Invarianti della wordlist.
 *
 * ⚠️ Perché questo file esiste. La lista conteneva **"night" duplicata**: compariva sia
 * al suo posto (indice 1195) sia dove doveva stare "tonight" (indice 1829). Poiché la
 * generazione della mnemonica usa l'indice mentre la verifica del checksum usa
 * `indexOf()` — che restituisce sempre la PRIMA occorrenza — ogni frase che pescava
 * l'indice 1829 risultava **invalida per l'applicazione stessa**: circa 1 frase su 86
 * (1,17%). L'utente vedeva un errore generico durante la configurazione della chiave di
 * recupero, senza alcun modo di capire perché.
 *
 * Un difetto simile non si vede leggendo il codice e non si vede provando l'app una
 * volta: si vede solo con questi tre controlli. Non rimuoverli.
 */

describe('wordlist BIP39', () => {
  // La lista precedente passava tutti gli invarianti qui sotto e NON era BIP39: 10 parole
  // estranee e 1014 indici spostati. Gli invarianti dicono che la lista è coerente; solo
  // l'hash dice che è quella giusta.
  it('è esattamente la wordlist inglese ufficiale BIP39', async () => {
    const officialFile = new TextEncoder().encode(`${wordlist.join('\n')}\n`)
    const digest = await crypto.subtle.digest('SHA-256', officialFile)
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')

    expect(hex).toBe('2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda')
  })

  it('contiene esattamente 2048 parole (11 bit per parola)', () => {
    expect(wordlist).toHaveLength(2048)
  })

  // È l'invariante che era rotta: con un duplicato, indice e indexOf divergono.
  it('non contiene duplicati', () => {
    const duplicates = wordlist.filter((word, index) => wordlist.indexOf(word) !== index)

    expect(duplicates).toEqual([])
  })

  it('ogni parola si ritrova al proprio indice', () => {
    wordlist.forEach((word, index) => {
      expect(wordlist.indexOf(word), `"${word}" all'indice ${index}`).toBe(index)
    })
  })

  it('è ordinata alfabeticamente', () => {
    const outOfOrder = wordlist
      .map((word, index) => ({ word, index, prev: wordlist[index - 1] }))
      .filter(({ word, index, prev }) => index > 0 && word <= prev)

    expect(outOfOrder).toEqual([])
  })

  it('contiene solo lettere minuscole', () => {
    const invalid = wordlist.filter((word) => !/^[a-z]+$/.test(word))

    expect(invalid).toEqual([])
  })
})
