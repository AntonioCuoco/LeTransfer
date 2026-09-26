import axios from 'axios'
import { apiErrorMessage } from '@/src/utils/apiError'
import type { LoopbackRequest } from '@/src/utils/cliAuthorization'

/**
 * Le chiamate del sito verso /api/cli: autorizzare un dispositivo, elencare e revocare quelli
 * collegati all'account.
 *
 * ── «Non ancora attivo» non è un errore ─────────────────────────────────────────
 * Il backend tiene l'intera funzione dietro un interruttore: spento, ogni rotta /api/cli
 * risponde 404. Il sito viene pubblicato PRIMA che l'interruttore si accenda (è l'ordine di
 * rilascio), quindi un 404 qui significa «funzione non attiva» e le pagine lo dicono così,
 * invece di mostrare un errore che farebbe pensare a un guasto.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export type CliKind = 'device' | 'account'

export class CliUnavailable extends Error {
  constructor() {
    super('L’accesso dalla CLI non è ancora attivo.')
    this.name = 'CliUnavailable'
  }
}

function failure(error: unknown, fallback: string): Error {
  const status = (error as { response?: { status?: number } })?.response?.status
  if (status === 404) return new CliUnavailable()
  return new Error(apiErrorMessage(error) ?? fallback)
}

export interface CliDevice {
  tokenId: string
  deviceName: string
  createdAt: string
  expiresAt: string
  lastUsedAt: string
  suspended: boolean
}

export function useCliAuthorization() {
  /**
   * Chiede il codice monouso per la CLI.
   *  - `device`: anonimo. Nessuna sessione (`skipAuth`), serve il token di Turnstile.
   *  - `account`: con la sessione del sito, che l'intercettore aggiunge da sé.
   */
  async function requestGrant(request: LoopbackRequest, kind: CliKind, turnstileToken?: string): Promise<string> {
    try {
      const { data } = await axios.post<{ code: string }>(
        `${API_BASE_URL}/cli/grant`,
        {
          kind,
          codeChallenge: request.codeChallenge,
          deviceName: request.deviceName,
          ...(turnstileToken ? { turnstileToken } : {}),
        },
        { skipAuth: kind === 'device' },
      )
      return data.code
    } catch (error) {
      throw failure(error, 'Non è stato possibile autorizzare la CLI. Riprova.')
    }
  }

  /** Quale dispositivo sta chiedendo di essere autorizzato con questo codice breve. */
  async function describeDevice(userCode: string): Promise<{ deviceName: string } | null> {
    try {
      const { data } = await axios.get<{ deviceName: string }>(
        `${API_BASE_URL}/cli/device/${encodeURIComponent(userCode)}`,
        { skipAuth: true },
      )
      return data
    } catch (error) {
      const code = (error as { response?: { data?: { errorCode?: string } } })?.response?.data?.errorCode
      // 404 con DEVICE_CODE_INVALID: il codice non c'è. 404 senza: la funzione è spenta.
      if (code === 'DEVICE_CODE_INVALID') return null
      throw failure(error, 'Non è stato possibile leggere il codice. Riprova.')
    }
  }

  async function approveDevice(userCode: string, kind: CliKind, turnstileToken?: string): Promise<boolean> {
    try {
      await axios.post(
        `${API_BASE_URL}/cli/device/approve`,
        { userCode, kind, ...(turnstileToken ? { turnstileToken } : {}) },
        { skipAuth: kind === 'device' },
      )
      return true
    } catch (error) {
      const code = (error as { response?: { data?: { errorCode?: string } } })?.response?.data?.errorCode
      if (code === 'DEVICE_CODE_INVALID') return false
      throw failure(error, 'Non è stato possibile autorizzare il dispositivo. Riprova.')
    }
  }

  /** I dispositivi collegati all'account. `null` = funzione non attiva: la sezione si nasconde. */
  async function listDevices(): Promise<CliDevice[] | null> {
    try {
      const { data } = await axios.get<{ tokens: CliDevice[] }>(`${API_BASE_URL}/cli/tokens`)
      return data.tokens
    } catch (error) {
      if ((error as { response?: { status?: number } })?.response?.status === 404) return null
      throw failure(error, 'Non è stato possibile caricare i dispositivi collegati.')
    }
  }

  async function revokeDevice(tokenId: string): Promise<void> {
    try {
      await axios.delete(`${API_BASE_URL}/cli/tokens/${encodeURIComponent(tokenId)}`)
    } catch (error) {
      throw failure(error, 'Non è stato possibile scollegare il dispositivo.')
    }
  }

  return { requestGrant, describeDevice, approveDevice, listDevices, revokeDevice }
}
