import { basename } from 'node:path'

/**
 * Il nome con cui salvare un file ricevuto.
 *
 * ⚠️ **Il nome lo sceglie chi ha inviato il file**, e con `nameVersion: 2` arriva cifrato:
 * nessuno — né il server né un filtro intermedio — può averlo controllato prima che lo
 * decifriamo qui. Nel browser è innocuo, perché è il browser a decidere dove salvare. In una
 * CLI che scrive su disco, un nome come `../../.bashrc` o `C:\Windows\…` è un attacco
 * (path traversal): scriverebbe fuori dalla cartella scelta, sopra un file dell'utente.
 *
 * Quindi il nome si **riduce**, mai si interpreta:
 *  1. solo l'ultimo componente — nessun separatore, in nessuno dei due sistemi;
 *  2. niente caratteri di controllo, niente caratteri vietati da Windows;
 *  3. niente nomi riservati di Windows (`CON`, `NUL`, `COM1`…), che su quel sistema non sono
 *     file ma dispositivi;
 *  4. niente `.` e `..`, niente punti o spazi finali (Windows li toglie da sé, cambiando il
 *     nome sotto i piedi);
 *  5. lunghezza limitata;
 *  6. se non resta niente, un nome di ripiego.
 */

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
// Caratteri di controllo e quelli vietati nei nomi di file Windows.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g
const MAX_LENGTH = 200

export const FALLBACK_NAME = 'novren-download'

export function safeFileName(untrusted: string): string {
  // Entrambi i separatori, qualunque sia il sistema su cui gira la CLI: un nome con `\`
  // ricevuto su Linux è innocuo lì, ma lo stesso codice gira anche su Windows.
  let name = basename(untrusted.replace(/\\/g, '/'))
  name = name.replace(FORBIDDEN_CHARS, '_')
  name = name.replace(/[. ]+$/, '')
  if (name === '' || name === '.' || name === '..' || /^_*$/.test(name)) return FALLBACK_NAME
  if (WINDOWS_RESERVED.test(name)) name = `_${name}`

  if (name.length > MAX_LENGTH) {
    // Si tiene l'estensione: è quella che dice al sistema con cosa aprirlo.
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : ''
    name = name.slice(0, MAX_LENGTH - ext.length) + ext
  }
  return name
}
