import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { message } from 'antd';
import {
    MultipartUploadConfig,
    MultipartUploadState,
    UploadedPart,
    InitUploadResponse,
    GetPresignedUrlsResponse,
    CompleteUploadResponse
} from '../types/multipart-upload';
import {
    generateAESKey,
    encryptFile,
    exportKeyToBase64,
    exportIVToBase64
} from '../utils/crypto';
import { useEncryptionOptional } from '../contexts/EncryptionContext';

const DEFAULT_CONFIG: MultipartUploadConfig = {
    chunkSize: 10 * 1024 * 1024, // 10MB default
    concurrency: 3,
    apiBaseUrl: '/api' // Adjust as needed
};

interface PendingPart {
    partNumber: number;
    chunk: Blob;
    retries: number;
}

export const useS3MultipartUpload = (config: Partial<MultipartUploadConfig> = {}) => {
    // Ensure concurrency has a fallback if undefined is passed explicitly
    const finalConfig = {
        ...DEFAULT_CONFIG,
        ...config,
        concurrency: config.concurrency || DEFAULT_CONFIG.concurrency
    };

    const encryption = useEncryptionOptional();

    const [state, setState] = useState<MultipartUploadState>({
        status: 'idle',
        progress: { uploadedBytes: 0, totalBytes: 0, percentage: 0, speed: 0, eta: 0 },
        error: null,
        uploadId: null,
        fileKey: null,
        encryptionKey: null,
        encryptionIV: null
    });

    const abortControllerRef = useRef<AbortController | null>(null);
    const partsQueueRef = useRef<PendingPart[]>([]);
    const uploadedPartsRef = useRef<UploadedPart[]>([]);
    const activeUploadsRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    const fileRef = useRef<File | null>(null);
    const pauseRef = useRef<boolean>(false);

    const activePartsProgressRef = useRef<{ [key: number]: number }>({});

    // Refs for encryption data - needed because completeMultipartUpload runs asynchronously
    // and would otherwise capture stale state values (classic React closure issue)
    const encryptionKeyRef = useRef<CryptoKey | null>(null);
    const encryptionIVRef = useRef<Uint8Array | null>(null);

    // Helpers for API calls
    const getHeaders = async () => {
        const token = finalConfig.getAuthToken ? await finalConfig.getAuthToken() : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const api = axios.create({
        baseURL: finalConfig.apiBaseUrl,
    });

    const updateProgress = useCallback((uploadedBytes: number, totalBytes: number) => {
        const now = Date.now();
        const timeElapsed = (now - startTimeRef.current) / 1000; // seconds
        const bytesSinceStart = uploadedBytes; // simplistic speed calc
        const speed = timeElapsed > 0 ? bytesSinceStart / timeElapsed : 0;
        const remainingBytes = totalBytes - uploadedBytes;
        const eta = speed > 0 ? remainingBytes / speed : 0;

        setState(prev => ({
            ...prev,
            progress: {
                uploadedBytes,
                totalBytes,
                percentage: Math.min(100, (uploadedBytes / totalBytes) * 100),
                speed,
                eta
            }
        }));
    }, []);

    const calculateTotalProgress = useCallback(() => {
        const completedBytes = uploadedPartsRef.current.reduce((acc, p) => acc + p.size, 0);
        const activeBytes = Object.values(activePartsProgressRef.current).reduce((acc, bytes) => acc + bytes, 0);
        return completedBytes + activeBytes;
    }, []);

    const processQueue = useCallback(async (context?: { uploadId: string, fileKey: string }) => {
        if (pauseRef.current || abortControllerRef.current?.signal.aborted) return;
        if (state.status === 'error') return;

        // Use passed context OR state (for resumes)
        const currentUploadId = context?.uploadId || state.uploadId;
        const currentFileKey = context?.fileKey || state.fileKey;

        // Check if done
        if (partsQueueRef.current.length === 0 && activeUploadsRef.current === 0) {
            // All parts uploaded
            await completeMultipartUpload(currentUploadId || undefined, currentFileKey || undefined);
            return;
        }

        while (activeUploadsRef.current < finalConfig.concurrency && partsQueueRef.current.length > 0) {
            const part = partsQueueRef.current.shift();
            if (!part) break;

            if (!currentUploadId || !currentFileKey) {
                message.error('Errore interno durante l\'upload');
                return;
            }

            activeUploadsRef.current++;
            /* eslint-disable-next-line @typescript-eslint/no-use-before-define */
            uploadPart(part, currentUploadId, currentFileKey).catch(async (err) => {
                activeUploadsRef.current--;
                delete activePartsProgressRef.current[part.partNumber]; // Cleanup on error
                // Simple retry logic
                if (part.retries < 3 && !abortControllerRef.current?.signal.aborted) {
                    part.retries++;
                    partsQueueRef.current.unshift(part); // Put back in front
                    processQueue(context);
                } else {
                    handleError(new Error(`Failed to upload part ${part.partNumber} after retries`));
                }
            });
        }
    }, [state.status, state.uploadId, state.fileKey, finalConfig.concurrency]); // eslint-disable-line react-hooks/exhaustive-deps

    const uploadPart = async (part: PendingPart, uploadId: string, fileKey: string) => {
        // 1. Get Presigned URL for this part
        const headers = await getHeaders();
        const { data } = await api.post<GetPresignedUrlsResponse>('/upload/multipart/urls', {
            fileKey: fileKey,
            uploadId: uploadId,
            partNumbers: [part.partNumber]
        }, { headers });

        const url = data.urls[part.partNumber];
        if (!url) throw new Error(`No presigned URL for part ${part.partNumber}`);

        // 2. Upload to S3
        // Use a fresh axios instance to avoid global interceptors adding Authorization headers
        // which breaks S3 presigned URLs.
        const s3Api = axios.create();

        const response = await s3Api.put(url, part.chunk, {
            headers: { 'Content-Type': fileRef.current?.type || 'application/octet-stream' },
            onUploadProgress: (progressEvent) => {
                // Update local progress for this part
                if (progressEvent.total) { // activePartsProgressRef handles this safely
                    activePartsProgressRef.current[part.partNumber] = progressEvent.loaded;
                    const totalUploaded = calculateTotalProgress();
                    updateProgress(totalUploaded, fileRef.current?.size || 0);
                }
            },
            signal: abortControllerRef.current?.signal
        });

        // 3. Store ETag
        // ETag is usually usually surrounded by quotes in header.
        // For CompleteMultipartUpload, S3 expects the ETag exactly as returned (including quotes).
        const eTag = response.headers['etag'];

        if (!eTag) throw new Error("Missing ETag from S3 response");

        // Remove from active progress map as it is now completed
        delete activePartsProgressRef.current[part.partNumber];

        uploadedPartsRef.current.push({
            PartNumber: part.partNumber,
            ETag: eTag,
            size: part.chunk.size
        });

        activeUploadsRef.current--;

        // Update progress one last time for this part completion (ensure we rely on fixed size now)
        const totalUploaded = calculateTotalProgress();
        updateProgress(totalUploaded, fileRef.current?.size || 0);

        // Continue queue
        // We must pass the SAME context down to keep it alive
        processQueue({ uploadId, fileKey });
    };

    const completeMultipartUpload = async (uploadId?: string, fileKey?: string) => {
        const finalUploadId = uploadId || state.uploadId;
        const finalFileKey = fileKey || state.fileKey;

        if (!finalUploadId || !finalFileKey) {
            return;
        }

        setState(prev => ({ ...prev, status: 'completing' }));

        try {
            // Sort parts by number (required by S3)
            const sortedParts = uploadedPartsRef.current.sort((a, b) => a.PartNumber - b.PartNumber);
            const headers = await getHeaders();

            await api.post<CompleteUploadResponse>('/upload/multipart/complete', {
                fileKey: finalFileKey,
                uploadId: finalUploadId,
                parts: sortedParts.map(p => ({ PartNumber: p.PartNumber, ETag: p.ETag })),
                // Metadata for DynamoDB Sync
                fileName: fileRef.current?.name,
                fileSize: fileRef.current?.size,
                fileType: fileRef.current?.type,
                userId: finalConfig.userId,
                userEmail: finalConfig.userEmail
            }, { headers });

            // Store encryption key in context for sharing
            // Use refs instead of state to avoid stale closure issues
            const currentEncryptionKey = encryptionKeyRef.current;
            const currentEncryptionIV = encryptionIVRef.current;

            if (currentEncryptionKey && currentEncryptionIV && encryption) {
                try {
                    const keyBase64 = await exportKeyToBase64(currentEncryptionKey);
                    const ivBase64 = exportIVToBase64(currentEncryptionIV);
                    await encryption.storeKey(finalFileKey, { key: keyBase64, iv: ivBase64 });
                } catch (e) {
                    message.error('Errore nel salvataggio della chiave di cifratura');
                }
            }

            setState(prev => ({ ...prev, status: 'completed', percentage: 100 }));
        } catch (err: any) {
            handleError(err);
        }
    };

    const handleError = (error: Error) => {
        message.error('Errore durante l\'upload del file');
        setState(prev => ({ ...prev, status: 'error', error }));
        abortControllerRef.current?.abort();
    };

    const uploadFile = useCallback(async (file: File) => {
        if (state.status === 'uploading' || state.status === 'initializing') {
            return;
        }

        fileRef.current = file;
        abortControllerRef.current = new AbortController();
        partsQueueRef.current = [];
        uploadedPartsRef.current = [];
        activePartsProgressRef.current = {};
        activeUploadsRef.current = 0;
        startTimeRef.current = Date.now();
        pauseRef.current = false;

        setState({
            status: 'initializing',
            progress: { uploadedBytes: 0, totalBytes: file.size, percentage: 0, speed: 0, eta: 0 },
            error: null,
            uploadId: null,
            fileKey: null,
            encryptionKey: null,
            encryptionIV: null
        });

        try {
            // 1. E2E Encryption - Generate key and encrypt file
            const encryptionKey = await generateAESKey();
            const { encrypted: encryptedBlob, iv: encryptionIV } = await encryptFile(file, encryptionKey);

            // Store encryption data in state for later use (link generation)
            // Also store in refs to avoid stale closure issues in completeMultipartUpload
            encryptionKeyRef.current = encryptionKey;
            encryptionIVRef.current = encryptionIV;

            setState(prev => ({
                ...prev,
                encryptionKey,
                encryptionIV
            }));

            // 2. Initialize multipart upload with encrypted file size
            const headers = await getHeaders();
            const { data: initData } = await api.post<InitUploadResponse>('/upload/multipart/init', {
                fileName: file.name,
                fileType: file.type,
                fileSize: encryptedBlob.size, // Use encrypted size
                originalSize: file.size, // Keep original size for display
                isEncrypted: true,
                userId: finalConfig.userId
            }, { headers });

            setState(prev => ({
                ...prev,
                status: 'uploading',
                uploadId: initData.uploadId,
                fileKey: initData.fileKey
            }));

            // Handle Resume if existingParts provided
            const existingPartNumbers = new Set((initData.existingParts || []).map(p => p.PartNumber));
            if (initData.existingParts) {
                uploadedPartsRef.current = initData.existingParts;

                // Update progress based on resumed parts
                const totalUploaded = calculateTotalProgress();
                updateProgress(totalUploaded, encryptedBlob.size);
            }

            // 3. Chunking the ENCRYPTED blob (not original file)
            const totalParts = Math.ceil(encryptedBlob.size / finalConfig.chunkSize);
            for (let i = 0; i < totalParts; i++) {
                const partNumber = i + 1;
                if (existingPartNumbers.has(partNumber)) continue; // Skip existing

                const start = i * finalConfig.chunkSize;
                const end = Math.min(start + finalConfig.chunkSize, encryptedBlob.size);
                const chunk = encryptedBlob.slice(start, end);

                partsQueueRef.current.push({
                    partNumber,
                    chunk,
                    retries: 0
                });
            }

            // 4. Start Processing
            processQueue({ uploadId: initData.uploadId, fileKey: initData.fileKey });

        } catch (err: any) {
            handleError(err);
        }
    }, [finalConfig.chunkSize, finalConfig.concurrency]); // eslint-disable-line react-hooks/exhaustive-deps

    const pauseUpload = useCallback(() => {
        if (state.status === 'uploading') {
            pauseRef.current = true;
            setState(prev => ({ ...prev, status: 'paused' }));
        }
    }, [state.status]);

    const resumeUpload = useCallback(() => {
        if (state.status === 'paused') {
            pauseRef.current = false;
            setState(prev => ({ ...prev, status: 'uploading' }));
            processQueue();
        }
    }, [state.status, processQueue]);

    const resetUpload = useCallback(() => {
        setState({
            status: 'idle',
            progress: { uploadedBytes: 0, totalBytes: 0, percentage: 0, speed: 0, eta: 0 },
            error: null,
            uploadId: null,
            fileKey: null,
            encryptionKey: null,
            encryptionIV: null
        });
        fileRef.current = null;
        abortControllerRef.current = null;
        partsQueueRef.current = [];
        uploadedPartsRef.current = [];
        activePartsProgressRef.current = {};
        activeUploadsRef.current = 0;
        encryptionKeyRef.current = null;
        encryptionIVRef.current = null;
    }, []);

    const abortUpload = useCallback(async () => {
        abortControllerRef.current?.abort();
        if (state.uploadId && state.fileKey) {
            try {
                const headers = await getHeaders();
                await api.post('/upload/multipart/abort', {
                    fileKey: state.fileKey,
                    uploadId: state.uploadId
                }, { headers });
            } catch (err) {
                // Ignore errors on abort
            }
        }
        resetUpload();
    }, [state.uploadId, state.fileKey, resetUpload]);

    /**
     * Get encryption data for sharing (export key and IV as base64)
     */
    const getEncryptionData = useCallback(async (): Promise<{ key: string; iv: string } | null> => {
        if (!state.encryptionKey || !state.encryptionIV) return null;

        const keyBase64 = await exportKeyToBase64(state.encryptionKey);
        const ivBase64 = exportIVToBase64(state.encryptionIV);

        return { key: keyBase64, iv: ivBase64 };
    }, [state.encryptionKey, state.encryptionIV]);

    return {
        uploadFile,
        pauseUpload,
        resumeUpload,
        abortUpload,
        resetUpload,
        getEncryptionData,
        state,
        isUploading: state.status === 'uploading' || state.status === 'initializing' || state.status === 'completing'
    };
};
