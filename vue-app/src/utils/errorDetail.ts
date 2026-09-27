import { technicalDetail } from '@/src/crypto/streamingDownload'

/**
 * Il dettaglio tecnico di un errore qualunque, da mettere **in coda** al messaggio mostrato.
 *
 * Perché esiste: quando il server non scrive un messaggio, o l'errore nasce nel browser, il
 * toast mostrava una frase nostra e basta — «Errore durante il caricamento». Una frase così
 * non distingue la rete assente da un 502 di Fly, un 413 del proxy da un CORS rotto, una
 * chiave sbagliata da un IndexedDB negato. Ed è l'unico posto dove quel dato esiste: gli errori
 * del browser non arrivano ai log del server, e quelli di rete per definizione nemmeno.
 *
 * Regola: la frase resta nostra e leggibile; il dettaglio va fra parentesi quadre, così chi
 * legge capisce cosa è successo e chi deve correggerlo sa dove guardare.
 */

interface AxiosLike {
  isAxiosError?: boolean
  code?: string
  message?: string
  response?: { status?: number; statusText?: string }
  config?: { method?: string; url?: string; baseURL?: string }
}

/**
 * I codici di axios quando **non c'è risposta**: sono i casi più opachi, perché senza status
 * sembrano tutti uguali, e invece vogliono indagini diverse.
 */
const NO_RESPONSE: Record<string, string> = {
  ERR_NETWORK: 'nessuna risposta: rete assente, server spento o richiesta bloccata dal CORS',
  ECONNABORTED: 'tempo scaduto in attesa del server',
  ETIMEDOUT: 'tempo scaduto in attesa del server',
  ERR_CANCELED: 'richiesta annullata',
}

/**
 * Metodo e percorso della chiamata, **mai la query né l'host**: gli URL firmati di S3 portano
 * la firma nella query, e un toast finisce negli screenshot.
 */
function requestLine(config: AxiosLike['config']): string | null {
  if (!config?.url) return null
  try {
    const path = new URL(config.url, config.baseURL || 'http://localhost').pathname
    return `${(config.method ?? 'get').toUpperCase()} ${path}`
  } catch {
    return null
  }
}

export function errorDetail(error: unknown): string {
  const e = error as AxiosLike | null
  if (e?.isAxiosError) {
    const status = e.response?.status
    const what = status
      ? `HTTP ${status}${e.response?.statusText ? ` ${e.response.statusText}` : ''}`
      : e.code && NO_RESPONSE[e.code]
        ? `${e.code} — ${NO_RESPONSE[e.code]}`
        : e.code ?? e.message ?? 'errore di rete senza codice'
    const where = requestLine(e.config)
    return where ? `${what} · ${where}` : what
  }
  if (error !== null && typeof error === 'object' && !(error instanceof Error)) {
    // Un oggetto lanciato a mano (o un rifiuto con un payload): meglio il suo contenuto che «[object Object]».
    try {
      return JSON.stringify(error).slice(0, 200)
    } catch {
      return String(error)
    }
  }
  return technicalDetail(error)
}

/**
 * La frase nostra con il dettaglio tecnico in coda. Se il dettaglio è già nella frase (un
 * errore nostro, il cui messaggio è quello che mostriamo) non si ripete.
 */
export function withDetail(text: string, error: unknown): string {
  const detail = errorDetail(error)
  const message = error instanceof Error ? error.message : ''
  if (text.includes(detail) || (message && text.includes(message))) return text
  return `${text} [${detail}]`
}

/**
 * Una risposta 2xx che non contiene quello che serviva. Prima diventava «Risposta non valida
 * dal server», che non dice né cosa mancava né cosa è arrivato al suo posto.
 *
 * Il caso da riconoscere per primo è il body di **testo**: se `VITE_API_URL` punta al
 * frontend invece che all'API, Pages risponde 200 con `index.html` (il fallback della SPA),
 * e a guardare lo status sembra tutto a posto.
 */
export function unexpectedResponse(what: string, data: unknown): string {
  if (typeof data === 'string') {
    const start = data.trim().slice(0, 40).replace(/\s+/g, ' ')
    return `Il server ha risposto con del testo invece che con JSON, e senza ${what} [«${start}…»]: l'indirizzo dell'API punta forse al frontend?`
  }
  const body = data as { success?: unknown; message?: unknown } | null | undefined
  if (typeof body?.message === 'string' && body.message.trim()) return body.message.trim()
  const shape = body == null ? 'risposta vuota' : `success: ${String(body.success)}, campi: ${Object.keys(body).join(', ') || 'nessuno'}`
  return `Il server ha risposto senza ${what} [${shape}].`
}
