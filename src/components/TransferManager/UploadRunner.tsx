import React, { useEffect, useRef } from 'react';
import { TransferItem, TransferControl, TransferStatus } from '../../types/transfer';
import { useS3MultipartUpload } from '../../hooks/useS3MultipartUpload';
import { getUserIdFromToken, getUserEmailFromToken } from '../../utils/authUtils';
import Cookies from 'js-cookie';

interface UploadRunnerProps {
    transfer: TransferItem;
    apiBaseUrl: string;
    concurrency?: number;
    updateTransfer: (id: string, updates: Partial<TransferItem>) => void;
    registerControls: (id: string, controls: TransferControl) => void;
}

export const UploadRunner: React.FC<UploadRunnerProps> = ({
    transfer,
    apiBaseUrl,
    concurrency,
    updateTransfer,
    registerControls
}) => {
    const userId = getUserIdFromToken();
    const userEmail = getUserEmailFromToken();
    const startedRef = useRef(false);

    const {
        uploadFile,
        pauseUpload,
        resumeUpload,
        abortUpload,
        state
    } = useS3MultipartUpload({
        apiBaseUrl,
        userId,
        userEmail,
        concurrency,
        getAuthToken: async () => Cookies.get('accessToken') || null
    });

    // Register controls once
    useEffect(() => {
        registerControls(transfer.id, {
            pause: pauseUpload,
            resume: resumeUpload,
            cancel: abortUpload
        });
    }, [transfer.id, registerControls, pauseUpload, resumeUpload, abortUpload]);

    // Start upload on mount
    useEffect(() => {
        if (!startedRef.current && transfer.fileOrUrl instanceof File) {
            startedRef.current = true;
            uploadFile(transfer.fileOrUrl);
        }
    }, [transfer.fileOrUrl, uploadFile]);

    // Sync state to context
    useEffect(() => {
        // Map hook status to TransferStatus
        let status: TransferStatus = transfer.status; // Default to current status
        switch (state.status) {
            case 'idle':
                // If hook is idle but we are mounted, it means we are just starting. 
                // Keep it as 'initializing' (or whatever passed in transfer) to avoid loop.
                status = 'initializing';
                break;
            case 'initializing': status = 'initializing'; break;
            case 'uploading': status = 'uploading'; break;
            case 'paused': status = 'paused'; break;
            case 'completed': status = 'completed'; break;
            case 'error': status = 'error'; break;
            case 'completing': status = 'uploading'; break;
        }

        // Avoid unnecessary updates if nothing changed
        if (
            status !== transfer.status ||
            state.progress.percentage !== transfer.progress.percentage ||
            state.progress.uploadedBytes !== transfer.progress.loadedBytes ||
            state.error !== transfer.error
        ) {
            updateTransfer(transfer.id, {
                status,
                progress: {
                    percentage: state.progress.percentage,
                    loadedBytes: state.progress.uploadedBytes,
                    totalBytes: state.progress.totalBytes,
                    speed: state.progress.speed,
                    eta: state.progress.eta
                },
                error: state.error,
                resultKey: state.fileKey || undefined
            });
        }
    }, [
        state.status,
        state.progress,
        state.error,
        state.fileKey,
        transfer.id,
        transfer.status,
        transfer.progress.percentage,
        transfer.progress.loadedBytes,
        transfer.error,
        updateTransfer
    ]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // If unmounting and not completed, it implies cancellation or removal
            // Check current status ref if needed, but here we can rely on context status
            // If the runner is unmounted, it's because it was removed from the list
            // We should ensure the upload is aborted if it was running
            if (state.status === 'uploading' || state.status === 'initializing' || state.status === 'paused') {
                abortUpload();
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null; // Invisible component
};
