import { describe, it, expect } from 'vitest'
import {
  detectContainerKind,
  inspectFileName,
  inspectTypeMismatch,
  parseZipCentralDirectory,
  findEndOfCentralDirectory,
  inspectZipEntries,
  inspectPdfMarkers,
  inspectFile,
  inspectFiles,
  hasCritical,
  extensionOf,
} from './fileInspection'

/**
 * Test del controllo pre-invio (roadmap F1.5).
 *
 * Due cose vanno verificate, e la seconda conta quanto la prima:
 *  1. che riconosca i travestimenti;
 *  2. **che stia zitto sul resto**. Un controllo che avvisa su ogni `.exe` insegna a
 *     ignorare gli avvisi, e allora anche quello che conta passa inosservato. I test
 *     "non deve segnalare" qui sotto difendono quella scelta di progetto.
 */

const PE_HEADER = new Uint8Array([0x4d, 0x5a, 0x90, 0x00])
const PDF_HEADER = new TextEncoder().encode('%PDF-1.7\n')

function fileFrom(name: string, bytes: Uint8Array | string): File {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  return new File([data], name)
}

/**
 * Costruisce lo scheletro di uno zip **con la stessa forma di uno vero**: intestazioni
 * locali in testa (è quella che dà la firma `PK\x03\x04` riconosciuta dai byte iniziali),
 * poi il central directory, poi l'EOCD con gli offset giusti. Le voci non hanno dati
 * compressi — a noi interessano solo i metadati, che sono ciò che il codice legge.
 */
function zipWith(entries: { name: string; encrypted?: boolean }[]): Uint8Array {
  const encoder = new TextEncoder()

  const localHeaders = entries.map(({ name, encrypted }) => {
    const nameBytes = encoder.encode(name)
    const header = new Uint8Array(30 + nameBytes.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(6, encrypted ? 0x0001 : 0x0000, true)
    view.setUint16(26, nameBytes.length, true)
    header.set(nameBytes, 30)
    return header
  })

  const centralRecords = entries.map(({ name, encrypted }) => {
    const nameBytes = encoder.encode(name)
    const record = new Uint8Array(46 + nameBytes.length)
    const view = new DataView(record.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(8, encrypted ? 0x0001 : 0x0000, true)
    view.setUint16(28, nameBytes.length, true)
    record.set(nameBytes, 46)
    return record
  })

  const localSize = localHeaders.reduce((total, header) => total + header.length, 0)
  const cdSize = centralRecords.reduce((total, record) => total + record.length, 0)
  const out = new Uint8Array(localSize + cdSize + 22)

  let offset = 0
  for (const block of [...localHeaders, ...centralRecords]) {
    out.set(block, offset)
    offset += block.length
  }

  const eocd = new DataView(out.buffer, localSize + cdSize, 22)
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(10, centralRecords.length, true)
  eocd.setUint32(12, cdSize, true)
  eocd.setUint32(16, localSize, true) // il central directory comincia dopo le intestazioni locali
  return out
}

/** Solo la parte "central directory + EOCD", per i test delle funzioni pure. */
function zipTail(entries: { name: string; encrypted?: boolean }[]): { bytes: Uint8Array; cdOffset: number } {
  const bytes = zipWith(entries)
  const eocd = findEndOfCentralDirectory(bytes)
  return { bytes, cdOffset: eocd?.cdOffset ?? 0 }
}

describe('detectContainerKind', () => {
  it('riconosce i formati dai byte, non dall’estensione', () => {
    expect(detectContainerKind(PE_HEADER)).toBe('pe')
    expect(detectContainerKind(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]))).toBe('elf')
    expect(detectContainerKind(PDF_HEADER)).toBe('pdf')
    expect(detectContainerKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('zip')
    expect(detectContainerKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('ole2')
  })

  it('non inventa un formato quando non lo conosce', () => {
    expect(detectContainerKind(new Uint8Array([0x01, 0x02, 0x03, 0x04]))).toBeNull()
    expect(detectContainerKind(new Uint8Array([]))).toBeNull()
    expect(detectContainerKind(new Uint8Array([0x4d]))).toBeNull() // firma troncata
  })
})

describe('inspectFileName', () => {
  it('smaschera l’override bidirezionale', () => {
    // U+202E fa leggere "annuncio<RLO>fdp.exe" come "annuncioexe.pdf".
    const findings = inspectFileName('annuncio‮fdp.exe')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ code: 'name-bidi', severity: 'critical' })
  })

  it('smaschera la doppia estensione', () => {
    expect(inspectFileName('fattura.pdf.exe')[0]).toMatchObject({ code: 'double-extension', severity: 'critical' })
    expect(inspectFileName('foto.jpg.scr')[0]).toMatchObject({ code: 'double-extension' })
  })

  it('tace sui nomi legittimi, anche quando contengono punti', () => {
    for (const name of [
      'relazione.pdf',
      'build.tar.gz',
      'app-v1.2.3.zip',
      'setup.exe', // un eseguibile che si dichiara tale non è un inganno
      'archivio.7z',
      'note.md',
    ]) {
      expect(inspectFileName(name), name).toEqual([])
    }
  })
})

