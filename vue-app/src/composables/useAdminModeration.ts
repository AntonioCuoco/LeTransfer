import { ref } from 'vue'
import axios from 'axios'
import { notify } from '@/src/utils/notify'

/**
 * Moderazione (roadmap O1.4 fase 1) — è la parte che blocca l'apertura al pubblico.
 *
 * `routes/guest.js` mette in quarantena i link segnalati e conserva l'oggetto «for human
 * review», e `appeal` marca `appealStatus: 'pending'» — ma finché questo composable non
 * esisteva, nessuna interfaccia leggeva quelle code. Il DSA richiede un notice-and-action
 * *funzionante*: questo è quello.
 *
 * ⚠️ **`ModerationReport` non ha un campo `fileName`**, di proposito: il backend lo
 * omette. `nameEncrypted` dice se aspettarsi un ciphertext, non lo mostra mai in chiaro —
 * un moderatore decide sui metadati (segnalazioni, dimensione, tipo MIME), mai sul nome.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const admin = (path: string) => `${API_BASE_URL}/admin/moderation${path}`

export type LinkState = 'active' | 'revoked' | 'expired' | 'quarantined'

export interface AbuseReportEntry {
  at: string
  reason: string | null
}

export interface ModerationReport {
  publicToken: string
  state: LinkState
  abuseReports: number
  reports: AbuseReportEntry[]
  downloadCount: number
  fileSize: number | string | null
  fileType: string | null
  /** true = il nome è ciphertext (O2.2): non aspettarsi un nome leggibile, non è un errore. */
  nameEncrypted: boolean
  createdAt: string | null
  expiresAt: string | null
  quarantinedAt: string | null
  appealStatus: 'pending' | 'accepted' | 'rejected' | 'none' | null
  appealRequestedAt: string | null
}

export function useAdminModeration() {
  const reports = ref<ModerationReport[]>([])
  const appeals = ref<ModerationReport[]>([])
  const isLoading = ref(false)
  const isActing = ref(false)

  async function loadReports(state: 'all' | 'quarantined' | 'open' = 'all'): Promise<void> {
    isLoading.value = true
    try {
      const { data } = await axios.get<{ data?: { items?: ModerationReport[] } }>(
        admin('/reports'),
        { params: { state } },
      )
      reports.value = data?.data?.items ?? []
    } finally {
      isLoading.value = false
    }
  }

  async function loadAppeals(): Promise<void> {
    isLoading.value = true
    try {
      const { data } = await axios.get<{ data?: { items?: ModerationReport[] } }>(
        admin('/appeals'),
      )
      appeals.value = data?.data?.items ?? []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Revoca **definitiva**: cancella anche l'oggetto. Irreversibile — il chiamante deve
   * aver già fatto confermare all'admin, questo composable non lo fa da solo.
   */
  async function revoke(publicToken: string, reason: string): Promise<boolean> {
    isActing.value = true
    try {
      await axios.post(`${admin(`/${publicToken}/revoke`)}`, { reason })
      reports.value = reports.value.filter((r) => r.publicToken !== publicToken)
      appeals.value = appeals.value.filter((r) => r.publicToken !== publicToken)
      notify.success('Link revocato e oggetto cancellato.')
      return true
    } catch (error) {
      notify.error(errorMessageOf(error, 'Revoca non riuscita.'))
      return false
    } finally {
      isActing.value = false
    }
  }

  /**
   * Appello accolto: il link torna vivo. Il server può rispondere con un avviso — per
   * esempio se il link nel frattempo è scaduto — che va mostrato, non solo un successo muto.
   */
  async function restore(publicToken: string, reason: string): Promise<boolean> {
    isActing.value = true
    try {
      const { data } = await axios.post<{ data?: { note?: string | null } }>(
        admin(`/${publicToken}/restore`),
        { reason },
      )
      reports.value = reports.value.filter((r) => r.publicToken !== publicToken)
      appeals.value = appeals.value.filter((r) => r.publicToken !== publicToken)
      const note = data?.data?.note
      notify.success(note ? `Quarantena rimossa. ${note}.` : 'Quarantena rimossa: il link è di nuovo attivo.')
      return true
    } catch (error) {
      // ALREADY_PURGED: l'oggetto era già stato cancellato da una revoca precedente.
      const code = (error as { response?: { data?: { errorCode?: string; error?: string } } }).response?.data
      if (code?.errorCode === 'ALREADY_PURGED') {
        notify.error(code.error ?? 'Il file è già stato cancellato definitivamente: non è ripristinabile.')
      } else {
        notify.error(errorMessageOf(error, 'Ripristino non riuscito.'))
      }
      return false
    } finally {
      isActing.value = false
    }
  }

  return { reports, appeals, isLoading, isActing, loadReports, loadAppeals, revoke, restore }
}

function errorMessageOf(error: unknown, fallback: string): string {
  const msg = (error as { response?: { data?: { error?: string } } }).response?.data?.error
  return msg ?? fallback
}
