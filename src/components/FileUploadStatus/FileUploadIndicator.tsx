import React from 'react';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';

interface FileUploadIndicatorProps {
    uploadStatus?: 'pending' | 'uploading' | 'success' | 'error';
    uploadProgress?: number;
    uploadError?: string;
    onRetry?: () => void;
}

export const FileUploadIndicator: React.FC<FileUploadIndicatorProps> = ({
    uploadStatus,
    uploadProgress = 0,
    uploadError,
    onRetry
}) => {
    if (!uploadStatus || uploadStatus === 'pending') {
        return null;
    }

    const getStatusIcon = () => {
        switch (uploadStatus) {
            case 'success':
                return <CheckCircleOutlined className="text-green-500 text-sm" />;
            case 'error':
                return <CloseCircleOutlined className="text-red-500 text-sm" />;
            case 'uploading':
            default:
                return <LoadingOutlined className="text-[#724CF9] text-sm animate-spin" />;
        }
    };

    const getStatusText = () => {
        switch (uploadStatus) {
            case 'success':
                return 'Caricato con successo';
            case 'error':
                return uploadError || 'Errore durante il caricamento';
            case 'uploading':
            default:
                return `Caricamento... ${Math.round(uploadProgress)}%`;
        }
    };

    const getTextColor = () => {
        switch (uploadStatus) {
            case 'success':
                return 'text-green-400';
            case 'error':
                return 'text-red-400';
            case 'uploading':
            default:
                return 'text-[#DBD4D3]';
        }
    };

    return (
        <div className="flex items-center space-x-2 mt-1">
            {getStatusIcon()}
            <span className={`text-xs ${getTextColor()}`}>
                {getStatusText()}
            </span>
            {uploadStatus === 'error' && onRetry && (
                <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={onRetry}
                    className="!text-red-400 hover:!text-red-300 !p-1 !h-auto"
                    title="Riprova caricamento"
                />
            )}
            {uploadStatus === 'uploading' && (
                <div className="w-16 bg-[#1a1625] rounded-full h-1">
                    <div
                        className="h-1 bg-[#724CF9] rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(uploadProgress, 100)}%` }}
                    />
                </div>
            )}
        </div>
    );
};
