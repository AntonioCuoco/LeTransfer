import { open, rename, rm, stat, type FileHandle } from 'node:fs/promises'
import { join, parse } from 'node:path'
import type { PlaintextSink } from '../../vue-app/src/crypto/streamingDownload'

/**
 * Dove finiscono i byte decifrati: un file su disco, scritto in modo che **un file troncato
 * non sembri mai un file intero**.
 *
 * Il nucleo lo pretende (`PlaintextSink` in `streamingDownload.ts`): `close` arriva solo se
 * tutti i chunk sono arrivati e hanno superato il tag GCM, `abort` se qualcosa va storto a
 * metà. Da cui:
 *
 *  - si scrive su `<nome>.novren-part`, mai sul nome finale;
 *  - solo a `close` il file parziale viene **rinominato** — un'operazione atomica sullo
 *    stesso disco: o c'è il file intero, o non c'è;
 *  - ad `abort` il parziale si **cancella**. Un documento a metà, con il nome giusto, è il
 *    modo più facile di mandare a un cliente un contratto senza le ultime pagine.
 *
 * Permessi `0600`: ciò che si riceve con Novren è per definizione riservato, e su un
 * computer condiviso non deve diventare leggibile da ogni altro utente solo perché la umask
 * del sistema è permissiva. Su Windows il parametro è ignorato e valgono i permessi della
 * cartella.
 */

const PART_SUFFIX = '.novren-part'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Un percorso libero nella cartella: `nome.pdf`, poi `nome (1).pdf`, `nome (2).pdf`…
 *
 * Mai sovrascrivere: scaricare due volte lo stesso link, o due file omonimi da mittenti
 * diversi, non deve distruggere quello che c'era.
 */
export async function freePath(dir: string, fileName: string): Promise<string> {
  const { name, ext } = parse(fileName)
  for (let i = 0; i < 1000; i++) {
    const candidate = join(dir, i === 0 ? fileName : `${name} (${i})${ext}`)
    if (!(await exists(candidate)) && !(await exists(candidate + PART_SUFFIX))) return candidate
  }
  throw new Error(`Troppi file con il nome «${fileName}» in ${dir}.`)
}

export interface FileSink extends PlaintextSink {
  /** Il percorso definitivo, valido solo dopo `close`. */
  readonly path: string
}

export async function createFileSink(finalPath: string): Promise<FileSink> {
  const partPath = finalPath + PART_SUFFIX
  // `wx`: fallisce se il file esiste già. Fra `freePath` e qui un altro processo potrebbe
  // averlo creato; meglio un errore che scrivere dentro il file di qualcun altro.
  const handle: FileHandle = await open(partPath, 'wx', 0o600)
  let finished = false

  return {
    path: finalPath,
    async write(chunk) {
      await handle.write(chunk)
    },
    async close() {
      await handle.close()
      await rename(partPath, finalPath)
      finished = true
    },
    async abort() {
      if (finished) return
      await handle.close().catch(() => {})
      await rm(partPath, { force: true })
    },
  }
}
