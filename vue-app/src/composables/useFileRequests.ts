import { ref } from 'vue'
import axios from 'axios'
import { notify } from '@/src/utils/notify'
import { apiErrorMessage, notifyApiError } from '@/src/utils/apiError'

/**
 * Richieste file — lato di chi le apre (roadmap O2.1).
 *
 * **Cos'è.** Il flusso inverso del prodotto: invece di mandare un file, apri un link su cui
 * altri caricano — e **solo tu** puoi aprire ciò che arriva. È il bisogno quotidiano del
 * segmento che paga: il commercialista che raccoglie le fatture, l'avvocato che chiede al
 * cliente le carte della causa.
 *
 * **Perché è E2E davvero.** Chi carica cifra nel proprio browser con la **tua chiave
 * pubblica RSA**: il server trasporta un blob che non sa aprire, esattamente come nella
 * condivisione utente-a-utente. Dropbox File Request e simili non fanno questo — chi ospita
 * vede tutto.
 *
 * **Dove finiscono i file.** In `SharesTable`, come share verso di te. Quindi compaiono
 * nell'elenco «ricevuti» che esiste già e si aprono col percorso di decifratura che esiste
 * già: qui non c'è niente di nuovo da costruire, ed è il motivo per cui questa funzione
 * costa molto meno di quanto sembri.
 *
 * ── Contratto atteso dal backend ────────────────────────────────────────────────
 *   POST   /api/requests            { title, note?, expiresInHours?, maxUploads? }
 *     201 → { requestId, publicToken, url, expiresAt }
 *   GET    /api/requests            → { success, data: FileRequest[] }
 *   POST   /api/requests/:id/close  → chiude l'ingresso, subito
 *   DELETE /api/requests/:id        → elimina la richiesta (i file arrivati restano: sono tuoi)
 * Tutte autenticate. `expiresInHours` viene clampato al cap di retention del piano.
 * ────────────────────────────────────────────────────────────────────────────────
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export interface FileRequest {
  requestId: string
  publicToken: string
  title: string
  note?: string
  expiresAt: string
  maxUploads?: number | null
  uploadCount: number
  closedAt?: string | null
  createdAt: string
}

export interface CreateRequestInput {
  title: string
  note?: string
  expiresInHours?: number
  maxUploads?: number | null
}

/** Il link pubblico da consegnare. Non contiene nessuna chiave: qui non serve il frammento. */
export function requestUrl(publicToken: string): string {
  const base = import.meta.env.VITE_FRONTEND_URL || window.location.origin
  return `${base.replace(/\/$/, '')}/richiesta/${publicToken}`
}

/** Una richiesta è "viva" se accetta ancora caricamenti. */
export function isOpen(request: FileRequest): boolean {
  if (request.closedAt) return false
  if (new Date(request.expiresAt).getTime() <= Date.now()) return false
  if (request.maxUploads != null && request.uploadCount >= request.maxUploads) return false
  return true
}

export function useFileRequests() {
  const requests = ref<FileRequest[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  /** `false` quando il backend non ha ancora questi endpoint: la UI lo dichiara. */
  const isAvailable = ref(true)

  async function load(): Promise<void> {
    isLoading.value = true
    try {
      const { data } = await axios.get<{ data?: FileRequest[] }>(`${API_BASE_URL}/requests`)
      requests.value = Array.isArray(data?.data) ? data.data : []
      isAvailable.value = true
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      // 404/501 = la funzione non è ancora accesa lato server. Non è un errore dell'utente
      // e non va mostrato come tale, come per i piani e le notifiche.
      if (status === 404 || status === 501) isAvailable.value = false
      else notifyApiError(error, 'Richieste non caricate', 'Non siamo riusciti a caricare le richieste.')
      requests.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function create(input: CreateRequestInput): Promise<FileRequest | null> {
    isSaving.value = true
    try {
      const { data } = await axios.post<{ data?: FileRequest }>(`${API_BASE_URL}/requests`, input)
      const created = data?.data ?? null
      if (created) requests.value = [created, ...requests.value]
      return created
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status === 404 || status === 501) {
        isAvailable.value = false
        notify.info(
          apiErrorMessage(error) ?? 'Le richieste file non sono ancora attive su questo ambiente.',
          'Richieste non attive',
        )
      } else {
        notifyApiError(error, 'Richiesta non creata', 'Non siamo riusciti a creare la richiesta.')
      }
      return null
    } finally {
      isSaving.value = false
    }
  }

  async function close(requestId: string): Promise<boolean> {
    try {
      await axios.post(`${API_BASE_URL}/requests/${requestId}/close`)
      requests.value = requests.value.map((r) =>
        r.requestId === requestId ? { ...r, closedAt: new Date().toISOString() } : r,
      )
      return true
    } catch (error) {
      notifyApiError(error, 'Richiesta non chiusa', 'Non siamo riusciti a chiudere la richiesta.')
      return false
    }
  }

  async function remove(requestId: string): Promise<boolean> {
    try {
      await axios.delete(`${API_BASE_URL}/requests/${requestId}`)
      requests.value = requests.value.filter((r) => r.requestId !== requestId)
      return true
    } catch (error) {
      notifyApiError(error, 'Richiesta non eliminata', 'Non siamo riusciti a eliminare la richiesta.')
      return false
    }
  }

  return { requests, isLoading, isSaving, isAvailable, load, create, close, remove }
}
