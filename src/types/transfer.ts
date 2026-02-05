export type TransferType = 'upload' | 'download';
export type TransferStatus = 'queued' | 'initializing' | 'uploading' | 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';

export interface TransferProgress {
    percentage: number;
    loadedBytes: number;
    totalBytes: number;
    speed?: number; // bytes per second
    eta?: number; // seconds remaining
}

export interface TransferControl {
    pause: () => void;
    resume: () => void;
    cancel: () => void;
}

export interface TransferItem {
    id: string;
    type: TransferType;
    name: string;
    size?: number;
    mimeType?: string;
    status: TransferStatus;
    progress: TransferProgress;
    error?: Error | null;
    fileOrUrl: File | string; // File for upload, URL for download
    resultKey?: string; // S3 Key after upload
    controls?: TransferControl; // Function references to control the specific transfer
    createdAt: number;
}

export interface TransferContextType {
    transfers: TransferItem[];
    addUpload: (file: File) => string;
    addDownload: (url: string, fileName: string, fileSize?: number) => string;
    pauseTransfer: (id: string) => void;
    resumeTransfer: (id: string) => void;
    cancelTransfer: (id: string) => void;
    clearCompleted: () => void;
    // Internal use for runners
    updateTransfer: (id: string, updates: Partial<TransferItem>) => void;
    registerControls: (id: string, controls: TransferControl) => void;
}
