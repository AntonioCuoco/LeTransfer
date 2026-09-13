import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'
import type { ShareFileRequest, ShareFileResponse, SharedFile, ShareFileOptions, EncryptionKeyData } from '@/src/types'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useUserKeyPair } from './useUserKeyPair'
import { wrapKeyWithPublicKey, unwrapKeyWithPrivateKey, importKeyFromBase64, importIVFromBase64, decryptFile } from '@/src/crypto/crypto'
import { notify } from '@/src/utils/notify'
import { notifyApiError } from '@/src/utils/apiError'
import { resolveFileName } from '@/src/utils/fileNames'
import {
  downloadAndDecryptV2,
  shouldWarnLargeDownload,
  DownloadCancelled,
  DownloadError,
  assertStorageResponse,
  downloadErrorMessage,
} from '@/src/crypto/streamingDownload'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

/** Un destinatario la cui chiave pubblica è stata scaricata e, se richiesto, verificata. */
export interface PreparedRecipient {
  email: string
  publicKey: CryptoKey
}

/**
 * Condivisione utente → utente, cifrata per il destinatario.
 *
 * Divisa in passi riutilizzabili, perché la usano due flussi: «Condividi» su un file di
 * «I tuoi file» (un file, un destinatario → `shareFile`) e «Manda a una persona» (più file,
 * più destinatari, file anche dal computer → useSendFiles, che compone i passi uno per uno):
 *
 *  1. `ensureVaultUnlocked` / `getShareableKey` — la chiave del file c'è?
 *  2. `prepareRecipient` — chiave pubblica del destinatario + verifica dell'impronta
 *  3. `deliverFile` — la chiave del file, chiusa nella chiave pubblica, va al server
 *
 * ⚠️ **Senza la chiave del file non si condivide.** Prima, con il vault chiuso, la condivisione
 * partiva lo stesso senza `encryptedAESKey`: il destinatario riceveva un file cifrato che non
 * poteva aprire, e nessuno se ne accorgeva. Il backend ora lo rifiuta (400 FILE_KEY_REQUIRED).
 */
