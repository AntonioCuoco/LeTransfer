/**
 * Codificatore QR minimo — **modalità byte, correzione M**, versioni 1–40.
 *
 * Perché scritto in casa e non una dipendenza (roadmap F1.3):
 * il QR contiene il link **con la chiave nel fragment**, cioè il segreto stesso
 * dell'invio. Il codice che lo disegna è quindi codice che tocca materiale
 * crittografico, e in un prodotto che promette build verificabili una libreria in
 * più è superficie in più da far fidare a chi ci legge. Sono ~250 righe di
 * aritmetica pubblica (ISO/IEC 18004), senza rete, senza DOM, senza stato globale:
 * costano meno di quanto costerebbe giustificare la dipendenza.
 *
 * Correzione **M** (~15% di ridondanza): è il compromesso standard per un link
 * inquadrato da un telefono. L non sopravvive a uno schermo sporco o a una foto
 * storta; Q e H farebbero crescere la matrice, e un QR più fitto si legge peggio
 * proprio sui telefoni vecchi che dovremmo aiutare.
 *
 * Correttezza: verificato matrice per matrice contro un'implementazione di
 * riferimento a maschera forzata (vedi qr.test.ts) — non "sembra funzionare".
 */

export interface QrMatrix {
  /** Lato della matrice, in moduli (21 per la versione 1, +4 per ogni versione). */
  size: number
  /** `modules[riga][colonna]`, `true` = modulo scuro. */
  modules: boolean[][]
  version: number
  /** Maschera applicata (0–7): la sceglie l'algoritmo, salvo forzatura nei test. */
  mask: number
}

export interface QrOptions {
  /** Forza una maschera invece di sceglierla per penalità. Serve ai test. */
  mask?: number
}

/** Il testo non entra in un QR nemmeno alla versione 40. */
export class QrTooLongError extends Error {
  constructor(byteLength: number) {
    super(`Il contenuto (${byteLength} byte) supera la capacità di un QR con correzione M`)
    this.name = 'QrTooLongError'
  }
}

// Tabelle ISO/IEC 18004 per il livello M, indicizzate per versione (l'indice 0 non esiste).
const ECC_CODEWORDS_PER_BLOCK = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
]
const NUM_ERROR_CORRECTION_BLOCKS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20,
  21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
]

/** Bit di livello per la stringa di formato: L=01, **M=00**, Q=11, H=10. */
const ECC_FORMAT_BITS = 0b00
const BYTE_MODE_INDICATOR = 0b0100

// ── Campo di Galois GF(256), polinomio primitivo 0x11D ──────────────────────────

function gfMultiply(x: number, y: number): number {
  let product = 0
  for (let shift = 7; shift >= 0; shift -= 1) {
    // Raddoppia e, se esce dagli 8 bit, riduci modulo il polinomio primitivo.
    product = (product << 1) ^ ((product >>> 7) * 0x11d)
    product ^= ((y >>> shift) & 1) * x
  }
  return product & 0xff
}

/** Polinomio generatore di grado `degree`, cioè (x − α⁰)(x − α¹)…(x − α^(degree−1)). */
function reedSolomonDivisor(degree: number): Uint8Array {
  const divisor = new Uint8Array(degree)
  divisor[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      divisor[j] = gfMultiply(divisor[j], root)
      if (j + 1 < degree) divisor[j] ^= divisor[j + 1]
    }
    root = gfMultiply(root, 0x02)
  }
  return divisor
}

/** I codeword di correzione: il resto della divisione polinomiale dei dati. */
function reedSolomonRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const remainder = new Uint8Array(divisor.length)
  for (const byte of data) {
    const factor = byte ^ remainder[0]
    remainder.copyWithin(0, 1)
    remainder[remainder.length - 1] = 0
    for (let i = 0; i < divisor.length; i += 1) {
      remainder[i] ^= gfMultiply(divisor[i], factor)
    }
  }
  return remainder
}

// ── Geometria della versione ────────────────────────────────────────────────────

function moduleCount(version: number): number {
  return version * 4 + 17
}

/** Moduli disponibili ai dati (tolti i pattern di servizio), in bit. */
function rawDataModules(version: number): number {
  let modules = (16 * version + 128) * version + 64
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2
    modules -= (25 * alignmentCount - 10) * alignmentCount - 55
    if (version >= 7) modules -= 36
  }
  return modules
}

