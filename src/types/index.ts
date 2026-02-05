/**
 * Tipi centralizzati per l'applicazione LeTransfer
 */

// ==================== FILE TYPES ====================

export interface DynamoDBFile {
    fileId: string;
    fileName: string;
    originalName: string;
    fileSize: string; // Già formattata dal backend (es: "1.5 MB"), può essere chiamata sia fileSize che size
    formattedSize: string; // Già formattata dal backend (es: "1.5 MB")
    fileType: string;
    s3Key: string;
    s3Url: string | null;
    urlExpires: string | null;
    ownerUserId: string;
    uploadedAt: string;
    metadata?: Record<string, string>;
    // Campi per file condivisi
    sharedWith?: SharedRecipient[]; // Lista di utenti a cui è stato condiviso
    isShared?: boolean; // Se il file è stato condiviso
    // Campi per file ricevuti
    isReceived?: boolean; // Se il file è stato ricevuto da altri
    senderEmail?: string; // Email del mittente (per file ricevuti)
    senderId?: string; // ID del mittente
    shareId?: string; // ID della condivisione
    sharedAt?: string; // Data di condivisione
    // E2E Encryption fields
    isEncrypted?: boolean;
    encryptionIV?: string; // Base64 IV used for encryption
    encryptedAESKey?: string; // Base64 wrapped AES key (for received files)
}

export interface SharedRecipient {
    email: string;
    sharedAt: string;
    shareId: string;
}

export interface SelectedFile {
    id: string;
    name: string;
    size: string;
    type: string;
    isFromS3: boolean;
    s3Key?: string;
    file?: File;
    uploadToS3?: boolean;
    uploadStatus?: 'pending' | 'uploading' | 'success' | 'error';
    uploadError?: string;
    uploadProgress?: number;
    fileStatus?: 'active' | 'deleted' | 'sent';
    sentTo?: string[];
    sentAt?: string;
}

export interface FileToSend {
    name: string;
    size: string;
    type: string;
    s3Key?: string;
    file?: File;
}

export interface TableFile {
    id: string;
    name: string;
    type: string;
    size: string;
    status: 'uploaded' | 'downloaded' | 'sent' | 'received' | 'archived' | 'deleted';
    date: string;
    recipient?: string;
    originalFile?: DynamoDBFile;
    // Campi per la condivisione
    sharedWith?: SharedRecipient[];
    isShared?: boolean;
    isReceived?: boolean;
    senderEmail?: string;
}

// ==================== SHARE API TYPES ====================

export interface ShareFileRequest {
    s3Key: string;
    type: 'user';
    targetEmail: string;
    // E2E Encryption
    encryptedAESKey?: string;
    encryptionIV?: string;
}

export interface ShareFileResponse {
    message: string;
    shareId: string;
}

export interface SharedFile {
    shareId: string;
    s3Key: string;
    ownerId: string;
    ownerEmail?: string;
    fileName: string;
    fileSize: number | string;
    fileType: string;
    createdAt: string;
    s3Url: string;
}

export interface GetSharedFilesResponse {
    files: SharedFile[];
}

export interface SharedLink {
    id: string;
    s3Key: string;
    fileName: string;
    fileSize: string;
    fileType: string;
    publicToken: string;           // Token pubblico per l'URL
    url: string;                   // URL custom (non S3)
    isPasswordProtected: boolean;
    expiresAt: string;
    maxDownloads?: number;
    downloadCount: number;
    revokedAt: string | null;
    createdAt: string;
    ownerId?: string;
    // E2E Encryption
    isEncrypted: boolean;
}

// ==================== LINK ACCESS TYPES ====================

/**
 * Informazioni pubbliche di un link condivisibile
 * Ritornate da GET /shared-links/:publicToken
 */
export interface SharedLinkAccessInfo {
    id: string;
    fileName: string;
    fileSize: string;
    fileType: string;
    isPasswordProtected: boolean;
    expiresAt: string;
    createdAt: string;
    ownerName?: string;            // Nome del proprietario (opzionale)
}

/**
 * Richiesta di accesso a un link condivisibile
 * Inviata a POST /shared-links/:publicToken/access
 */
export interface SharedLinkAccessRequest {
    visitorName: string;
    password?: string;
}

/**
 * Risposta dopo autenticazione accesso
 * Ritornata da POST /shared-links/:publicToken/access
 */
export interface SharedLinkAccessResponse {
    success: boolean;
    sessionToken: string;          // Token di sessione per accesso file
    expiresAt: string;             // Scadenza sessione
    fileName: string;
    fileSize: string;
    fileType: string;
    previewSupported: boolean;     // true per immagini, pdf, video, audio
    downloadAllowed: boolean;
}

/**
 * Richiesta creazione nuovo link condivisibile
 * Inviata a POST /shared-links
 */
export interface CreateSharedLinkRequest {
    s3Key: string;
    fileName: string;
    fileSize: string;
    fileType: string;
    password?: string;
    expiresInHours?: number;
    maxDownloads?: number;
}

