import { spawn } from 'node:child_process'
import { encode } from 'uqr'
import { looksHeadless } from './login'
import { openExternal } from './open'
import { ask, info, interactive } from './ui'
import { UserError } from './commands/get'

/**
 * Dopo `send`: far arrivare il link a qualcuno — appunti, QR, email, WhatsApp, Telegram.
 *
 * ── Chi vede il link ─────────────────────────────────────────────────────────
 * Il link contiene la chiave: chi lo legge apre il file. Per questo NON lo manda Novren (il
 * server vedrebbe la chiave e cadrebbe lo zero-knowledge): lo consegna questo computer al
 * canale scelto dall'utente, esattamente come se lo copiasse a mano. Novren non è mai nel
 * mezzo; il canale sì, e la scelta del canale è dell'utente.
 *
 * Per WhatsApp e Telegram si aprono le **app** (`whatsapp:`, `tg:`), non le pagine web
 * wa.me / t.me: quelle ricevono il testo nella query string, cioè i loro server leggerebbero
 * il link con la chiave prima ancora che il messaggio parta.
 */

export interface SharedTransfer {
  link: string
  /** Il nome del file (o dell'archivio): va solo nel messaggio, sul canale dell'utente. */
  name: string
  expiresAt: string | null
  passwordProtected: boolean
}

export interface ShareOptions {
  copy?: boolean
  qr?: boolean
  /** Indirizzo del destinatario; stringa vuota = lo si sceglie nel programma di posta. */
  mail?: string
  whatsapp?: boolean
  telegram?: boolean
  noMenu?: boolean
}

// ── Il messaggio ───────────────────────────────────────────────────────────────

function expiryText(expiresAt: string | null): string | null {
  if (!expiresAt) return null
  const when = new Date(expiresAt)
  if (Number.isNaN(when.getTime())) return null
  return `Il link scade il ${when.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' })}.`
}

/** Il testo che accompagna il link: lo stesso per email e chat. */
export function composeMessage(t: SharedTransfer): string {
  return [
    `Ti ho mandato «${t.name}» con Novren:`,
    '',
    t.link,
    '',
    'Il file è cifrato end-to-end: si apre nel browser, e la chiave è solo in questo link.',
    ...(t.passwordProtected ? ['È protetto da una password: te la mando a parte.'] : []),
    ...(expiryText(t.expiresAt) ? [expiryText(t.expiresAt)!] : []),
  ].join('\n')
}

/**
 * Un indirizzo email plausibile, e soprattutto senza caratteri che in un mailto: aprono altri
 * parametri: `mario@x.it?bcc=altro@y.it` aggiungerebbe un destinatario nascosto.
 */
const EMAIL = /^[^\s@<>()",;:?&#%]+@[^\s@<>()",;:?&#%]+\.[^\s@<>()",;:?&#%]+$/
export const isEmail = (value: string) => EMAIL.test(value)

/** RFC 6068: righe separate da CRLF, tutto percent-encoded (spazi come %20, non «+»). */
const mailEncode = (text: string) => encodeURIComponent(text.replace(/\r?\n/g, '\r\n'))

export function mailtoUrl(t: SharedTransfer, to: string): string {
  if (to && !isEmail(to)) throw new UserError(`«${to}» non sembra un indirizzo email.`)
  const subject = `«${t.name}» — tramite Novren`
  return `mailto:${to}?subject=${mailEncode(subject)}&body=${mailEncode(composeMessage(t))}`
}

export const whatsappUrl = (t: SharedTransfer) => `whatsapp://send?text=${encodeURIComponent(composeMessage(t))}`

export function telegramUrl(t: SharedTransfer): string {
  // Telegram mette il link in cima da solo: nel testo va il resto del messaggio.
  const text = composeMessage(t).replace(`${t.link}\n\n`, '')
  return `tg://msg_url?url=${encodeURIComponent(t.link)}&text=${encodeURIComponent(text)}`
}

// ── QR ─────────────────────────────────────────────────────────────────────────

const WHITE_FG = '\x1b[97m'
const BLACK_FG = '\x1b[30m'
const WHITE_BG = '\x1b[107m'
const BLACK_BG = '\x1b[40m'
const RESET = '\x1b[0m'

/**
 * Il QR per il terminale: due righe di moduli per riga di testo, con «▀» (sopra = colore del
 * testo, sotto = colore di sfondo).
 *
 * I colori sono espliciti, nero su bianco, e non «pieno = scuro»: su un terminale con tema
 * scuro i blocchi pieni verrebbero chiari su fondo nero, un QR invertito che molte fotocamere
 * non leggono. Il bordo bianco (zona di quiete) è dipinto anch'esso, per lo stesso motivo.
 */
export function renderQr(text: string): string {
  const { data } = encode(text, { ecc: 'L', border: 2 })
  const lines: string[] = []
  for (let y = 0; y < data.length; y += 2) {
    let line = ''
    for (let x = 0; x < data[y]!.length; x++) {
      const top = data[y]![x]!
      const bottom = data[y + 1]?.[x] ?? false
      line += `${top ? BLACK_FG : WHITE_FG}${bottom ? BLACK_BG : WHITE_BG}▀`
    }
    lines.push(`${line}${RESET}`)
  }
  return lines.join('\n')
}

// ── Appunti ────────────────────────────────────────────────────────────────────

function pipeTo(command: string, args: string[], input: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] })
      child.on('error', () => resolve(false))
      child.on('close', (code) => resolve(code === 0))
      child.stdin.on('error', () => resolve(false))
      child.stdin.end(input)
    } catch {
      resolve(false)
    }
  })
}

