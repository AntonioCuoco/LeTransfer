import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { TransferContextType, TransferItem, TransferControl } from '../types/transfer';
import { UploadRunner } from '../components/TransferManager/UploadRunner';
import { DownloadRunner } from '../components/TransferManager/DownloadRunner';

const TransferContext = createContext<TransferContextType | undefined>(undefined);

export const useTransfer = () => {
    const context = useContext(TransferContext);
    if (!context) {
        throw new Error('useTransfer must be used within a TransferProvider');
    }
    return context;
};

const LIMITS = {
    uploadLarge: {
        files: 3,
        parts: 2
    },
    uploadSmall: {
        files: 6
    },
    download: {
        files: 2
    }
};

export const TransferProvider: React.FC<{ children: ReactNode; apiBaseUrl: string }> = ({ children, apiBaseUrl }) => {
    const [transfers, setTransfers] = useState<TransferItem[]>([]);

    const addUpload = useCallback((file: File) => {
        const id = crypto.randomUUID();
        const newItem: TransferItem = {
            id,
            type: 'upload',
            name: file.name,
            size: file.size,
            mimeType: file.type,
            status: 'queued', // Start as queued
            progress: { percentage: 0, loadedBytes: 0, totalBytes: file.size, speed: 0, eta: 0 },
            fileOrUrl: file,
            createdAt: Date.now()
        };
        setTransfers(prev => [newItem, ...prev]);
        return id;
    }, []);

    const addDownload = useCallback((url: string, fileName: string, fileSize?: number) => {
        const id = crypto.randomUUID();
        const newItem: TransferItem = {
            id,
            type: 'download',
            name: fileName,
            size: fileSize || 0,
            status: 'queued', // Start as queued
            progress: { percentage: 0, loadedBytes: 0, totalBytes: fileSize || 0 },
            fileOrUrl: url,
            createdAt: Date.now()
        };
        setTransfers(prev => [newItem, ...prev]);
        return id;
    }, []);

    const updateTransfer = useCallback((id: string, updates: Partial<TransferItem>) => {
        setTransfers(prev => prev.map(item =>
            item.id === id ? { ...item, ...updates } : item
        ));
    }, []);

    const registerControls = useCallback((id: string, controls: TransferControl) => {
        setTransfers(prev => prev.map(item =>
            item.id === id ? { ...item, controls } : item
        ));
    }, []);

    const pauseTransfer = useCallback((id: string) => {
        const item = transfers.find(t => t.id === id);
        if (item?.controls?.pause) {
            item.controls.pause();
            updateTransfer(id, { status: 'paused' });
        }
    }, [transfers, updateTransfer]);

    const resumeTransfer = useCallback((id: string) => {
        const item = transfers.find(t => t.id === id);
        if (item?.controls?.resume) {
            item.controls.resume();
            updateTransfer(id, { status: item.type === 'upload' ? 'uploading' : 'downloading' }); // Optimistic
        }
    }, [transfers, updateTransfer]);

    const cancelTransfer = useCallback((id: string) => {
        const item = transfers.find(t => t.id === id);
        // If queued, just cancel directly
        if (item?.status === 'queued') {
            updateTransfer(id, { status: 'cancelled' });
        } else if (item?.controls?.cancel) {
            item.controls.cancel();
            updateTransfer(id, { status: 'cancelled' });
        }
    }, [transfers, updateTransfer]);

    const clearCompleted = useCallback(() => {
        setTransfers(prev => prev.filter(t =>
            t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'error'
        ));
    }, []);

    // Scheduler Effect
    React.useEffect(() => {
        const activeUploadsLarge = transfers.filter(t =>
            t.type === 'upload' &&
            t.fileOrUrl instanceof File && t.fileOrUrl.size > 100 * 1024 * 1024 &&
            ['initializing', 'uploading'].includes(t.status)
        ).length;

        const activeUploadsSmall = transfers.filter(t =>
            t.type === 'upload' &&
            t.fileOrUrl instanceof File && t.fileOrUrl.size <= 100 * 1024 * 1024 &&
            ['initializing', 'uploading'].includes(t.status)
        ).length;

        const activeDownloads = transfers.filter(t =>
            t.type === 'download' && ['initializing', 'downloading'].includes(t.status)
        ).length;

        const queuedItems = transfers.filter(t => t.status === 'queued').reverse(); // FIFO roughly

        queuedItems.forEach(item => {
            if (item.type === 'upload' && item.fileOrUrl instanceof File) {
                const isLarge = item.fileOrUrl.size > 100 * 1024 * 1024;
                if (isLarge) {
                    if (activeUploadsLarge < LIMITS.uploadLarge.files) {
                        updateTransfer(item.id, { status: 'initializing' });
                    }
                } else {
                    if (activeUploadsSmall < LIMITS.uploadSmall.files) {
                        updateTransfer(item.id, { status: 'initializing' });
                    }
                }
            } else if (item.type === 'download') {
                if (activeDownloads < LIMITS.download.files) {
                    updateTransfer(item.id, { status: 'initializing' });
                }
            }
        });
    }, [transfers, updateTransfer]);

    return (
        <TransferContext.Provider value={{
            transfers,
            addUpload,
            addDownload,
            pauseTransfer,
            resumeTransfer,
            cancelTransfer,
            clearCompleted,
            updateTransfer,
            registerControls
        }}>
            {children}
            {/* Hidden Managers */}
            {transfers.map(transfer => {
                // Do not render runners for queued, completed, cancelled, or error items (to save resources)
                // Actually need to keep completed/error to allow viewing? No, runners invoke callbacks.
                // Runners should only be active for initializing/uploading/paused/completing.
                // But UploadRunner handles restart/completion logic.
                // Let's keep it simple: Render if not queued and not final state?
                // Or just if not queued? The runner handles unmount cleanup.

                if (transfer.status === 'queued') return null;

                // Cleanup runners for finished states to free memory, 
                // UNLESS we need them to hold some internal state not in context? 
                // Context has everything.
                if (['completed', 'cancelled', 'error'].includes(transfer.status)) return null;

                if (transfer.type === 'upload') {
                    const isLarge = transfer.fileOrUrl instanceof File && transfer.fileOrUrl.size > 100 * 1024 * 1024;
                    const concurrency = isLarge ? LIMITS.uploadLarge.parts : undefined;

                    return (
                        <UploadRunner
                            key={transfer.id}
                            transfer={transfer}
                            apiBaseUrl={apiBaseUrl}
                            concurrency={concurrency}
                            updateTransfer={updateTransfer}
                            registerControls={registerControls}
                        />
                    );
                } else {
                    return (
                        <DownloadRunner
                            key={transfer.id}
                            transfer={transfer}
                            updateTransfer={updateTransfer}
                            registerControls={registerControls}
                        />
                    );
                }
            })}
        </TransferContext.Provider>
    );
};
