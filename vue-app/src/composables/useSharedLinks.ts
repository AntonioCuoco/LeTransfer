import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import { notifyApiError } from '@/src/utils/apiError'
import type { SharedLink, CreateSharedLinkRequest, CreateSharedLinkResponse } from '@/src/types'
import { createKeyHash } from '@/src/crypto/crypto'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || window.location.origin

export interface CreateLinkOptions {
  password?: string
  expiresInHours?: number
  maxDownloads?: number
  encryptionKey?: string
  encryptionIV?: string
}

export interface SharedLinkWithEncryption extends SharedLink {
  encryptedUrl?: string
}

export const useSharedLinks = () => {
  const links = ref<SharedLink[]>([])
  const isLoading = ref(false)
  const isCreating = ref(false)
  const error = ref<string | null>(null)

  const getToken = () => Cookies.get('idToken')

  const fetchLinks = async () => {
    isLoading.value = true
    error.value = null
    try {
      const { data } = await axios.get<{ data?: SharedLink[] }>(`${API_BASE_URL}/shared-links`)
      links.value = Array.isArray(data.data) ? data.data : []
    } catch (err) {
      notifyApiError(err, 'Link non caricati', 'Errore durante il caricamento dei link condivisi')
      links.value = []
    } finally {
      isLoading.value = false
    }
  }

  const createLink = async (s3Key: string, fileName: string, fileSize: string, fileType: string, options?: CreateLinkOptions): Promise<SharedLinkWithEncryption | null> => {
    isCreating.value = true
    error.value = null
    try {
      const token = getToken()
      if (!token) throw new Error('Token di autenticazione non trovato')

      const body: CreateSharedLinkRequest = { s3Key, fileName, fileSize, fileType, password: options?.password, expiresInHours: options?.expiresInHours || 168, maxDownloads: options?.maxDownloads }
      const { data } = await axios.post<CreateSharedLinkResponse>(`${API_BASE_URL}/shared-links`, body, {
        headers: { 'Content-Type': 'application/json' },
      })

      if (data.success && data.data) {
        const result: SharedLinkWithEncryption = { ...data.data }
        if (options?.encryptionKey && options?.encryptionIV) {
          const keyHash = createKeyHash({ key: options.encryptionKey, iv: options.encryptionIV })
          result.encryptedUrl = `${FRONTEND_URL}/share/${data.data.publicToken}${keyHash}`
        }
        links.value = [data.data, ...links.value]
        return result
      }
      error.value = 'Risposta non valida dal server'
      return null
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'Link non creato', 'Errore durante la creazione del link')
      return null
    } finally {
      isCreating.value = false
    }
  }

  const revokeLink = async (linkId: string): Promise<boolean> => {
    try {
      await axios.post(`${API_BASE_URL}/shared-links/${linkId}/revoke`, {})
      links.value = links.value.map(l => l.id === linkId ? { ...l, revokedAt: new Date().toISOString() } : l)
      return true
    } catch (err) { notifyApiError(err, 'Link non revocato', 'Errore durante la revoca del link'); return false }
  }

  const regenerateLink = async (linkId: string): Promise<boolean> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/shared-links/${linkId}/regenerate`, {})
      const newLink = response.data.data || response.data
      links.value = links.value.map(l => l.id === linkId ? newLink : l)
      await fetchLinks()
      return true
    } catch (err) { notifyApiError(err, 'Link non rigenerato', 'Errore durante la rigenerazione del link'); return false }
  }

  const updateLink = async (linkId: string, updates: Partial<SharedLink>): Promise<boolean> => {
    try {
      const { data } = await axios.patch<SharedLink>(`${API_BASE_URL}/shared-links/${linkId}`, updates)
      links.value = links.value.map(l => l.id === linkId ? data : l)
      return true
    } catch (err) { notifyApiError(err, 'Link non aggiornato', "Errore durante l'aggiornamento del link"); return false }
  }

  const deleteLink = async (linkId: string): Promise<boolean> => {
    try {
      await axios.delete(`${API_BASE_URL}/shared-links/${linkId}`)
      links.value = links.value.filter(l => l.id !== linkId)
      return true
    } catch (err) { notifyApiError(err, 'Link non eliminato', "Errore durante l'eliminazione del link"); return false }
  }

  return { links, isLoading, isCreating, error, fetchLinks, createLink, revokeLink, regenerateLink, updateLink, deleteLink }
}
