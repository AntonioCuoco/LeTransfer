import { spawn } from 'node:child_process'

/**
 * Apre un indirizzo con il programma di sistema: il browser per https:, il programma di
 * posta per mailto:, l'app per whatsapp: e tg:.
 *
 * Senza shell (`spawn` con argomenti separati): gli indirizzi contengono `&`, e passati a una
 * shell verrebbero spezzati in due comandi — con un pezzo del link eseguito come comando.
 *
 * Restituisce false se non ha nemmeno provato (`NOVREN_OPEN_BROWSER=0`: test, o chi preferisce
 * copiare l'indirizzo a mano). true non garantisce che si sia aperto qualcosa: se manca il
 * programma giusto il sistema non lo dice a noi.
 */
export function openExternal(url: string): boolean {
  if (process.env.NOVREN_OPEN_BROWSER === '0') return false
  const [command, args] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]]
  try {
    spawn(command, args as string[], { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
    return true
  } catch {
    return false
  }
}
