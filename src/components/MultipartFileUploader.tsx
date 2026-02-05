import React, { useRef } from 'react';
import { useTransfer } from '../contexts/TransferContext';
import { InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { useFileDragAndDrop } from '../hooks/useFileDragAndDrop';

interface MultipartFileUploaderProps {
    apiBaseUrl: string;
    onUploadComplete?: (fileKey: string) => void;
}

export const MultipartFileUploader: React.FC<MultipartFileUploaderProps> = () => {
    const { addUpload } = useTransfer();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Drag and drop per file
    const handleFilesDropped = (files: File[]) => {
        files.forEach(file => addUpload(file));
    };

    const { isDragOver, dragProps } = useFileDragAndDrop({
        onFilesDropped: handleFilesDropped,
        multiple: true
    });

    return (
        <div className="w-full">
            {/* File Selection */}
            <div className="flex flex-col gap-3 w-full">
                <div
                    {...dragProps}
                    className={`
                        relative border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer
                        ${isDragOver
                            ? 'border-[#724CF9] bg-[#2c2638] scale-[1.02]'
                            : 'border-[#4a4554] bg-[#4a4554]/20 hover:border-[#724CF9] hover:bg-[#2c2638]'
                        }
                    `}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        multiple
                        ref={fileInputRef}
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                Array.from(e.target.files).forEach(file => addUpload(file));
                                e.target.value = '';
                            }
                        }}
                        className="hidden"
                    />
                    <div className="flex flex-col items-center space-y-3">
                        <InboxOutlined className={`text-3xl !text-[#724CF9] ${isDragOver ? 'animate-bounce' : ''}`} />
                        <div>
                            <p className={`text-base font-medium ${isDragOver ? 'text-[#724CF9]' : 'text-[#DBD4D3]'}`}>
                                {isDragOver ? 'Rilascia i file qui' : 'Trascina i file qui o clicca per selezionare'}
                            </p>
                            <p className="text-sm text-[#9ca3af] mt-1">
                                Max 5TB • Upload diretto S3 (Multipart) • Multi-file supportato
                            </p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                            className="px-4 py-2 bg-[#724CF9] text-white rounded-md hover:bg-[#5a3fd1] flex items-center gap-2"
                        >
                            <UploadOutlined />
                            Sfoglia File
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

