import { ref, computed } from 'vue'
import axios from 'axios'
import type { SharedLinkAccessInfo, SharedLinkAccessRequest, SharedLinkAccessResponse, SharedLinkFileResponse, SharedLinkError } from '@/src/types'
import { apiErrorMessage, describeApiError } from '@/src/utils/apiError'
import { unexpectedResponse } from '@/src/utils/errorDetail'

export type LinkStatus = 'loading' | 'valid' | 'expired' | 'revoked' | 'not_found' | 'download_limit' | 'secret_read' | 'error'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const mapErrorToStatus = (code: string): LinkStatus => {
  const map: Record<string, LinkStatus> = {
    LINK_NOT_FOUND: 'not_found', LINK_EXPIRED: 'expired', LINK_REVOKED: 'revoked', DOWNLOAD_LIMIT_REACHED: 'download_limit',
    SECRET_ALREADY_READ: 'secret_read',
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
      const { data } = await axios.get<{ success: boolean; data: SharedLinkAccessInfo }>(`${API_BASE_URL}/shared-links/${publicToken}`, { skipAuth: true })
      if (data.success && data.data) {
        linkInfo.value = data.data
        linkStatus.value = 'valid'
        return data.data
      }
      linkStatus.value = 'error'
      error.value = unexpectedResponse('le informazioni del link', data)
      return null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: SharedLinkError }; message?: string }
      // Il backend manda `errorCode` su queste rotte; `code` resta per compatibilità.
      const code = e.response?.data?.code ?? e.response?.data?.errorCode
      if (code) {
        linkStatus.value = mapErrorToStatus(code)
        error.value = e.response?.data?.message ?? null
      } else if (e.response?.status === 404) {
        linkStatus.value = 'not_found'; error.value = 'Link non trovato'
      } else if (e.response?.status === 410) {
        linkStatus.value = 'expired'; error.value = 'Link scaduto o revocato'
      } else {
        linkStatus.value = 'error'; error.value = describeApiError(err, 'Non siamo riusciti a leggere le informazioni del link.')
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
      const { data } = await axios.post<{ success: boolean; data: SharedLinkAccessResponse }>(`${API_BASE_URL}/shared-links/${publicToken}/access`, request, { skipAuth: true })
      if (data.success && data.data) {
        sessionToken.value = data.data.sessionToken
        sessionExpiresAt.value = data.data.expiresAt
        return data.data
      }
      error.value = unexpectedResponse('la sessione di accesso', data)
      return null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: SharedLinkError }; message?: string }
      error.value = e.response?.status === 401
        ? apiErrorMessage(err) ?? 'Password non corretta'
        : describeApiError(err, 'Accesso al link non riuscito.')
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
        skipAuth: true,
      })
      if (data.success && data.data?.url) return data.data.url
      error.value = unexpectedResponse('l’indirizzo per scaricare il file', data)
      return null
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: SharedLinkError }; message?: string }
      if (e.response?.status === 401) {
        error.value = apiErrorMessage(err) ?? "Sessione scaduta. Effettua nuovamente l'accesso."
        sessionToken.value = null; sessionExpiresAt.value = null
      } else {
        error.value = describeApiError(err, 'Non siamo riusciti a ottenere il file da scaricare.')
      }
      return null
    } finally {
      isLoading.value = false
    }
  }

  const clearSession = () => { sessionToken.value = null; sessionExpiresAt.value = null }

  return { linkInfo, linkStatus, isLoading, error, sessionToken, sessionExpiresAt, isAuthenticated, getLinkInfo, accessLink, downloadFile, clearSession }
}
