import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeNovren, type FakeNovren, type TokenKind } from './fake-novren'

/**
 * `novren login` e `novren send`, da fuori: il binario compilato contro il Novren finto.
 *
 * La prova che conta è il giro completo: ciò che `send` carica, `get` lo riapre identico
 * byte per byte. `get` è lo stesso percorso di decifratura del sito, quindi un invio della
 * CLI si apre anche dal browser.
 */

const CLI = fileURLToPath(new URL('../dist/novren.mjs', import.meta.url))

let novren: FakeNovren
let root: string
let config: string
let work: string

interface Run {
  code: number
  stdout: string
  stderr: string
}

const baseEnv = () => ({
  ...process.env,
  NOVREN_API_URL: novren.apiUrl,
  NOVREN_CONFIG_DIR: config,
  NOVREN_OPEN_BROWSER: '0',
  NOVREN_LINK_PASSWORD: '',
})

function run(args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { env: { ...baseEnv(), ...env }, maxBuffer: 1 << 24 }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr })
    })
  })
}

/** Un processo della CLI di cui si legge stderr mentre gira: serve per il login. */
function start(args: string[], env: Record<string, string> = {}) {
  const child = spawn(process.execPath, [CLI, ...args], { env: { ...baseEnv(), ...env } })
  let stdout = ''
  let stderr = ''
  const waiters: { pattern: RegExp; resolve: (m: RegExpMatchArray) => void }[] = []
  child.stdout.on('data', (d) => (stdout += d))
  child.stderr.on('data', (d) => {
    stderr += d
    for (const w of [...waiters]) {
      const match = stderr.match(w.pattern)
      if (match) {
        waiters.splice(waiters.indexOf(w), 1)
        w.resolve(match)
      }
    }
  })
  const done = new Promise<Run>((resolve) => child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr })))
  return {
    waitFor(pattern: RegExp): Promise<RegExpMatchArray> {
      const match = stderr.match(pattern)
      if (match) return Promise.resolve(match)
      return new Promise((resolve) => waiters.push({ pattern, resolve }))
    },
    done,
  }
}

async function saveToken(kind: TokenKind): Promise<string> {
  const token = novren.issueToken(kind)
  await mkdir(config, { recursive: true })
  await writeFile(
    join(config, 'credentials.json'),
    JSON.stringify({ token, kind, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), deviceName: 'test', apiUrl: novren.apiUrl }),
  )
  return token
}

const credentials = async () => JSON.parse(await readFile(join(config, 'credentials.json'), 'utf8'))
const exists = (path: string) => readFile(path).then(() => true, () => false)

function randomFile(size: number): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = 0; i < size; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(size, i + 65536)))
  return out
}

/** Invia e riscarica: il file che torna deve essere quello partito. */
async function roundTrip(paths: string[]): Promise<{ link: string; saved: string; sent: Run }> {
  const sent = await run(['send', ...paths])
  expect(sent.code, sent.stderr).toBe(0)
  const link = sent.stdout.trim()
  const out = join(root, 'ricevuti')
  await mkdir(out, { recursive: true })
  const got = await run(['get', link, '-o', out])
  expect(got.code, got.stderr).toBe(0)
  return { link, saved: got.stdout.trim(), sent }
}

beforeAll(async () => {
  novren = await startFakeNovren()
})
afterAll(async () => {
  await novren.close()
})
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'novren-send-'))
  config = join(root, 'config')
  work = join(root, 'lavoro')
  await mkdir(work, { recursive: true })
  novren.dailyLimit = 20
  novren.cliEnabled = true
  return () => rm(root, { recursive: true, force: true })
})

