import { decryptFileName, FILENAME_VERSION } from '@/src/crypto/crypto'

/**
 * Nomi dei file: cifratura in scrittura, tolleranza in lettura (O2.2).
 *
 * **Il problema.** Il nome è spesso più rivelatore del contenuto —
 * `Ricorso_Rossi_vs_Bianchi_udienza_12_marzo.pdf` dice tutto senza che nessuno apra niente —
 * ed è l'ultima cosa dei contenuti che il server vede in chiaro.
 *
 * ── L'interruttore ──────────────────────────────────────────────────────────────
 * `ENCRYPT_FILENAMES` accende la **scrittura**. Resta `false` finché il backend non
 * tollera il campo: `utils/helpers.js` oggi sanifica i nomi, e su un blob cifrato lo
 * distruggerebbe — il file diventerebbe irrecuperabile nel nome, per sempre.
 *
 * ⚠️ **La lettura invece è sempre attiva**, e non è una svista: un client che non sapesse
 * leggere `nameVersion: 2` mostrerebbe base64 all'utente il giorno in cui un altro client
 * (o una versione futura) inizia a scriverlo. Si insegna prima a leggere, poi a scrivere —
 * come per il formato v1/v2 dei contenuti.
 *
 * ── Perché non basta provare a decifrare ────────────────────────────────────────
 * Serve `nameVersion` esplicito. Provare a decifrare "e se fallisce era in chiaro" sembra
 * elegante e non lo è: un nome legittimo che *somigli* a base64 verrebbe interpretato come
 * ciphertext, e un ciphertext con la chiave sbagliata verrebbe mostrato come nome. Il
 * discriminante dev'essere un dato, non un tentativo.
 */

/**
 * ⚠️ Si mette a `true` **solo dopo** che il backend ha smesso di sanificare `fileName`.
 * Vedi il work order O2.2: è l'unica cosa che il backend deve fare, ed è bloccante.
 */
export const ENCRYPT_FILENAMES = true

/** Mostrato quando il nome è cifrato ma la chiave non c'è (chiavi bloccate, link senza frammento). */
export const NAME_UNAVAILABLE = 'Nome non disponibile'

/** La forma minima che serve per decidere come leggere un nome. */
export interface NamedRecord {
  fileName?: string
  nameVersion?: number
}

/** `true` se questo record porta un nome cifrato. */
export function hasEncryptedName(record: NamedRecord): boolean {
  return record.nameVersion === FILENAME_VERSION
}

/**
 * Il nome da mostrare. Non lancia mai: un nome che non si apre non deve impedire di vedere
 * il file, di scaricarlo o di cancellarlo — quelle operazioni non dipendono dal nome.
 *
 * @param key la chiave del file, o `null` se non disponibile in questo contesto
 */
export async function resolveFileName(
  record: NamedRecord,
  key: CryptoKey | null,
): Promise<string> {
  const raw = record.fileName ?? ''
  if (!hasEncryptedName(record)) return raw
  if (!key) return NAME_UNAVAILABLE

  try {
    return await decryptFileName(raw, key)
  } catch {
    // Chiave sbagliata o nome manomesso. Mostrare il base64 sarebbe peggio: sembrerebbe
    // un nome vero e finirebbe copiato in un'email o in un ticket.
    return NAME_UNAVAILABLE
  }
}

/**
 * Risolve i nomi di una lista riusando una sola volta la chiave di ciascun file.
 * `getKey` viene chiamata **solo** per i record che ne hanno davvero bisogno: su un elenco
 * di file legacy non parte nessuna richiesta.
 */
export async function resolveFileNames<T extends NamedRecord>(
  records: T[],
  getKey: (record: T) => Promise<CryptoKey | null>,
): Promise<string[]> {
  return Promise.all(
    records.map(async (record) => {
      if (!hasEncryptedName(record)) return record.fileName ?? ''
      return resolveFileName(record, await getKey(record))
    }),
  )
}
