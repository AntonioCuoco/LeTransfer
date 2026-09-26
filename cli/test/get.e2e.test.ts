import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeNovren, type FakeNovren } from './fake-novren'

/**
 * `novren get`, da fuori: la CLI **compilata** (`dist/novren.mjs`) lanciata come processo,
 * contro un Novren finto con la forma del backend vero e file cifrati dal nucleo reale.
 *
 * Si prova il binario e non le funzioni perché è il binario che l'utente installa: un errore
 * di bundling — un import che esbuild non ha risolto, un modulo mancante — passerebbe
 * inosservato da ogni test che importa i sorgenti.
 */

const CLI = fileURLToPath(new URL('../dist/novren.mjs', import.meta.url))

let novren: FakeNovren
/** La sandbox del test: tutto ciò che la CLI scrive deve restare qui dentro. */
let root: string
let out: string

interface Run {
  code: number
  stdout: string
  stderr: string
}

function run(args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, ...args],
      { env: { ...process.env, NOVREN_API_URL: novren.apiUrl, ...env } },
      (error, stdout, stderr) => {
        resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr })
      },
    )
  })
}

beforeAll(async () => {
  novren = await startFakeNovren()
})
afterAll(async () => {
  await novren.close()
})
beforeEach(async () => {
  // La cartella di destinazione sta cinque livelli DENTRO la sandbox. Così, se la protezione
  // dal path traversal si rompesse, `../../../../` finirebbe comunque nella sandbox e non
  // nella home di chi lancia i test — è successo, durante una verifica, prima di questa riga.
  root = await mkdtemp(join(tmpdir(), 'novren-cli-'))
  out = join(root, 'a', 'b', 'c', 'd', 'e')
  await mkdir(out, { recursive: true })
  return () => rm(root, { recursive: true, force: true })
})

/** Tutti i file della sandbox, con il percorso relativo. */
async function allFiles(): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1).split(sep).join('/'))
    .sort()
}