export const useShareFile = () => {
  const isSharing = ref(false)
  const isLoadingShared = ref(false)
  const sharedFiles = ref<SharedFile[]>([])
  const shareError = ref<string | null>(null)

  const { getRecipientPublicKey, privateKey } = useUserKeyPair()
  const encryptionStore = useEncryptionStore()

  const ensureVaultUnlocked = (): boolean => {
    if (encryptionStore.isUnlocked) return true
    notify.warning(
      'Sblocca le tue chiavi con le 24 parole prima di condividere: senza, il destinatario riceverebbe un file che non può aprire.',
      'Condivisione bloccata',
    )
    return false
  }

  /** La chiave del file, o `null` con il motivo già mostrato. */
  const getShareableKey = async (s3Key: string): Promise<EncryptionKeyData | null> => {
    if (!ensureVaultUnlocked()) return null
    const keyData = await encryptionStore.getKey(s3Key)
    if (!keyData) {
      notify.error(
        'Non troviamo la chiave di questo file: condividerlo manderebbe al destinatario un file che non può aprire.',
        'Chiave del file mancante',
      )
      return null
    }
    return keyData
  }

  /**
   * Chiave pubblica del destinatario, verificata. `null` = non si procede: il destinatario non
   * è raggiungibile (il motivo lo mostra getRecipientPublicKey) o l'impronta non è stata confermata.
   */
  const prepareRecipient = async (
    email: string,
    verifyRecipient?: ShareFileOptions['verifyRecipient'],
  ): Promise<PreparedRecipient | null> => {
    const targetEmail = email.trim()
    const publicKey = await getRecipientPublicKey(targetEmail)
    if (!publicKey) return null
    // Verifica dell'impronta (F2): l'ultimo momento utile per accorgersi che la chiave
    // pubblica servita non è quella della persona giusta. Se non conferma, niente parte.
    if (verifyRecipient && !(await verifyRecipient(publicKey, targetEmail))) return null
    return { email: targetEmail, publicKey }
  }

  /** Consegna un file a un destinatario già preparato. Senza la chiave del file non consegna nulla. */
  const deliverFile = async (s3Key: string, recipient: PreparedRecipient): Promise<ShareFileResponse | null> => {
    const keyData = await getShareableKey(s3Key)
    if (!keyData) return null
    try {
      const aesKey = await importKeyFromBase64(keyData.key)
      const body: ShareFileRequest = {
        s3Key,
        type: 'user',
        targetEmail: recipient.email,
        encryptedAESKey: await wrapKeyWithPublicKey(aesKey, recipient.publicKey),
        encryptionIV: keyData.iv,
      }
      const { data } = await axios.post<ShareFileResponse>(`${API_BASE_URL}/share`, body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      const fallback =
        status === 404 ? "Utente non trovato. Verifica che l'email sia corretta."
          : status === 400 ? 'Non puoi inviare un file a te stesso.'
            : 'Errore durante la condivisione del file'
      shareError.value = notifyApiError(err, 'Condivisione non riuscita', fallback)
      return null
    }
  }

  /** Un file, un destinatario: il flusso di «Condividi» in «I tuoi file». */
  const shareFile = async (s3Key: string, targetEmail: string, options?: ShareFileOptions): Promise<ShareFileResponse | null> => {
    isSharing.value = true
    shareError.value = null
    try {
      // Prima la chiave del file (locale, immediata), poi il destinatario: nessuna verifica
      // di impronta per un file che comunque non si potrebbe consegnare.
      if (!(await getShareableKey(s3Key))) {
        options?.onError?.(new Error('Chiave del file non disponibile'))
        return null
      }
      const recipient = await prepareRecipient(targetEmail, options?.verifyRecipient)
      if (!recipient) return null

      const data = await deliverFile(s3Key, recipient)
      if (!data) {
        options?.onError?.(new Error(shareError.value ?? 'Condivisione non riuscita'))
        return null
      }
      options?.onSuccess?.(data)
      notify.success(`File condiviso con ${recipient.email}: solo lui può aprirlo.`, 'Condiviso')
      return data
    } finally {
      isSharing.value = false
    }
  }

  const getSharedWithMe = async (): Promise<SharedFile[]> => {
    isLoadingShared.value = true
    shareError.value = null
    try {
      const token = Cookies.get('idToken')
      if (!token) throw new Error('Token di autenticazione non trovato')
      const { data } = await axios.get<{ files: SharedFile[] }>(`${API_BASE_URL}/shared-files`)
      const files = data.files || []
      sharedFiles.value = files
      return files
    } catch (err: unknown) {
      shareError.value = notifyApiError(err, 'File ricevuti non caricati', 'Errore durante il caricamento dei file condivisi')
      return []
    } finally {
      isLoadingShared.value = false
    }
  }

  // Scarica un file ricevuto in condivisione (utente→utente). Se è cifrato E2E, la file key AES è
  // wrappata con la MIA chiave pubblica RSA: la sblocco con la mia private key (non estraibile, ma
  // può fare unwrap), poi decifro il file. Se non è cifrato, scarica direttamente.
  const downloadSharedFile = async (file: SharedFile): Promise<boolean> => {
    try {
      if (!file.s3Url) throw new DownloadError('L’indirizzo del file non è disponibile: ricarica la pagina e riprova.')

      // La file key AES è wrappata con la MIA chiave pubblica RSA → la sblocco con la mia private key
      // (non estraibile, ma può comunque fare unwrap).
      let aesKey: CryptoKey | null = null
      if (file.encryptedAESKey) {
        if (!privateKey.value) throw new DownloadError('Chiavi di cifratura non ancora pronte. Riprova tra un istante.')
        aesKey = await unwrapKeyWithPrivateKey(file.encryptedAESKey, privateKey.value)
      }

      // Con `nameVersion: 2` il nome è ciphertext: salvarlo così darebbe all'utente un file
      // chiamato base64. La chiave è la stessa che apre il contenuto.
      const saveName = (await resolveFileName(file, aesKey)) || 'download'

      // Formato v2 (#6): decifratura a chunk in streaming — niente file intero in RAM.
      if (aesKey && file.formatVersion === 2 && file.chunkSize && file.originalSize != null) {
        if (shouldWarnLargeDownload(file.originalSize)) {
          const warn = await Swal.fire({
            title: 'File molto grande',
            text: 'Su questo browser i file oltre ~2 GB potrebbero non scaricarsi. Per file di queste dimensioni usa Chrome o Edge.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Prova comunque',
            cancelButtonText: 'Annulla',
          })
          if (!warn.isConfirmed) return false
        }
        try {
          await downloadAndDecryptV2({
            url: file.s3Url,
            key: aesKey,
            chunkSize: file.chunkSize,
            originalSize: file.originalSize,
            fileName: saveName,
          })
          return true
        } catch (err) {
          if (err instanceof DownloadCancelled) return false
          throw err
        }
      }

      // --- Formato v1 (legacy): intero blob con un unico IV ---
      const res = await fetch(file.s3Url)
      assertStorageResponse(res)
      let finalBlob = await res.blob()
      if (aesKey && file.encryptionIV) {
        const iv = importIVFromBase64(file.encryptionIV)
        finalBlob = await decryptFile(finalBlob, aesKey, iv)
      }

      const url = URL.createObjectURL(finalBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = saveName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return true
    } catch (err: unknown) {
      // Il motivo vero se lo conosciamo (storage, rete, chiavi non pronte). Il resto sono errori
      // di Web Crypto, il cui testo tecnico non direbbe niente a chi legge.
      notify.error(downloadErrorMessage(err, 'Non è stato possibile decifrare il file condiviso.'), 'Download non riuscito')
      return false
    }
  }

  const reset = () => {
    isSharing.value = false; isLoadingShared.value = false; sharedFiles.value = []; shareError.value = null
  }

  return {
    isSharing,
    isLoadingShared,
    sharedFiles,
    shareError,
    ensureVaultUnlocked,
    getShareableKey,
    prepareRecipient,
    deliverFile,
    shareFile,
    getSharedWithMe,
    downloadSharedFile,
    reset,
  }
}