function dataCodewords(version: number): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[version] * NUM_ERROR_CORRECTION_BLOCKS[version]
  )
}

/** Coordinate dei pattern di allineamento (righe e colonne insieme: si incrociano). */
function alignmentPositions(version: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2
  // Il primo è sempre 6; gli altri si contano a ritroso dal bordo opposto, così
  // l'ultimo passo assorbe l'eventuale resto della divisione.
  const positions = [6]
  for (let pos = moduleCount(version) - 7; positions.length < count; pos -= step) {
    positions.splice(1, 0, pos)
  }
  return positions
}

/** Byte mode: 8 bit di lunghezza fino alla versione 9, 16 da lì in poi. */
function characterCountBits(version: number): number {
  return version <= 9 ? 8 : 16
}

// ── Bitstream e blocchi ─────────────────────────────────────────────────────────

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1)
  }
}

function buildCodewords(data: Uint8Array, version: number): Uint8Array {
  const bits: number[] = []
  appendBits(bits, BYTE_MODE_INDICATOR, 4)
  appendBits(bits, data.length, characterCountBits(version))
  for (const byte of data) appendBits(bits, byte, 8)

  const capacityBits = dataCodewords(version) * 8
  // Terminatore (fino a 4 zeri), poi allineamento al byte.
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8)

  const codewords = new Uint8Array(capacityBits / 8)
  for (let i = 0; i < bits.length; i += 1) {
    codewords[i >>> 3] |= bits[i] << (7 - (i & 7))
  }
  // Riempimento fino a capacità con la coppia canonica 0xEC/0x11.
  for (let i = bits.length / 8, pad = 0xec; i < codewords.length; i += 1) {
    codewords[i] = pad
    pad = pad === 0xec ? 0x11 : 0xec
  }
  return codewords
}

/**
 * Divide i dati in blocchi, ne calcola la correzione e li **interlaccia**: è
 * l'interlacciamento a rendere il codice resistente a un graffio localizzato, che
 * altrimenti cancellerebbe un blocco intero invece di un byte per blocco.
 */
function addErrorCorrection(codewords: Uint8Array, version: number): Uint8Array {
  const blockCount = NUM_ERROR_CORRECTION_BLOCKS[version]
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[version]
  const rawCodewords = Math.floor(rawDataModules(version) / 8)
  const shortBlockCount = blockCount - (rawCodewords % blockCount)
  const shortBlockLength = Math.floor(rawCodewords / blockCount) - eccPerBlock

  const divisor = reedSolomonDivisor(eccPerBlock)
  const blocks: { data: Uint8Array; ecc: Uint8Array }[] = []
  let offset = 0
  for (let i = 0; i < blockCount; i += 1) {
    const length = shortBlockLength + (i < shortBlockCount ? 0 : 1)
    const blockData = codewords.subarray(offset, offset + length)
    offset += length
    blocks.push({ data: blockData, ecc: reedSolomonRemainder(blockData, divisor) })
  }

  const result = new Uint8Array(rawCodewords)
  let index = 0
  for (let i = 0; i <= shortBlockLength; i += 1) {
    for (const block of blocks) {
      // Il byte in più dei blocchi lunghi va in coda al gruppo dei dati, non qui.
      if (i < block.data.length) result[index++] = block.data[i]
    }
  }
  for (let i = 0; i < eccPerBlock; i += 1) {
    for (const block of blocks) result[index++] = block.ecc[i]
  }
  return result
}

// ── Disegno della matrice ───────────────────────────────────────────────────────

interface Canvas {
  size: number
  modules: boolean[][]
  reserved: boolean[][]
}

function createCanvas(version: number): Canvas {
  const size = moduleCount(version)
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  }
}

function setFunctionModule(canvas: Canvas, x: number, y: number, dark: boolean) {
  canvas.modules[y][x] = dark
  canvas.reserved[y][x] = true
}

function drawFinder(canvas: Canvas, centerX: number, centerY: number) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx
      const y = centerY + dy
      if (x < 0 || x >= canvas.size || y < 0 || y >= canvas.size) continue
      // Anelli concentrici: scuro tranne il secondo e il quarto (separatore incluso).
      const ring = Math.max(Math.abs(dx), Math.abs(dy))
      setFunctionModule(canvas, x, y, ring !== 2 && ring !== 4)
    }
  }
}

