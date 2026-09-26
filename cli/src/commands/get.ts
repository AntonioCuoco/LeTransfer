import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  decryptFile,
  decryptFileName,
  FILENAME_VERSION,
  importIVFromBase64,
  importKeyFromBase64,
} from '../../../vue-app/src/crypto/crypto'
import { assertStorageResponse, decryptToSink, DownloadError } from '../../../vue-app/src/crypto/streamingDownload'
import { accessLink, downloadUrl, getLinkInfo } from '../api'
import { FALLBACK_NAME, safeFileName } from '../filename'
import { parseLink } from '../link'
import { createFileSink, freePath } from '../sink'
import { ask, askSecret, formatBytes, info, interactive, progress } from '../ui'

/**
 * `novren get <link>` — scarica un invio e lo decifra **qui**, su questo computer.
 *
 * Usa solo le rotte pubbliche che usa già il sito: nessun account, nessuna modifica al
 * backend. La decifratura è il codice del nucleo di `vue-app`, lo stesso del browser.
 *
 * Esce su stdout **solo il percorso del file salvato**: tutto il resto va su stderr, così
 * il comando si compone in uno script.
 */

export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

export interface GetOptions {
  link?: string
  output?: string
  /** Il nome con cui presentarsi al mittente. Il backend lo richiede (almeno 2 caratteri). */
  visitorName?: string
}

/**
 * Il nome di default verso il mittente. Neutro di proposito: usare il nome utente del
 * sistema o il nome del computer sarebbe comodo, ma manderebbe a un terzo un dato che
 * l'utente non ha scelto di dare.
 */
const DEFAULT_VISITOR_NAME = 'Novren CLI'

export async function get(options: GetOptions): Promise<string> {
  let rawLink = options.link
  if (!rawLink) {
    if (!interactive()) throw new UserError('Manca il link. Uso: novren get "<link>"')
    // Incollare invece di passarlo come argomento evita i problemi di quoting: il link
    // contiene `&`, che bash e PowerShell interpretano se non è fra virgolette.
    rawLink = await ask('Incolla il link: ')
  }

  const link = parseLink(rawLink)
  if (!link.key) {
    throw new UserError(
      'Il link non contiene la chiave (la parte dopo «#»). Senza, il file non si può aprire: ' +
        'non ce l’ha nessun altro, nemmeno Novren. Chiedi il link completo a chi te l’ha mandato.',
    )
  }

  let key: CryptoKey
  try {
    key = await importKeyFromBase64(link.key)
  } catch {
    throw new UserError('La chiave nel link è danneggiata: copia di nuovo il link completo.')
  }

  const outputDir = resolve(options.output ?? process.cwd())
  const dirStat = await stat(outputDir).catch(() => null)
  if (!dirStat?.isDirectory()) throw new UserError(`La cartella «${outputDir}» non esiste.`)

  const linkInfo = await getLinkInfo(link.publicToken)

  // Con `nameVersion: 2` il nome è ciphertext e si apre con la stessa chiave del file. Se non
  // si apre, si scarica comunque con un nome di ripiego: il contenuto non dipende dal nome.
  let name = linkInfo.fileName
  if (linkInfo.nameVersion === FILENAME_VERSION) {
    name = await decryptFileName(linkInfo.fileName, key).catch(() => FALLBACK_NAME)
  }
  const fileName = safeFileName(name)

  let password: string | undefined
  if (linkInfo.isPasswordProtected) {
    password = process.env.NOVREN_LINK_PASSWORD
    if (!password) {
      if (!interactive()) {
        throw new UserError('Il link è protetto da password: impostala in NOVREN_LINK_PASSWORD.')
      }
      password = await askSecret('Password del link: ')
    }
  }

  const access = await accessLink(link.publicToken, options.visitorName ?? DEFAULT_VISITOR_NAME, password)
  if (access.downloadAllowed === false) throw new UserError('Il mittente non consente il download di questo file.')

  const url = await downloadUrl(link.publicToken, access.sessionToken)
  const target = await freePath(outputDir, fileName)
  const sink = await createFileSink(target)

  const isV2 = linkInfo.formatVersion === 2 && linkInfo.chunkSize && linkInfo.originalSize != null
  const total = isV2 ? linkInfo.originalSize! : Number(linkInfo.fileSize) || 0
  info(`${fileName} · ${formatBytes(total)}`)
  const bar = progress('decifro')

  try {
    if (isV2) {
      // Formato v2: a chunk, in streaming. In memoria c'è al massimo un chunk alla volta,
      // qualunque sia la dimensione del file.
      await decryptToSink(
        {
          url,
          key,
          chunkSize: linkInfo.chunkSize!,
          originalSize: linkInfo.originalSize!,
          onProgress: bar.update,
        },
        sink,
      )
    } else {
      // Formato v1 legacy: un blob unico con un solo IV, quello del frammento.
      if (!link.iv) {
        throw new UserError(
          'Questo è un invio in formato vecchio e al link manca la parte «iv=». ' +
            'Probabilmente il terminale l’ha tagliato alla «&»: rilancia con il link fra virgolette, ' +
            'oppure scrivi solo «novren get» e incollalo.',
        )
      }
      const response = await fetch(url)
      assertStorageResponse(response)
      const plain = await decryptFile(await response.blob(), key, importIVFromBase64(link.iv))
      await sink.write(new Uint8Array(await plain.arrayBuffer()))
      await sink.close()
      bar.update(total, total)
    }
  } catch (error) {
    await sink.abort?.(error)
    if (error instanceof UserError || error instanceof DownloadError) throw error
    // Tutto il resto, qui, è il tag GCM che non torna: chiave sbagliata o dati alterati.
    // Non si prova a indovinare quale dei due: si dice cosa significa.
    throw new UserError('Il file non si decifra con questa chiave: il link è incompleto o il file è stato alterato.')
  } finally {
    bar.end()
  }

  return sink.path
}
