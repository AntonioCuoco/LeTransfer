import { ref } from 'vue'
import axios from 'axios'
import { notifyApiError } from '@/src/utils/apiError'

/**
 * Costi e limiti (roadmap O1.5 «Bolletta sotto controllo»).
 *
 * La stima del mese arriva dentro la panoramica delle metriche (`/admin/metrics/overview`,
 * campo `costs`): è la stessa fotografia, così il numero di oggi e quello del grafico storico
 * non possono divergere. Qui ci sono le due cose in più: l'elenco dei limiti in vigore (sola
 * lettura) e il canale ospiti, con il suo interruttore.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export type LimitUnit = 'bytes' | 'hours' | 'days' | 'count'

export interface LimitEntry {
  key: string
  label: string
  value: number
  unit: LimitUnit
  /** La variabile d'ambiente che lo cambia; `null` = è nel codice. */
  env: string | null
  note: string | null
}

export interface LimitGroup {
  key: string
  label: string
  items: LimitEntry[]
}

export interface GuestChannelState {
  closed: boolean
  reason: string | null
  at: string | null
  /** `sub` dell'admin che l'ha cambiato. */
  by: string | null
}

export interface GuestChannelOverview {
  day: string
  usedBytesToday: number | null
  maxBytesPerDay: number
  maxBytesPerIpPerDay: number
  /** false = contatori in memoria (manca GUEST_QUOTA_TABLE): non è un tetto vero. */
  persistent: boolean
  channel: GuestChannelState | null
}

export function useAdminCosts() {
  const limits = ref<LimitGroup[]>([])
  const guest = ref<GuestChannelOverview | null>(null)
  const isSwitching = ref(false)

  async function loadLimits(): Promise<void> {
    try {
      const { data } = await axios.get<{ data?: { groups: LimitGroup[] } }>(`${API_BASE_URL}/admin/limits`)
      limits.value = data?.data?.groups ?? []
    } catch (error) {
      notifyApiError(error, 'Limiti non caricati', 'Non siamo riusciti a caricare i limiti in vigore.')
    }
  }

  async function loadGuestChannel(): Promise<void> {
    try {
      const { data } = await axios.get<{ data?: GuestChannelOverview }>(`${API_BASE_URL}/admin/guest-channel`)
      guest.value = data?.data ?? null
    } catch (error) {
      notifyApiError(error, 'Canale ospiti non caricato', 'Non siamo riusciti a leggere lo stato degli invii senza account.')
    }
  }

  /** Chiude (con un motivo, che resta nel registro) o riapre gli invii senza account. */
  async function setGuestChannel(closed: boolean, reason = ''): Promise<boolean> {
    isSwitching.value = true
    try {
      await axios.post(`${API_BASE_URL}/admin/guest-channel`, { closed, reason })
      await loadGuestChannel()
      return true
    } catch (error) {
      notifyApiError(error, closed ? 'Canale non chiuso' : 'Canale non riaperto', 'Non siamo riusciti a cambiare lo stato del canale ospiti.')
      return false
    } finally {
      isSwitching.value = false
    }
  }

  return { limits, guest, isSwitching, loadLimits, loadGuestChannel, setGuestChannel }
}

/** Un limite scritto per una persona: «10 GB», «7 giorni», «168 ore», «20». */
export function formatLimit(entry: Pick<LimitEntry, 'value' | 'unit'>, formatBytes: (n: number) => string): string {
  switch (entry.unit) {
    case 'bytes':
      return formatBytes(entry.value)
    case 'days':
      return `${entry.value} ${entry.value === 1 ? 'giorno' : 'giorni'}`
    case 'hours':
      return entry.value % 24 === 0 ? `${entry.value / 24} ${entry.value === 24 ? 'giorno' : 'giorni'}` : `${entry.value} ore`
    default:
      return entry.value.toLocaleString('it-IT')
  }
}
