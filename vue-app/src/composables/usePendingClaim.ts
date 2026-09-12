import axios from 'axios'
import { notify } from '@/src/utils/notify'
import { apiErrorMessage } from '@/src/utils/apiError'

/**
 * "Reclama questo invio" (roadmap F3) — il ponte tra un invio guest e un account.
 *
 * Dopo un invio senza account mettiamo da parte `publicToken` + `manageToken`
 * (quest'ultimo il backend lo mostra UNA volta sola). Quando l'utente entra nell'area
 * autenticata — da login, registrazione o Google — il claim viene riscattato una volta
 * sola e lo spazio ripulito.
 *
 * Contratto: POST /api/share/claim { publicToken, manageToken } → BACKEND_API_DOCS §4.10.
 * Il `publicToken` NON cambia: i link già distribuiti restano validi.
 *
 * ── Perché sessionStorage e non localStorage ──────────────────────────────────
 * Il `manageToken` è una capability: chi ce l'ha può revocare o adottare quel
 * trasferimento (NON leggerlo — la chiave di cifratura sta nel fragment `#` e non
 * viene mai salvata). Va quindi tenuto per il minimo tempo necessario:
 *  • sessionStorage muore con la scheda, e l'intero percorso "invio → registrazione →
 *    codice di conferma" avviene nella stessa scheda (anche il redirect OAuth ci torna);
 *  • localStorage lo lascerebbe lì per mesi, anche su un computer condiviso;
 *  • un cookie lo spedirebbe al server a ogni richiesta, per finire nei log senza motivo.
 * In più: TTL esplicito e cancellazione immediata appena il claim è concluso.
 */

const STORAGE_KEY = 'letransfer_pending_claim'
// Rete di sicurezza se la scheda resta aperta per giorni: oltre, l'invio guest è scaduto comunque.
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export interface PendingClaim {
  publicToken: string
  manageToken: string
  fileName?: string
  savedAt: number
}

export function savePendingClaim(claim: Omit<PendingClaim, 'savedAt'>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...claim, savedAt: Date.now() }))
  } catch {
    // storage non disponibile (navigazione privata, quota): si perde il claim, non è critico
  }
}

export function readPendingClaim(): PendingClaim | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingClaim>
    if (!parsed.publicToken || !parsed.manageToken) return null
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearPendingClaim()
      return null
    }
    return parsed as PendingClaim
  } catch {
    return null
  }
}

export function clearPendingClaim(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // idem
  }
}

/**
 * Riscatta il claim in sospeso, se c'è. Idempotente per costruzione: la voce sparisce
 * sia in caso di successo sia quando il server dà una risposta definitiva (il backend
 * rende uniformi i 403: link assente, non-guest o manageToken errato), così non si
 * ritenta a ogni ingresso. Solo gli errori transitori lasciano il claim in coda.
 */
export async function redeemPendingClaim(): Promise<boolean> {
  const claim = readPendingClaim()
  if (!claim) return false

  try {
    await axios.post(`${API_BASE_URL}/share/claim`, {
      publicToken: claim.publicToken,
      manageToken: claim.manageToken,
    })
    clearPendingClaim()
    notify.success(
      claim.fileName
        ? `"${claim.fileName}" è ora nel tuo account: il link che hai già condiviso resta valido.`
        : 'Invio salvato nel tuo account: il link che hai già condiviso resta valido.',
      'Invio reclamato',
    )
    return true
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status === 400 || status === 403 || status === 404) {
      // Risposta definitiva: già adottato, scaduto o token non valido. Non ritentare.
      clearPendingClaim()
      notify.info(
        apiErrorMessage(error) ?? 'L’ultimo invio senza account non è più reclamabile: il link è scaduto o già adottato.',
        'Invio non reclamabile',
      )
    } else {
      // Transitorio (rete, 5xx): il claim resta in coda e si ritenta al prossimo ingresso.
      notify.warning(
        apiErrorMessage(error) ??
          'Non siamo riusciti a collegare l’ultimo invio al tuo account. Riproveremo al prossimo accesso.',
        'Invio non ancora reclamato',
      )
    }
    return false
  }
}