describe('novren login', () => {
  it('dal browser, senza account: salva un token del dispositivo', async () => {
    // DISPLAY: su Linux senza schermo la CLI sceglierebbe da sola il codice breve.
    const cli = start(['login', '--name', 'portatile'], { DISPLAY: ':0' })
    const [, url] = await cli.waitFor(/visita:\s*\n\s*(\S+)/)
    const [, check] = await cli.waitFor(/Codice di controllo: (\S+)/)

    // Il codice mostrato nel terminale è quello che la pagina ricalcola dalla sfida.
    const challenge = new URL(url!).searchParams.get('challenge')!
    expect(check).toBe(`${challenge.slice(0, 4)}-${challenge.slice(4, 8)}`)
    expect(new URL(url!).pathname).toBe('/cli/authorize')

    const page = await novren.approveLoopback(url!, 'device')
    expect(page.status).toBe(200)
    const result = await cli.done
    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).toContain('senza account')

    const saved = await credentials()
    expect(saved.token).toMatch(/^nvd_/)
    expect(saved.kind).toBe('device')
    expect(saved.deviceName).toBe('portatile')

    const status = await run(['status'])
    expect(status.stderr).toContain('senza account')
  })

  it('dal browser, con account: dice a quale account si è collegati', async () => {
    const cli = start(['login'], { DISPLAY: ':0' })
    const [, url] = await cli.waitFor(/visita:\s*\n\s*(\S+)/)
    await novren.approveLoopback(url!, 'account')
    const result = await cli.done
    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).toContain('mario@example.com')
    expect((await credentials()).token).toMatch(/^nva_/)
  })

  it('un ritorno con lo state sbagliato si rifiuta, e il login resta in attesa di quello vero', async () => {
    const cli = start(['login'], { DISPLAY: ':0' })
    const [, url] = await cli.waitFor(/visita:\s*\n\s*(\S+)/)
    const port = new URL(url!).searchParams.get('port')
    const forged = await fetch(`http://127.0.0.1:${port}/callback?code=rubato&state=indovinato-a-caso-xyz`)
    expect(forged.status).toBe(400)
    expect(await exists(join(config, 'credentials.json'))).toBe(false)

    await novren.approveLoopback(url!, 'device')
    expect((await cli.done).code).toBe(0)
  })

  it('con il codice breve (server via SSH)', async () => {
    const cli = start(['login', '--device-code'])
    const [, userCode] = await cli.waitFor(/codice:\s+([A-Z2-9]{4}-[A-Z2-9]{4})/)
    await cli.waitFor(/cli\/device/)
    novren.approveDevice(userCode!, 'account')
    const result = await cli.done
    expect(result.code, result.stderr).toBe(0)
    expect((await credentials()).kind).toBe('account')
  })

  it('logout: revoca il token sul server e lo cancella dal disco', async () => {
    const token = await saveToken('device')
    const result = await run(['logout'])
    expect(result.code, result.stderr).toBe(0)
    expect(novren.isRevoked(token)).toBe(true)
    expect(await exists(join(config, 'credentials.json'))).toBe(false)
  })
})

