import { ref } from 'vue'
import axios from 'axios'
import { notify } from '@/src/utils/notify'
import { notifyApiError } from '@/src/utils/apiError'
import type { AuditEntry } from './useAdmin'

/**
 * Utenti (roadmap O1.4 fase 2).
 *
 * La scheda esiste per rispondere alla domanda vera dietro un ticket: **«perché questo
 * utente non riesce a caricare?»**. Piano, quota e volume uno sotto l'altro, invece di
 * dedotti — è il 90% dell'uso reale del pannello.
 *
 * ⚠️ **Le azioni sotto sono irreversibili o quasi**, e ognuna vuole un motivo — il server
 * lo impone (`400 REASON_REQUIRED`), qui è tipizzato come obbligatorio per non scoprirlo
 * a metà di un dialogo.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const admin = (path: string) => `${API_BASE_URL}/admin/users${path}`

export interface UserListItem {
  userId: string
  email: string | null
  createdAt: string | null
  status: string
  enabled: boolean
  suspended: boolean
  deletionScheduledAt: string | null
}

export interface UserDetail {
  profile: {
    userId: string
    email: string | null
    createdAt: string | null
    lastActivityAt: string | null
    status: string
    enabled: boolean
    /** `null` = non verificabile in questo momento — non è un "no". */
    mfaEnabled: boolean | null
  }
  plan: {
    plan: string
    /** 'stripe' | 'admin' | 'admin_revoked' | null. Distingue un cliente da un regalo. */
    source: string | null
    expiresAt: string | null
    grantedBy: string | null
    grantedAt: string | null
    reason: string | null
    billingStatus: string | null
    hasStripeCustomer: boolean
  }
  usage: {
    storedBytes: number
    monthlyBytes: number
    monthlyResetsAt: string | null
    tracked: boolean
  }
  limits: {
    maxFileSizeBytes: number | null
    maxStoredBytes: number | null
    maxMonthlyBytes: number | null
    maxExpiryHours: number | null
  }
  counts: {
    files: number | null
    links: number
    activeLinks: number
    requests: number
  }
  state: {
    suspended: boolean
    suspendedAt: string | null
    suspendReason: string | null
    deletionScheduledAt: string | null
    deletionReason: string | null
  }
  moderation: { openReports: number }
}

/** Le uniche durate che il backend accetta (`ADMIN_PLAN_GRANT_DAYS`). Un numero libero
 *  qui sarebbe un regalo che nessuno nota finché non guarda i conti. */
export const PLAN_GRANT_DAYS = [30, 90, 365] as const
export type PlanGrantDays = (typeof PLAN_GRANT_DAYS)[number]