function drawAlignment(canvas: Canvas, centerX: number, centerY: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunctionModule(canvas, centerX + dx, centerY + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
}

/** 15 bit: 5 di dato (livello + maschera) + 10 di BCH, mascherati con la costante di norma. */
function drawFormatBits(canvas: Canvas, mask: number) {
  const data = (ECC_FORMAT_BITS << 3) | mask
  let bch = data
  for (let i = 0; i < 10; i += 1) {
    bch = (bch << 1) ^ ((bch >>> 9) * 0x537)
  }
  const bits = (((data << 10) | bch) ^ 0x5412) & 0x7fff
  const bit = (index: number) => ((bits >>> index) & 1) === 1

  // Prima copia: attorno al finder in alto a sinistra.
  for (let i = 0; i <= 5; i += 1) setFunctionModule(canvas, 8, i, bit(i))
  setFunctionModule(canvas, 8, 7, bit(6))
  setFunctionModule(canvas, 8, 8, bit(7))
  setFunctionModule(canvas, 7, 8, bit(8))
  for (let i = 9; i < 15; i += 1) setFunctionModule(canvas, 14 - i, 8, bit(i))

  // Seconda copia: divisa fra gli altri due finder, così resta leggibile
  // anche se un angolo del codice è rovinato.
  for (let i = 0; i < 8; i += 1) setFunctionModule(canvas, canvas.size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i += 1) setFunctionModule(canvas, 8, canvas.size - 15 + i, bit(i))
  setFunctionModule(canvas, 8, canvas.size - 8, true) // modulo sempre scuro
}

/** Dalla versione 7 il numero di versione è scritto nel codice (18 bit, due copie). */
function drawVersionBits(canvas: Canvas, version: number) {
  if (version < 7) return
  let bch = version
  for (let i = 0; i < 12; i += 1) {
    bch = (bch << 1) ^ ((bch >>> 11) * 0x1f25)
  }
  const bits = (version << 12) | bch

  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1
    const a = canvas.size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    setFunctionModule(canvas, a, b, dark)
    setFunctionModule(canvas, b, a, dark)
  }
}

function drawFunctionPatterns(canvas: Canvas, version: number) {
  for (let i = 0; i < canvas.size; i += 1) {
    setFunctionModule(canvas, 6, i, i % 2 === 0)
    setFunctionModule(canvas, i, 6, i % 2 === 0)
  }

  drawFinder(canvas, 3, 3)
  drawFinder(canvas, canvas.size - 4, 3)
  drawFinder(canvas, 3, canvas.size - 4)

  const positions = alignmentPositions(version)
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      // I tre angoli sono già occupati dai finder.
      const isCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === positions.length - 1) ||
        (i === positions.length - 1 && j === 0)
      if (!isCorner) drawAlignment(canvas, positions[i], positions[j])
    }
  }

  drawFormatBits(canvas, 0) // riserva lo spazio; il valore vero arriva con la maschera scelta
  drawVersionBits(canvas, version)
}

/** Percorso a zigzag su colonne doppie, dal basso a destra verso l'alto a sinistra. */
function drawCodewords(canvas: Canvas, codewords: Uint8Array) {
  let bitIndex = 0
  for (let right = canvas.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // la colonna 6 è quella del timing
    for (let step = 0; step < canvas.size; step += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column
        const upward = ((right + 1) & 2) === 0
        const y = upward ? canvas.size - 1 - step : step
        if (canvas.reserved[y][x] || bitIndex >= codewords.length * 8) continue
        canvas.modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1
        bitIndex += 1
      }
    }
  }
}

const MASK_RULES: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function applyMask(canvas: Canvas, mask: number) {
  const rule = MASK_RULES[mask]
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      if (!canvas.reserved[y][x] && rule(x, y)) canvas.modules[y][x] = !canvas.modules[y][x]
    }
  }
}

// Pattern "finder finto" (1:1:3:1:1 con quattro moduli chiari a lato): confonde i lettori.
const FALSE_FINDER_A = [true, false, true, true, true, false, true, false, false, false, false]
const FALSE_FINDER_B = [false, false, false, false, true, false, true, true, true, false, true]

