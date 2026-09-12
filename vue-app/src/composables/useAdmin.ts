import { ref } from 'vue'
import axios from 'axios'
import { notifyApiError } from '@/src/utils/apiError'

/**
 * Pannello di amministrazione — lo strato dati (roadmap O1.4).
 *
 * ⚠️ **Il vincolo che viene prima di ogni riga qui sotto.** Un admin vede solo metadati: le
 * chiavi non arrivano mai al server, quindi nessuna rotta admin può restituire contenuto di
 * file — nemmeno cifrato — né un modo di "entrare" nell'account di qualcuno. Questo file non
 * chiama e non deve mai chiamare un endpoint che lo faccia.
 *
 * ── Autorizzazione: il 403 non spiega cosa manca ─────────────────────────────────
 * `requireAdmin` risponde lo stesso `403` per "non sei admin", "non hai la 2FA" e "non si
 * riesce a verificare". È deliberato — un pannello admin non deve confermare a un estraneo
 * di esistere. Quindi qui non si prova a distinguere i casi: si mostra "accesso negato" e
 * basta. Chi ha davvero i requisiti ma non li ha ancora (es. ha appena attivato la 2FA) li
 * riottiene entro 5 minuti, quando scade la cache del server.
 *
 * ── Perché un solo composable e non uno per sezione ──────────────────────────────
 * Le quattro sezioni (moderazione, utenti, metriche, registro) condividono `isAdmin` e il
 * client Axios: separarle avrebbe moltiplicato la verifica di accesso senza guadagnare
 * niente, dato che nessuno stato è condiviso fra sezioni oltre a quello.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const admin = (path: string) => `${API_BASE_URL}/admin${path}`

// ── Identità ──────────────────────────────────────────────────────────────────────

export interface AdminIdentity {
  userId: string
  email: string | null
}

const isAdmin = ref<boolean | null>(null) // null = non ancora verificato
const adminIdentity = ref<AdminIdentity | null>(null)
let whoamiChecked = false

/** Verifica una volta sola per sessione se l'utente corrente può entrare nel pannello. */
export async function checkAdminAccess(): Promise<boolean> {
  if (whoamiChecked) return isAdmin.value === true
  whoamiChecked = true
  try {
    const { data } = await axios.get<{ data?: AdminIdentity }>(admin('/whoami'))
    adminIdentity.value = data?.data ?? null
    isAdmin.value = !!data?.data
  } catch {
    // 403 (non admin / niente 2FA) o rete giù: da qui indistinguibili, e va bene così —
    // il pannello non esiste per chi non passa questo controllo.
    isAdmin.value = false
  }
  return isAdmin.value === true
}

export function useAdminIdentity() {
  return { isAdmin, adminIdentity, checkAdminAccess }
}

// ── Registro (append-only, sola lettura) ─────────────────────────────────────────

export interface AuditEntry {
  id: string
  at: string
  adminId: string
  adminEmail: string | null
  action: string
  targetType: 'user' | 'link' | 'request'
  targetId: string
  detail: Record<string, unknown>
  ip?: string
}

export function useAdminAudit() {
  const entries = ref<AuditEntry[]>([])
  const isLoading = ref(false)

  async function load(targetId?: string, limit = 100): Promise<void> {
    isLoading.value = true
    try {
      const { data } = await axios.get<{ data?: { items?: AuditEntry[] } }>(admin('/audit'), {
        params: { limit, ...(targetId ? { targetId } : {}) },
      })
      entries.value = data?.data?.items ?? []
    } catch (error) {
      notifyApiError(error, 'Registro non caricato', 'Non siamo riusciti a caricare il registro.')
    } finally {
      isLoading.value = false
    }
  }

  return { entries, isLoading, load }
}

// ── Stati imposti (sospesi / in cancellazione) ───────────────────────────────────

export interface AccountStateEntry {
  userId: string
  suspended: boolean
  suspendedAt: string | null
  suspendReason: string | null
  deletionAt: string | null
  deletionReason: string | null
  updatedBy: string | null
  updatedAt: string | null
}

export function useAdminAccountStates() {
  const items = ref<AccountStateEntry[]>([])
  /**
   * Quanti stati la cache in RAM del server sta applicando *davvero*. Se diverge dalla
   * lunghezza di `items`, il refresh in background non sta girando: qualcuno potrebbe
   * restare bloccato — o libero — senza che lo stato lo dica ancora.
   */
  const cacheInfo = ref<Record<string, unknown> | null>(null)
  const isLoading = ref(false)

  async function load(): Promise<void> {
    isLoading.value = true
    try {
      const { data } = await axios.get<{
        data?: { items?: AccountStateEntry[]; cache?: Record<string, unknown> }
      }>(admin('/accounts/states'))
      items.value = data?.data?.items ?? []
      cacheInfo.value = data?.data?.cache ?? null
    } catch (error) {
      notifyApiError(error, 'Stati non caricati', 'Non siamo riusciti a caricare gli stati degli account.')
    } finally {
      isLoading.value = false
    }
  }

  return { items, cacheInfo, isLoading, load }
}
