import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'
import { notify } from '@/src/utils/notify'
import { notifyApiError } from '@/src/utils/apiError'
import type { DynamoDBFile, LoadFilesOptions, DeleteFileOptions, ShareLinkData } from '@/src/types'
import { useEncryptionStore } from '@/src/stores/encryption'
import { decryptFile, importKeyFromBase64, importIVFromBase64 } from '@/src/crypto/crypto'
import {
  DownloadCancelled,
  DownloadError,
  assertStorageResponse,
  downloadErrorMessage,
} from '@/src/crypto/streamingDownload'
import { downloadAndDecryptV2, shouldWarnLargeDownload } from '@/src/crypto/browserDownload'
import { resolveFileName } from '@/src/utils/fileNames'

export const useFileFromDynamoDB = () => {
  const files = ref<DynamoDBFile[]>([])
  const isLoading = ref(false)
  const isDeleting = ref(false)
  const error = ref<string | null>(null)
  const nextKey = ref<string | null>(null)
  const hasMore = ref(false)

  const encryptionStore = useEncryptionStore()

  // ⚠️ Qui c'era `uploadFile`: un caricamento in chiaro, senza cifratura, verso
  // `GET /presigned-url` — un endpoint delle vecchie Lambda che nel backend Express non esiste
  // più. Non la chiamava nessuno, ed è stata tolta: in un prodotto che promette la cifratura,
  // un percorso di upload in chiaro pronto all'uso è un rischio anche da spento. L'unico
  // upload dell'area autenticata è useS3MultipartUpload.

  const getToken = () => Cookies.get('idToken')

  const loadFiles = async (options?: LoadFilesOptions) => {
    isLoading.value = true
    error.value = null
    try {
      const token = getToken()
      if (!token) throw new Error('Token di autenticazione non trovato')

      const params: Record<string, string | number | boolean> = {}
      if (options?.limit) params.limit = options.limit
      if (options?.lastKey) params.lastKey = options.lastKey
      if (options?.fileType) params.fileType = options.fileType
      if (options?.onlyOwned) params.onlyOwned = options.onlyOwned

      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/user/files/dynamo`, { params })
      files.value = data.files || []
      nextKey.value = data.nextKey || null
      hasMore.value = data.hasMore || false
      return { files: data.files || [], count: data.count || 0, nextKey: data.nextKey || null, hasMore: data.hasMore || false }
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'File non caricati', 'Errore durante il caricamento dei file')
      return null
    } finally {
      isLoading.value = false
    }
  }

  const loadMoreFiles = async (options?: LoadFilesOptions) => {
    if (!nextKey.value || isLoading.value) return null
    isLoading.value = true
    error.value = null
    try {
      const token = getToken()
      if (!token) throw new Error('Token di autenticazione non trovato')
      const params: Record<string, string | number | boolean> = { lastKey: nextKey.value }
      if (options?.limit) params.limit = options.limit
      if (options?.fileType) params.fileType = options.fileType

      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/user/files/dynamo`, { params })
      files.value = [...files.value, ...(data.files || [])]
      nextKey.value = data.nextKey || null
      hasMore.value = data.hasMore || false
      return { files: data.files || [], count: data.count || 0, nextKey: data.nextKey || null, hasMore: data.hasMore || false }
    } catch (err: unknown) {
      error.value = notifyApiError(err, 'File non caricati', 'Errore durante il caricamento dei file')
      return null
    } finally {
      isLoading.value = false
    }
  }

  const deleteFile = async (fileId: string, s3Key: string, options?: DeleteFileOptions): Promise<boolean> => {
    isDeleting.value = true
    error.value = null
    try {
      const token = getToken()
      if (!token) throw new Error('Token di autenticazione non trovato')
      await axios.delete(`${import.meta.env.VITE_API_URL}/uploads/files`, {
        data: { fileId: s3Key },
      })
      files.value = files.value.filter(f => f.fileId !== fileId)
      options?.onSuccess?.()
      return true
    } catch (err: unknown) {
      const msg = notifyApiError(err, 'Eliminazione non riuscita', "Errore durante l'eliminazione del file")
      error.value = msg
      options?.onError?.(new Error(msg))
      return false
    } finally {
      isDeleting.value = false
    }
  }

  const downloadFile = async (file: DynamoDBFile): Promise<boolean> => {
    try {
      const downloadUrl = file.s3Url
      if (!downloadUrl) throw new DownloadError('L’indirizzo del file non è disponibile: ricarica la pagina e riprova.')

      const keyData = encryptionStore.isUnlocked ? await encryptionStore.getKey(file.s3Key) : null

      // Il nome con cui il file atterra sul disco. Con `nameVersion: 2` quello che arriva dal
      // server è ciphertext: salvarlo così com'è darebbe all'utente un file chiamato base64.
      const saveName = await resolveFileName(
        file,
        keyData ? await importKeyFromBase64(keyData.key) : null,
      )

      // Formato v2 (#6): decifratura a chunk in streaming — non carica mai il file intero in RAM.
      if (keyData && file.formatVersion === 2 && file.chunkSize && file.originalSize != null) {
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
          const key = await importKeyFromBase64(keyData.key)
          await downloadAndDecryptV2({
            url: downloadUrl,
            key,
            chunkSize: file.chunkSize,
            originalSize: file.originalSize,
            fileName: saveName,
          })
          return true
        } catch (err) {
          if (err instanceof DownloadCancelled) return false
          notify.error(downloadErrorMessage(err, 'Impossibile decifrare il file.'), 'Download non riuscito')
          return false
        }
      }

      // --- Formato v1 (legacy): intero blob con un unico IV ---
      const response = await fetch(downloadUrl)
      // `fetch` non fallisce su 403/404: senza questo un URL scaduto finiva nella decifratura
      // e l'errore mostrato era «impossibile decifrare», che manda a cercare il guasto sbagliato.
      assertStorageResponse(response)
      const blob = await response.blob()
      let finalBlob = blob

      if (keyData) {
        try {
          const key = await importKeyFromBase64(keyData.key)
          const iv = importIVFromBase64(keyData.iv)
          finalBlob = await decryptFile(blob, key, iv)
        } catch (err) {
          notify.error(downloadErrorMessage(err, 'Impossibile decifrare il file.'), 'Decifratura non riuscita')
          return false
        }
      } else if (file.isEncrypted) {
        const result = await Swal.fire({
          title: 'File Cifrato',
          text: 'Chiave di decifratura non trovata. Il file potrebbe risultare illeggibile.',
          icon: 'warning',
          confirmButtonText: 'Scarica comunque',
          showCancelButton: true,
          cancelButtonText: 'Annulla',
        })
        if (!result.isConfirmed) return false
      }

      const url = URL.createObjectURL(finalBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = saveName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      return true
    } catch (err) {
      // Qui non ci sono chiamate al backend: gli errori sono dello storage o della rete, e il
      // loro motivo lo porta DownloadError.
      notify.error(downloadErrorMessage(err, 'Errore durante il download del file.'), 'Download non riuscito')
      return false
    }
  }

  const createShareLink = async (file: DynamoDBFile): Promise<ShareLinkData | null> => {
    try {
      const { data } = await axios.get(
        `${import.meta.env.VITE_API_URL}/file-url?key=${file.s3Key}&download=true&expires=3600`
      )
      return { url: data.url, fileName: file.fileName, fileSize: file.fileSize, uploadDate: file.uploadedAt, expiresIn: '1 ora', fileType: file.fileType }
    } catch (err: unknown) {
      notifyApiError(err, 'Link non creato', 'Impossibile creare il link')
      return null
    }
  }

  const reset = () => {
    files.value = []
    isLoading.value = false
    isDeleting.value = false
    error.value = null
    nextKey.value = null
    hasMore.value = false
  }

  return { files, isLoading, isDeleting, error, hasMore, nextKey, loadFiles, loadMoreFiles, deleteFile, downloadFile, createShareLink, reset }
}