describe('inspectTypeMismatch', () => {
  it('segnala un eseguibile travestito da documento', () => {
    expect(inspectTypeMismatch('foto.jpg', 'pe')[0]).toMatchObject({ code: 'type-mismatch', severity: 'critical' })
    expect(inspectTypeMismatch('relazione.pdf', 'elf')).toHaveLength(1)
  })

  it('tace quando il file dichiara ciò che è', () => {
    expect(inspectTypeMismatch('setup.exe', 'pe')).toEqual([])
    expect(inspectTypeMismatch('script.sh', 'script')).toEqual([])
    expect(inspectTypeMismatch('documento.pdf', 'pdf')).toEqual([])
    expect(inspectTypeMismatch('sconosciuto.bin', null)).toEqual([])
  })
})

describe('lettura dello zip', () => {
  it('elenca le voci dal central directory senza decomprimere', () => {
    const { bytes, cdOffset } = zipTail([{ name: 'doc/relazione.pdf' }, { name: 'setup.exe', encrypted: true }])
    const eocd = findEndOfCentralDirectory(bytes)
    expect(eocd?.cdOffset).toBe(cdOffset)

    const entries = parseZipCentralDirectory(bytes.subarray(cdOffset, cdOffset + eocd!.cdSize))
    expect(entries).toEqual([
      { name: 'doc/relazione.pdf', encrypted: false },
      { name: 'setup.exe', encrypted: true },
    ])
  })

  it('non produce risultati su dati che non sono uno zip', () => {
    expect(findEndOfCentralDirectory(new Uint8Array(100))).toBeNull()
    expect(parseZipCentralDirectory(new Uint8Array([1, 2, 3]))).toEqual([])
  })

  it('segnala eseguibili, voci cifrate e macro dentro l’archivio', () => {
    const findings = inspectZipEntries('consegna.zip', [
      { name: 'readme.txt', encrypted: false },
      { name: 'installer.exe', encrypted: false },
      { name: 'segreto.doc', encrypted: true },
      { name: 'word/vbaProject.bin', encrypted: false },
    ])
    expect(findings.map((f) => f.code).sort()).toEqual(['archive-encrypted', 'archive-executable', 'office-macro'])
    // Nessuno di questi blocca: zippare una build è normale.
    expect(hasCritical(findings)).toBe(false)
  })

  it('tace su un archivio di soli documenti', () => {
    expect(inspectZipEntries('foto.zip', [{ name: 'mare.jpg', encrypted: false }])).toEqual([])
  })
})

describe('inspectPdfMarkers', () => {
  it('riconosce il contenuto attivo', () => {
    expect(inspectPdfMarkers('modulo.pdf', '<< /OpenAction << /S /JavaScript >> >>')[0])
      .toMatchObject({ code: 'pdf-active', severity: 'warn' })
  })

  it('tace su un PDF senza marcatori', () => {
    expect(inspectPdfMarkers('relazione.pdf', '%PDF-1.7 /Type /Catalog /Pages 2 0 R')).toEqual([])
  })
})

describe('inspectFile — lettura reale a fette', () => {
  it('trova l’eseguibile travestito da immagine', async () => {
    const findings = await inspectFile(fileFrom('vacanze.jpg', PE_HEADER))
    expect(findings.map((f) => f.code)).toContain('type-mismatch')
    expect(hasCritical(findings)).toBe(true)
  })

  it('legge dentro un archivio vero', async () => {
    const findings = await inspectFile(fileFrom('consegna.zip', zipWith([{ name: 'payload.exe' }])))
    expect(findings.map((f) => f.code)).toContain('archive-executable')
  })

  it('non dice niente su un file normale', async () => {
    expect(await inspectFile(fileFrom('note.txt', 'ciao, questo è un file di testo'))).toEqual([])
    expect(await inspectFile(fileFrom('relazione.pdf', PDF_HEADER))).toEqual([])
  })

  it('non dice niente su un eseguibile dichiarato: mandare build è un uso normale', async () => {
    expect(await inspectFile(fileFrom('LeTransfer-setup.exe', PE_HEADER))).toEqual([])
  })
})

describe('inspectFiles', () => {
  it('dichiara quando si è fermato invece di far credere di aver guardato tutto', async () => {
    const many = Array.from({ length: 205 }, (_, i) => fileFrom(`file-${i}.txt`, 'x'))
    const result = await inspectFiles(many)
    expect(result.truncated).toBe(true)

    const few = [fileFrom('uno.txt', 'x'), fileFrom('due.jpg', PE_HEADER)]
    const small = await inspectFiles(few)
    expect(small.truncated).toBe(false)
    expect(small.findings).toHaveLength(1)
  })
})

describe('extensionOf', () => {
  it('ignora il percorso e i file senza estensione', () => {
    expect(extensionOf('cartella/sotto/foto.JPG')).toBe('jpg')
    expect(extensionOf('Makefile')).toBe('')
    expect(extensionOf('.gitignore')).toBe('')
  })
})
