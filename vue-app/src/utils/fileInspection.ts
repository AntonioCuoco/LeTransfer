/**
 * Controllo strutturale pre-invio (roadmap F1.5) — **locale, prima della cifratura**.
 *
 * ⚠️ Cos'è e cosa NON è. Questo **non è un anti-abuso**: chi vuole abusare del canale
 * non esegue il nostro JavaScript, chiama `/api/guest/upload/init` con `curl`. Contro
 * l'abuso deliberato il valore è zero, e chiamarlo altrimenti sarebbe mentire a noi
 * stessi sul livello di protezione (vedi [ANTI_ABUSO.md](../../../docs/ANTI_ABUSO.md)).
 *
 * A cosa serve davvero: al **mittente disattento**. Chi inoltra un allegato ricevuto,
 * chi rimbalza il documento di un cliente. Quella persona il nostro codice lo esegue
 * davvero, ed è l'unica che possiamo aiutare.
 *
 * Tre principi di progetto:
 *
 * 1. **Si segnala solo l'inganno, non il rischio.** Un `.exe` che si chiama `.exe` non
 *    produce alcun avviso: mandare build è un caso d'uso centrale di un servizio di
 *    trasferimento file. Avvisare su tutto insegna a ignorare gli avvisi, e a quel punto
 *    il controllo che conta passa inosservato insieme agli altri.
 * 2. **Si legge a fette, mai il file intero.** La RAM costante è una proprietà di
 *    progetto dell'uploader: un controllo che carica in memoria un file da 5 GB la
 *    distruggerebbe. Qui si leggono la testa e la coda, poche decine di KB.
 * 3. **Il risultato non lascia il dispositivo.** Mai. Mandare al server "questo utente ha
 *    provato a caricare un PE" sarebbe leak di metadati di contenuto: romperemmo la
 *    promessa per difenderla.
 */

export type FindingSeverity = 'warn' | 'critical'

export type FindingCode =
  | 'name-bidi'
  | 'double-extension'
  | 'type-mismatch'
  | 'archive-executable'
  | 'archive-encrypted'
  | 'office-macro'
  | 'office-legacy'
  | 'pdf-active'

export interface Finding {
  code: FindingCode
  /** `critical` chiede una conferma esplicita; `warn` informa e basta. */
  severity: FindingSeverity
  fileName: string
  title: string
  detail: string
}

/** Formati riconosciuti dai byte iniziali, non dall'estensione. */
export type ContainerKind = 'pe' | 'elf' | 'macho' | 'pdf' | 'zip' | 'ole2' | 'rar' | '7z' | 'gzip' | 'script'

const EXECUTABLE_KINDS: ContainerKind[] = ['pe', 'elf', 'macho']

/** Estensioni che promettono un documento innocuo: se dentro c'è un binario, è inganno. */
const INNOCENT_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
  'txt', 'md', 'csv', 'rtf', 'mp3', 'mp4', 'mov', 'wav', 'avi',
])

/** Estensioni eseguibili o interpretate: pericolose solo se *nascoste*. */
const EXECUTABLE_EXTENSIONS = new Set([
  'exe', 'scr', 'com', 'pif', 'bat', 'cmd', 'msi', 'msc', 'cpl', 'hta',
  'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'lnk', 'jar', 'apk', 'app', 'sh',
])

/**
 * Override bidirezionali Unicode. `U+202E` (RIGHT-TO-LEFT OVERRIDE) fa apparire
 * `annuncio‮fdp.exe` come `annunciexe.pdf`: è un travestimento, non un carattere
 * di scrittura. In un nome di file non ha usi legittimi.
 */
const BIDI_OVERRIDES = /[‪-‮⁦-⁩]/

