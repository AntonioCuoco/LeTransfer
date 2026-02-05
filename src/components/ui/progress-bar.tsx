import React from 'react';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';

interface ProgressBarProps {
    progress: number; // 0-100
    status: 'uploading' | 'success' | 'error';
    fileName: string;
    errorMessage?: string;
    onRetry?: () => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
    progress,
    status,
    fileName,
    errorMessage,
    onRetry
}) => {
    const getStatusIcon = () => {
        switch (status) {
            case 'success':
                return <CheckCircleOutlined className="text-green-500 text-lg" />;
            case 'error':
                return <CloseCircleOutlined className="text-red-500 text-lg" />;
            case 'uploading':
            default:
                return <LoadingOutlined className="text-[#724CF9] text-lg animate-spin" />;
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'success':
                return 'File caricato con successo';
            case 'error':
                return errorMessage || 'Errore durante il caricamento';
            case 'uploading':
            default:
                return `Caricamento in corso... ${Math.round(progress)}%`;
        }
    };

    const getBarColor = () => {
        switch (status) {
            case 'success':
                return 'bg-green-500';
            case 'error':
                return 'bg-red-500';
            case 'uploading':
            default:
                return 'bg-[#724CF9]';
        }
    };

    return (
        <div className="w-full p-4 bg-[#2c2638] rounded-lg border border-[#4a4554]">
            <div className="flex items-center space-x-3 mb-2">
                {getStatusIcon()}
                <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{fileName}</p>
                    <p className={`text-xs ${status === 'success' ? 'text-green-400' :
                            status === 'error' ? 'text-red-400' :
                                'text-[#DBD4D3]'
                        }`}>
                        {getStatusText()}
                    </p>
                </div>
            </div>

            {status === 'uploading' && (
                <div className="w-full bg-[#1a1625] rounded-full h-2 mb-2">
                    <div
                        className={`h-2 rounded-full transition-all duration-300 ease-out ${getBarColor()}`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                </div>
            )}

            {status === 'error' && onRetry && (
                <button
                    onClick={onRetry}
                    className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded transition-colors"
                >
                    Riprova
                </button>
            )}
        </div>
    );
};
