import React, { useEffect, useRef } from 'react';
import axios, { CancelTokenSource } from 'axios';
import { message } from 'antd';
import { TransferItem, TransferControl } from '../../types/transfer';

interface DownloadRunnerProps {
    transfer: TransferItem;
    updateTransfer: (id: string, updates: Partial<TransferItem>) => void;
    registerControls: (id: string, controls: TransferControl) => void;
}

export const DownloadRunner: React.FC<DownloadRunnerProps> = ({
    transfer,
    updateTransfer,
    registerControls
}) => {
    const cancelSource = useRef<CancelTokenSource | null>(null);
    const startedRef = useRef(false);

    // Register controls
    useEffect(() => {
        registerControls(transfer.id, {
            pause: () => { /* Pause non supportato */ },
            resume: () => { /* Resume non supportato */ },
            cancel: () => {
                if (cancelSource.current) {
                    cancelSource.current.cancel("User cancelled");
                }
            }
        });
    }, [transfer.id, registerControls]);

    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;

        const url = transfer.fileOrUrl as string;
        const filename = transfer.name;

        cancelSource.current = axios.CancelToken.source();

        updateTransfer(transfer.id, { status: 'downloading' });

        axios.get(url, {
            responseType: 'blob',
            cancelToken: cancelSource.current.token,
            onDownloadProgress: (progressEvent) => {
                const total = progressEvent.total || transfer.size || 0;
                const loaded = progressEvent.loaded;
                const percentage = total > 0 ? (loaded / total) * 100 : 0;

                updateTransfer(transfer.id, {
                    status: 'downloading',
                    progress: {
                        percentage,
                        loadedBytes: loaded,
                        totalBytes: total,
                        speed: progressEvent.rate, // Axios might provide rate or calculate it
                        eta: progressEvent.estimated // Axios might provide estimated
                    }
                });
            }
        })
            .then((response) => {
                // Create download link
                // Use content-type from headers if available
                const blob = new Blob([response.data], { type: response.headers['content-type'] });
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(downloadUrl);

                updateTransfer(transfer.id, {
                    status: 'completed',
                    progress: { ...transfer.progress, percentage: 100 }
                });
            })
            .catch((err) => {
                if (axios.isCancel(err)) {
                    // Cancelled
                    updateTransfer(transfer.id, { status: 'cancelled' });
                } else {
                    message.error('Errore durante il download del file');
                    updateTransfer(transfer.id, { status: 'error', error: err });
                }
            });

        return () => {
            // Cleanup: if unmounting and still running, cancel
            // We can check if cancelSource is set
            if (cancelSource.current) {
                cancelSource.current.cancel("Component unmounted");
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
};
