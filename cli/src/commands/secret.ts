import { readFile, stat } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { stdin } from 'node:process'
import type { SendResult } from '../send'
import { askSecret, info, interactive } from '../ui'
import { UserError } from './get'
import { send } from './send'

/**
 * `novren secret [file]` — un segreto in transito: una chiave API, una password, un `.env`.
 *
 * È un invio come gli altri (cifrato qui, la chiave nel frammento del link) con un tipo
 * dedicato, a cui il server applica regole che il mittente non può allargare: **si legge una
 * volta**, scade presto (default 1 ora, massimo 24), al massimo 64 KB.
 *
 * Il segreto non si passa mai come argomento: finirebbe nella cronologia della shell e
 * nell'elenco dei processi. Arriva da un file, da stdin (`echo "$KEY" | novren secret`) o,
 * in un terminale, da una domanda con la risposta nascosta.
 */

/** Deve coincidere con `SECRET_FILE_TYPE` del backend (`config/constants.js`). */
export const SECRET_FILE_TYPE = 'application/vnd.novren.secret'
/** Il testo in chiaro; il backend tollera il sovrappiù della cifratura. */
export const SECRET_MAX_BYTES = 64 * 1024
export const SECRET_MAX_EXPIRY_HOURS = 24

/** Il nome di un segreto senza file: va solo nel messaggio e in chi lo riceve. */
const DEFAULT_NAME = 'segreto'

export interface SecretCommandOptions {
  file?: string
  askPassword?: boolean
  expiresInHours?: string
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.byteLength
    // Si smette di leggere appena si supera il tetto: un `cat` di un file enorme non riempie la memoria.
    if (size > SECRET_MAX_BYTES) throw tooLarge()
    chunks.push(buffer)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

const tooLarge = () =>
  new UserError(`Un segreto può essere al massimo di ${SECRET_MAX_BYTES / 1024} KB. Per un file usa «novren send».`)

async function readSecret(file: string | undefined): Promise<{ name: string; data: Uint8Array }> {
  if (file) {
    const path = resolve(file)
    const s = await stat(path).catch(() => null)
    if (!s?.isFile()) throw new UserError(`Non trovo il file «${path}».`)
    if (s.size > SECRET_MAX_BYTES) throw tooLarge()
    return { name: basename(path), data: new Uint8Array(await readFile(path)) }
  }
  if (!stdin.isTTY) return { name: DEFAULT_NAME, data: await readStdin() }
  if (!interactive()) throw new UserError('Cosa invio? Esempio: novren secret .env  oppure  echo "$TOKEN" | novren secret')
  const text = await askSecret('Il segreto (non si vede mentre lo scrivi): ')
  return { name: DEFAULT_NAME, data: new TextEncoder().encode(text) }
}

export async function secret(options: SecretCommandOptions): Promise<SendResult> {
  // La scadenza si controlla prima di leggere: scoprire un errore dopo aver incollato il
  // segreto è peggio.
  if (options.expiresInHours !== undefined) {
    const hours = Number(options.expiresInHours)
    if (!Number.isInteger(hours) || hours <= 0) throw new UserError('--expires: serve un numero intero positivo.')
    if (hours > SECRET_MAX_EXPIRY_HOURS) {
      throw new UserError(`--expires: un segreto dura al massimo ${SECRET_MAX_EXPIRY_HOURS} ore.`)
    }
  }

  const { name, data } = await readSecret(options.file)
  if (data.byteLength === 0) throw new UserError('Il segreto è vuoto.')
  if (data.byteLength > SECRET_MAX_BYTES) throw tooLarge()

  const result = await send({
    paths: [],
    content: { name, data, type: SECRET_FILE_TYPE },
    askPassword: options.askPassword,
    expiresInHours: options.expiresInHours ?? '1',
  })
  info('Si apre una volta sola: dopo la prima lettura il link non funziona più.')
  return result
}
