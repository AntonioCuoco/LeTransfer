import { emitKeypressEvents } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

/**
 * Una scelta da elenco con le frecce: ↑/↓ per muoversi, Invio per confermare, Esc (o Ctrl+C)
 * per uscire senza scegliere. Niente librerie: sono poche righe di sequenze ANSI, e la CLI
 * resta senza dipendenze a runtime.
 *
 * Il terminale va in «raw mode» per ricevere i tasti uno per uno invece che a riga intera.
 * ⚠️ Va SEMPRE ripristinato, anche uscendo con Ctrl+C: un terminale lasciato in raw mode non
 * mostra più quello che si scrive, e l'utente crede che si sia rotto. Per questo Ctrl+C qui
 * non uccide il processo (in raw mode non arriva nemmeno come segnale) ma chiude la scelta.
 */

interface KeyInput extends Readable {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => unknown
}

export interface SelectOptions {
  /** L'elemento evidenziato all'inizio. */
  initial?: number
  input?: KeyInput
  output?: Writable
}

interface Key {
  name?: string
  ctrl?: boolean
}

const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'
const CLEAR_LINE = '\x1b[2K'
const CLEAR_BELOW = '\x1b[J'
const up = (lines: number) => (lines > 0 ? `\x1b[${lines}A` : '')

/** Le righe del menu, con l'elemento corrente evidenziato. */
export function renderChoices(labels: string[], index: number): string[] {
  return labels.map((label, i) => (i === index ? `\x1b[36m❯ ${label}\x1b[0m` : `  ${label}`))
}

/** Dove va il cursore dopo un tasto; `null` se il tasto non sposta niente. Si gira in tondo. */
export function moveCursor(index: number, key: Key, length: number): number | null {
  if (key.name === 'up' || key.name === 'k') return (index - 1 + length) % length
  if (key.name === 'down' || key.name === 'j') return (index + 1) % length
  if (key.name === 'home') return 0
  if (key.name === 'end') return length - 1
  return null
}

/** L'indice scelto, o `null` se si è usciti senza scegliere. */
export function select(labels: string[], options: SelectOptions = {}): Promise<number | null> {
  const input: KeyInput = options.input ?? process.stdin
  const output: Writable = options.output ?? process.stderr
  let index = Math.min(Math.max(options.initial ?? 0, 0), labels.length - 1)

  const draw = (first: boolean) => {
    const lines = renderChoices(labels, index)
    output.write(`${first ? '' : up(lines.length)}${lines.map((line) => `${CLEAR_LINE}${line}\n`).join('')}`)
  }

  return new Promise((resolve) => {
    emitKeypressEvents(input)
    input.setRawMode?.(true)
    input.resume()
    output.write(HIDE_CURSOR)
    draw(true)

    const finish = (choice: number | null) => {
      input.off('keypress', onKey)
      input.setRawMode?.(false)
      input.pause()
      // Il menu sparisce: al suo posto andrà il risultato della scelta.
      output.write(`${up(labels.length)}${CLEAR_BELOW}${SHOW_CURSOR}`)
      resolve(choice)
    }

    function onKey(_text: string, key: Key = {}) {
      if (key.name === 'return' || key.name === 'enter') return finish(index)
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) return finish(null)
      const next = moveCursor(index, key, labels.length)
      if (next !== null && next !== index) {
        index = next
        draw(false)
      }
    }

    input.on('keypress', onKey)
  })
}
