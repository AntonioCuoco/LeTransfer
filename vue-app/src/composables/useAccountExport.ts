import { ref } from 'vue'
import axios from 'axios'
import { downloadZip } from 'client-zip'
import { useEncryptionStore } from '@/src/stores/encryption'
import {
  decryptToStream,
  supportsStreamingToDisk,
  shouldWarnLargeDownload,
} from '@/src/crypto/streamingDownload'
import { decryptFile, importKeyFromBase64, importIVFromBase64 } from '@/src/crypto/crypto'
import { resolveFileName } from '@/src/utils/fileNames'
import { apiErrorMessage } from '@/src/utils/apiError'
import type { DynamoDBFile } from '@/src/types'

/**
 * «Scarica tutto» — portabilità dei dati (GDPR art. 20).
 *
 * **Perché esiste, oltre all'obbligo.** È la contromisura all'irreversibilità della
 * cancellazione: avendo scelto la distruzione crittografica immediata (nessun periodo di
 * grazia), l'unica cosa onesta è offrire prima di portarsi via tutto. Il dialogo di
 * cancellazione dice «scaricali prima di procedere», e finché questa funzione non esiste
 * quella frase chiede all'utente di scaricare i file **uno alla volta**.
 *
 * **Come funziona.** È lo specchio esatto dell'invio multi-file di `guestUpload`: lì i
 * file vengono impacchettati in uno zip in streaming *e poi cifrati*; qui vengono
 * *decifrati* e impacchettati, sempre in streaming. Stessa libreria, stessa proprietà —
 * l'archivio non sta mai in RAM.
 *
 * ⚠️ **Il generatore è pigro, ed è il punto.** `downloadZip` riceve un async generator,
 * non un array: così la richiesta di rete di un file parte **solo quando lo zip arriva a
 * quel file**. Con un array, tutti gli stream nascerebbero insieme — N connessioni
 * aperte, N decifrature in volo, e la contropressione dello zip resa inutile.
 *
 * Il generatore pigro risolve anche un problema che altrimenti sarebbe grave: le URL
 * firmate scadono dopo un'ora, e un export di molti GB dura più di un'ora. Chiedendo
 * l'URL nell'istante in cui serve, non scade mai a metà.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

export type ExportPhase = 'idle' | 'listing' | 'archiving' | 'done' | 'cancelled' | 'error'

export interface SkippedFile {
  fileName: string
  reason: 'chiave non disponibile' | 'non scaricabile'
}

export interface ExportBlocker {
  /** `locked` = le chiavi non sono sbloccate; `empty` = non c'è niente da esportare. */
  kind: 'locked' | 'empty'
  message: string
}

/** Nome dell'archivio: datato, così due export non si sovrascrivono nella cartella Download. */
function archiveName(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `novren-export-${today}.zip`
}

