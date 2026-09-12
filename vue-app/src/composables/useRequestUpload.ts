import { ref } from 'vue'
import axios from 'axios'
import {
  generateAESKey,
  generateIV,
  encryptChunkFramed,
  encryptedSizeV2,
  wrapKeyWithPublicKey,
  importPublicKeyFromJWK,
  arrayBufferToBase64,
  encryptFileName,
  FILENAME_VERSION,
  FILE_FORMAT_VERSION,
} from '@/src/crypto/crypto'
import { jwkThumbprint } from '@/src/crypto/fingerprint'
import { ENCRYPT_FILENAMES } from '@/src/utils/fileNames'
import { parsePlanLimitError } from '@/src/utils/planLimitError'
import { apiErrorMessage } from '@/src/utils/apiError'

/**
 * Caricamento su una richiesta file — lato di chi carica, **senza account**.
 *
 * ── Dove sta la crittografia ────────────────────────────────────────────────────
 * La chiave AES nasce in questo browser, cifra il file a chunk (formato v2, lo stesso
 * dell'invio guest) e poi viene **wrappata sulla chiave pubblica RSA del destinatario**.
 * Al server arrivano solo ciphertext e una chiave wrappata che non sa aprire: la può
 * sciogliere unicamente la chiave privata del destinatario, che vive nel suo browser e non
 * è esportabile.
 *
 * ⚠️ **Il punto debole, dichiarato invece che nascosto.** La chiave pubblica su cui cifriamo
 * arriva **dal server di Novren**. Se il server mentisse restituendo un'altra chiave, chi
 * carica cifrerebbe per l'attaccante senza accorgersene: è la debolezza strutturale di ogni
 * rubrica di chiavi centralizzata (modello crittografico §5). Per questo calcoliamo
 * l'impronta **qui, dalla chiave che stiamo davvero usando** — non ci fidiamo di
 * un'impronta calcolata altrove e spedita insieme — e la mostriamo, perché il destinatario
 * possa pubblicarla e chi carica possa confrontarla.
 *
 * ── Contratto atteso dal backend ────────────────────────────────────────────────
 *   GET  /api/requests/:publicToken
 *     200 → { success, data: { title, note?, expiresAt, closed, uploadsLeft,
 *                              ownerPublicKeyJWK, ownerFingerprint } }
 *     410 → scaduta / chiusa / piena
 *   POST /api/requests/:publicToken/upload/{init,urls,complete,abort}
 * `init` accetta `turnstileToken`: se il backend ha `TURNSTILE_SECRET` impostata è
 * obbligatorio, altrimenti risponde 403. Il client lo manda **già ora**, così accendere il
 * secret non rompe nulla — è l'ordine di rollout che sul canale guest era stato documentato
 * proprio perché è facile sbagliarlo.
 * `complete` riceve `encryptedAESKey` + `encryptionIV`: la chiave del file, wrappata.
 * ────────────────────────────────────────────────────────────────────────────────
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

/** 10 MB: sopra il minimo del multipart (5 MB), tranne l'ultima parte. Come il guest. */
const CHUNK_SIZE = 10 * 1024 * 1024
const CONCURRENCY = 3

export interface RequestInfo {
  title: string
  note?: string
  expiresAt: string
  closed: boolean
  uploadsLeft: number | null
  ownerPublicKeyJWK: JsonWebKey
  /** Impronta ricalcolata **da noi** sulla chiave ricevuta, non quella dichiarata dal server. */
  fingerprint: string
}

export type UploadStatus = 'idle' | 'encrypting' | 'uploading' | 'finalizing' | 'done' | 'error'

interface Part {
  PartNumber: number
  ETag: string
}

