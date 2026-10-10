import { ref, shallowRef } from 'vue'
import axios from 'axios'
import { notifyApiError } from '@/src/utils/apiError'

/**
 * Da Pro a Free: quali file tenere (backend `services/planDowngrade.js`, deciso il 2026-10-07).
 *
 * A fine abbonamento ci sono 14 giorni di grazia: l'utente sceglie i file caricati da Pro da
 * tenere, fino allo spazio del Free. Gli altri vengono cancellati alla scadenza. Se non sceglie,
 * il server tiene i più recenti che ci stanno: `keep` arriva già con quella proposta.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export interface DowngradeFile {
  s3Key: string
  /** Cifrato se `nameVersion` è 2: si decifra con la chiave del file. */
  fileName: string | null
  nameVersion: number | null
  fileType: string | null
  uploadedAt: string | null
  /** Spazio occupato su R2 (base binaria, come il backend). */
  bytes: number
}

export interface DowngradeState {
  status: 'pending'
  fromPlan: string
  endedAt: string
  graceEndsAt: string
  keepChosenAt: string | null
  keepLimitBytes: number
  /** La scelta salvata, oppure quella automatica (i più recenti che stanno nello spazio). */
  keep: string[]
  /** `true` = l'utente ha già scelto; `false` = `keep` è la proposta automatica. */
  chosen: boolean
  files: DowngradeFile[]
}

// Stato a livello di modulo: l'avviso e la modale stanno in punti diversi dell'albero.
const state = shallowRef<DowngradeState | null>(null)
const isLoading = ref(false)
const isSaving = ref(false)
const dialogOpen = ref(false)

export function usePlanDowngrade() {
  async function load(): Promise<void> {
    isLoading.value = true
    try {
      const { data } = await axios.get<{ data?: { downgrade: DowngradeState | null } }>(`${API_BASE_URL}/user/downgrade`)
      state.value = data?.data?.downgrade ?? null
    } catch {
      // Silenzioso: senza questo dato l'app funziona uguale, e un errore qui a ogni avvio
      // sarebbe rumore. Se c'è davvero una grazia in corso, l'email l'ha già detto.
      state.value = null
    } finally {
      isLoading.value = false
    }
  }

  /** Salva i file da tenere. `false` se il server ha rifiutato (l'errore è già mostrato). */
  async function saveKeep(s3Keys: string[]): Promise<boolean> {
    isSaving.value = true
    try {
      await axios.put(`${API_BASE_URL}/user/downgrade/keep`, { s3Keys })
      await load()
      return true
    } catch (error) {
      notifyApiError(error, 'Scelta non salvata', 'Non siamo riusciti a salvare i file da tenere. Riprova.')
      return false
    } finally {
      isSaving.value = false
    }
  }

  return { state, isLoading, isSaving, dialogOpen, load, saveKeep }
}

/** Byte in base binaria, come li conta il backend: 10 GiB si legge «10 GB», non «10,7 GB». */
export function formatBinaryBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = Math.round((bytes / 1024 ** i) * 10) / 10
  return `${value.toLocaleString('it-IT')} ${units[i]}`
}
