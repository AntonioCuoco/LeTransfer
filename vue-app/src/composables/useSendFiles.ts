import { ref } from 'vue'
import { notify } from '@/src/utils/notify'
import { useShareFile, type PreparedRecipient } from '@/src/composables/useShareFile'
import { useS3MultipartUpload } from '@/src/composables/useS3MultipartUpload'
import type { ShareFileOptions } from '@/src/types'

/**
 * «Manda a una persona»: uno o più file, a uno o più destinatari, cifrati per ciascuno.
 *
 * **Perché esiste.** Il vecchio FileSender chiamava `POST /share/send`, un endpoint che nel
 * backend non esiste: il pulsante rispondeva sempre con un errore. E anche se fosse esistito,
 * i file dal computer non venivano caricati e quelli del tuo spazio partivano senza la chiave
 * per il destinatario. Qui l'invio è costruito sugli stessi passi di «Condividi» (useShareFile)
 * e sullo stesso upload cifrato di «Carica nel tuo spazio» (useS3MultipartUpload): un solo modo
 * di condividere, non due.
 *
 * ── L'ordine conta ─────────────────────────────────────────────────────────────
 *  1. vault sbloccato e chiave presente per i file del tuo spazio — altrimenti ci si ferma
 *     subito, prima di chiedere impronte;
 *  2. ogni destinatario: chiave pubblica + verifica dell'impronta. Se uno non è pronto o non
 *     viene confermato, **non parte niente**: né upload né consegne;
 *  3. i file dal computer si caricano, cifrati, nel tuo spazio;
 *  4. ogni file a ogni destinatario, con la chiave del file chiusa nella sua chiave pubblica.
 *
 * Gli errori dei singoli passi li mostrano già upload e consegna; qui si tiene il conto.
 */

export type SendItemStatus = 'pending' | 'uploading' | 'sent' | 'partial' | 'error'

export interface SendItem {
  id: string
  name: string
  size: number | string
  /** `local` = dal computer, va prima caricato. Dopo l'upload diventa `space`. */
  source: 'space' | 'local'
  s3Key?: string
  file?: File
  status: SendItemStatus
}

export interface SendOutcome {
  /** `true` = non è partito niente (vault chiuso, chiave mancante, destinatario non confermato). */
  aborted: boolean
  /** Consegne riuscite: una per ogni coppia file × destinatario. */
  delivered: number
  failed: number
}

export function useSendFiles(options: { verifyRecipient?: ShareFileOptions['verifyRecipient'] } = {}) {
  const { ensureVaultUnlocked, getShareableKey, prepareRecipient, deliverFile } = useShareFile()
  // Un'istanza dedicata, usata un file alla volta: uploadFileAndWait lo richiede.
  const uploader = useS3MultipartUpload()
  const isSending = ref(false)

  async function send(items: SendItem[], emails: string[]): Promise<SendOutcome> {
    const outcome: SendOutcome = { aborted: false, delivered: 0, failed: 0 }
    const abort = (): SendOutcome => ({ ...outcome, aborted: true })
    if (isSending.value || items.length === 0 || emails.length === 0) return abort()

    isSending.value = true
    try {
      for (const item of items) if (item.status !== 'sent') item.status = 'pending'

      // 1. Si può consegnare? Prima di disturbare chiunque con una verifica di impronta.
      if (!ensureVaultUnlocked()) return abort()
      for (const item of items) {
        if (item.source !== 'space') continue
        if (!item.s3Key || !(await getShareableKey(item.s3Key))) {
          item.status = 'error'
          return abort()
        }
      }

      // 2. Tutti i destinatari, prima di muovere un byte.
      const recipients: PreparedRecipient[] = []
      for (const email of emails) {
        const recipient = await prepareRecipient(email, options.verifyRecipient)
        if (!recipient) {
          notify.info(`Nessun file è partito: ${email} non è pronto a ricevere o non è stato confermato.`, 'Invio annullato')
          return abort()
        }
        recipients.push(recipient)
      }

      // 3. File dal computer: cifrati e caricati nel tuo spazio, uno alla volta.
      for (const item of items) {
        if (item.source !== 'local') continue
        if (!item.file) {
          item.status = 'error'
          outcome.failed += recipients.length
          continue
        }
        item.status = 'uploading'
        const fileKey = await uploader.uploadFileAndWait(item.file)
        if (!fileKey) {
          item.status = 'error'
          outcome.failed += recipients.length
          continue
        }
        item.s3Key = fileKey
        // Ora il file è nel tuo spazio: se la consegna fallisce e si riprova, non va ricaricato.
        item.source = 'space'
      }

      // 4. Consegna: ogni file a ogni destinatario.
      for (const item of items) {
        if (item.status === 'error' || item.status === 'sent' || !item.s3Key) continue
        let delivered = 0
        for (const recipient of recipients) {
          if (await deliverFile(item.s3Key, recipient)) delivered++
        }
        outcome.delivered += delivered
        outcome.failed += recipients.length - delivered
        item.status = delivered === recipients.length ? 'sent' : delivered > 0 ? 'partial' : 'error'
      }

      return outcome
    } finally {
      isSending.value = false
    }
  }

  return { isSending, send }
}