export function useRequestUpload(publicToken: string) {
  const info = ref<RequestInfo | null>(null)
  const loadError = ref<'gone' | 'missing' | 'network' | null>(null)
  const isLoadingInfo = ref(false)

  const status = ref<UploadStatus>('idle')
  const progress = ref(0)
  const errorMessage = ref<string | null>(null)

  // Client separato: sulle PUT verso lo storage non deve finire l'header Authorization
  // dell'app (qui non c'è, ma l'interceptor globale è su `axios`) né i nostri default.
  const storageApi = axios.create()

  async function loadInfo(): Promise<void> {
    isLoadingInfo.value = true
    loadError.value = null
    try {
      const { data } = await axios.get<{ data?: Omit<RequestInfo, 'fingerprint'> }>(
        `${API_BASE_URL}/requests/${publicToken}`,
      )
      if (!data?.data) throw new Error('risposta vuota')

      // L'impronta si ricalcola sulla chiave che useremo davvero: è l'unico modo perché
      // il confronto significhi qualcosa. Un'impronta ricevuta insieme alla chiave
      // proverebbe solo che il server sa fare SHA-256.
      const fingerprint = await jwkThumbprint(data.data.ownerPublicKeyJWK)
      info.value = { ...data.data, fingerprint }
    } catch (error) {
      const httpStatus = (error as { response?: { status?: number } }).response?.status
      if (httpStatus === 410) loadError.value = 'gone'
      else if (httpStatus === 404) loadError.value = 'missing'
      else loadError.value = 'network'
    } finally {
      isLoadingInfo.value = false
    }
  }

  /**
   * Cifra e carica un file. Il progresso è sui byte accettati dallo storage: è l'unica
   * misura che non mente, perché conta ciò che è davvero uscito dal dispositivo.
   */
  async function upload(file: File, uploaderName: string, turnstileToken?: string): Promise<boolean> {
    if (!info.value) return false
    errorMessage.value = null

    try {
      status.value = 'encrypting'
      const key = await generateAESKey()
      const iv = generateIV()

      const publicKey = await importPublicKeyFromJWK(info.value.ownerPublicKeyJWK)
      const encryptedAESKey = await wrapKeyWithPublicKey(key, publicKey)

      const meta = {
        fileName: ENCRYPT_FILENAMES ? await encryptFileName(file.name, key) : file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        originalSize: file.size,
      }

      const { data: init } = await axios.post<{ uploadId: string; fileKey: string }>(
        `${API_BASE_URL}/requests/${publicToken}/upload/init`,
        { ...meta, uploaderName, turnstileToken },
      )

      const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE))
      const totalEncrypted = encryptedSizeV2(file.size, CHUNK_SIZE)
      const uploaded = new Array<Part>(totalParts)
      let sentBytes = 0
      let nextIndex = 0

      status.value = 'uploading'

      const worker = async () => {
        for (;;) {
          const index = nextIndex
          nextIndex += 1
          if (index >= totalParts) return

          const start = index * CHUNK_SIZE
          const slice = file.slice(start, Math.min(start + CHUNK_SIZE, file.size))
          const framed = await encryptChunkFramed(await slice.arrayBuffer(), key, index)
          const body = new Blob([framed])

          const { data: urls } = await axios.post<{ urls: Record<string, string> }>(
            `${API_BASE_URL}/requests/${publicToken}/upload/urls`,
            { fileKey: init.fileKey, uploadId: init.uploadId, partNumbers: [index + 1] },
          )
          const url = urls.urls[String(index + 1)]
          if (!url) throw new Error('URL della parte non disponibile')

          const response = await storageApi.put(url, body, {
            headers: { 'Content-Type': 'application/octet-stream' },
          })
          const eTag = response.headers['etag']
          if (!eTag) throw new Error('ETag mancante nella risposta di storage')

          uploaded[index] = { PartNumber: index + 1, ETag: eTag }
          sentBytes += body.size
          progress.value = Math.min(99, Math.round((sentBytes / totalEncrypted) * 100))
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, totalParts) }, () => worker()),
      )

      status.value = 'finalizing'
      await axios.post(`${API_BASE_URL}/requests/${publicToken}/upload/complete`, {
        fileKey: init.fileKey,
        uploadId: init.uploadId,
        parts: uploaded,
        uploaderName,
        encryptedAESKey,
        encryptionIV: arrayBufferToBase64(iv.buffer as ArrayBuffer),
        ...meta,
        ...(ENCRYPT_FILENAMES ? { nameVersion: FILENAME_VERSION } : {}),
        formatVersion: FILE_FORMAT_VERSION,
        chunkSize: CHUNK_SIZE,
      })

      progress.value = 100
      status.value = 'done'
      return true
    } catch (error) {
      const httpStatus = (error as { response?: { status?: number } }).response?.status
      const limit = parsePlanLimitError(error)

      // ⚠️ Qui i limiti superati sono quelli **del destinatario**, non di chi carica — e chi
      // carica è un estraneo senza account. Quindi niente numeri: dirgli quanto spazio ha
      // libero l'avvocato che gli ha mandato il link sarebbe raccontare lo stato di un
      // account altrui a chi passava di lì. Gli si dice che non è colpa sua e cosa fare.
      // Per lo stesso motivo sui limiti NON si usa il messaggio del server, che quei numeri
      // può contenerli: vale solo per gli altri casi.
      if (httpStatus === 410) {
        errorMessage.value = apiErrorMessage(error) ?? 'Questa richiesta non accetta più caricamenti.'
      } else if (limit?.code === 'QUOTA_EXCEEDED' || limit?.code === 'MONTHLY_LIMIT_EXCEEDED') {
        errorMessage.value =
          'Chi ha aperto questa richiesta non ha spazio sufficiente per ricevere il file. ' +
          'Avvisalo: potrà liberarne e allora riproverai.'
      } else if (limit) {
        errorMessage.value = 'Il file supera la dimensione ammessa da questa richiesta.'
      } else {
        errorMessage.value = apiErrorMessage(error) ?? 'Il caricamento non è riuscito. Riprova.'
      }
      status.value = 'error'
      return false
    }
  }

  return { info, isLoadingInfo, loadError, status, progress, errorMessage, loadInfo, upload }
}
