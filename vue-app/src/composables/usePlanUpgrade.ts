import { ref, shallowRef } from 'vue'
import axios from 'axios'
import { useEncryptionStore } from '@/src/stores/encryption'

/**
 * Da Free a Pro: rendere permanenti i file caricati da Free (backend `services/planUpgrade.js`).
 *
 * Per ogni file, nell'ordine:
 *   1. si apre la sua chiave (posizione free) e la si salva avvolta per la posizione permanente
 *      — la chiave è legata alla sua posizione, e solo il dispositivo la conosce;
 *   2. `POST /user/upgrade/promote`: il server copia l'oggetto dentro lo storage, aggiorna link e
 *      condivisioni e cancella l'originale solo alla fine.
 * Un'interruzione non perde niente: ciò che non è spostato resta dov'era, e si riprova.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export interface FreeFile {
  s3Key: string
  permanentKey: string
  fileName: string | null
  nameVersion: number | null
  fileType: string | null
  uploadedAt: string | null
  expiresAt: string | null
  bytes: number
}

export interface PromoteResult {
  moved: number
  failed: number
}

const plan = ref<string>('free')
const files = shallowRef<FreeFile[]>([])

export function usePlanUpgrade() {
  const encryptionStore = useEncryptionStore()
  const isMoving = ref(false)
  const progress = ref({ done: 0, total: 0 })

  async function load(): Promise<void> {
    try {
      const { data } = await axios.get<{ data?: { plan: string; files: FreeFile[] } }>(`${API_BASE_URL}/user/upgrade`)
      plan.value = data?.data?.plan ?? 'free'
      files.value = data?.data?.files ?? []
    } catch {
      // Silenzioso: senza questo dato l'app funziona uguale, i file free scadono come previsto.
      files.value = []
    }
  }

  /** Sposta i file indicati, uno alla volta. Richiede le chiavi sbloccate. */
  async function promote(selected: FreeFile[]): Promise<PromoteResult> {
    const result: PromoteResult = { moved: 0, failed: 0 }
    isMoving.value = true
    progress.value = { done: 0, total: selected.length }
    try {
      for (const file of selected) {
        try {
          const keyData = await encryptionStore.getKey(file.s3Key)
          if (!keyData) throw new Error('chiave non disponibile')
          if (!(await encryptionStore.storeKey(file.permanentKey, keyData))) throw new Error('chiave non salvata')
          await axios.post(`${API_BASE_URL}/user/upgrade/promote`, { s3Key: file.s3Key })
          result.moved++
        } catch {
          result.failed++
        }
        progress.value = { done: progress.value.done + 1, total: selected.length }
      }
    } finally {
      isMoving.value = false
      await load()
    }
    return result
  }

  return { plan, files, isMoving, progress, load, promote }
}
