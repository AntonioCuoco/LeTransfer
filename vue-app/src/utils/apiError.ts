import { notify } from './notify'
import { withDetail } from './errorDetail'

/**
 * Il messaggio d'errore scritto dal backend, se c'è.
 *
 * Il backend non usa una forma sola: i link pubblici rispondono `{ code, message }`,
 * admin e foto profilo `{ error, errorCode }`, il canale guest a volte solo `{ errorCode }`.
 * Si leggono `message` ed `error`, in quest'ordine, e solo se sono testo.
 *
 * ⚠️ Mai `err.message` di axios: è «Request failed with status code 403», in inglese e
 * senza niente di utile per chi legge. Se il server non ha scritto nulla, decide il
 * chiamante con un testo suo.
 */
export function apiErrorMessage(error: unknown): string | null {
  const data = (error as { response?: { data?: { message?: unknown; error?: unknown } } } | null)
    ?.response?.data
  for (const candidate of [data?.message, data?.error]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

/**
 * Il testo da mostrare per una chiamata al backend fallita: il messaggio del server se l'ha
 * scritto; altrimenti il `fallback` **con il dettaglio tecnico in coda** (status, metodo e
 * percorso, o il codice di rete se una risposta non c'è proprio).
 *
 * Il ripiego da solo non esce più: è esattamente il caso in cui serve di più sapere cosa è
 * successo — rete assente, 502 di Fly, 413 del proxy, CORS — e il server non l'ha detto.
 */
export function describeApiError(error: unknown, fallback: string): string {
  return apiErrorMessage(error) ?? withDetail(fallback, error)
}

/**
 * Toast d'errore per una chiamata al backend: titolo fisso, descrizione da `describeApiError`.
 * Restituisce il testo mostrato, per chi deve anche tenerlo in pagina.
 */
export function notifyApiError(error: unknown, title: string, fallback: string): string {
  const message = describeApiError(error, fallback)
  notify.error(message, title)
  return message
}