/**
 * OSC 52: la sequenza con cui il terminale stesso mette un testo negli appunti. Funziona anche
 * via SSH — gli appunti sono quelli del computer davanti a cui si è seduti, non del server —
 * ma solo se il terminale la supporta, e noi non possiamo saperlo.
 */
function osc52(text: string): void {
  process.stderr.write(`\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`)
}

/** Copia negli appunti. Restituisce come ci è riuscita, o null. */
export async function copyToClipboard(text: string): Promise<'system' | 'terminal' | null> {
  const forced = process.env.NOVREN_CLIPBOARD
  const remote = Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY)
  if (forced !== 'osc52' && !remote) {
    const candidates: [string, string[]][] =
      process.platform === 'win32' ? [['clip', []]]
      : process.platform === 'darwin' ? [['pbcopy', []]]
      : [
          ...(process.env.WAYLAND_DISPLAY ? [['wl-copy', []] as [string, string[]]] : []),
          ['xclip', ['-selection', 'clipboard']],
          ['xsel', ['--clipboard', '--input']],
        ]
    for (const [command, args] of candidates) {
      if (await pipeTo(command, args, text)) return 'system'
    }
  }
  if (forced === 'osc52' || process.stderr.isTTY) {
    osc52(text)
    return 'terminal'
  }
  return null
}

// ── Le azioni ──────────────────────────────────────────────────────────────────

/** Apre l'indirizzo; se non si può (o è disattivato), lo stampa da aprire a mano. */
function openOrPrint(url: string, what: string): void {
  if (openExternal(url)) info(`Apro ${what}…`)
  else info(`Apri questo indirizzo per ${what}:\n  ${url}`)
}

async function doCopy(t: SharedTransfer): Promise<void> {
  const how = await copyToClipboard(t.link)
  if (how === 'system') info('Link copiato negli appunti.')
  else if (how === 'terminal') info('Link inviato agli appunti tramite il terminale (se il tuo terminale lo supporta).')
  else info('Non riesco ad accedere agli appunti: copia il link qui sopra.')
}

function doQr(t: SharedTransfer): void {
  info(`${renderQr(t.link)}\nInquadralo con la fotocamera del telefono.`)
}

async function runOptions(t: SharedTransfer, options: ShareOptions): Promise<void> {
  if (options.copy) await doCopy(t)
  if (options.qr) doQr(t)
  if (options.mail !== undefined) openOrPrint(mailtoUrl(t, options.mail.trim()), 'il programma di posta')
  if (options.whatsapp) openOrPrint(whatsappUrl(t), 'WhatsApp')
  if (options.telegram) openOrPrint(telegramUrl(t), 'Telegram')
}

interface MenuEntry {
  label: string
  run: (t: SharedTransfer) => Promise<void> | void
}

/** Le voci del menu. Senza schermo (SSH) niente email né app: non c'è niente da aprire. */
export function menuEntries(headless: boolean): MenuEntry[] {
  const entries: MenuEntry[] = [
    { label: 'Copia negli appunti', run: doCopy },
    { label: 'Mostra il QR code (lo inquadri con il telefono)', run: doQr },
  ]
  if (!headless) {
    entries.push(
      {
        label: 'Email (dal tuo programma di posta)',
        run: async (t) => {
          let to = await ask('A chi? (Invio: lo scegli nel programma di posta) ')
          while (to && !isEmail(to)) to = await ask('Non sembra un indirizzo email. Riprova (Invio per saltare): ')
          openOrPrint(mailtoUrl(t, to), 'il programma di posta')
        },
      },
      { label: 'WhatsApp', run: (t) => openOrPrint(whatsappUrl(t), 'WhatsApp') },
      { label: 'Telegram', run: (t) => openOrPrint(telegramUrl(t), 'Telegram') },
    )
  }
  return entries
}

async function runMenu(t: SharedTransfer): Promise<void> {
  const entries = menuEntries(looksHeadless())
  info('\nCosa ne faccio del link?')
  entries.forEach((entry, i) => info(`  ${i + 1}  ${entry.label}`))
  info('  Invio  niente, basta così')
  let prompt = 'Scelta: '
  for (;;) {
    const answer = await ask(prompt)
    if (!answer) return
    const entry = entries[Number(answer) - 1]
    if (!entry) {
      prompt = `Scegli un numero da 1 a ${entries.length}, o Invio per finire: `
      continue
    }
    await entry.run(t)
    prompt = 'Altro? (numero, o Invio per finire): '
  }
}

/**
 * Con opzioni esplicite fa quelle; altrimenti, se c'è qualcuno davanti al terminale, chiede.
 * In uno script (niente terminale) non chiede mai niente: il link è già su stdout.
 */
export async function shareLink(t: SharedTransfer, options: ShareOptions): Promise<void> {
  const explicit = options.copy || options.qr || options.mail !== undefined || options.whatsapp || options.telegram
  if (explicit) return runOptions(t, options)
  if (!options.noMenu && interactive()) return runMenu(t)
}
