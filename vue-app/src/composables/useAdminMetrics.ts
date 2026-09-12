import { ref } from 'vue'
import axios from 'axios'
import { notifyApiError } from '@/src/utils/apiError'

/**
 * Metriche (roadmap O1.4 fase 3).
 *
 * ⚠️ **Nessuna metrica per utente qui.** Il backend espone solo aggregati di proposito: una
 * dashboard sul comportamento di una persona identificabile è sorveglianza, non
 * amministrazione. I dati del singolo stanno nella scheda utente, dove servono e dove
 * l'accesso è tracciato nel registro.
 *
 * `storedBytes` nel tempo è la metrica che conta più delle altre: è l'indicatore anticipato
 * della bolletta, cioè la preoccupazione da cui è nato tutto il lavoro sui limiti di piano.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const admin = (path: string) => `${API_BASE_URL}/admin/metrics${path}`

export interface MetricsOverview {
  day: string
  at: string
  users: number | null
  activeUsers30d: number | null
  trackedUsers: number
  storedBytes: number | null
  monthlyBytes: number | null
  plans: Record<string, number>
  paidPlans: number | null
  grantedPlans: number | null
  expiredGrants: number | null
  guestLinks: number | null
  accountLinks: number | null
  claims: number | null
  openReports: number | null
  quarantinedLinks: number | null
  /** Percentuale: guest → account. `null` se non calcolabile (nessun dato). */
  claimRate: number | null
}

export const TIMESERIES_METRICS = [
  'storedBytes',
  'users',
  'newUsers',
  'activeUsers30d',
  'monthlyBytes',
  'guestLinks',
  'accountLinks',
  'claims',
  'openReports',
  'paidPlans',
  'grantedPlans',
] as const
export type TimeseriesMetric = (typeof TIMESERIES_METRICS)[number]

export interface TimeseriesPoint {
  day: string
  value: number | null
}

export interface TimeseriesResult {
  metric: string
  points: TimeseriesPoint[]
  from: string
  to: string
  /** false = nessuna fotografia nell'intervallo: il job giornaliero non ha ancora girato. */
  available: boolean
  note: string | null
}

export function useAdminMetrics() {
  const overview = ref<MetricsOverview | null>(null)
  const isLoadingOverview = ref(false)

  /**
   * Scansiona quattro tabelle sul server: va chiamata quando si apre la dashboard, **mai
   * in polling**. Se servisse un refresh continuo, la risposta giusta è leggere l'ultima
   * fotografia giornaliera con `timeseries`, non richiamare questa più spesso.
   */
  async function loadOverview(): Promise<void> {
    isLoadingOverview.value = true
    try {
      const { data } = await axios.get<{ data?: MetricsOverview }>(admin('/overview'))
      overview.value = data?.data ?? null
    } catch (error) {
      notifyApiError(error, 'Metriche non caricate', 'Non siamo riusciti a caricare la panoramica.')
    } finally {
      isLoadingOverview.value = false
    }
  }

  async function loadTimeseries(
    metric: TimeseriesMetric,
    from?: string,
    to?: string,
  ): Promise<TimeseriesResult | null> {
    try {
      const { data } = await axios.get<{ data?: TimeseriesResult }>(admin('/timeseries'), {
        params: { metric, from, to },
      })
      return data?.data ?? null
    } catch (error) {
      notifyApiError(error, 'Andamento non caricato', 'Non siamo riusciti a caricare l’andamento nel tempo.')
      return null
    }
  }

  return { overview, isLoadingOverview, loadOverview, loadTimeseries }
}