export function useAccountExport() {
  const encryptionStore = useEncryptionStore()

  const phase = ref<ExportPhase>('idle')
  const filesTotal = ref(0)
  const filesDone = ref(0)
  const currentFile = ref<string | null>(null)
  const skipped = ref<SkippedFile[]>([])
  const errorMessage = ref<string | null>(null)

  let cancelled = false

  /**
   * Tutti i file **posseduti**. Quelli ricevuti da altri restano fuori di proposito:
   * l'art. 20 riguarda i dati che hai fornito tu, e un file che ti ha mandato qualcun
   * altro è un dato suo, che ti è stato reso accessibile.
   */
  async function listOwnedFiles(): Promise<DynamoDBFile[]> {
    const all: DynamoDBFile[] = []
    let lastKey: string | null = null

    do {
      const params: Record<string, string | number | boolean> = { limit: 100, onlyOwned: true }
      if (lastKey) params.lastKey = lastKey
      const { data } = await axios.get<{ files?: DynamoDBFile[]; nextKey?: string | null }>(
        `${API_BASE_URL}/user/files/dynamo`,
        { params },
      )
      all.push(...(data.files ?? []).filter((f) => !f.isReceived))
      lastKey = data.nextKey ?? null
    } while (lastKey && !cancelled)

    return all
  }

  /**
   * URL firmata fresca per un singolo file. Chiamiamo l'endpoint direttamente invece di
   * `usePresignedUrl`, che su errore apre una finestra modale: in un'operazione su N file
   * significherebbe N finestre in fila. Qui gli errori si contano e si riassumono alla fine.
   */
  async function freshUrl(s3Key: string): Promise<string | null> {
    try {
      const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
      const { data } = await axios.get<{ url: string }>(`${base}/file-url`, {
        params: { key: s3Key, download: true, expires: 3600 },
      })
      return data.url ?? null
    } catch {
      return null
    }
  }

  /** Il nome con cui il file entra nell'archivio. */
  async function exportName(file: DynamoDBFile): Promise<string> {
    const keyData = await encryptionStore.getKey(file.s3Key)
    return (
      (await resolveFileName(file, keyData ? await importKeyFromBase64(keyData.key) : null)) ||
      file.s3Key.split('/').pop() ||
      'file'
    )
  }

  /** Il chiaro di un file, come stream (v2) o come Blob (v1 legacy). */
  async function plaintextOf(file: DynamoDBFile): Promise<ReadableStream<Uint8Array> | Blob | null> {
    const url = await freshUrl(file.s3Key)
    if (!url) return null

    const keyData = await encryptionStore.getKey(file.s3Key)
    if (!keyData) return null

    // Formato v2: decifratura a chunk, RAM costante.
    if (file.formatVersion === 2 && file.chunkSize && file.originalSize != null) {
      const key = await importKeyFromBase64(keyData.key)
      return decryptToStream({
        url,
        key,
        chunkSize: file.chunkSize,
        originalSize: file.originalSize,
      })
    }

    // Formato v1 legacy: un unico blob GCM, quindi per forza tutto in memoria. Accettabile
    // perché sono file vecchi e non se ne producono più, ma è il motivo per cui un export
    // fatto di soli file v1 può pesare in RAM quanto il più grande di essi.
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const key = await importKeyFromBase64(keyData.key)
    const iv = importIVFromBase64(keyData.iv)
    return decryptFile(blob, key, iv)
  }

  /** Le voci dell'archivio, prodotte una alla volta man mano che lo zip le consuma. */
  async function* entries(files: DynamoDBFile[]) {
    for (const file of files) {
      if (cancelled) return
      currentFile.value = file.fileName

      let plain: ReadableStream<Uint8Array> | Blob | null = null
      try {
        plain = await plaintextOf(file)
      } catch {
        plain = null
      }

      if (!plain) {
        skipped.value = [
          ...skipped.value,
          { fileName: file.fileName, reason: 'chiave non disponibile' },
        ]
        filesDone.value += 1
        continue
      }

      // Il nome dentro lo zip: con `nameVersion: 2` quello del record è ciphertext, e un
      // archivio pieno di file chiamati base64 sarebbe inutilizzabile proprio nel momento in
      // cui serve — prima di cancellare l'account.
      const entryName = await exportName(file)

      yield {
        name: `file/${entryName}`,
        input: plain,
        lastModified: file.uploadedAt ? new Date(file.uploadedAt) : undefined,
      }
      filesDone.value += 1
    }

    // Un indice leggibile a macchina: è la parte che rende l'export "portabile" e non solo
    // "una cartella di file". Va in coda perché solo ora sappiamo cosa è stato saltato.
    yield {
      name: 'contenuto.json',
      input: JSON.stringify(
        {
          esportatoIl: new Date().toISOString(),
          file: files.map((f) => ({
            nome: f.fileName,
            nomeCifrato: f.nameVersion === 2 || undefined,
            dimensione: f.fileSize,
            tipo: f.fileType,
            caricatoIl: f.uploadedAt,
          })),
          nonEsportati: skipped.value,
        },
        null,
        2,
      ),
    }
  }

  /** Scrive l'archivio su disco, in streaming dove il browser lo permette. */
  async function writeArchive(stream: ReadableStream<Uint8Array>): Promise<boolean> {
    if (supportsStreamingToDisk()) {
      const picker = (window as unknown as {
        showSaveFilePicker: (o: unknown) => Promise<FileSystemFileHandle>
      }).showSaveFilePicker
      const handle = await picker({
        suggestedName: archiveName(),
        types: [{ description: 'Archivio ZIP', accept: { 'application/zip': ['.zip'] } }],
      })
      const writable = await handle.createWritable()
      await stream.pipeTo(writable)
      return true
    }

    // Ripiego: l'archivio intero passa dalla RAM. È il motivo dell'avviso in `startExport`.
    const parts: BlobPart[] = []
    const reader = stream.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) parts.push(value)
    }
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/zip' }))
    const a = document.createElement('a')
    a.href = url
    a.download = archiveName()
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  }

  /**
   * Verifica che l'export sia possibile **prima** di mostrarlo come disponibile: senza le
   * chiavi sbloccate non si decifra nulla, e scoprirlo a metà sarebbe peggio.
   */
  function blocker(): ExportBlocker | null {
    if (!encryptionStore.isUnlocked) {
      return {
        kind: 'locked',
        message:
          'Per esportare i file serve sbloccare le tue chiavi: senza, nemmeno noi possiamo decifrarli.',
      }
    }
    return null
  }

  async function startExport(): Promise<void> {
    cancelled = false
    skipped.value = []
    errorMessage.value = null
    filesDone.value = 0
    filesTotal.value = 0
    currentFile.value = null

    try {
      phase.value = 'listing'
      const files = await listOwnedFiles()
      filesTotal.value = files.length

      if (files.length === 0) {
        phase.value = 'done'
        return
      }

      phase.value = 'archiving'
      const zipStream = downloadZip(entries(files)).body
      if (!zipStream) throw new Error('Archivio non disponibile su questo browser')

      await writeArchive(zipStream)
      phase.value = cancelled ? 'cancelled' : 'done'
    } catch (err) {
      // L'utente che chiude il selettore di file non è un errore: è un ripensamento.
      if ((err as { name?: string }).name === 'AbortError') {
        phase.value = 'idle'
        return
      }
      // Prima il testo del server; poi il nostro, se l'errore l'abbiamo lanciato noi
      // (es. «Archivio non disponibile»). Mai quello tecnico di axios.
      const isHttp = (err as { isAxiosError?: boolean }).isAxiosError === true
      errorMessage.value =
        apiErrorMessage(err) ??
        (!isHttp && err instanceof Error && err.message ? err.message : 'Non siamo riusciti a creare l’archivio.')
      phase.value = 'error'
    } finally {
      currentFile.value = null
    }
  }

  function cancel() {
    cancelled = true
  }

  return {
    phase,
    filesTotal,
    filesDone,
    currentFile,
    skipped,
    errorMessage,
    blocker,
    startExport,
    cancel,
    /** Vero quando il ripiego in RAM rischia di non farcela: serve ad avvisare prima. */
    warnsOnSize: (totalBytes: number) =>
      !supportsStreamingToDisk() && shouldWarnLargeDownload(totalBytes),
  }
}
