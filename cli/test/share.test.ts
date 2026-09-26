import { describe, it, expect } from 'vitest'
import { encode } from 'uqr'
import { composeMessage, isEmail, mailtoUrl, menuEntries, renderQr, telegramUrl, whatsappUrl } from '../src/share'

// Un link vero ha «&» e «#»: sono proprio i caratteri che un indirizzo costruito male spezza.
const transfer = {
  link: 'https://novren.net/share/tok00000001AbCdEf#key=Ab-_cd12Ef34gh56Ij78kl90Mn12op34Qr56st78Uv9&iv=Wx12Yz34Ab56Cd78',
  name: 'contratto firmato.pdf',
  expiresAt: '2026-10-03T12:00:00.000Z',
  passwordProtected: false,
}

describe('il messaggio', () => {
  it('contiene il link intero, il nome e la scadenza', () => {
    const text = composeMessage(transfer)
    expect(text).toContain(transfer.link)
    expect(text).toContain('«contratto firmato.pdf»')
    expect(text).toContain('scade il')
    expect(text).not.toContain('password')
  })

  it('con la password lo dice, ma la password non c’è', () => {
    expect(composeMessage({ ...transfer, passwordProtected: true })).toContain('te la mando a parte')
  })
})

describe('mailto', () => {
  it('il link arriva nel corpo intatto, con «&» e «#»', () => {
    const url = new URL(mailtoUrl(transfer, 'mario@example.com'))
    expect(url.protocol).toBe('mailto:')
    expect(url.pathname).toBe('mario@example.com')
    // Solo oggetto e corpo: un «&» del link non deve diventare un parametro in più.
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body'])
    expect(url.searchParams.get('body')).toContain(transfer.link)
    expect(url.searchParams.get('subject')).toContain('contratto firmato.pdf')
  })

  it('righe in CRLF e spazi come %20, come vuole la RFC 6068', () => {
    const raw = mailtoUrl(transfer, '')
    expect(raw).toContain('%0D%0A')
    expect(raw).not.toContain('+')
    expect(raw.startsWith('mailto:?subject=')).toBe(true)
  })

  it('un indirizzo con parametri nascosti si rifiuta', () => {
    expect(isEmail('mario@example.com')).toBe(true)
    for (const bad of ['mario@example.com?bcc=spia@x.it', 'a@b.it&cc=c@d.it', 'non è una email', 'mario@', 'a@b.it#x']) {
      expect(isEmail(bad), bad).toBe(false)
      expect(() => mailtoUrl(transfer, bad), bad).toThrow()
    }
  })
})

describe('chat', () => {
  it('WhatsApp: l’app, non wa.me — e il link intero nel testo', () => {
    const url = whatsappUrl(transfer)
    expect(url.startsWith('whatsapp://send?text=')).toBe(true)
    expect(new URL(url).searchParams.get('text')).toContain(transfer.link)
  })

  it('Telegram: l’app, non t.me — link nel suo parametro, non ripetuto nel testo', () => {
    const url = new URL(telegramUrl(transfer))
    expect(url.protocol).toBe('tg:')
    expect(url.searchParams.get('url')).toBe(transfer.link)
    expect(url.searchParams.get('text')).not.toContain(transfer.link)
  })
})

describe('QR', () => {
  it('il disegno è esattamente la matrice del QR: si rilegge modulo per modulo', () => {
    const expected = encode(transfer.link, { ecc: 'L', border: 2 }).data
    const rows = renderQr(transfer.link).split('\n')
    expect(rows.length).toBe(Math.ceil(expected.length / 2))

    // Ogni cella: colore del testo (modulo sopra) e dello sfondo (modulo sotto), poi «▀».
    const cell = /\x1b\[(30|97)m\x1b\[(40|107)m▀/g
    const decoded: boolean[][] = []
    for (const row of rows) {
      const top: boolean[] = []
      const bottom: boolean[] = []
      for (const [, fg, bg] of row.matchAll(cell)) {
        top.push(fg === '30')
        bottom.push(bg === '40')
      }
      decoded.push(top, bottom)
    }
    // Se le righe sono dispari, l'ultima riga «sotto» è solo bordo bianco aggiunto.
    expect(decoded.slice(0, expected.length)).toEqual(expected)
  })
})

describe('menu', () => {
  it('senza schermo (SSH) solo appunti e QR: email e app non avrebbero dove aprirsi', () => {
    expect(menuEntries(true).map((e) => e.label)).toHaveLength(2)
    expect(menuEntries(false).map((e) => e.label)).toHaveLength(5)
  })
})
