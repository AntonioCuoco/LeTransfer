import { ApiError, guestRevoke } from '../api'
import { forgetCredentials, loadSends, saveSends } from '../config'
import { send as upload, type MemoryContent, type SendResult } from '../send'
import { isEmail } from '../share'
import { askSecret, info, interactive } from '../ui'
import { requireCredentials } from './account'
import { UserError } from './get'

/**
 * `novren send <file…>` — stampa il link su stdout, e solo quello.
 *
 * La password del link non si passa mai come argomento (cronologia della shell, elenco dei
 * processi): `--password` la chiede in modo nascosto, oppure si legge da
 * NOVREN_LINK_PASSWORD.
 */

export interface SendCommandOptions {
  paths: string[]
  /** Al posto di `paths`, un contenuto in memoria: lo usa `novren secret`. */
  content?: MemoryContent
  askPassword?: boolean
  expiresInHours?: string
  maxDownloads?: string
  /** Solo per validarlo PRIMA di caricare: scoprire un indirizzo sbagliato a invio fatto è tardi. */
  mail?: string
}

function positiveInt(value: string | undefined, what: string): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new UserError(`${what}: serve un numero intero positivo.`)
  return n
}

export async function send(options: SendCommandOptions): Promise<SendResult> {
  if (options.paths.length === 0 && !options.content) throw new UserError('Cosa invio? Esempio: novren send documento.pdf')
  const expiresInHours = positiveInt(options.expiresInHours, '--expires')
  const maxDownloads = positiveInt(options.maxDownloads, '--max-downloads')
  const mail = options.mail?.trim()
  if (mail && !isEmail(mail)) throw new UserError(`--mail: «${mail}» non sembra un indirizzo email.`)

  let password = process.env.NOVREN_LINK_PASSWORD || undefined
  if (options.askPassword && !password) {
    if (!interactive()) throw new UserError('Senza terminale la password si passa con NOVREN_LINK_PASSWORD.')
    password = await askSecret('Password del link: ')
    if (!password) throw new UserError('Password vuota.')
    if ((await askSecret('Ripeti la password: ')) !== password) throw new UserError('Le password non coincidono.')
  }

  const credentials = await requireCredentials()
  try {
    const result = await upload({ paths: options.paths, content: options.content, credentials, password, expiresInHours, maxDownloads })
    if (result.expiresAt) info(`Scade il ${new Date(result.expiresAt).toLocaleString('it-IT')}.`)
    if (result.claimed) info('Aggiunto al tuo account: lo trovi fra i tuoi link sul sito.')
    return result
  } catch (error) {
    // Un token revocato dal sito resta sul disco finché non si prova a usarlo: lo si toglie,
    // così il prossimo invio ricollega il computer invece di fallire di nuovo.
    if (error instanceof ApiError && error.code === 'CLI_TOKEN_INVALID') await forgetCredentials()
    throw error
  }
}

/**
 * `novren revoke [link|codice]` — ritira un invio fatto **senza account** da questo computer.
 * Quelli reclamati da un account si gestiscono dal sito.
 */
export async function revoke(target: string | undefined): Promise<void> {
  const sends = await loadSends()
  const own = sends.filter((s) => !s.claimed)
  if (!target) {
    if (own.length === 0) {
      info('Nessun invio senza account da ritirare su questo computer.')
      return
    }
    info('Invii da questo computer (codice · inviato il):')
    for (const s of own) info(`  ${s.publicToken} · ${new Date(s.sentAt).toLocaleString('it-IT')}`)
    info('Per ritirarne uno: novren revoke <codice>')
    return
  }

  // Si accetta sia il codice sia il link intero: del link serve solo il codice pubblico,
  // e il frammento con la chiave si ignora.
  const publicToken = target.split('#')[0]!.split('/share/').pop()!.replace(/\/$/, '')
  const record = sends.find((s) => s.publicToken === publicToken)
  if (!record) throw new UserError('Non trovo questo invio fra quelli fatti da questo computer.')
  if (record.claimed) throw new UserError('Questo invio è nel tuo account: ritiralo dal sito.')

  await guestRevoke(record.publicToken, record.manageToken)
  await saveSends(sends.filter((s) => s !== record))
  info('Ritirato: il link non funziona più e il file è stato cancellato.')
}
