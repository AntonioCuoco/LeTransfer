import { describe, it, expect } from 'vitest'
import { encodeQr, qrToPath, QrTooLongError } from './qr'

/**
 * Test del codificatore QR (roadmap F1.3).
 *
 * Il punto delicato di un QR scritto in casa è che **sembra sempre funzionare**:
 * disegna dei quadratini, e se sbagli un bit di correzione il difetto salta fuori
 * solo sul telefono di qualcun altro. Perciò qui non si verifica "che disegni
 * qualcosa", ma che disegni **esattamente** ciò che disegna un'implementazione
 * indipendente.
 *
 * I fixture sotto sono stati prodotti con `node-qrcode` (modalità byte forzata,
 * correzione M, **maschera forzata** — altrimenti si confronterebbe l'euristica di
 * scelta della maschera, che è una questione di gusto, non di correttezza). Sono un
 * oracolo esterno: se una riga di `qr.ts` cambia comportamento, questi test cadono.
 *
 * Rigenerarli:
 *   npm i qrcode  (in una cartella temporanea, NON nel progetto)
 *   qrcode.create([{ data: new TextEncoder().encode(text), mode: 'byte' }],
 *                 { errorCorrectionLevel: 'M', maskPattern: <n> })
 */

const LINK_BASE = 'https://letransfer.app/share/'
const LINK_TOKEN = '9f2c1d4e6b8a0c3f5e7d9b1a3c5e7f90'

function renderRows(text: string, mask: number): string[] {
  const matrix = encodeQr(text, { mask })
  return matrix.modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''))
}

