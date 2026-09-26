import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, hostname } from 'node:os'
import { join } from 'node:path'

/**
 * Dove la CLI tiene le sue cose, e cosa ci tiene.
 *
 *   credentials.json   il token di questo computer (nvd_… o nva_…)
 *   sends.json         gli invii fatti da qui: codice pubblico e manageToken, per ritirarli
 *
 * ── Cosa NON ci tiene mai ───────────────────────────────────────────────────────
 * Le chiavi dei file. Un link di Novren porta la chiave nel frammento: se la cronologia la
 * conservasse, un file di configurazione copiato da un backup aprirebbe tutto ciò che è
 * stato inviato da questo computer. Il link completo si stampa una volta, e si dimentica.
 *
 * ── Permessi ────────────────────────────────────────────────────────────────────
 * Cartella 0700, file 0600: su un computer condiviso, gli altri utenti non leggono il token.
 * Su Windows i permessi POSIX non si applicano e valgono quelli del profilo utente, che è
 * già privato. Il token, comunque, non apre nessun file: permette di inviare, e con un
 * account di reclamare gli invii e gestire i propri link.
 */

export function configDir(): string {
  if (process.env.NOVREN_CONFIG_DIR) return process.env.NOVREN_CONFIG_DIR
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'novren')
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'novren')
}

/** Il sito: da qui partono l'autorizzazione e i link. */
export function webBaseUrl(): string {
  return (process.env.NOVREN_WEB_URL ?? 'https://novren.net').replace(/\/$/, '')
}

/** Il nome con cui questo computer compare nelle impostazioni del sito. Modificabile con --name. */
export function defaultDeviceName(): string {
  return hostname().slice(0, 80) || 'CLI'
}

async function ensureDir(): Promise<string> {
  const dir = configDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  return dir
}

async function writePrivate(name: string, data: unknown): Promise<void> {
  const path = join(await ensureDir(), name)
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  // `mode` vale solo alla creazione: un file già esistente con permessi larghi va ristretto.
  await chmod(path, 0o600).catch(() => {})
}

async function readJson<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(join(configDir(), name), 'utf8')) as T
  } catch {
    return null
  }
}

export interface Credentials {
  token: string
  kind: 'device' | 'account'
  expiresAt: string
  deviceName: string
  /** Per non usare un token di staging contro la produzione, o viceversa. */
  apiUrl: string
}

export async function loadCredentials(apiUrl: string): Promise<Credentials | null> {
  const saved = await readJson<Credentials>('credentials.json')
  if (!saved?.token || saved.apiUrl !== apiUrl) return null
  if (new Date(saved.expiresAt).getTime() <= Date.now()) return null
  return saved
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  await writePrivate('credentials.json', credentials)
}

export async function forgetCredentials(): Promise<void> {
  await rm(join(configDir(), 'credentials.json'), { force: true })
}

export interface SentRecord {
  publicToken: string
  /** La capability per ritirare un invio senza account. Non apre il file. */
  manageToken: string
  sentAt: string
  expiresAt: string | null
  /** Reclamato da un account: da quel momento si gestisce dal sito. */
  claimed: boolean
}

export async function loadSends(): Promise<SentRecord[]> {
  return (await readJson<SentRecord[]>('sends.json')) ?? []
}

export async function recordSend(record: SentRecord): Promise<void> {
  const now = Date.now()
  // Si tengono solo gli invii non ancora scaduti: un manageToken di un link morto non serve.
  const kept = (await loadSends()).filter((r) => !r.expiresAt || new Date(r.expiresAt).getTime() > now)
  await writePrivate('sends.json', [...kept, record])
}

export async function saveSends(records: SentRecord[]): Promise<void> {
  await writePrivate('sends.json', records)
}