function matchesAt(line: boolean[], start: number, pattern: boolean[]): boolean {
  for (let i = 0; i < pattern.length; i += 1) {
    if (line[start + i] !== pattern[i]) return false
  }
  return true
}

/** Le quattro penalità di norma: più è alto, peggio si legge il codice. */
function penalty(canvas: Canvas): number {
  const { size, modules } = canvas
  let score = 0

  const lines: boolean[][] = []
  for (let y = 0; y < size; y += 1) lines.push(modules[y])
  for (let x = 0; x < size; x += 1) lines.push(modules.map((row) => row[x]))

  for (const line of lines) {
    // Regola 1: sequenze monocrome lunghe.
    let runLength = 1
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) {
        runLength += 1
      } else {
        if (runLength >= 5) score += 3 + (runLength - 5)
        runLength = 1
      }
    }
    // Regola 3: pattern che imitano un finder.
    for (let i = 0; i + 11 <= size; i += 1) {
      if (matchesAt(line, i, FALSE_FINDER_A) || matchesAt(line, i, FALSE_FINDER_B)) score += 40
    }
  }

  // Regola 2: blocchi 2×2 dello stesso colore.
  for (let y = 0; y + 1 < size; y += 1) {
    for (let x = 0; x + 1 < size; x += 1) {
      const value = modules[y][x]
      if (value === modules[y][x + 1] && value === modules[y + 1][x] && value === modules[y + 1][x + 1]) {
        score += 3
      }
    }
  }

  // Regola 4: sbilanciamento fra scuro e chiaro — `floor(|percentuale − 50| / 5) × 10`,
  // cioè la lettera della tabella 11 della norma. Diverse librerie diffuse arrotondano
  // in modo leggermente diverso e su alcuni input scelgono un'altra maschera: sono QR
  // ugualmente validi (la maschera è scritta nei bit di formato), e la correttezza vera
  // la verificano i fixture a maschera forzata in qr.test.ts.
  // La forma senza divisioni intermedie evita gli errori in virgola mobile.
  let dark = 0
  for (const row of modules) for (const cell of row) if (cell) dark += 1
  const total = size * size
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10

  return score
}

/**
 * Prova le otto maschere e tiene quella con la penalità più bassa. Nessuna è
 * "sbagliata" — un lettore le decodifica tutte — ma quella giusta è la meno
 * ambigua da inquadrare, ed è l'unica differenza che l'utente può percepire.
 */
function chooseMask(canvas: Canvas): number {
  let best = 0
  let bestScore = Infinity
  for (let candidate = 0; candidate < 8; candidate += 1) {
    applyMask(canvas, candidate)
    drawFormatBits(canvas, candidate)
    const score = penalty(canvas)
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
    applyMask(canvas, candidate) // la maschera è uno XOR: riapplicarla la annulla
  }
  return best
}

// ── API ─────────────────────────────────────────────────────────────────────────

/**
 * Codifica `text` in una matrice QR. La versione è la più piccola che lo contiene:
 * un QR grande quanto serve e non di più si inquadra prima.
 */
export function encodeQr(text: string, options: QrOptions = {}): QrMatrix {
  const data = new TextEncoder().encode(text)

  let version = 0
  for (let candidate = 1; candidate <= 40; candidate += 1) {
    const capacity = dataCodewords(candidate) * 8
    if (4 + characterCountBits(candidate) + data.length * 8 <= capacity) {
      version = candidate
      break
    }
  }
  if (version === 0) throw new QrTooLongError(data.length)

  const codewords = addErrorCorrection(buildCodewords(data, version), version)

  const canvas = createCanvas(version)
  drawFunctionPatterns(canvas, version)
  drawCodewords(canvas, codewords)

  const mask = options.mask ?? chooseMask(canvas)
  applyMask(canvas, mask)
  drawFormatBits(canvas, mask)

  return { size: canvas.size, modules: canvas.modules, version, mask }
}

/**
 * Traduce la matrice in un unico attributo `d` per un `<path>` SVG: un elemento
 * solo invece di qualche migliaio di `<rect>`, che su un telefono si nota.
 * Le coordinate sono in moduli — la scala la decide il `viewBox`.
 */
export function qrToPath(matrix: QrMatrix): string {
  const parts: string[] = []
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y][x]) parts.push(`M${x} ${y}h1v1h-1z`)
    }
  }
  return parts.join('')
}
