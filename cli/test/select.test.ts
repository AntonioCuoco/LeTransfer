import { describe, it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { moveCursor, renderChoices, select } from '../src/select'

/**
 * Il menu con le frecce, con un terminale finto: si «premono» i tasti scrivendo le loro
 * sequenze sullo stream d'ingresso, come fa un terminale vero.
 *
 * La cosa più importante da difendere non è la navigazione: è che il terminale torni SEMPRE
 * normale (raw mode spento, cursore visibile), in qualunque modo si esca.
 */

const KEYS = { up: '\x1b[A', down: '\x1b[B', enter: '\r', ctrlC: '\x03', escape: '\x1b' }
const LABELS = ['Copia negli appunti', 'Mostra il QR code', 'Email', 'Fine']

function fakeTerminal() {
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode: vi.fn() })
  const output = new PassThrough()
  let written = ''
  output.on('data', (chunk) => (written += chunk))
  return { input, output, written: () => written }
}

async function press(input: PassThrough, ...keys: string[]) {
  for (const key of keys) {
    input.write(key)
    await new Promise((r) => setImmediate(r))
  }
}

describe('select', () => {
  it('parte dal primo elemento: Invio subito lo sceglie', async () => {
    const t = fakeTerminal()
    const choice = select(LABELS, t)
    await press(t.input, KEYS.enter)
    expect(await choice).toBe(0)
  })

  it('↓ ↓ Invio → il terzo', async () => {
    const t = fakeTerminal()
    const choice = select(LABELS, t)
    await press(t.input, KEYS.down, KEYS.down, KEYS.enter)
    expect(await choice).toBe(2)
  })

  it('gira in tondo: ↑ dal primo va all’ultimo, ↓ dall’ultimo al primo', async () => {
    const a = fakeTerminal()
    const first = select(LABELS, a)
    await press(a.input, KEYS.up, KEYS.enter)
    expect(await first).toBe(3)

    const b = fakeTerminal()
    const second = select(LABELS, { ...b, initial: 3 })
    await press(b.input, KEYS.down, KEYS.enter)
    expect(await second).toBe(0)
  })

  it('Esc e Ctrl+C escono senza scegliere', async () => {
    const a = fakeTerminal()
    const byCtrlC = select(LABELS, a)
    await press(a.input, KEYS.ctrlC)
    expect(await byCtrlC).toBeNull()

    const b = fakeTerminal()
    const byEscape = select(LABELS, b)
    await press(b.input, KEYS.escape)
    // Esc da solo: readline aspetta un attimo per capire che non è l'inizio di una freccia.
    expect(await byEscape).toBeNull()
  })

  it('il terminale torna normale in ogni caso: raw mode spento, cursore visibile', async () => {
    for (const exit of [KEYS.enter, KEYS.ctrlC]) {
      const t = fakeTerminal()
      const choice = select(LABELS, t)
      await press(t.input, exit)
      await choice
      expect(t.input.setRawMode.mock.calls).toEqual([[true], [false]])
      expect(t.written().endsWith('\x1b[?25h')).toBe(true)
    }
  })

  it('evidenzia solo l’elemento corrente', () => {
    const lines = renderChoices(LABELS, 1)
    expect(lines[1]).toContain('❯ Mostra il QR code')
    expect(lines.filter((line) => line.includes('❯'))).toHaveLength(1)
    expect(moveCursor(0, { name: 'x' }, 4)).toBeNull()
  })
})