async function digestOf(rows: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(rows.join('\n'))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

describe('encodeQr — confronto con un\'implementazione indipendente', () => {
  // Versione 1 per intero e a occhio nudo: ci si leggono i tre mirini agli angoli,
  // la riga di timing alternata e il modulo sempre scuro in basso a sinistra.
  it('riproduce la matrice di riferimento per un testo corto (v1, maschera 0)', () => {
    expect(renderRows('hello', 0)).toEqual([
      '#######..##...#######',
      '#.....#.##....#.....#',
      '#.###.#..#.##.#.###.#',
      '#.###.#...##..#.###.#',
      '#.###.#.##..#.#.###.#',
      '#.....#.....#.#.....#',
      '#######.#.#.#.#######',
      '..........###........',
      '#.#.#.#..#.#....#..#.',
      '..#.##....#...#....##',
      '.#.#..#.###.#...#####',
      '##..#.........#....#.',
      '.##.#.##..#.#.#.#....',
      '........####.#.#..###',
      '#######...##.###..###',
      '#.....#...####.##....',
      '#.###.#.#.##.###...##',
      '#.###.#..#....##..##.',
      '#.###.#.###.#...#.#.#',
      '#.....#..#....#.#..#.',
      '#######.###.#.##...##',
    ])
  })

  // Le matrici grandi si confrontano per digest: srotolarle qui dentro sarebbe
  // illeggibile e non aggiungerebbe niente al confronto.
  const digestCases: { name: string; text: string; mask: number; version: number; size: number; digest: string }[] = [
    {
      name: 'accenti (UTF-8 multibyte, v1, maschera 6)',
      text: 'àèìòù',
      mask: 6,
      version: 1,
      size: 21,
      digest: '61889d1b855a983124b358091ee92a02ca980064155bfb5486422a394fea7cda',
    },
    {
      name: 'link corto (v3, maschera 5)',
      text: `${LINK_BASE}abc123`,
      mask: 5,
      version: 3,
      size: 29,
      digest: 'c7cb123ffcb1be67bcefc30fc1c58ca21ff00045fda271caf1db5d7d76f251cc',
    },
    {
      // v8 > 7 → la matrice contiene anche i bit di versione, un blocco a sé.
      name: 'link con chiave lunga (v8, bit di versione, maschera 4)',
      text: `${LINK_BASE}${LINK_TOKEN}#${'k'.repeat(90)}`,
      mask: 4,
      version: 8,
      size: 49,
      digest: '99f83948396e24ac65dd9709ff33f283b0b31dd7e164e67a3844afd66fbd2fa9',
    },
    {
      // v10 → il contatore di caratteri passa da 8 a 16 bit e i blocchi si moltiplicano.
      name: 'contenuto lungo (v10, contatore a 16 bit, maschera 2)',
      text: `${LINK_BASE}${LINK_TOKEN}#${'k'.repeat(120)}`,
      mask: 2,
      version: 10,
      size: 57,
      digest: 'aeab0e6b7fb19f31aa79570cc76b3de91535a89b2beed048fe2421ff304bf841',
    },
    {
      name: 'contenuto molto lungo (v17, maschera 7)',
      text: `${LINK_BASE}${LINK_TOKEN}#${'k'.repeat(400)}`,
      mask: 7,
      version: 17,
      size: 85,
      digest: '7a9613ed6f092345bfe5d7f4bd843ecb57bae43d292f7b8745f2653ea922dc71',
    },
  ]

  for (const testCase of digestCases) {
    it(`riproduce la matrice di riferimento — ${testCase.name}`, async () => {
      const matrix = encodeQr(testCase.text, { mask: testCase.mask })
      expect(matrix.version).toBe(testCase.version)
      expect(matrix.size).toBe(testCase.size)
      expect(await digestOf(renderRows(testCase.text, testCase.mask))).toBe(testCase.digest)
    })
  }
})

describe('encodeQr — struttura', () => {
  it('sceglie la versione più piccola che contiene il testo', () => {
    // Capacità in modalità byte con correzione M: 14 byte alla v1, 26 alla v2.
    expect(encodeQr('x'.repeat(14)).version).toBe(1)
    expect(encodeQr('x'.repeat(15)).version).toBe(2)
    expect(encodeQr('x'.repeat(26)).version).toBe(2)
    expect(encodeQr('x'.repeat(27)).version).toBe(3)
  })

  it('dimensiona la matrice come 4 × versione + 17', () => {
    for (const text of ['a', 'x'.repeat(200), 'x'.repeat(900)]) {
      const matrix = encodeQr(text)
      expect(matrix.size).toBe(matrix.version * 4 + 17)
      expect(matrix.modules).toHaveLength(matrix.size)
      for (const row of matrix.modules) expect(row).toHaveLength(matrix.size)
    }
  })

  it('disegna i tre mirini, il timing e il modulo sempre scuro', () => {
    const { modules, size } = encodeQr(`${LINK_BASE}${LINK_TOKEN}#chiave`)

    // Mirino = anello scuro 7×7 con centro pieno 3×3, ai tre angoli (non al quarto).
    for (const [originY, originX] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let d = 0; d < 7; d += 1) {
        expect(modules[originY][originX + d]).toBe(true) // bordo superiore
        expect(modules[originY + 6][originX + d]).toBe(true) // bordo inferiore
      }
      expect(modules[originY + 3][originX + 3]).toBe(true) // centro
      expect(modules[originY + 1][originX + 1]).toBe(false) // anello chiaro
    }

    // Riga e colonna di timing: moduli alternati a partire da scuro.
    for (let i = 8; i < size - 8; i += 1) {
      expect(modules[6][i]).toBe(i % 2 === 0)
      expect(modules[i][6]).toBe(i % 2 === 0)
    }

    expect(modules[size - 8][8]).toBe(true) // il modulo che è sempre scuro
  })

  it('sceglie sempre una maschera valida, in modo deterministico', () => {
    const link = `${LINK_BASE}${LINK_TOKEN}#chiave-di-esempio`
    const first = encodeQr(link)
    expect(first.mask).toBeGreaterThanOrEqual(0)
    expect(first.mask).toBeLessThanOrEqual(7)
    expect(encodeQr(link).mask).toBe(first.mask)
  })

  it('rifiuta ciò che non entra nemmeno nella versione 40', () => {
    // Il tetto della modalità byte con correzione M è 2331 caratteri.
    expect(() => encodeQr('x'.repeat(2331))).not.toThrow()
    expect(() => encodeQr('x'.repeat(2332))).toThrow(QrTooLongError)
  })
})

describe('qrToPath', () => {
  it('emette un rettangolo unitario per ogni modulo scuro', () => {
    const matrix = encodeQr('hello', { mask: 0 })
    const darkCount = matrix.modules.flat().filter(Boolean).length
    const path = qrToPath(matrix)

    expect(path.match(/M/g) ?? []).toHaveLength(darkCount)
    expect(path.startsWith('M0 0h1v1h-1z')).toBe(true) // il primo modulo del mirino
  })
})
