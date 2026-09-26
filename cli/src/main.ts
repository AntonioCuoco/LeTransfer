import { parseArgs } from 'node:util'
import { ApiError } from './api'
import { InvalidLink } from './link'
import { get, UserError } from './commands/get'
import { login, logout, status } from './commands/account'
import { revoke, send } from './commands/send'
import { DownloadError } from '../../vue-app/src/crypto/streamingDownload'

/**
 * `novren` — l'ingresso della CLI.
 *
 * `util.parseArgs` di Node e non una libreria di parsing: la CLI non ha dipendenze a runtime,
 * e per uno strumento crittografico ogni dipendenza è codice di terzi sul percorso della chiave.
 *
 * Codici d'uscita: 0 riuscito · 1 errore (link, rete, decifratura) · 2 uso sbagliato.
 */

declare const __NOVREN_CLI_VERSION__: string

const USAGE = `novren — file cifrati end-to-end, la chiave non lascia mai il tuo computer.

Uso:
  novren send <file|cartella…>  cifra, carica e stampa il link
      --password               protegge il link con una password (chiesta, nascosta)
      --expires <ore>          scadenza in ore (default e massimo: 7 giorni)
      --max-downloads <n>      numero massimo di download

  novren get [link]            scarica e decifra un invio (senza link: te lo chiede)
      -o, --output <cartella>  dove salvarlo (default: la cartella corrente)
      --name <nome>            come presentarti al mittente (default: «Novren CLI»)

  novren login                 collega questo computer (con o senza account)
      --device-code            senza browser qui: codice da inserire da un altro dispositivo
      --name <nome>            come compare questo computer nelle impostazioni del sito
  novren status                a cosa è collegato questo computer
  novren logout                scollega questo computer e revoca il suo accesso
  novren revoke [codice|link]  ritira un invio senza account fatto da qui (senza argomenti: elenco)

  novren --version
  novren --help

Più file o una cartella partono come un unico .zip, come dal sito.
Il link contiene «&»: se lo passi come argomento, mettilo fra virgolette.
Password dei link, in uno script: NOVREN_LINK_PASSWORD.`

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(`${USAGE}\n`)
    return command ? 0 : 2
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${typeof __NOVREN_CLI_VERSION__ === 'string' ? __NOVREN_CLI_VERSION__ : 'dev'}\n`)
    return 0
  }

  try {
    switch (command) {
      case 'get': {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: {
            output: { type: 'string', short: 'o' },
            name: { type: 'string' },
          },
        })
        if (positionals.length > 1) {
          throw new UsageError('Un link alla volta. Se il link contiene spazi o «&», mettilo fra virgolette.')
        }
        const path = await get({ link: positionals[0], output: values.output, visitorName: values.name })
        process.stdout.write(`${path}\n`)
        return 0
      }
      case 'send': {
        const { values, positionals } = parseArgs({
          args: rest,
          allowPositionals: true,
          options: {
            password: { type: 'boolean' },
            expires: { type: 'string' },
            'max-downloads': { type: 'string' },
          },
        })
        const link = await send({
          paths: positionals,
          askPassword: values.password,
          expiresInHours: values.expires,
          maxDownloads: values['max-downloads'],
        })
        process.stdout.write(`${link}
`)
        return 0
      }
      case 'login': {
        const { values } = parseArgs({
          args: rest,
          options: { 'device-code': { type: 'boolean' }, name: { type: 'string' } },
        })
        await login({ deviceName: values.name, deviceCode: values['device-code'] })
        return 0
      }
      case 'logout':
        parseArgs({ args: rest, options: {} })
        await logout()
        return 0
      case 'status':
        parseArgs({ args: rest, options: {} })
        await status()
        return 0
      case 'revoke': {
        const { positionals } = parseArgs({ args: rest, allowPositionals: true, options: {} })
        if (positionals.length > 1) throw new UsageError('Un invio alla volta.')
        await revoke(positionals[0])
        return 0
      }
      default:
        throw new UsageError(`Comando sconosciuto: «${command}». Vedi novren --help.`)
    }
  } catch (error) {
    return report(error)
  }
}

class UsageError extends Error {}

/**
 * Un errore che l'utente può capire si mostra così com'è. Tutto il resto — un difetto nostro —
 * diventa un messaggio generico, con il dettaglio solo se `NOVREN_DEBUG` è impostata: uno
 * stack trace non aiuta chi sta cercando di scaricare un file, e potrebbe contenere un link.
 */
function report(error: unknown): number {
  if (error instanceof UsageError || (error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS'))) {
    process.stderr.write(`${error.message}\n`)
    return 2
  }
  if (error instanceof UserError || error instanceof ApiError || error instanceof InvalidLink || error instanceof DownloadError) {
    process.stderr.write(`${error.message}\n`)
    return 1
  }
  process.stderr.write('Errore inatteso. Rilancia con NOVREN_DEBUG=1 per i dettagli.\n')
  if (process.env.NOVREN_DEBUG) process.stderr.write(`${(error as Error)?.stack ?? String(error)}\n`)
  return 1
}
