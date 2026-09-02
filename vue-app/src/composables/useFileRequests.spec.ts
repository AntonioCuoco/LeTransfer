import { describe, it, expect } from 'vitest'
import { isOpen, requestUrl, type FileRequest } from './useFileRequests'

/**
 * `isOpen` decide se una richiesta accetta ancora file, e da lei dipendono tre bottoni:
 * copia link, chiudi, e l'etichetta di stato. Se sbaglia, sbaglia **in silenzio** — il
 * destinatario continua a distribuire un link che il server rifiuta, e se ne accorge solo
 * quando il cliente scrive «non funziona».
 *
 * Il server resta l'ultima parola (risponde `410`): questi controlli servono a non
 * mostrare come vivo qualcosa che è già morto, non a fare da guardia.
 */

const base: FileRequest = {
  requestId: 'r1',
  publicToken: 'tok',
  title: 'Documenti causa Rossi',
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  maxUploads: null,
  uploadCount: 0,
  closedAt: null,
  createdAt: new Date().toISOString(),
}

describe('isOpen', () => {
  it('una richiesta appena creata accetta file', () => {
    expect(isOpen(base)).toBe(true)
  })

  it('una richiesta chiusa a mano non accetta più niente', () => {
    expect(isOpen({ ...base, closedAt: new Date().toISOString() })).toBe(false)
  })

  it('una richiesta scaduta non accetta più niente', () => {
    expect(isOpen({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(false)
  })

  it('si chiude al raggiungimento del massimo', () => {
    expect(isOpen({ ...base, maxUploads: 3, uploadCount: 3 })).toBe(false)
    expect(isOpen({ ...base, maxUploads: 3, uploadCount: 2 })).toBe(true)
  })

  it('senza massimo il conteggio non la chiude mai', () => {
    expect(isOpen({ ...base, maxUploads: null, uploadCount: 999 })).toBe(true)
  })

  it('la chiusura manuale vince su tutto il resto', () => {
    const stillValid = { ...base, closedAt: new Date().toISOString(), uploadCount: 0 }
    expect(isOpen(stillValid)).toBe(false)
  })
})

describe('requestUrl', () => {
  it('costruisce un link senza frammento', () => {
    const url = requestUrl('abc123')
    // Qui la chiave NON va nel `#`: chi carica cifra sulla chiave pubblica del
    // destinatario, non su una chiave trasportata dal link. Un frammento qui sarebbe il
    // segno che qualcuno ha copiato il flusso sbagliato.
    expect(url).not.toContain('#')
    expect(url).toContain('/richiesta/abc123')
  })

  it('non produce doppie barre se la base ne ha già una in fondo', () => {
    expect(requestUrl('tok')).not.toMatch(/[^:]\/\//)
  })
})
