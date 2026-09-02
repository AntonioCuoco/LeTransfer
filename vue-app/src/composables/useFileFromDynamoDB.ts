import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'
import Swal from 'sweetalert2'
import type { DynamoDBFile, LoadFilesOptions, UploadFileOptions, DeleteFileOptions, ShareLinkData } from '@/src/types'
import { useEncryptionStore } from '@/src/stores/encryption'
import { decryptFile, importKeyFromBase64, importIVFromBase64 } from '@/src/crypto/crypto'
import { downloadAndDecryptV2, shouldWarnLargeDownload, DownloadCancelled } from '@/src/crypto/streamingDownload'
import { resolveFileName } from '@/src/utils/fileNames'

export const useFileFromDynamoDB = () => {
  const files = ref<DynamoDBFile[]>([])
  const isLoading = ref(false)
  const isUploading = ref(false)
  const isDeleting = ref(false)
  const error = ref<string | null>(null)
  const nextKey = ref<string | null>(null)
  const hasMore = ref(false)

  const encryptionStore = useEncryptionStore()

  // Istanza axios SENZA interceptor: gli URL S3 presigned non devono ricevere l'accessToken (#8).
  const s3Api = axios.create()

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
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e.response?.data?.message || e.message || 'Errore durante il caricamento dei file'
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
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      error.value = e.response?.data?.message || e.message || 'Errore durante il caricamento dei file'
      return null
    } finally {
      isLoading.value = false
    }
  }

  const uploadFile = async (file: File, options?: UploadFileOptions): Promise<string | null> => {
    isUploading.value = true
    error.value = null
    try {
      const token = getToken()
      if (!token) throw new Error('Token di autenticazione non trovato')
      const { data: presignedData } = await axios.get(`${import.meta.env.VITE_API_URL}/presigned-url`, {
        params: { fileName: file.name, fileType: file.type },
      })
      await s3Api.put(presignedData.uploadUrl, file, {
        headers: { 'Content-Type': file.type },
        onUploadProgress: (evt) => {
          if (options?.onProgress && evt.total) {
            options.onProgress(Math.round((evt.loaded * 100) / evt.total))
          }
        },
      })
      await loadFiles()
      if (options?.onSuccess && presignedData.file) options.onSuccess(presignedData.file)
      return presignedData.key
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      const msg = e.response?.data?.message || e.message || "Errore durante l'upload del file"
      error.value = msg
      options?.onError?.(new Error(msg))
      Swal.fire({ title: 'Errore!', text: msg, icon: 'error' })
      return null
    } finally {
      isUploading.value = false
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
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      const msg = e.response?.data?.message || e.message || "Errore durante l'eliminazione del file"
      error.value = msg
      options?.onError?.(new Error(msg))
      Swal.fire({ title: 'Errore!', text: msg, icon: 'error' })
      return false
    } finally {
      isDeleting.value = false
    }
  }

  const downloadFile = async (file: DynamoDBFile): Promise<boolean> => {
    try {
      const downloadUrl = file.s3Url
      if (!downloadUrl) throw new Error('URL del file non disponibile')

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
          Swal.fire({ title: 'Errore Decifratura!', text: 'Impossibile decifrare il file.', icon: 'error' })
          return false
        }
      }

      // --- Formato v1 (legacy): intero blob con un unico IV ---
      const response = await fetch(downloadUrl)
      const blob = await response.blob()
      let finalBlob = blob

      if (keyData) {
        try {
          const key = await importKeyFromBase64(keyData.key)
          const iv = importIVFromBase64(keyData.iv)
          finalBlob = await decryptFile(blob, key, iv)
        } catch {
          Swal.fire({ title: 'Errore Decifratura!', text: 'Impossibile decifrare il file.', icon: 'error' })
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
    } catch {
      Swal.fire({ title: 'Errore!', text: 'Errore durante il download del file', icon: 'error' })
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
      const e = err as { response?: { data?: { message?: string } } }
      Swal.fire({ title: 'Errore', text: e.response?.data?.message || 'Impossibile creare il link', icon: 'error' })
      return null
    }
  }

  const reset = () => {
    files.value = []
    isLoading.value = false
    isUploading.value = false
    isDeleting.value = false
    error.value = null
    nextKey.value = null
    hasMore.value = false
  }

  return { files, isLoading, isUploading, isDeleting, error, hasMore, nextKey, loadFiles, loadMoreFiles, uploadFile, deleteFile, downloadFile, createShareLink, reset }
}
