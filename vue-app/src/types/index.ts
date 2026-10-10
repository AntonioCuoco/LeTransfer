export * from './waitlist'
export * from './transfer'

// ==================== FILE TYPES ====================

export interface DynamoDBFile {
  fileId: string
  /** File di un account free: quando sparisce (ISO). Assente = non scade. */
  expiresAt?: string
  fileName: string
  originalName: string
  fileSize: string
  formattedSize: string
  fileType: string
  s3Key: string
  s3Url: string | null
  urlExpires: string | null
  ownerUserId: string
  uploadedAt: string
  metadata?: Record<string, string>
  sharedWith?: SharedRecipient[]
  isShared?: boolean
  isReceived?: boolean
  senderEmail?: string
  senderId?: string
  shareId?: string
  sharedAt?: string
  isEncrypted?: boolean
  encryptionIV?: string
  encryptedAESKey?: string
  // Formato del contenuto cifrato (#6): 2 = a chunk/streaming. Assente o 1 = legacy (unico blob GCM).
  formatVersion?: number
  chunkSize?: number
  originalSize?: number
  /** O2.2 — 2 = `fileName` è ciphertext, apribile con la chiave del file. Assente/1 = in chiaro. */
  nameVersion?: number
}

export interface SharedRecipient {
  email: string
  sharedAt: string
  shareId: string
}

export interface SelectedFile {
  id: string
  name: string
  size: string
  type: string
  isFromS3: boolean
  s3Key?: string
  file?: File
  uploadToS3?: boolean
  uploadStatus?: 'pending' | 'uploading' | 'success' | 'error'
  uploadError?: string
  uploadProgress?: number
  fileStatus?: 'active' | 'deleted' | 'sent'
  sentTo?: string[]
  sentAt?: string
}

export interface FileToSend {
  name: string
  size: string
  type: string
  s3Key?: string
  file?: File
}

export interface TableFile {
  id: string
  name: string
  type: string
  size: string
  status: 'uploaded' | 'downloaded' | 'sent' | 'received' | 'archived' | 'deleted'
  date: string
  /** File di un account free: «scade il 12 ott». Assente = non scade. */
  expires?: string
  recipient?: string
  originalFile?: DynamoDBFile
  sharedWith?: SharedRecipient[]
  isShared?: boolean
  isReceived?: boolean
  senderEmail?: string
}

// ==================== SHARE API TYPES ====================

export interface ShareFileRequest {
  s3Key: string
  type: 'user'
  targetEmail: string
  encryptedAESKey?: string
  encryptionIV?: string
}

export interface ShareFileResponse {
  message: string
  shareId: string
}

export interface SharedFile {
  shareId: string
  s3Key: string
  ownerId: string
  /**
   * Email di chi ha condiviso, risolta dal server. ⚠️ Il campo si chiama così, **non**
   * `ownerEmail`: leggerlo con l'altro nome mostrava «Utente sconosciuto» su ogni riga.
   * `null` per i caricamenti su richiesta: chi carica non ha un account.
   */
  senderEmail?: string | null
  fileName: string
  fileSize: number | string
  fileType: string
  /**
   * Quando il file è stato condiviso con me. ⚠️ `GET /api/shared-files` lo manda come
   * `sharedAt` e **non manda `createdAt`**: leggerlo con quel nome faceva comparire
   * «Sconosciuta» nella colonna Data di ogni file ricevuto.
   */
  sharedAt: string
  /** Quando il file è stato caricato: ripiego per la data, e dato a sé per i file legacy. */
  uploadedAt?: string
  s3Url: string
  // Presenti se il file è cifrato E2E: la file key AES wrappata con la MIA chiave pubblica RSA.
  encryptedAESKey?: string
  encryptionIV?: string
  // Formato del contenuto cifrato (#6): 2 = a chunk/streaming. Assente o 1 = legacy.
  formatVersion?: number
  chunkSize?: number
  originalSize?: number
  // Arrivato da una richiesta file (O2.1): chi ha caricato non ha un account, quindi
  // `ownerEmail` è assente per costruzione e l'unica provenienza è il nome che ha digitato.
  // Non è verificato: va mostrato come dichiarazione, mai come identità accertata.
  viaRequest?: boolean
  uploaderName?: string
  /** O2.2 — 2 = `fileName` è ciphertext, apribile con la chiave del file. Assente/1 = in chiaro. */
  nameVersion?: number
}

export interface GetSharedFilesResponse {
  files: SharedFile[]
}

export interface SharedLink {
  id: string
  s3Key: string
  fileName: string
  fileSize: string
  fileType: string
  publicToken: string
  url: string
  isPasswordProtected: boolean
  expiresAt: string
  maxDownloads?: number
  downloadCount: number
  revokedAt: string | null
  createdAt: string
  ownerId?: string
  isEncrypted: boolean
  /** O2.2 — 2 = `fileName` è ciphertext, apribile con la chiave del file. Assente/1 = in chiaro. */
  nameVersion?: number
}

