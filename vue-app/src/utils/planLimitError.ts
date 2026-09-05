import { formatBytes } from '@/src/types/plan'

/**
 * I tre modi in cui un upload può sbattere contro i limiti del piano.
 *
 * **Perché serve un modulo apposta.** Il backend risponde `413` per tre motivi diversi, e
 * fino a ieri il client li trattava come uno solo:
 *
 * ```ts
 * const isTooLarge = response?.status === 413 || errorCode === 'FILE_TOO_LARGE'
 * ```
 *
 * Con la quota attiva quella riga diventa dannosa: a chi ha finito lo spazio direbbe
 * «il file supera il limite del tuo piano» e gli aprirebbe il dialogo per comprare un piano
 * con file più grandi — **per un file magari da 2 MB**. Non un errore muto: un errore sicuro
 * di sé e sbagliato, che manda l'utente a comprare la cosa che non gli serve.
 *
 * Le tre cause vogliono tre risposte diverse, e solo una delle tre si risolve pagando:
 *
 * | Codice | Cosa è successo | Si risolve |
 * |---|---|---|
 * | `FILE_TOO_LARGE` | Questo file è più grande del massimo per trasferimento | Con un piano superiore |
 * | `QUOTA_EXCEEDED` | Lo spazio archiviato è pieno | **Liberando spazio**, o con un piano superiore |
 * | `MONTHLY_LIMIT_EXCEEDED` | Esaurito il volume del mese | **Aspettando il rinnovo**, o con un piano superiore |
 *
 * ⚠️ **Un `413` che non porta un codice riconoscibile non viene indovinato.** Prima si
 * assumeva `FILE_TOO_LARGE`; ora si dice che è un limite del piano senza specificare quale.
 * Meno preciso, ma non inventa: una diagnosi sbagliata detta con sicurezza costa più di una
 * diagnosi mancante.
 */

export type PlanLimitCode = 'FILE_TOO_LARGE' | 'QUOTA_EXCEEDED' | 'MONTHLY_LIMIT_EXCEEDED'

/** I campi che il backend allega al `413` (`services/userUsage.js`). Tutti facoltativi. */
export interface PlanLimitDetail {
  limitBytes?: number
  usedBytes?: number
  remainingBytes?: number
  requiredBytes?: number
  /** Solo per il tetto mensile: quando riparte il conteggio (ISO). */
  resetsAt?: string
  /** Solo per il cap per file, nome storico del campo. */
  maxBytes?: number
}

export interface PlanLimitError {
  /** `null` quando il `413` non dichiara quale limite ha colpito. */
  code: PlanLimitCode | null
  detail: PlanLimitDetail
  /** Messaggio pronto da mostrare, con i numeri dentro quando ci sono. */
  message: string
  /**
   * Ha senso proporre un piano superiore per questo errore?
   *
   * Per il tetto mensile è `false` di proposito: l'utente ha già lo spazio, gli è finito il
   * mese. Il primo consiglio è «riprova il giorno X», non «paga» — e un prodotto che
   * propone di pagare quando basterebbe aspettare si fa ricordare per il motivo sbagliato.
   */
  suggestsUpgrade: boolean
}

function isCode(value: unknown): value is PlanLimitCode {
  return (
    value === 'FILE_TOO_LARGE' ||
    value === 'QUOTA_EXCEEDED' ||
    value === 'MONTHLY_LIMIT_EXCEEDED'
  )
}

function formatResetDate(iso?: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
}

function buildMessage(code: PlanLimitCode | null, detail: PlanLimitDetail): string {
  switch (code) {
    case 'FILE_TOO_LARGE': {
      const max = detail.maxBytes ?? detail.limitBytes
      return max
        ? `Questo file supera il massimo del tuo piano (${formatBytes(max)} per trasferimento).`
        : 'Questo file supera il massimo per trasferimento del tuo piano.'
    }

    case 'QUOTA_EXCEEDED': {
      // Lo spazio libero è l'informazione che serve davvero: dice quanto liberare.
      const { remainingBytes, requiredBytes, limitBytes } = detail
      if (remainingBytes != null && requiredBytes != null) {
        return `Spazio esaurito: ti restano ${formatBytes(remainingBytes)} e questo file ne occupa ${formatBytes(requiredBytes)}. Libera spazio eliminando qualche file, oppure passa a un piano più capiente.`
      }
      return limitBytes
        ? `Hai riempito lo spazio del tuo piano (${formatBytes(limitBytes)}). Libera spazio eliminando qualche file, oppure passa a un piano più capiente.`
        : 'Hai riempito lo spazio del tuo piano. Libera spazio eliminando qualche file, oppure passa a un piano più capiente.'
    }

    case 'MONTHLY_LIMIT_EXCEEDED': {
      const when = formatResetDate(detail.resetsAt)
      const { remainingBytes, requiredBytes } = detail
      const head =
        remainingBytes != null && requiredBytes != null
          ? `Hai quasi esaurito il volume di questo mese: ne restano ${formatBytes(remainingBytes)} e questo file ne occupa ${formatBytes(requiredBytes)}.`
          : 'Hai esaurito il volume di trasferimento di questo mese.'
      return when
        ? `${head} Il conteggio riparte il ${when}.`
        : `${head} Il conteggio riparte all'inizio del mese prossimo.`
    }

    default:
      // Nessun codice: si dice cosa si sa, e non di più.
      return 'Il trasferimento supera un limite del tuo piano.'
  }
}

/**
 * Riconosce un errore di limite del piano in un errore Axios. Restituisce `null` se non lo è
 * — così chi chiama può tenere il suo messaggio generico per tutto il resto.
 */
export function parsePlanLimitError(error: unknown): PlanLimitError | null {
  const response = (
    error as {
      response?: { status?: number; data?: { errorCode?: unknown } & PlanLimitDetail }
    }
  ).response

  const data = response?.data
  const code = isCode(data?.errorCode) ? data.errorCode : null

  // Un codice riconosciuto vale anche senza `413`; un `413` vale anche senza codice.
  if (!code && response?.status !== 413) return null

  const detail: PlanLimitDetail = {
    limitBytes: data?.limitBytes,
    usedBytes: data?.usedBytes,
    remainingBytes: data?.remainingBytes,
    requiredBytes: data?.requiredBytes,
    resetsAt: data?.resetsAt,
    maxBytes: data?.maxBytes,
  }

  return {
    code,
    detail,
    message: buildMessage(code, detail),
    suggestsUpgrade: code !== 'MONTHLY_LIMIT_EXCEEDED',
  }
}
