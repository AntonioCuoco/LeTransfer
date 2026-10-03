import { ref, shallowRef } from 'vue'
import axios from 'axios'
import {
  rotateRecoveryKey,
  RotationError,
  type RecoveryRotationDeps,
  type RotationFileKey,
  type RotationProgress,
} from '@/src/crypto/recoveryRotation'
import type { KeyPairBackup } from '@/src/crypto/crypto'
import type { XWingSeedBackup } from '@/src/crypto/hybrid'
import { rememberedUntil, rememberMasterKey, forgetMasterKey } from '@/src/crypto/rememberedDevice'
import { useEncryptionStore } from '@/src/stores/encryption'
import { getCurrentUser } from '@/src/utils/getCurrentUser'
import { describeApiError } from '@/src/utils/apiError'
import { withDetail } from '@/src/utils/errorDetail'
import type { UserRecoveryKeyStatus } from '@/src/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const httpStatus = (err: unknown) => (err as { response?: { status?: number } }).response?.status
const httpCode = (err: unknown) => {
  const data = (err as { response?: { data?: { code?: string; errorCode?: string } } }).response?.data
  return data?.errorCode ?? data?.code
}

/** Le chiamate vere dietro `rotateRecoveryKey` (il flusso e le sue regole stanno nel nucleo). */
const deps: RecoveryRotationDeps = {
  fetchStatus: async () => (await axios.get<UserRecoveryKeyStatus>(`${API_BASE_URL}/user/recovery-key/status`)).data,
  begin: async (request) => {
    const { data } = await axios.post<{ data: { rotationId: string } }>(`${API_BASE_URL}/user/recovery-key/rotation`, request)
    return data.data.rotationId
  },
  listFileKeys: async () =>
    (await axios.get<{ keys: RotationFileKey[] }>(`${API_BASE_URL}/user/file-keys`)).data.keys ?? [],
  stageFileKeys: async (id, items) => {
    await axios.put(`${API_BASE_URL}/user/recovery-key/rotation/${encodeURIComponent(id)}/file-keys`, { items })
  },
  fetchKeyPairBackup: async () => {
    try {
      return (await axios.get<{ data: KeyPairBackup }>(`${API_BASE_URL}/user/keypair-backup`)).data.data
    } catch (err) {
      if (httpStatus(err) === 404) return null
      throw err
    }
  },
  fetchXWingBackup: async () => {
    try {
      return (await axios.get<{ data: XWingSeedBackup }>(`${API_BASE_URL}/user/xwing-key-backup`)).data.data
    } catch (err) {
      if (httpStatus(err) === 404) return null
      throw err
    }
  },
  stageBackups: async (id, backups) => {
    await axios.put(`${API_BASE_URL}/user/recovery-key/rotation/${encodeURIComponent(id)}/backups`, backups)
  },
  commit: async (id) => {
    try {
      await axios.post(`${API_BASE_URL}/user/recovery-key/rotation/${encodeURIComponent(id)}/commit`, {})
      return 'committed'
    } catch (err) {
      if (httpStatus(err) === 409 && httpCode(err) === 'ROTATION_INCOMPLETE') return 'incomplete'
      throw err
    }
  },
  cancel: async () => {
    await axios.delete(`${API_BASE_URL}/user/recovery-key/rotation`)
  },
}

export type RotationOutcome =
  | { ok: true }
  /** `wrongPassword`: si può riprovare con le stesse parole, il server non ha aperto niente. */
  | { ok: false; message: string; wrongPassword: boolean }

/**
 * Cambio delle 24 parole dal sito. Dopo il commit la master key in memoria diventa quella
 * nuova; se questo browser era «ricordato», lo resta con la chiave nuova (la vecchia non
 * aprirebbe più il blob di verifica e verrebbe scartata al prossimo avvio).
 */
export function useRecoveryKeyRotation() {
  const encryptionStore = useEncryptionStore()
  const progress = shallowRef<RotationProgress | null>(null)
  const isRunning = ref(false)

  async function rotate(password: string, mnemonic: string): Promise<RotationOutcome> {
    const current = encryptionStore.masterKey
    if (!current) {
      return { ok: false, message: 'Sblocca prima i tuoi file con le 24 parole attuali.', wrongPassword: false }
    }
    const sub = getCurrentUser()?.sub
    const wasRemembered = !!(await rememberedUntil({ sub }).catch(() => null))

    isRunning.value = true
    progress.value = null
    try {
      const next = await rotateRecoveryKey(deps, current, password, mnemonic, (p) => (progress.value = p))
      encryptionStore.setMasterKey(next)
      if (wasRemembered) {
        await rememberMasterKey(next, { sub }).catch(() => forgetMasterKey({ sub }).catch(() => {}))
      }
      return { ok: true }
    } catch (err) {
      if (err instanceof RotationError) return { ok: false, message: err.message, wrongPassword: false }
      if (httpCode(err) === 'INVALID_PASSWORD') {
        return { ok: false, message: 'Password errata. Le parole nuove restano queste: riprova.', wrongPassword: true }
      }
      const message = (err as { response?: unknown })?.response
        ? describeApiError(err, 'Il cambio delle 24 parole non è riuscito.')
        : withDetail('Il cambio delle 24 parole non è riuscito.', err)
      return { ok: false, message, wrongPassword: false }
    } finally {
      isRunning.value = false
    }
  }

  return { rotate, progress, isRunning }
}
