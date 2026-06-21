import { ref, computed } from 'vue'
import axios from 'axios'
import type { SharedLinkAccessInfo, SharedLinkAccessRequest, SharedLinkAccessResponse, SharedLinkFileResponse, SharedLinkError } from '@/src/types'

export type LinkStatus = 'loading' | 'valid' | 'expired' | 'revoked' | 'not_found' | 'download_limit' | 'error'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const mapErrorToStatus = (code: string): LinkStatus => {
  const map: Record<string, LinkStatus> = {
    LINK_NOT_FOUND: 'not_found', LINK_EXPIRED: 'expired', LINK_REVOKED: 'revoked', DOWNLOAD_LIMIT_REACHED: 'download_limit',
  }
  return map[code] || 'error'
}

export const usePublicLink = () => {
  const linkInfo = ref<SharedLinkAccessInfo | null>(null)
  const linkStatus = ref<LinkStatus>('loading')
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const sessionToken = ref<string | null>(null)
  const sessionExpiresAt = ref<string | null>(null)

  const isAuthenticated = computed(() =>
    sessionToken.value !== null && sessionExpiresAt.value !== null && new Date(sessionExpiresAt.value) > new Date()
  )

  const getLinkInfo = async (publicToken: string): Promise<SharedLinkAccessInfo | null> => {
    isLoading.value = true
    error.value = null
    linkStatus.value = 'loading'
    try {
      const { data } = await axios.get<{ success: boolean; data: SharedLinkAccessInfo }>(`${API_BASE_URL}/shared-links/${publicToken}`)
      if (data.success && data.data) {
        linkInfo.value = data.data
        linkStatus.value = 'valid'
        return data.data
      }
      linkStatus.value = 'error'
      error.value = 'Risposta non valida dal server'
      return null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: SharedLinkError }; message?: string }
      if (e.response?.data?.code) {
        linkStatus.value = mapErrorToStatus(e.response.data.code)
        error.value = e.response.data.message
      } else if (e.response?.status === 404) {
        linkStatus.value = 'not_found'; error.value = 'Link non trovato'
      } else if (e.response?.status === 410) {
        linkStatus.value = 'expired'; error.value = 'Link scaduto o revocato'
      } else {
        linkStatus.value = 'error'; error.value = e.message || 'Errore durante il recupero delle informazioni'
      }
      return null
    } finally {
      isLoading.value = false
    }
  }

  const accessLink = async (publicToken: string, request: SharedLinkAccessRequest): Promise<SharedLinkAccessResponse | null> => {
    isLoading.value = true
    error.value = null
    try {
      const { data } = await axios.post<{ success: boolean; data: SharedLinkAccessResponse }>(`${API_BASE_URL}/shared-links/${publicToken}/access`, request)
      if (data.success && data.data) {
        sessionToken.value = data.data.sessionToken
        sessionExpiresAt.value = data.data.expiresAt
        return data.data
      }
      error.value = 'Risposta non valida dal server'
      return null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: SharedLinkError }; message?: string }
      if (e.response?.status === 401) error.value = 'Password non corretta'
      else if (e.response?.data?.message) error.value = e.response.data.message
      else error.value = e.message || "Errore durante l'autenticazione"
      return null
    } finally {
      isLoading.value = false
    }
  }

  const downloadFile = async (publicToken: string, action: 'download' | 'preview' = 'download'): Promise<string | null> => {
    if (!sessionToken.value) { error.value = "Sessione non valida. Effettua nuovamente l'accesso."; return null }
    isLoading.value = true
    error.value = null
    try {
      const { data } = await axios.get<SharedLinkFileResponse>(`${API_BASE_URL}/shared-links/${publicToken}/file`, {
        params: { action },
        headers: { Authorization: `Bearer ${sessionToken.value}` },
      })
      if (data.success && data.data?.url) return data.data.url
      error.value = 'Risposta non valida dal server'
      return null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: SharedLinkError }; message?: string }
      if (e.response?.status === 401) {
        error.value = "Sessione scaduta. Effettua nuovamente l'accesso."
        sessionToken.value = null; sessionExpiresAt.value = null
      } else {
        error.value = e.response?.data?.message || e.message || 'Errore durante il download'
      }
      return null
    } finally {
      isLoading.value = false
    }
  }

  const clearSession = () => { sessionToken.value = null; sessionExpiresAt.value = null }

  return { linkInfo, linkStatus, isLoading, error, sessionToken, sessionExpiresAt, isAuthenticated, getLinkInfo, accessLink, downloadFile, clearSession }
}
