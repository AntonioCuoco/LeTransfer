/**
 * Memoria delle impronte già verificate (roadmap F2).
 *
 * Modello "trust on first use", come Signal: la prima volta che condividi con
 * qualcuno annoti l'impronta della sua chiave; dalle volte successive l'app
 * confronta. Il valore vero non è il "verificato ✓" — è **accorgersi se cambia**:
 * un'impronta diversa da quella annotata significa o che la persona ha rigenerato
 * le chiavi, o che qualcuno (server compreso) te ne sta servendo una fasulla.
 * Senza questo controllo, il nostro server potrebbe silenziosamente sostituire la
 * chiave pubblica del destinatario e leggere tutto: è l'unico punto in cui
 * l'utente può accorgersene.
 *
 * ── Perché localStorage qui, mentre il claim usa sessionStorage ──────────────
 * Qui NON c'è nessun segreto: sono digest di chiavi pubbliche. E la loro utilità
 * sta esattamente nel sopravvivere alle sessioni — un confronto che si dimentica
 * a ogni chiusura di scheda non rileverebbe mai un cambio di chiave.
 *
 * ── Perché le email non sono in chiaro ───────────────────────────────────────
 * Le voci sono indicizzate per SHA-256 dell'email normalizzata, non per email.
 * Chi leggesse questo spazio non ottiene l'elenco delle persone con cui condividi.
 * ⚠️ Onestà su cosa NON risolve: lo spazio delle email è indovinabile, quindi chi
 * *sospetta* già un indirizzo può confermarlo calcolandone l'hash. Serve a impedire
 * l'enumerazione a freddo, non a nascondere un contatto da chi lo cerca.
 */

const STORAGE_KEY = 'letransfer_verified_keys'

export type VerificationState = 'new' | 'known' | 'changed'

export interface VerifiedEntry {
  thumbprint: string
  verifiedAt: string
}

type VerifiedMap = Record<string, VerifiedEntry>

/** Indice della voce: SHA-256 dell'email normalizzata (mai l'email stessa). */
async function emailIndex(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function readAll(): VerifiedMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as VerifiedMap) : {}
  } catch {
    return {}
  }
}

function writeAll(map: VerifiedMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // storage non disponibile: si ricade su "prima verifica" ogni volta, mai su un falso ✓
  }
}

export function useVerifiedKeys() {
  async function getVerified(email: string): Promise<VerifiedEntry | null> {
    return readAll()[await emailIndex(email)] ?? null
  }

  /** Confronta l'impronta appena scaricata con quella annotata in passato. */
  async function checkRecipient(email: string, thumbprint: string): Promise<VerificationState> {
    const known = await getVerified(email)
    if (!known) return 'new'
    return known.thumbprint === thumbprint ? 'known' : 'changed'
  }

  async function markVerified(email: string, thumbprint: string): Promise<void> {
    const map = readAll()
    map[await emailIndex(email)] = { thumbprint, verifiedAt: new Date().toISOString() }
    writeAll(map)
  }

  async function forget(email: string): Promise<void> {
    const map = readAll()
    delete map[await emailIndex(email)]
    writeAll(map)
  }

  return { getVerified, checkRecipient, markVerified, forget }
}