export function useAdminUsers() {
  const items = ref<UserListItem[]>([])
  const cursor = ref<string | null>(null)
  const detail = ref<UserDetail | null>(null)
  const userAudit = ref<AuditEntry[]>([])
  const isLoading = ref(false)
  const isActing = ref(false)

  async function search(q: string, useCursor?: string): Promise<void> {
    isLoading.value = true
    try {
      const { data } = await axios.get<{ data?: { items?: UserListItem[]; cursor?: string | null } }>(
        admin(''),
        { params: { q: q || undefined, cursor: useCursor || undefined, limit: 25 } },
      )
      items.value = useCursor ? [...items.value, ...(data?.data?.items ?? [])] : data?.data?.items ?? []
      cursor.value = data?.data?.cursor ?? null
    } catch (error) {
      notifyApiError(error, 'Ricerca non riuscita', 'Non siamo riusciti a caricare gli utenti.')
    } finally {
      isLoading.value = false
    }
  }

  async function loadDetail(userId: string): Promise<boolean> {
    isLoading.value = true
    try {
      const [detailRes, auditRes] = await Promise.all([
        axios.get<{ data?: UserDetail }>(admin(`/${userId}`)),
        axios.get<{ data?: { items?: AuditEntry[] } }>(admin(`/${userId}/audit`)),
      ])
      detail.value = detailRes.data?.data ?? null
      userAudit.value = auditRes.data?.data?.items ?? []
      return !!detail.value
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      notifyApiError(
        error,
        'Scheda non caricata',
        status === 404 ? 'Utente non trovato.' : 'Non siamo riusciti a caricare la scheda.',
      )
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function act<T>(path: string, reason: string, successMsg: string): Promise<T | null> {
    isActing.value = true
    try {
      const { data } = await axios.post<{ data?: T & { note?: string | null } }>(
        admin(path),
        { reason },
      )
      const note = data?.data && 'note' in data.data ? data.data.note : null
      notify.success(note ? `${successMsg} ${note}.` : successMsg)
      return data?.data ?? null
    } catch (error) {
      notifyApiError(error, 'Azione non riuscita', 'Operazione non riuscita.')
      return null
    } finally {
      isActing.value = false
    }
  }

  /** Accesso bloccato subito, link revocati subito. Per fermare un abuso in corso. */
  const suspend = (userId: string, reason: string) =>
    act(`/${userId}/suspend`, reason, 'Utente sospeso: accesso e link bloccati.')

  /** ⚠️ Non ripristina i link revocati durante la sospensione: il `note` del server lo dice. */
  const unsuspend = (userId: string, reason: string) =>
    act(`/${userId}/unsuspend`, reason, 'Sospensione revocata.')

  /** 7 giorni di sola lettura, poi cancellazione. I link restano vivi fino ad allora. */
  const scheduleDeletion = (userId: string, reason: string) =>
    act<{ deletionAt: string }>(`/${userId}/schedule-deletion`, reason, 'Cancellazione programmata: 7 giorni per esportare.')

  const cancelDeletion = (userId: string, reason: string) =>
    act(`/${userId}/cancel-deletion`, reason, 'Cancellazione annullata: account di nuovo scrivibile.')

  /** Regala un piano a termine. Torna a Free da solo alla scadenza, senza job. */
  async function grantPlan(
    userId: string,
    plan: string,
    days: PlanGrantDays,
    reason: string,
  ): Promise<boolean> {
    isActing.value = true
    try {
      await axios.post(admin(`/${userId}/plan`), { plan, days, reason })
      notify.success(`Piano ${plan} regalato per ${days} giorni.`)
      return true
    } catch (error) {
      notifyApiError(error, 'Piano non assegnato', 'Assegnazione non riuscita.')
      return false
    } finally {
      isActing.value = false
    }
  }

  /** Toglie il *regalo*, non un abbonamento pagato: se paga davvero, Stripe lo ripristina. */
  async function revokePlan(userId: string, reason: string): Promise<boolean> {
    isActing.value = true
    try {
      const { data } = await axios.delete<{ data?: { note?: string | null } }>(admin(`/${userId}/plan`), {
        data: { reason },
      })
      const note = data?.data?.note
      notify.success(note ? `Piano regalato tolto. ${note}.` : 'Piano regalato tolto: torna a Free.')
      return true
    } catch (error) {
      notifyApiError(error, 'Piano non revocato', 'Revoca del piano non riuscita.')
      return false
    } finally {
      isActing.value = false
    }
  }

  /**
   * Crea la credenziale. ⚠️ Non crea un account "pronto": le chiavi nascono nel browser
   * dell'utente al primo accesso. Il chiamante deve mostrare questo limite, non solo il
   * successo — è la stessa nota che il server allega alla risposta.
   */
  async function createUser(
    email: string,
    plan?: string,
    days?: PlanGrantDays,
  ): Promise<{ userId: string; note: string } | null> {
    isActing.value = true
    try {
      const { data } = await axios.post<{ data?: { userId: string; note: string } }>(admin(''), {
        email,
        ...(plan ? { plan, days } : {}),
      })
      return data?.data ?? null
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      notifyApiError(
        error,
        'Utente non creato',
        status === 409 ? 'Esiste già un utente con questa email.' : 'Creazione non riuscita.',
      )
      return null
    } finally {
      isActing.value = false
    }
  }

  return {
    items,
    cursor,
    detail,
    userAudit,
    isLoading,
    isActing,
    search,
    loadDetail,
    suspend,
    unsuspend,
    scheduleDeletion,
    cancelDeletion,
    grantPlan,
    revokePlan,
    createUser,
  }
}
