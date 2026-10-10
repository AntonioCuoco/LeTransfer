import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeNovren, type FakeNovren } from './fake-novren'

/**
 * `novren secret` e la lettura di un segreto con `novren get`, da fuori: il binario compilato
 * contro il Novren finto.
 *
 * Cosa conta: il segreto torna identico byte per byte (un `.env` con o senza a capo finale
 * dev'essere lo stesso file), non tocca il disco di chi lo riceve se non lo chiede, e si
 * legge una volta sola. Il server non vede né il contenuto né la chiave.
 */

const CLI = fileURLToPath(new URL('../dist/novren.mjs', import.meta.url))
const SECRET = 'application/vnd.novren.secret'

let novren: FakeNovren
let root: string
let config: string

interface Run {
  code: number
  stdout: string
  stderr: string
}

/** Lancia la CLI senza terminale; `input`, se c'è, arriva su stdin. */
function run(args: string[], input?: string): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: {
        ...process.env,
        NOVREN_API_URL: novren.apiUrl,
        NOVREN_CONFIG_DIR: config,
        NOVREN_OPEN_BROWSER: '0',
        NOVREN_LINK_PASSWORD: '',
      },
      cwd: root,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.stdin.end(input ?? '')
  })
}

async function saveToken(): Promise<void> {
  const token = novren.issueToken('device')
  await mkdir(config, { recursive: true })
  await writeFile(
    join(config, 'credentials.json'),
    JSON.stringify({ token, kind: 'device', expiresAt: new Date(Date.now() + 86_400_000).toISOString(), deviceName: 'test', apiUrl: novren.apiUrl }),
  )
}

beforeAll(async () => {
  novren = await startFakeNovren()
})
afterAll(async () => {
  await novren.close()
})
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'novren-secret-'))
  config = join(root, 'config')
  novren.dailyLimit = 20
  novren.cliEnabled = true
  return () => rm(root, { recursive: true, force: true })
})

describe('novren secret', () => {
  it('da stdin: il segreto torna identico su stdout, una volta sola, e il server non vede né testo né chiave', async () => {
    await saveToken()
    const before = novren.requests.length

    const sent = await run(['secret', '--no-menu'], 'sk_live_51Hxyz')
    expect(sent.code, sent.stderr).toBe(0)
    const link = sent.stdout.trim()
    expect(link).toMatch(/^https:\/\/novren\.net\/share\/[A-Za-z0-9]+#key=/)
    expect(sent.stderr).toContain('una volta sola')

    const done = novren.completed.at(-1)!
    expect(done.body.fileType).toBe(SECRET)
    expect(Number(done.body.expiresInHours)).toBe(1)
    expect(done.body.nameVersion).toBe(2)

    const first = await run(['get', link])
    expect(first.code, first.stderr).toBe(0)
    // Esattamente il segreto: senza terminale non si aggiunge nemmeno l'a capo.
    expect(first.stdout).toBe('sk_live_51Hxyz')

    const second = await run(['get', link])
    expect(second.code).toBe(1)
    expect(second.stderr).toContain('già stato letto')

    const key = new URLSearchParams(new URL(link).hash.slice(1)).get('key')!
    const seen = novren.requests.slice(before).join('\n')
    expect(seen).not.toContain(key)
    expect(seen).not.toContain('sk_live_51Hxyz')
  })

  it('da file: un .env torna identico, e non tocca il disco di chi lo riceve', async () => {
    await saveToken()
    const env = 'DATABASE_URL=postgres://u:p@db/x\nSTRIPE_KEY=sk_test_1\n'
    await writeFile(join(root, '.env'), env)

    const sent = await run(['secret', join(root, '.env'), '--no-menu'])
    expect(sent.code, sent.stderr).toBe(0)

    const got = await run(['get', sent.stdout.trim()])
    expect(got.code, got.stderr).toBe(0)
    expect(got.stdout).toBe(env)
    // Nella cartella corrente di chi lo riceve non è comparso niente.
    await expect(stat(join(root, 'segreto'))).rejects.toThrow()
  })

  it('con -o si salva in un file, perché lo si è chiesto', async () => {
    await saveToken()
    const sent = await run(['secret', '--no-menu'], 'password-del-db')
    const out = join(root, 'ricevuti')
    await mkdir(out)

    const got = await run(['get', sent.stdout.trim(), '-o', out])
    expect(got.code, got.stderr).toBe(0)
    expect(await readFile(got.stdout.trim(), 'utf8')).toBe('password-del-db')
  })

  it('le regole si controllano prima di caricare: vuoto, troppo grande, troppo lungo nel tempo', async () => {
    await saveToken()
    const before = novren.completed.length

    const empty = await run(['secret', '--no-menu'], '')
    expect(empty.code).toBe(1)
    expect(empty.stderr).toContain('vuoto')

    const big = await run(['secret', '--no-menu'], 'x'.repeat(64 * 1024 + 1))
    expect(big.code).toBe(1)
    expect(big.stderr).toContain('64 KB')

    const long = await run(['secret', '--expires', '48', '--no-menu'], 'abc')
    expect(long.code).toBe(1)
    expect(long.stderr).toContain('24 ore')

    expect(novren.completed.length).toBe(before)
  })

  it('il segreto non si accetta come argomento: due posizionali sono un errore d\'uso', async () => {
    const res = await run(['secret', 'uno', 'due'])
    expect(res.code).toBe(2)
  })
})