const SIGNATURES: { kind: ContainerKind; bytes: number[]; offset?: number }[] = [
  { kind: 'pe', bytes: [0x4d, 0x5a] },                                  // MZ
  { kind: 'elf', bytes: [0x7f, 0x45, 0x4c, 0x46] },                     // \x7fELF
  { kind: 'macho', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { kind: 'macho', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { kind: 'macho', bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { kind: 'macho', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { kind: 'macho', bytes: [0xca, 0xfe, 0xba, 0xbe] },                   // universal binary
  { kind: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] },                     // %PDF
  { kind: 'zip', bytes: [0x50, 0x4b, 0x03, 0x04] },                     // PK\x03\x04
  { kind: 'ole2', bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { kind: 'rar', bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },         // Rar!
  { kind: '7z', bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { kind: 'gzip', bytes: [0x1f, 0x8b] },
  { kind: 'script', bytes: [0x23, 0x21] },                              // #!
]

// ── Funzioni pure ───────────────────────────────────────────────────────────────

export function extensionOf(fileName: string): string {
  const base = fileName.split('/').pop() ?? fileName
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

/** Riconosce il formato dai byte iniziali. `null` se non è uno dei formati noti. */
export function detectContainerKind(head: Uint8Array): ContainerKind | null {
  for (const signature of SIGNATURES) {
    const start = signature.offset ?? 0
    if (head.length < start + signature.bytes.length) continue
    if (signature.bytes.every((byte, index) => head[start + index] === byte)) {
      return signature.kind
    }
  }
  return null
}

/**
 * Controlli sul solo nome. Sono i più forti del lotto: un travestimento nel nome è
 * intenzionale per definizione — nessuno rinomina un file per sbaglio in `foto.jpg.exe`.
 */
export function inspectFileName(fileName: string): Finding[] {
  const findings: Finding[] = []
  const base = fileName.split('/').pop() ?? fileName

  if (BIDI_OVERRIDES.test(base)) {
    findings.push({
      code: 'name-bidi',
      severity: 'critical',
      fileName,
      title: 'Il nome del file è camuffato',
      detail:
        'Contiene un carattere che inverte la scrittura: serve a far sembrare un programma un documento. Non ha usi legittimi in un nome di file.',
    })
  }

  const parts = base.toLowerCase().split('.')
  if (parts.length >= 3) {
    const last = parts[parts.length - 1]
    const previous = parts[parts.length - 2]
    if (EXECUTABLE_EXTENSIONS.has(last) && INNOCENT_EXTENSIONS.has(previous)) {
      findings.push({
        code: 'double-extension',
        severity: 'critical',
        fileName,
        title: 'Doppia estensione',
        detail: `Si presenta come «.${previous}» ma è un «.${last}»: è il travestimento più comune per far aprire un programma.`,
      })
    }
  }

  return findings
}

/** Il tipo reale contraddice quello promesso dall'estensione. */
export function inspectTypeMismatch(fileName: string, kind: ContainerKind | null): Finding[] {
  if (!kind || !EXECUTABLE_KINDS.includes(kind)) return []
  const extension = extensionOf(fileName)
  if (!INNOCENT_EXTENSIONS.has(extension)) return []

  return [{
    code: 'type-mismatch',
    severity: 'critical',
    fileName,
    title: 'Il contenuto non è quello che dice l’estensione',
    detail: `Si chiama «.${extension}» ma dentro è un programma eseguibile. È il segnale più netto che possiamo leggere senza aprire il file.`,
  }]
}

export interface ZipEntry {
  name: string
  /** Bit 0 del general purpose flag: la voce è protetta da password. */
  encrypted: boolean
}

/**
 * Legge le voci dal **central directory** di uno zip. Non decomprime niente: sono i
 * metadati dell'archivio, in coda al file, che elencano cosa c'è dentro.
 * `cdBytes` deve iniziare esattamente sul primo record del central directory.
 */
export function parseZipCentralDirectory(cdBytes: Uint8Array, maxEntries = 2000): ZipEntry[] {
  const view = new DataView(cdBytes.buffer, cdBytes.byteOffset, cdBytes.byteLength)
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let offset = 0

  while (offset + 46 <= cdBytes.length && entries.length < maxEntries) {
    if (view.getUint32(offset, true) !== 0x02014b50) break

    const flags = view.getUint16(offset + 8, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const nameStart = offset + 46

    if (nameStart + nameLength > cdBytes.length) break

    entries.push({
      name: decoder.decode(cdBytes.subarray(nameStart, nameStart + nameLength)),
      encrypted: (flags & 0x0001) === 1,
    })
    offset = nameStart + nameLength + extraLength + commentLength
  }

  return entries
}

/** Trova l'offset dell'End Of Central Directory dentro la coda del file. */
export function findEndOfCentralDirectory(tail: Uint8Array): { cdOffset: number; cdSize: number } | null {
  if (tail.length < 22) return null
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)

  // Si cerca all'indietro: l'EOCD sta in fondo, seguito al massimo da un commento.
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue
    const cdSize = view.getUint32(offset + 12, true)
    const cdOffset = view.getUint32(offset + 16, true)
    // 0xFFFFFFFF = ZIP64: gli offset veri stanno in un record separato. Non lo
    // interpretiamo: meglio nessun risultato che un risultato inventato.
    if (cdOffset === 0xffffffff || cdSize === 0xffffffff) return null
    return { cdOffset, cdSize }
  }
  return null
}

export function inspectZipEntries(fileName: string, entries: readonly ZipEntry[]): Finding[] {
  const findings: Finding[] = []

  const executables = entries.filter((entry) => EXECUTABLE_EXTENSIONS.has(extensionOf(entry.name)))
  if (executables.length > 0) {
    findings.push({
      code: 'archive-executable',
      severity: 'warn',
      fileName,
      title: 'L’archivio contiene programmi',
      detail: `${executables.length === 1 ? 'Una voce è un eseguibile' : `${executables.length} voci sono eseguibili`} (es. «${executables[0].name}»). Normale per una build, meno per un documento.`,
    })
  }

  if (entries.some((entry) => entry.encrypted)) {
    findings.push({
      code: 'archive-encrypted',
      severity: 'warn',
      fileName,
      title: 'L’archivio è protetto da password',
      detail:
        'È anche il modo classico per far passare un allegato senza che nessuno possa controllarlo. Qui non serve: il file è già cifrato, e per proteggere il link c’è la password del link.',
    })
  }

  if (entries.some((entry) => entry.name.toLowerCase().endsWith('vbaproject.bin'))) {
    findings.push({
      code: 'office-macro',
      severity: 'warn',
      fileName,
      title: 'Il documento contiene macro',
      detail: 'Le macro sono codice che si esegue all’apertura: è la via più battuta per i documenti infetti.',
    })
  }

  return findings
}

/** Marcatori di contenuto attivo dentro un PDF. */
export function inspectPdfMarkers(fileName: string, text: string): Finding[] {
  const markers = ['/JavaScript', '/JS ', '/OpenAction', '/Launch', '/EmbeddedFile']
  const found = markers.filter((marker) => text.includes(marker))
  if (found.length === 0) return []

  return [{
    code: 'pdf-active',
    severity: 'warn',
    fileName,
    title: 'Il PDF contiene contenuto attivo',
    detail: `Include ${found.join(', ').trim()}: un PDF può eseguire codice o aprire allegati all’apertura.`,
  }]
}

// ── Orchestrazione: le letture a fette ──────────────────────────────────────────

const HEAD_BYTES = 64 * 1024
const TAIL_BYTES = 64 * 1024
const MAX_CENTRAL_DIRECTORY = 1024 * 1024

/** Il numero di file oltre il quale non ispezioniamo più: una cartella può averne migliaia. */
export const INSPECTION_FILE_LIMIT = 200

async function sliceBytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  const clampedStart = Math.max(0, Math.min(start, file.size))
  const clampedEnd = Math.max(clampedStart, Math.min(end, file.size))
  return new Uint8Array(await file.slice(clampedStart, clampedEnd).arrayBuffer())
}

/**
 * Ispeziona un singolo file. Legge al massimo testa + coda + (per gli zip) il central
 * directory: su un file da gigabyte sono comunque poche centinaia di KB.
 */
export async function inspectFile(file: File): Promise<Finding[]> {
  const name = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  const findings: Finding[] = [...inspectFileName(name)]

  let head: Uint8Array
  try {
    head = await sliceBytes(file, 0, HEAD_BYTES)
  } catch {
    // File non più leggibile (spostato, permessi): non è compito di questo controllo
    // segnalarlo — se ne accorgerà l'upload, con un errore che parla di quello.
    return findings
  }

  const kind = detectContainerKind(head)
  findings.push(...inspectTypeMismatch(name, kind))

  if (kind === 'ole2') {
    findings.push({
      code: 'office-legacy',
      severity: 'warn',
      fileName: name,
      title: 'Documento Office in formato legacy',
      detail: 'I formati .doc/.xls precedenti al 2007 possono contenere macro senza dichiararlo nell’estensione.',
    })
  }

  if (kind === 'pdf') {
    const text = new TextDecoder('latin1').decode(head)
    findings.push(...inspectPdfMarkers(name, text))
  }

  if (kind === 'zip') {
    try {
      const tail = await sliceBytes(file, file.size - TAIL_BYTES, file.size)
      const eocd = findEndOfCentralDirectory(tail)
      if (eocd && eocd.cdSize <= MAX_CENTRAL_DIRECTORY) {
        const cdBytes = await sliceBytes(file, eocd.cdOffset, eocd.cdOffset + eocd.cdSize)
        findings.push(...inspectZipEntries(name, parseZipCentralDirectory(cdBytes)))
      }
    } catch {
      // Zip malformato o troncato: nessun risultato, nessun allarme inventato.
    }
  }

  return findings
}

/**
 * Ispeziona una lista di file. Oltre `INSPECTION_FILE_LIMIT` si ferma: su una cartella
 * da migliaia di file il controllo costerebbe più dell'invio, e va detto (`truncated`)
 * invece di lasciar credere che sia stato guardato tutto.
 */
export async function inspectFiles(files: readonly File[]): Promise<{ findings: Finding[]; truncated: boolean }> {
  const subset = files.slice(0, INSPECTION_FILE_LIMIT)
  const results = await Promise.all(subset.map((file) => inspectFile(file)))
  return {
    findings: results.flat(),
    truncated: files.length > subset.length,
  }
}

export function hasCritical(findings: readonly Finding[]): boolean {
  return findings.some((finding) => finding.severity === 'critical')
}
