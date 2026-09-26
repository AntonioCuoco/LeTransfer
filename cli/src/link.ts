/**
 * Il link di un invio: `https://novren.net/share/<publicToken>#key=<…>&iv=<…>`.
 *
 * La chiave sta nel **frammento** (`#…`), che per definizione non viene mai spedito al server:
 * è il fondamento dello schema (vedi `vue-app/src/crypto/README.md` §4.1). Qui la si legge
 * dal testo del link e resta nella memoria di questo processo.
 *
 * ── Perché basta la chiave, e l'`iv` è facoltativo ─────────────────────────────
 * Nel formato v2 (a chunk) ogni chunk porta il proprio IV: quello del frammento non serve.
 * Serve solo al formato v1 legacy. Tollerarne l'assenza non è pignoleria: il link contiene
 * una `&`, e in bash una `&` non tra virgolette manda il comando in background **tagliando
 * il link lì**. La chiave, che viene prima, arriva intera; l'`iv` no. Così un link incollato
 * senza virgolette funziona comunque per tutti i file recenti.
 */

export interface ParsedLink {
  publicToken: string
  /** Chiave AES in base64url, com'è nel frammento. */
  key: string | null
  /** Solo per il formato v1 legacy. */
  iv: string | null
}

export class InvalidLink extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidLink'
  }
}

/** Il token pubblico: generato con nanoid, alfabeto URL-safe. Qualunque altra cosa non è un link di Novren. */
const PUBLIC_TOKEN = /^[A-Za-z0-9_-]{8,64}$/

export function parseLink(raw: string): ParsedLink {
  const text = raw.trim()
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new InvalidLink('Non sembra un link: incollalo intero, a partire da https://')
  }

  const match = url.pathname.match(/\/share\/([^/]+)\/?$/)
  const publicToken = match?.[1]
  if (!publicToken || !PUBLIC_TOKEN.test(publicToken)) {
    throw new InvalidLink('Non è un link di un invio Novren (atteso …/share/<codice>).')
  }

  // `URLSearchParams` sul frammento, come fa il sito (`parseKeyFromHash`). Decodifica anche
  // gli eventuali `%2B` che un client di posta potrebbe aver introdotto.
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  return { publicToken, key: params.get('key'), iv: params.get('iv') }
}
