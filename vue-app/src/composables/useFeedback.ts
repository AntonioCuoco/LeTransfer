import axios from 'axios'
import { ref } from 'vue'

/**
 * Feedback e aiuto: il form (sito e area autenticata) e la pagina del pannello admin.
 * Contratto backend: POST /api/feedback (con account), POST /api/feedback/public (senza, con
 * captcha), GET/PATCH /api/admin/feedback.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export type FeedbackKind = 'idea' | 'problema' | 'aiuto' | 'altro'
export type FeedbackStatus = 'nuovo' | 'letto' | 'risposto' | 'archiviato'
export type FeedbackSource = 'landing' | 'web'

export const FEEDBACK_KINDS: { value: FeedbackKind; label: string; hint: string }[] = [
  { value: 'idea', label: 'Un\'idea', hint: 'Qualcosa che vorresti in Novren' },
  { value: 'problema', label: 'Qualcosa non va', hint: 'Un errore, un comportamento strano' },
  { value: 'aiuto', label: 'Mi serve aiuto', hint: 'Non riesci a fare qualcosa' },
  { value: 'altro', label: 'Altro', hint: 'Qualsiasi altra cosa' },
]

export const FEEDBACK_MAX = 4000

export interface FeedbackDraft {
  kind: FeedbackKind
  message: string
  contactEmail?: string
  source: FeedbackSource
  page?: string
  turnstileToken?: string | null
}

export async function sendFeedback(draft: FeedbackDraft, authenticated: boolean): Promise<void> {
  const url = `${API_BASE_URL}/feedback${authenticated ? '' : '/public'}`
  await axios.post(url, { ...draft, platform: navigator.platform || null })
}

export interface FeedbackItem {
  feedbackId: string
  createdAt: string
  status: FeedbackStatus
  kind: FeedbackKind
  message: string
  contactEmail?: string | null
  accountEmail?: string | null
  userId?: string | null
  source: string
  appVersion?: string | null
  platform?: string | null
  page?: string | null
  note?: string | null
  updatedAt?: string
  updatedBy?: string
}

export function useAdminFeedback() {
  const items = ref<FeedbackItem[]>([])
  const counts = ref<Record<FeedbackStatus, number>>({ nuovo: 0, letto: 0, risposto: 0, archiviato: 0 })
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function load(filter: { status?: FeedbackStatus | null; kind?: FeedbackKind | null } = {}) {
    isLoading.value = true
    error.value = null
    try {
      const { data } = await axios.get<{ data: { items: FeedbackItem[]; counts: Record<FeedbackStatus, number> } }>(
        `${API_BASE_URL}/admin/feedback`,
        { params: { status: filter.status || undefined, kind: filter.kind || undefined } },
      )
      items.value = data.data.items
      counts.value = data.data.counts
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Errore nel caricamento'
    } finally {
      isLoading.value = false
    }
  }

  async function update(id: string, changes: { status?: FeedbackStatus; note?: string }): Promise<FeedbackItem> {
    const { data } = await axios.patch<{ data: FeedbackItem }>(`${API_BASE_URL}/admin/feedback/${encodeURIComponent(id)}`, changes)
    const i = items.value.findIndex((x) => x.feedbackId === id)
    if (i >= 0) items.value[i] = data.data
    return data.data
  }

  return { items, counts, isLoading, error, load, update }
}
