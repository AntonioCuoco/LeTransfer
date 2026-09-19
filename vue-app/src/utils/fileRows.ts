import type { DynamoDBFile, SharedFile, TableFile } from '@/src/types'

/**
 * Da record del server a riga della tabella dei file.
 *
 * Sta qui, fuori dalla pagina, perché è codice che **sbaglia in silenzio**: se legge un campo
 * che il server non manda, la tabella si disegna lo stesso e mostra «Sconosciuta» o un trattino.
 * Nessun errore, nessun test rosso, e chi guarda pensa che il dato non ci sia — mentre sul
 * server c'è eccome. È già successo due volte sulla stessa riga:
 *
 *  - la **data** si leggeva da `createdAt`, che `GET /api/shared-files` non manda: la data della
 *    condivisione viaggia come `sharedAt` (e `uploadedAt` per il file). Risultato: «Sconosciuta»
 *    su ogni file ricevuto;
 *  - la colonna **Cifrato** legge `originalFile.isEncrypted`, che nessuno impostava per i file
 *    ricevuti: mostrava «—» anche su file cifrati end-to-end, cioè dava per non protetta la
 *    proprietà su cui si regge il prodotto.
 */

/** Data breve in italiano. «Sconosciuta» solo se il record non porta davvero nessuna data. */
export function formatRowDate(iso?: string | null): string {
  if (!iso) return 'Sconosciuta'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'Sconosciuta' : date.toLocaleDateString('it-IT')
}

/**
 * La riga di un file **ricevuto** (condivisione utente→utente o caricamento su richiesta).
 *
 * @param file  il record come lo manda `GET /api/shared-files`
 * @param name  il nome già risolto: con `nameVersion: 2` è ciphertext e va decifrato altrove
 */
export function receivedFileRow(file: SharedFile, name: string): TableFile {
  // Quando è stato ricevuto: la data della condivisione, con quella del file come ripiego.
  const receivedAt = file.sharedAt || file.uploadedAt

  // Cifrato end-to-end vuol dire: la chiave del file viaggia wrappata sulle mie chiavi
  // pubbliche. Se `encryptedAESKey` c'è, quel file il server non sa aprirlo — ed è esattamente
  // ciò che la colonna dichiara.
  const isEncrypted = !!file.encryptedAESKey

  // Chi l'ha mandato. ⚠️ Da una richiesta file chi carica NON ha un account: `uploaderName` è
  // testo digitato da uno sconosciuto e non verificato. Si mostra come dichiarazione, mai come
  // identità accertata — per questo non somiglia a un'email.
  const sender = file.viaRequest
    ? (file.uploaderName || 'Nome non indicato')
    : (file.senderEmail || 'Utente sconosciuto')

  const originalFile: DynamoDBFile = {
    fileId: file.shareId,
    fileName: file.fileName,
    originalName: file.fileName,
    fileSize: String(file.fileSize),
    formattedSize: typeof file.fileSize === 'number' ? formatFileSize(file.fileSize) : String(file.fileSize),
    fileType: file.fileType,
    s3Key: file.s3Key,
    s3Url: file.s3Url,
    urlExpires: null,
    ownerUserId: file.ownerId,
    uploadedAt: receivedAt ?? '',
    isReceived: true,
    senderEmail: sender,
    senderId: file.ownerId,
    shareId: file.shareId,
    sharedAt: receivedAt,
    // I dati di cifratura viaggiano insieme al record: senza, la riga direbbe «non cifrato»
    // di un file cifrato, e il download non saprebbe come aprirlo.
    isEncrypted,
    encryptedAESKey: file.encryptedAESKey,
    encryptionIV: file.encryptionIV,
    formatVersion: file.formatVersion,
    chunkSize: file.chunkSize,
    originalSize: file.originalSize,
    nameVersion: file.nameVersion,
  }

  return {
    id: file.shareId,
    name,
    type: file.fileType || 'application/octet-stream',
    size: typeof file.fileSize === 'number' ? formatFileSize(file.fileSize) : String(file.fileSize),
    status: 'received',
    date: formatRowDate(receivedAt),
    recipient: '-',
    originalFile,
    isReceived: true,
    senderEmail: sender,
  }
}

/** Peso leggibile. Vive qui perché serve sia alla riga sia al record che le sta dentro. */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
