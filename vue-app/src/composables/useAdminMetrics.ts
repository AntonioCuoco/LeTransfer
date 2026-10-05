import { ref } from 'vue'
import axios from 'axios'
import { notifyApiError } from '@/src/utils/apiError'
import type { GuestChannelOverview } from '@/src/composables/useAdminCosts'

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
  // ── O1.5 «Bolletta sotto controllo» ──
  /** Spazio dei file free ancora in vita: si libera da solo alla scadenza. */
  freeBytes: number | null
  /** Quanto spazio free si libera, giorno per giorno. */
  freeExpiring: { day: string; bytes: number }[]
  /** Spazio degli invii da ospite ancora in vita. */
  guestBytes: number | null
  /** Quanti utenti per fascia di spazio occupato. */
  storageBands: { label: string; users: number }[]
  /** Utenti oltre l'80% della quota del LORO piano. */
  nearQuota: number | null
  cognitoTier: string | null
  monthlyPayers: number | null
  yearlyPayers: number | null
  estimatedCostUsd: number
  costs: CostEstimate
  guest: GuestChannelOverview | null
  /** Ripieghi su scan dall'avvio del server: se non è vuoto, manca un indice. */
  indexFallbacks: IndexFallback[]
}

export interface CostLine {
  key: string
  label: string
  usd: number
  note: string
}

export interface CostEstimate {
  lines: CostLine[]
  totalUsd: number
  alert: { thresholdUsd: number; ratio: number; level: 'ok' | 'warn' | 'over' }
  revenue: { revenueEur: number; stripeFeesEur: number; marginEur: number }
  /** Frazione del mese trascorsa (0–1): i numeri «del mese» sono proiettati a fine mese. */
  monthProgress: number
  pricesCheckedOn: string
}

export interface IndexFallback {
  index: string
  table: string
  count: number
  firstAt: string
  lastAt: string
  lastError: string | null
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
  'freeBytes',
  'guestBytes',
  'estimatedCostUsd',
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