/**
 * Risposta creazione link
 * Ritornata da POST /shared-links
 */
export interface CreateSharedLinkResponse {
    success: boolean;
    data: SharedLink;
}

/**
 * Risposta download file
 * Ritornata da GET /shared-links/:publicToken/file
 */
export interface SharedLinkFileResponse {
    success: boolean;
    data: {
        url: string;               // Presigned URL S3
        expiresAt: string;
        fileName: string;
        contentType: string;
    };
}

/**
 * Errore generico API link
 */
export interface SharedLinkError {
    success: false;
    code: 'LINK_NOT_FOUND' | 'LINK_EXPIRED' | 'LINK_REVOKED' | 'INVALID_PASSWORD' | 'INVALID_SESSION' | 'DOWNLOAD_LIMIT_REACHED';
    message: string;
}

// ==================== API RESPONSE TYPES ====================

export interface LoadFilesResponse {
    success: boolean;
    files: DynamoDBFile[];
    count: number;
    nextKey: string | null;
    hasMore: boolean;
}

export interface UploadFileResponse {
    success: boolean;
    file?: DynamoDBFile;
    message?: string;
    key?: string;
    s3Key?: string;
}

export interface EmailResponse {
    success: boolean;
    data?: {
        id?: string;
        shareUrl?: string;
        downloadUrl?: string;
        recipientsCount?: number;
        filesCount?: number;
    };
    message?: string;
}

export interface ShareLinkData {
    url: string;
    previewUrl?: string;
    fileName: string;
    fileSize: string;
    uploadDate: string;
    expiresIn: string;
    fileType: string;
    recipientEmails?: string[];
    message?: string;
    emailId?: string;
    recipientsCount?: number;
    filesCount?: number;
    isMultipleEndpoint?: boolean;
}

// ==================== HOOK OPTIONS TYPES ====================

export interface LoadFilesOptions {
    limit?: number;
    lastKey?: string;
    fileType?: string;
    onlyOwned?: boolean;
}

export interface UploadFileOptions {
    onProgress?: (progress: number) => void;
    onSuccess?: (file: DynamoDBFile) => void;
    onError?: (error: Error) => void;
}

export interface DeleteFileOptions {
    onSuccess?: () => void;
    onError?: (error: Error) => void;
}

export interface SendEmailOptions {
    recipients: string[];
    files: FileToSend[];
    message?: string;
    onSuccess?: (response: EmailResponse) => void;
    onError?: (error: Error) => void;
}

export interface ShareFileOptions {
    onSuccess?: (response: ShareFileResponse) => void;
    onError?: (error: Error) => void;
}

// ==================== COMPONENT PROPS TYPES ====================

export interface FileSenderProps {
    onFileSent?: () => void;
    onLinkGenerated?: (linkData: ShareLinkData) => void;
}

export interface FilesTableProps {
    files: TableFile[];
    hideHeader?: boolean;
    onDeleteFile?: (fileId: string) => void;
    onDownloadFile?: (file: DynamoDBFile) => void;
    onShareFile?: (file: DynamoDBFile) => void;
}

// ==================== USER TYPES ====================

export interface User {
    sub: string;
    email: string;
    username?: string;
    email_verified?: boolean;
}

// ==================== STATS TYPES ====================

export interface FileStats {
    uploaded: number;
    downloaded: number;
    sent: number;
    received: number;
    archived: number;
    deleted: number;
}

// ==================== UTILITY TYPES ====================

export type FileStatus = 'active' | 'deleted' | 'sent';
export type UploadStatus = 'pending' | 'uploading' | 'success' | 'error';
export type TableFileStatus = 'uploaded' | 'sent' | 'received' | 'deleted';

// ==================== E2E ENCRYPTION TYPES ====================

export interface UserPublicKey {
    userId: string;
    email?: string;
    publicKeyJWK: JsonWebKey;
    createdAt: string;
}

export interface EncryptionKeyData {
    key: string; // Base64 encoded AES key
    iv: string; // Base64 encoded IV
}

export interface WrappedKeyData {
    s3Key: string;
    wrappedKey: string; // Base64 wrapped AES key
    fileIV: string;    // Base64 IV used for file encryption
    wrapIV: string;    // Base64 IV used for key wrapping
}

// ==================== NEW E2E API TYPES ====================

// Recovery Key Setup
export interface SetupRecoveryKeyRequest {
    salt: string; // Base64
    verificationHash: string; // Base64
}

export interface VerifyRecoveryKeyRequest {
    verificationHash: string; // Base64
}

export interface UserRecoveryKeyStatus {
    hasRecoveryKey: boolean;
    salt?: string; // Base64 (if configured)
    verificationHash?: string; // Base64 (if configured)
}

// File Keys API
export interface SaveFileKeyRequest extends WrappedKeyData { }

export interface GetFileKeysResponse {
    keys: WrappedKeyData[];
    count: number;
}