describe('novren get', () => {
  it('scarica e decifra un file v2 a più chunk, con il nome cifrato', async () => {
    const transfer = await novren.addV2({ name: 'contratto firmato.pdf', size: 3500, chunkSize: 1000 })
    const result = await run(['get', transfer.link, '-o', out])

    expect(result.code, result.stderr).toBe(0)
    // Su stdout SOLO il percorso: si deve poter usare in uno script.
    expect(result.stdout.trim()).toBe(join(out, 'contratto firmato.pdf'))
    expect(new Uint8Array(await readFile(join(out, 'contratto firmato.pdf')))).toEqual(transfer.plain)
  })

  it('dimensioni reali: 25 MB in chunk da 10 MiB, come in produzione', async () => {
    const transfer = await novren.addV2({ name: 'grande.bin', size: 25 * 1024 * 1024, chunkSize: 10 * 1024 * 1024 })
    const result = await run(['get', transfer.link, '-o', out])
    expect(result.code, result.stderr).toBe(0)
    const saved = new Uint8Array(await readFile(join(out, 'grande.bin')))
    expect(saved.length).toBe(transfer.plain.length)
    expect(Buffer.compare(saved, transfer.plain)).toBe(0)
  })

  it('la chiave non arriva mai al server', async () => {
    const transfer = await novren.addV2({ name: 'a.txt', size: 100 })
    const key = new URLSearchParams(new URL(transfer.link).hash.slice(1)).get('key')!
    await run(['get', transfer.link, '-o', out])
    const seen = novren.requests.join('\n')
    expect(seen).toContain(transfer.publicToken)
    expect(seen).not.toContain(key)
  })

  it('un nome ostile non esce dalla cartella: path traversal neutralizzato', async () => {
    // Il nome lo sceglie il mittente e arriva cifrato: nessuno l'ha potuto controllare
    // prima di noi. Scritto così com'è, finirebbe fuori dalla cartella scelta.
    const transfer = await novren.addV2({ name: '../../../../evil.sh', size: 50 })
    const result = await run(['get', transfer.link, '-o', out])

    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe(join(out, 'evil.sh'))
    // Nell'intera sandbox esiste un solo file, ed è dentro la cartella scelta.
    expect(await allFiles()).toEqual(['a/b/c/d/e/evil.sh'])
  })

  it('non sovrascrive: un secondo download con lo stesso nome diventa «nome (1)»', async () => {
    const transfer = await novren.addV2({ name: 'report.txt', size: 10 })
    await run(['get', transfer.link, '-o', out])
    const second = await run(['get', transfer.link, '-o', out])
    expect(second.stdout.trim()).toBe(join(out, 'report (1).txt'))
    expect((await readdir(out)).sort()).toEqual(['report (1).txt', 'report.txt'])
  })

  it('un chunk alterato: errore, e NESSUN file lasciato su disco, nemmeno parziale', async () => {
    // Un documento a metà con il nome giusto è peggio di nessun documento.
    const transfer = await novren.addV2({ name: 'alterato.bin', size: 3000 })
    novren.tamper(transfer.publicToken)
    const result = await run(['get', transfer.link, '-o', out])

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/non si decifra|alterato/)
    expect(await readdir(out)).toEqual([])
  })

  it('chiave sbagliata: errore chiaro, nessun file', async () => {
    const transfer = await novren.addV2({ name: 'x.bin', size: 100, encryptName: false })
    const other = await novren.addV2({ name: 'y.bin', size: 100 })
    const wrongKey = transfer.link.replace(/#.*$/, new URL(other.link).hash)
    const result = await run(['get', wrongKey, '-o', out])

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/non si decifra/)
    expect(await readdir(out)).toEqual([])
  })

  it('link senza chiave: spiega perché non si può aprire', async () => {
    const transfer = await novren.addV2({ name: 'x.bin', size: 10 })
    const result = await run(['get', transfer.link.replace(/#.*$/, ''), '-o', out])
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/non contiene la chiave/)
  })

  it('link tagliato alla «&» (bash senza virgolette): un file v2 si scarica lo stesso', async () => {
    const transfer = await novren.addV2({ name: 'tagliato.bin', size: 2500 })
    const truncated = transfer.link.split('&')[0]!
    const result = await run(['get', truncated, '-o', out])
    expect(result.code, result.stderr).toBe(0)
    expect(new Uint8Array(await readFile(join(out, 'tagliato.bin')))).toEqual(transfer.plain)
  })

  it('formato v1 legacy, con l’iv nel link', async () => {
    const transfer = await novren.addV1({ name: 'vecchio.bin', size: 777 })
    const result = await run(['get', transfer.link, '-o', out])
    expect(result.code, result.stderr).toBe(0)
    expect(new Uint8Array(await readFile(join(out, 'vecchio.bin')))).toEqual(transfer.plain)
  })

  it('formato v1 legacy senza iv: spiega che il link è stato tagliato', async () => {
    const transfer = await novren.addV1({ name: 'vecchio.bin', size: 77 })
    const result = await run(['get', transfer.link.split('&')[0]!, '-o', out])
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/virgolette/)
    expect(await readdir(out)).toEqual([])
  })

  it('link protetto da password: con NOVREN_LINK_PASSWORD giusta scarica, sbagliata no', async () => {
    const transfer = await novren.addV2({ name: 'segreto.txt', size: 40, password: 'corretta' })
    const wrong = await run(['get', transfer.link, '-o', out], { NOVREN_LINK_PASSWORD: 'sbagliata' })
    expect(wrong.code).toBe(1)
    expect(wrong.stderr).toMatch(/Password errata/)

    const right = await run(['get', transfer.link, '-o', out], { NOVREN_LINK_PASSWORD: 'corretta' })
    expect(right.code, right.stderr).toBe(0)
  })

  it('link protetto senza terminale e senza variabile: non resta appeso ad aspettare', async () => {
    const transfer = await novren.addV2({ name: 'segreto.txt', size: 40, password: 'x' })
    const result = await run(['get', transfer.link, '-o', out])
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/NOVREN_LINK_PASSWORD/)
  })

  it('link scaduto: il messaggio dice cosa fare', async () => {
    const transfer = await novren.addV2({ name: 'x.bin', size: 10 })
    novren.expire(transfer.publicToken)
    const result = await run(['get', transfer.link, '-o', out])
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/scaduto/)
  })

  it('un nome cifrato che non si apre non impedisce il download: nome di ripiego', async () => {
    // Il contenuto non dipende dal nome. Un nome che non si apre (chiave diversa, nome
    // manomesso) non deve impedire di avere il file — né essere mostrato come base64.
    const transfer = await novren.addV2({ name: 'riservato.pdf', size: 300, foreignName: true })
    const result = await run(['get', transfer.link, '-o', out])
    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe(join(out, 'novren-download'))
    expect(new Uint8Array(await readFile(join(out, 'novren-download')))).toEqual(transfer.plain)
  })

  it('uso sbagliato → codice 2; link non Novren → codice 1', async () => {
    expect((await run(['boh'])).code).toBe(2)
    expect((await run(['get', 'https://example.com/altro'])).stderr).toMatch(/Novren/)
  })

  it('i permessi del file ricevuto sono 0600 (non su Windows)', async () => {
    if (process.platform === 'win32') return
    const transfer = await novren.addV2({ name: 'privato.txt', size: 10 })
    await run(['get', transfer.link, '-o', out])
    expect((await stat(join(out, 'privato.txt'))).mode & 0o777).toBe(0o600)
  })
})