export interface SharedLinkAccessInfo {
  id: string
  fileName: string
  fileSize: string
  fileType: string
  isPasswordProtected: boolean
  expiresAt: string
  createdAt: string
  ownerName?: string
  // Formato del contenuto cifrato (#6): 2 = a chunk/streaming. Assente o 1 = legacy.
  formatVersion?: number
  chunkSize?: number
  originalSize?: number
  /** O2.2 — 2 = `fileName` è ciphertext, apribile con la chiave del frammento. Assente/1 = in chiaro. */
  nameVersion?: number
}

export interface SharedLinkAccessRequest {
  visitorName: string
  password?: string
}

export interface SharedLinkAccessResponse {
  success: boolean
  sessionToken: string
  expiresAt: string
  fileName: string
  fileSize: string
  fileType: string
  previewSupported: boolean
  downloadAllowed: boolean
}

export interface CreateSharedLinkRequest {
  s3Key: string
  fileName: string
  fileSize: string
  fileType: string
  password?: string
  expiresInHours?: number
  maxDownloads?: number
}

export interface CreateSharedLinkResponse {
  success: boolean
  data: SharedLink
}

export interface SharedLinkFileResponse {
  success: boolean
  data: {
    url: string
    expiresAt: string
    fileName: string
    contentType: string
  }
}

export interface SharedLinkError {
  success: false
  code?: 'LINK_NOT_FOUND' | 'LINK_EXPIRED' | 'LINK_REVOKED' | 'INVALID_PASSWORD' | 'INVALID_SESSION' | 'DOWNLOAD_LIMIT_REACHED' | 'SECRET_ALREADY_READ'
  errorCode?: string
  message?: string
}

// ==================== API RESPONSE TYPES ====================

export interface LoadFilesResponse {
  success: boolean
  files: DynamoDBFile[]
  count: number
  nextKey: string | null
  hasMore: boolean
}

export interface UploadFileResponse {
  success: boolean
  file?: DynamoDBFile
  message?: string
  key?: string
  s3Key?: string
}

export interface EmailResponse {
  success: boolean
  data?: {
    id?: string
    shareUrl?: string
    downloadUrl?: string
    recipientsCount?: number
    filesCount?: number
  }
  message?: string
}

export interface ShareLinkData {
  url: string
  previewUrl?: string
  fileName: string
  fileSize: string
  uploadDate: string
  expiresIn: string
  fileType: string
  recipientEmails?: string[]
  message?: string
  emailId?: string
  recipientsCount?: number
  filesCount?: number
  isMultipleEndpoint?: boolean
}

// ==================== HOOK OPTIONS TYPES ====================

export interface LoadFilesOptions {
  limit?: number
  lastKey?: string
  fileType?: string
  onlyOwned?: boolean
}

export interface DeleteFileOptions {
  onSuccess?: () => void
  onError?: (error: Error) => void
}

export interface SendEmailOptions {
  recipients: string[]
  files: FileToSend[]
  message?: string
  onSuccess?: (response: EmailResponse) => void
  onError?: (error: Error) => void
}

export interface ShareFileOptions {
  onSuccess?: (response: ShareFileResponse) => void
  onError?: (error: Error) => void
  /**
   * Gancio di verifica del destinatario (roadmap F2): viene chiamato con le chiavi
   * pubbliche appena scaricate (RSA e, se c'è, X-Wing), PRIMA di wrapparci dentro la
   * chiave del file. Se risolve `false` la condivisione si interrompe senza consegnare nulla.
   */
  verifyRecipient?: (recipient: import('@/src/crypto/hybrid').RecipientPublicKeys, targetEmail: string) => Promise<boolean>
}

// ==================== COMPONENT PROPS TYPES ====================

export interface FileSenderProps {
  onFileSent?: () => void
  onLinkGenerated?: (linkData: ShareLinkData) => void
}

export interface FilesTableProps {
  files: TableFile[]
  hideHeader?: boolean
  onDeleteFile?: (fileId: string) => void
  onDownloadFile?: (file: DynamoDBFile) => void
  onShareFile?: (file: DynamoDBFile) => void
}

// ==================== USER TYPES ====================

export interface User {
  sub: string
  email: string
  username?: string
  email_verified?: boolean
}

// ==================== STATS TYPES ====================

export interface FileStats {
  uploaded: number
  downloaded: number
  sent: number
  received: number
  archived: number
  deleted: number
}

// ==================== UTILITY TYPES ====================

export type FileStatus = 'active' | 'deleted' | 'sent'
export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error'
export type TableFileStatus = 'uploaded' | 'sent' | 'received' | 'deleted'

// ==================== E2E ENCRYPTION TYPES ====================

export interface UserPublicKey {
  userId: string
  email?: string
  publicKeyJWK: JsonWebKey
  createdAt: string
}

export interface EncryptionKeyData {
  key: string
  iv: string
}

export interface WrappedKeyData {
  s3Key: string
  wrappedKey: string
  fileIV: string
  wrapIV: string
}

export interface SetupRecoveryKeyRequest {
  salt: string
  verificationHash: string
}

export interface VerifyRecoveryKeyRequest {
  verificationHash: string
}

export interface UserRecoveryKeyStatus {
  hasRecoveryKey: boolean
  salt?: string
  verificationHash?: string
}

export type SaveFileKeyRequest = WrappedKeyData

export interface GetFileKeysResponse {
  keys: WrappedKeyData[]
  count: number
}
