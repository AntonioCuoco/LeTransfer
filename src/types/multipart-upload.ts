export interface UploadPart {
    ETag: string;
    PartNumber: number;
}

export interface UploadedPart extends UploadPart {
    size: number;
}

export interface MultipartUploadConfig {
    chunkSize: number; // in bytes, default 10MB
    concurrency: number; // default 3
    apiBaseUrl: string; // Base URL for your backend API
    // Optional: Add custom headers or auth tokens getter if needed
    getAuthToken?: () => Promise<string | null>;
    userId?: string;
    userEmail?: string;
}

export type UploadStatus = 'idle' | 'initializing' | 'uploading' | 'completing' | 'completed' | 'error' | 'paused' | 'aborted';

export interface UploadProgress {
    uploadedBytes: number;
    totalBytes: number;
    percentage: number;
    speed: number; // bytes per second
    eta: number; // seconds remaining
}

export interface MultipartUploadState {
    status: UploadStatus;
    progress: UploadProgress;
    error: Error | null;
    uploadId: string | null;
    fileKey: string | null;
    // E2E Encryption state
    encryptionKey: CryptoKey | null;
    encryptionIV: Uint8Array | null;
}

// API Response Types (Contract)
export interface InitUploadResponse {
    uploadId: string;
    fileKey: string;
    // If resuming, backend might return parts already uploaded
    existingParts?: UploadedPart[];
}

export interface GetPresignedUrlsResponse {
    urls: Record<number, string>; // { 1: "url1", 2: "url2" }
}

export interface CompleteUploadResponse {
    location: string;
    key: string;
}

export interface AbortUploadResponse {
    status: string;
}
