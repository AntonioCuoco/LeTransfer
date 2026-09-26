import { createInterface } from 'node:readline/promises'
import { stdin, stderr } from 'node:process'

/**
 * Tutto ciò che la CLI dice all'utente va su **stderr**. Su stdout esce solo il risultato
 * (il percorso del file scaricato, il link di un invio), così che si possa usare in uno
 * script: `open "$(novren get "$LINK")"`.
 */

export const interactive = () => Boolean(stdin.isTTY && stderr.isTTY)

export function info(message: string): void {
  stderr.write(`${message}\n`)
}

export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stderr, terminal: true })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

/**
 * Domanda con risposta nascosta, per le password.
 *
 * Mai una password come argomento (`--password segreto`): finirebbe nella cronologia della
 * shell e nell'elenco dei processi, visibile a ogni utente della macchina.
 */
export async function askSecret(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stderr, terminal: true })
  // readline riscrive la riga a ogni tasto: si intercetta l'output e si mostra solo la domanda.
  const internal = rl as unknown as { _writeToOutput: (text: string) => void }
  let asked = false
  internal._writeToOutput = (text: string) => {
    if (!asked) {
      stderr.write(text)
      asked = true
    }
  }
  try {
    return await rl.question(question)
  } finally {
    stderr.write('\n')
    rl.close()
  }
}

/** Una riga di avanzamento che si riscrive da sola, solo se c'è un terminale a guardarla. */
export function progress(label: string): { update: (done: number, total: number) => void; end: () => void } {
  if (!stderr.isTTY) return { update: () => {}, end: () => {} }
  let last = -1
  return {
    update(done, total) {
      const percent = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0
      if (percent === last) return
      last = percent
      stderr.write(`\r${label} ${String(percent).padStart(3)}%  ${formatBytes(done)} / ${formatBytes(total)}`)
    },
    end() {
      stderr.write('\n')
    },
  }
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}
