import { ref } from 'vue'
import axios from 'axios'
import { apiErrorMessage } from '@/src/utils/apiError'

/**
 * Le due leve anti-abuso del canale senza account: **segnalare** e **revocare**.
 *
 * Perché esiste questo file. Il backend ha da tempo `POST /api/guest/report/:publicToken`
 * (incrementa `abuseReports`, e alla soglia `ABUSE_AUTO_QUARANTINE_THRESHOLD` mette il
 * link in quarantena) e `POST /api/guest/:publicToken/revoke` (il mittente disattiva il
 * proprio invio col `manageToken`). Nessuno dei due aveva un bottone: la macchina di
 * takedown era montata e la leva scollegata, quindi **la soglia non poteva essere
 * raggiunta da nessuno**. Contro l'abuso deliberato questo vale infinitamente più di
 * qualunque controllo lato client, che chi abusa semplicemente non esegue.
 *
 * Contratto: BACKEND_API_DOCS.md §4.9.
 *
 * Due dettagli del protocollo che si riflettono qui:
 *  - `report` risponde **sempre** `202`, anche per un link inesistente: non rivela
 *    l'esistenza di un token. Quindi la UI non può (e non deve) dire "segnalazione
 *    registrata su un link valido" — dice solo "ricevuta".
 *  - `revoke` risponde `403` **uniforme** per link assente, non-guest o token errato.
 *    Anche qui: nessun messaggio che distingua i casi, o distinguerli diventa un oracolo.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

/** Motivi proposti. Il backend accetta testo libero: qui restringiamo per non chiedere un tema. */
export const REPORT_REASONS = [
  { value: 'malware', label: 'Malware o file pericoloso' },
  { value: 'phishing', label: 'Truffa o phishing' },
  { value: 'illegal', label: 'Contenuto illegale' },
  { value: 'copyright', label: 'Violazione di copyright' },
  { value: 'other', label: 'Altro' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['value']

export function useGuestModeration() {
  const isReporting = ref(false)
  const isRevoking = ref(false)
  /** Il testo del server sull'ultima revoca fallita, se ne ha mandato uno. */
  const revokeError = ref<string | null>(null)

  // Istanza dedicata: il canale guest è no-auth e non deve ereditare interceptor.
  const api = axios.create({ baseURL: API_BASE_URL })

  /**
   * Segnala un link. Ritorna `true` se la richiesta è stata accettata — che non
   * significa "il link è stato rimosso": la quarantena scatta a soglia, e dirlo
   * chiaramente evita di promettere a chi segnala un potere che non ha.
   */
  async function reportLink(publicToken: string, reason: ReportReason): Promise<boolean> {
    if (isReporting.value) return false
    isReporting.value = true
    try {
      await api.post(`/guest/report/${publicToken}`, { reason })
      return true
    } catch {
      return false
    } finally {
      isReporting.value = false
    }
  }

  /** Revoca il proprio invio. `manageToken` è la capability ricevuta a `init`. */
  async function revokeTransfer(publicToken: string, manageToken: string): Promise<boolean> {
    if (isRevoking.value) return false
    isRevoking.value = true
    revokeError.value = null
    try {
      await api.post(`/guest/${publicToken}/revoke`, { manageToken })
      return true
    } catch (error) {
      revokeError.value = apiErrorMessage(error)
      return false
    } finally {
      isRevoking.value = false
    }
  }

  return { isReporting, isRevoking, revokeError, reportLink, revokeTransfer }
}
