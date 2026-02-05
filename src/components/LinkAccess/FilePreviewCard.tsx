/**
 * FilePreviewCard - Card per visualizzare info e preview del file
 * 
 * Mostra:
 * - Icona tipo file
 * - Nome file
 * - Dimensione
 * - Tipo MIME
 * - Preview inline (se supportato)
 * - Pulsante download
 */

import { Button, Spin } from 'antd';
import {
    FileOutlined,
    FileImageOutlined,
    FilePdfOutlined,
    FileTextOutlined,
    PlayCircleOutlined,
    SoundOutlined,
    DownloadOutlined,
    EyeOutlined
} from '@ant-design/icons';

interface FilePreviewCardProps {
    /** Nome del file */
    fileName: string;
    /** Dimensione formattata */
    fileSize: string;
    /** MIME type */
    fileType: string;
    /** URL per la preview (opzionale) */
    previewUrl?: string;
    /** Se la preview è supportata */
    previewSupported?: boolean;
    /** Stato di caricamento download */
    isDownloading?: boolean;
    /** Stato di decifratura in corso */
    isDecrypting?: boolean;
    /** Callback per il download */
    onDownload?: () => void;
    /** Callback per aprire preview */
    onPreview?: () => void;
}

/**
 * Ritorna l'icona appropriata per il tipo di file
 */
const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
        return <FileImageOutlined className="text-pink-400 text-3xl" />;
    }
    if (fileType === 'application/pdf') {
        return <FilePdfOutlined className="text-red-400 text-3xl" />;
    }
    if (fileType.startsWith('video/')) {
        return <PlayCircleOutlined className="text-purple-400 text-3xl" />;
    }
    if (fileType.startsWith('audio/')) {
        return <SoundOutlined className="text-green-400 text-3xl" />;
    }
    if (fileType.startsWith('text/') || fileType.includes('document')) {
        return <FileTextOutlined className="text-blue-400 text-3xl" />;
    }
    return <FileOutlined className="text-[#724CF9] text-3xl" />;
};

/**
 * Verifica se il tipo di file supporta preview inline
 */
const supportsInlinePreview = (fileType: string): boolean => {
    return (
        fileType.startsWith('image/') ||
        fileType === 'application/pdf' ||
        fileType.startsWith('video/') ||
        fileType.startsWith('audio/')
    );
};

export const FilePreviewCard = ({
    fileName,
    fileSize,
    fileType,
    previewUrl,
    previewSupported = false,
    isDownloading = false,
    isDecrypting = false,
    onDownload,
    onPreview
}: FilePreviewCardProps) => {
    const canPreview = previewSupported && previewUrl && supportsInlinePreview(fileType);

    return (
        <div className="bg-gradient-to-r from-[#1a1625] to-[#2c2638] border border-[#4a4554] rounded-xl overflow-hidden">
            {/* Preview Area */}
            {canPreview && (
                <div className="relative bg-black/30 aspect-video flex items-center justify-center">
                    {/* ... preview content ... */}
                    {fileType.startsWith('image/') && (
                        <img
                            src={previewUrl}
                            alt={fileName}
                            className="max-w-full max-h-full object-contain"
                        />
                    )}
                    {fileType === 'application/pdf' && (
                        <iframe
                            src={previewUrl}
                            title={fileName}
                            className="w-full h-full min-h-[300px]"
                        />
                    )}
                    {fileType.startsWith('video/') && (
                        <video
                            src={previewUrl}
                            controls
                            className="max-w-full max-h-full"
                        />
                    )}
                    {fileType.startsWith('audio/') && (
                        <audio
                            src={previewUrl}
                            controls
                            className="w-full max-w-md"
                        />
                    )}
                </div>
            )}

            {/* File Info */}
            <div className="p-6">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-[#724CF9]/20 flex items-center justify-center flex-shrink-0">
                        {getFileIcon(fileType)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3
                            className="text-white font-semibold text-lg truncate mb-1"
                            title={fileName}
                        >
                            {fileName}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-[#9ca3af]">
                            <span className="whitespace-nowrap">{fileSize}</span>
                            <span className="w-1 h-1 rounded-full bg-[#4a4554] flex-shrink-0"></span>
                            <span className="truncate" title={fileType}>{fileType}</span>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                    {canPreview && onPreview && (
                        <Button
                            icon={<EyeOutlined />}
                            onClick={onPreview}
                            size="large"
                            className="flex-1 !bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white"
                            style={{ borderRadius: '10px', height: '48px' }}
                        >
                            Anteprima
                        </Button>
                    )}
                    <Button
                        type="primary"
                        icon={(isDownloading || isDecrypting) ? <Spin size="small" /> : <DownloadOutlined />}
                        onClick={onDownload}
                        disabled={isDownloading || isDecrypting}
                        size="large"
                        className="flex-1 !bg-[#724CF9] hover:!bg-[#9d7bfa] !text-white !border-[#724CF9]"
                        style={{ borderRadius: '10px', height: '48px' }}
                    >
                        {isDecrypting ? 'Decifratura...' : (isDownloading ? 'Download...' : 'Scarica')}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default FilePreviewCard;
