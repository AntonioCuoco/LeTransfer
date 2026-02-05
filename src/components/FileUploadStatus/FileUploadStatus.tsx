import React from 'react';
import { ProgressBar } from '../ui/progress-bar';

export interface FileUploadStatus {
    id: string;
    fileName: string;
    progress: number;
    status: 'uploading' | 'success' | 'error';
    errorMessage?: string;
}

interface FileUploadStatusProps {
    uploads: FileUploadStatus[];
    onRetry: (fileId: string) => void;
    onRemove: (fileId: string) => void;
}

export const FileUploadStatus: React.FC<FileUploadStatusProps> = ({
    uploads,
    onRetry,
    onRemove
}) => {
    if (uploads.length === 0) return null;

    return (
        <div className="space-y-3">
            <h4 className="text-white font-medium text-sm">Stato Caricamento File</h4>
            {uploads.map((upload) => (
                <div key={upload.id} className="relative">
                    <ProgressBar
                        progress={upload.progress}
                        status={upload.status}
                        fileName={upload.fileName}
                        errorMessage={upload.errorMessage}
                        onRetry={() => onRetry(upload.id)}
                    />
                    {(upload.status === 'success' || upload.status === 'error') && (
                        <button
                            onClick={() => onRemove(upload.id)}
                            className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
                            title="Rimuovi"
                        >
                            ×
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};