describe('novren send', () => {
  it('senza login e senza terminale: si ferma e dice cosa fare, senza toccare il server', async () => {
    const before = novren.requests.length
    await writeFile(join(work, 'a.txt'), 'ciao')
    const result = await run(['send', join(work, 'a.txt')])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('novren login')
    expect(novren.requests.length).toBe(before)
  })

  it('un file: il link che stampa si riapre identico, e il server non vede né nome né chiave', async () => {
    await saveToken('device')
    const plain = randomFile(5000)
    await writeFile(join(work, 'Ricorso Rossi.pdf'), plain)
    const before = novren.requests.length

    const { link, saved } = await roundTrip([join(work, 'Ricorso Rossi.pdf')])

    expect(link).toMatch(/^https:\/\/novren\.net\/share\/[A-Za-z0-9]+#key=/)
    expect(saved.endsWith('Ricorso Rossi.pdf')).toBe(true)
    expect(new Uint8Array(await readFile(saved))).toEqual(plain)

    const done = novren.completed.at(-1)!
    expect(done.body.nameVersion).toBe(2)
    expect(done.body.formatVersion).toBe(2)
    expect(done.body.chunkSize).toBe(10 * 1024 * 1024)
    expect(done.body.originalSize).toBe(5000)
    expect(done.body.fileType).toBe('application/pdf')

    const key = new URLSearchParams(new URL(link).hash.slice(1)).get('key')!
    const seen = novren.requests.slice(before).join('\n')
    expect(seen).not.toContain(key)
    expect(seen).not.toContain('Ricorso')
    // Nemmeno sul disco: la cronologia tiene il manageToken, mai la chiave.
    expect(await readFile(join(config, 'sends.json'), 'utf8')).not.toContain(key)
  })

  it('dimensioni reali: 25 MB → tre parti da 10 MiB, e torna identico', async () => {
    await saveToken('device')
    const plain = randomFile(25 * 1024 * 1024)
    await writeFile(join(work, 'grande.bin'), plain)
    const { saved } = await roundTrip([join(work, 'grande.bin')])
    expect(novren.completed.at(-1)!.partCount).toBe(3)
    expect(Buffer.compare(await readFile(saved), plain)).toBe(0)
  })

  it('una cartella: parte come «cartella.zip», con dentro i file e i percorsi', async () => {
    await saveToken('device')
    const folder = join(work, 'progetto')
    await mkdir(join(folder, 'sotto'), { recursive: true })
    await writeFile(join(folder, 'uno.txt'), 'contenuto del primo file')
    await writeFile(join(folder, 'sotto', 'due.txt'), 'contenuto del secondo file')

    const { saved } = await roundTrip([folder])
    expect(saved.endsWith('progetto.zip')).toBe(true)
    expect(novren.completed.at(-1)!.body.fileType).toBe('application/zip')

    // client-zip non comprime: nomi e contenuti si leggono nell'archivio così come sono.
    const zip = (await readFile(saved)).toString('latin1')
    expect(zip.startsWith('PK\u0003\u0004')).toBe(true)
    expect(zip).toContain('progetto/uno.txt')
    expect(zip).toContain('progetto/sotto/due.txt')
    expect(zip).toContain('contenuto del secondo file')
  })

  it('più file: «trasferimento.zip»', async () => {
    await saveToken('device')
    await writeFile(join(work, 'a.txt'), 'A')
    await writeFile(join(work, 'b.txt'), 'B')
    const { saved } = await roundTrip([join(work, 'a.txt'), join(work, 'b.txt')])
    expect(saved.endsWith('trasferimento.zip')).toBe(true)
  })

  it('con un account: l’invio passa nell’account (claim)', async () => {
    await saveToken('account')
    await writeFile(join(work, 'a.txt'), 'ciao')
    const { sent } = await roundTrip([join(work, 'a.txt')])
    expect(novren.completed.at(-1)!.claimedBy).toBe('mario@example.com')
    expect(sent.stderr).toContain('account')
  })

  it('una parte che lo storage rifiuta una volta si riprova, e l’invio riesce', async () => {
    await saveToken('device')
    const plain = randomFile(3000)
    await writeFile(join(work, 'a.bin'), plain)
    novren.failPartsOnce.add(1)
    const { saved } = await roundTrip([join(work, 'a.bin')])
    expect(new Uint8Array(await readFile(saved))).toEqual(plain)
  })

  it('password: con --password il link la chiede', async () => {
    await saveToken('device')
    await writeFile(join(work, 'a.txt'), 'segreto')
    const sent = await run(['send', '--password', join(work, 'a.txt')], { NOVREN_LINK_PASSWORD: 'cavallo' })
    expect(sent.code, sent.stderr).toBe(0)
    const wrong = await run(['get', sent.stdout.trim(), '-o', work])
    expect(wrong.code).toBe(1)
    expect(wrong.stderr).toContain('password')
    await mkdir(join(root, 'ok'))
    const right = await run(['get', sent.stdout.trim(), '-o', join(root, 'ok')], { NOVREN_LINK_PASSWORD: 'cavallo' })
    expect(right.code, right.stderr).toBe(0)
    expect(await readFile(right.stdout.trim(), 'utf8')).toBe('segreto')
  })

  it('quota giornaliera finita: messaggio chiaro, niente caricato', async () => {
    await saveToken('device')
    novren.dailyLimit = 0
    const count = novren.completed.length
    await writeFile(join(work, 'a.txt'), 'x')
    const result = await run(['send', join(work, 'a.txt')])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('invii di oggi')
    expect(novren.completed.length).toBe(count)
  })

  it('token revocato dal sito: messaggio chiaro, e le credenziali morte si tolgono dal disco', async () => {
    const token = await saveToken('device')
    novren.revokeToken(token)
    await writeFile(join(work, 'a.txt'), 'x')
    const result = await run(['send', join(work, 'a.txt')])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('novren login')
    expect(await exists(join(config, 'credentials.json'))).toBe(false)
  })

  it('backend con la CLI spenta: lo dice, invece di un errore incomprensibile', async () => {
    await saveToken('device')
    novren.cliEnabled = false
    await writeFile(join(work, 'a.txt'), 'x')
    const result = await run(['send', join(work, 'a.txt')])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('non è ancora attivo')
  })

  it('un file che non esiste: errore chiaro, nessuna richiesta', async () => {
    await saveToken('device')
    const before = novren.requests.length
    const result = await run(['send', join(work, 'non-esiste.txt')])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Non trovo')
    expect(novren.requests.length).toBe(before)
  })

  it('--mail: apre la posta con il link nel corpo; su stdout resta solo il link', async () => {
    await saveToken('device')
    await writeFile(join(work, 'preventivo.pdf'), 'x')
    // NOVREN_OPEN_BROWSER=0 (in baseEnv): invece di aprire, la CLI stampa l'indirizzo.
    const result = await run(['send', join(work, 'preventivo.pdf'), '--mail', 'mario@example.com'])
    expect(result.code, result.stderr).toBe(0)
    const link = result.stdout.trim()
    expect(result.stdout).toBe(`${link}\n`)

    const mailto = result.stderr.match(/mailto:\S+/)![0]
    const url = new URL(mailto)
    expect(url.pathname).toBe('mario@example.com')
    expect(url.searchParams.get('body')).toContain(link)
    expect(url.searchParams.get('subject')).toContain('preventivo.pdf')
  })

  it('--mail con un indirizzo sbagliato: si ferma PRIMA di caricare', async () => {
    await saveToken('device')
    await writeFile(join(work, 'a.txt'), 'x')
    const before = novren.completed.length
    const result = await run(['send', join(work, 'a.txt'), '--mail', 'mario@example.com?bcc=spia@x.it'])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('non sembra un indirizzo')
    expect(novren.completed.length).toBe(before)
  })

  it('--copy (via terminale, OSC 52) e --qr', async () => {
    await saveToken('device')
    await writeFile(join(work, 'a.txt'), 'x')
    const result = await run(['send', join(work, 'a.txt'), '--copy', '--qr'], { NOVREN_CLIPBOARD: 'osc52' })
    expect(result.code, result.stderr).toBe(0)
    const link = result.stdout.trim()
    expect(result.stderr).toContain(`\x1b]52;c;${Buffer.from(link).toString('base64')}\x07`)
    expect(result.stderr).toContain('▀')
    expect(result.stderr).toContain('Inquadralo')
  })

  it('--whatsapp e --telegram: le app, con il link', async () => {
    await saveToken('device')
    await writeFile(join(work, 'a.txt'), 'x')
    const result = await run(['send', join(work, 'a.txt'), '--whatsapp', '--telegram'])
    expect(result.code, result.stderr).toBe(0)
    const link = result.stdout.trim()
    expect(new URL(result.stderr.match(/whatsapp:\S+/)![0]).searchParams.get('text')).toContain(link)
    expect(new URL(result.stderr.match(/tg:\S+/)![0]).searchParams.get('url')).toBe(link)
  })

  it('in uno script (niente terminale) non chiede niente', async () => {
    await saveToken('device')
    await writeFile(join(work, 'a.txt'), 'x')
    const result = await run(['send', join(work, 'a.txt')])
    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).not.toContain('Cosa ne faccio')
  })

  it('revoke: ritira un invio senza account, e il link smette di funzionare', async () => {
    await saveToken('device')
    await writeFile(join(work, 'a.txt'), 'x')
    const sent = await run(['send', join(work, 'a.txt')])
    const link = sent.stdout.trim()

    const list = await run(['revoke'])
    expect(list.stderr).toContain(new URL(link).pathname.split('/').pop()!)

    const revoked = await run(['revoke', link])
    expect(revoked.code, revoked.stderr).toBe(0)
    const got = await run(['get', link, '-o', work])
    expect(got.code).toBe(1)
    expect(got.stderr).toContain('ritirato')
    expect(await readdir(work)).toEqual(['a.txt'])
  })
})
