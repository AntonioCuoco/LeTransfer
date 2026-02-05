import React, { useState } from 'react';
import { Button } from 'antd';
import { CloudUploadOutlined, FileOutlined, DeleteOutlined } from '@ant-design/icons';
import { StyledModal } from '../StyledModal';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/src/components/ui/table";

interface FilePreviewModalProps {
    visible: boolean;
    files: File[];
    onConfirm: (files: File[]) => void;
    onCancel: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
    visible,
    files,
    onConfirm,
    onCancel
}) => {
    const [localFiles, setLocalFiles] = useState<File[]>(files);

    // Update local files when props change
    React.useEffect(() => {
        setLocalFiles(files);
    }, [files]);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const totalSize = localFiles.reduce((acc, file) => acc + file.size, 0);

    const handleRemove = (index: number) => {
        const newFiles = [...localFiles];
        newFiles.splice(index, 1);
        setLocalFiles(newFiles);
    };

    return (
        <StyledModal
            title="Anteprima Upload Cartella"
            subtitle={`${localFiles.length} file pronti per il caricamento`}
            icon={<CloudUploadOutlined />}
            open={visible}
            onCancel={onCancel}
            width={800}
        >
            <div className="flex flex-col gap-6">
                {/* File List Container */}
                <div className="max-h-[400px] overflow-y-auto rounded-xl border border-[#4a4554] bg-[#1a1625]">
                    <Table>
                        <TableHeader className="bg-[#2c2638] sticky top-0 z-10">
                            <TableRow className="border-b-[#4a4554] hover:bg-[#2c2638]">
                                <TableHead className="text-[#DBD4D3] font-medium w-[45%]">Nome</TableHead>
                                <TableHead className="text-[#DBD4D3] font-medium w-[20%]">Tipo</TableHead>
                                <TableHead className="text-[#DBD4D3] font-medium w-[20%]">Dimensione</TableHead>
                                <TableHead className="text-[#DBD4D3] font-medium w-[15%] text-right pr-6">Azioni</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {localFiles.map((file, index) => (
                                <TableRow key={index} className="border-b-[#2c2638] hover:bg-[#2c2638]/50 transition-colors">
                                    <TableCell className="font-medium text-white">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg bg-[#724CF9]/10 flex items-center justify-center flex-shrink-0">
                                                <FileOutlined className="text-[#724CF9]" />
                                            </div>
                                            <span className="truncate max-w-[280px]" title={file.name}>
                                                {file.name}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-[#9ca3af]">
                                        <span className="truncate max-w-[120px] block text-xs uppercase tracking-wide bg-[#2c2638] px-2 py-1 rounded w-fit" title={file.type || 'N/A'}>
                                            {file.type ? file.type.split('/')[1] || 'FILE' : 'N/A'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-[#DBD4D3] font-mono text-sm">
                                        {formatSize(file.size)}
                                    </TableCell>
                                    <TableCell className="text-right pr-4">
                                        <Button
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => handleRemove(index)}
                                            className="hover:bg-red-500/10 flex ml-auto"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {localFiles.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-12">
                                        <div className="flex flex-col items-center gap-2">
                                            <FileOutlined className="text-4xl text-[#4a4554]" />
                                            <p className="text-[#9ca3af]">Nessun file selezionato</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Footer Stats & Actions */}
                <div className="flex justify-between items-center pt-2">
                    <div className="bg-[#1a1625] px-4 py-2 rounded-lg border border-[#4a4554]">
                        <span className="text-[#9ca3af] text-sm">Totale: </span>
                        <span className="text-white font-semibold ml-1">{formatSize(totalSize)}</span>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            onClick={onCancel}
                            className="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!text-white hover:!border-[#724CF9]"
                            size="large"
                            style={{ borderRadius: '10px', height: '44px', padding: '0 24px' }}
                        >
                            Annulla
                        </Button>
                        <Button
                            type="primary"
                            onClick={() => onConfirm(localFiles)}
                            disabled={localFiles.length === 0}
                            className="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none shadow-lg shadow-[#724CF9]/20 !text-white"
                            size="large"
                            style={{ borderRadius: '10px', height: '44px', padding: '0 24px' }}
                        >
                            Carica {localFiles.length} file
                        </Button>
                    </div>
                </div>
            </div>
        </StyledModal>
    );
};
