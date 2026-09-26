import { describe, it, expect } from 'vitest'
import { safeFileName, FALLBACK_NAME } from '../src/filename'

/**
 * Il nome di un file ricevuto lo sceglie il mittente: qui si verifica che, qualunque cosa
 * scelga, non possa uscire dalla cartella di destinazione né diventare qualcosa che non è un
 * file normale — su Linux, macOS **e Windows**, perché la stessa CLI gira su tutti e tre.
 */
describe('nome di file sicuro', () => {
  it.each([
    ['../../../etc/passwd', 'passwd'],
    ['..\\..\\Windows\\win.ini', 'win.ini'],
    ['C:\\Users\\vittima\\.ssh\\authorized_keys', 'authorized_keys'],
    ['/assoluto/percorso/file.txt', 'file.txt'],
    ['cartella/sotto/file.txt', 'file.txt'],
  ])('«%s» → «%s»: solo l’ultimo componente', (input, expected) => {
    expect(safeFileName(input)).toBe(expected)
  })

  it.each(['.', '..', '', '   ', '///', '\\\\', '...'])('«%s» → nome di ripiego', (input) => {
    expect(safeFileName(input)).toBe(FALLBACK_NAME)
  })

  it('i nomi riservati di Windows non diventano dispositivi', () => {
    // Su Windows «CON» o «nul.txt» non sono file: scrivere lì non salva niente, in silenzio.
    expect(safeFileName('CON')).toBe('_CON')
    expect(safeFileName('nul.txt')).toBe('_nul.txt')
    expect(safeFileName('com1.pdf')).toBe('_com1.pdf')
    expect(safeFileName('console.log')).toBe('console.log')
  })

  it('caratteri di controllo e vietati da Windows diventano «_»', () => {
    expect(safeFileName('a\u0000b\u001bc.txt')).toBe('a_b_c.txt')
    expect(safeFileName('report:2026?.pdf')).toBe('report_2026_.pdf')
  })

  it('punti e spazi finali via: Windows li toglierebbe cambiando il nome sotto i piedi', () => {
    expect(safeFileName('documento.pdf. . ')).toBe('documento.pdf')
  })

  it('un nome lunghissimo si accorcia tenendo l’estensione', () => {
    const name = safeFileName(`${'a'.repeat(500)}.pdf`)
    expect(name.length).toBeLessThanOrEqual(200)
    expect(name.endsWith('.pdf')).toBe(true)
  })

  it('i nomi normali restano identici, accenti e spazi compresi', () => {
    expect(safeFileName('Contratto firmato — Rossi (v2).pdf')).toBe('Contratto firmato — Rossi (v2).pdf')
  })
})
