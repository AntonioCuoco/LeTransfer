import { useState, useRef, useEffect } from 'react';
import { Button, Tag } from 'antd';
import { UploadOutlined, SendOutlined, FileOutlined, DeleteOutlined, PlusOutlined, InboxOutlined } from '@ant-design/icons';
import Swal from 'sweetalert2';
import axios from 'axios';
import Cookies from 'js-cookie';
import { getCurrentUser } from '../getCurrentUser/getCurrentUser';
import { useFileDragAndDrop } from '../../hooks/useFileDragAndDrop';
import { FileUploadIndicator } from '../FileUploadStatus/FileUploadIndicator';
import { FileStatusIndicator } from './FileStatusIndicator';
import { DynamoDBFile, ShareLinkData } from '../../types';

interface FileSenderProps {
    onFileSent?: () => void;
    onLinkGenerated?: (linkData: ShareLinkData) => void;
}

interface SelectedFile {
    id: string;
    name: string;
    size: string;
    type: string;
    isFromS3: boolean;
    s3Key?: string;
    file?: File;
    uploadToS3?: boolean;
    uploadStatus?: 'pending' | 'uploading' | 'success' | 'error';
    uploadError?: string;
    uploadProgress?: number;
    // Nuovi stati per gestione avanzata
    fileStatus?: 'active' | 'deleted' | 'sent';
    sentTo?: string[]; // Lista email destinatari
    sentAt?: string; // Timestamp invio
}

const FileSender: React.FC<FileSenderProps> = ({ onFileSent, onLinkGenerated }) => {
    const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
    const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
    const [currentEmail, setCurrentEmail] = useState('');
    const [customMessage, setCustomMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [s3Files, setS3Files] = useState<DynamoDBFile[]>([]);
    const [isLoadingS3Files, setIsLoadingS3Files] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Carica file S3 reali
    const loadS3Files = async () => {
        setIsLoadingS3Files(true);
        try {
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/user/files/paginated`, {
                headers: {
                    Authorization: `Bearer ${Cookies.get('idToken')}`
                },
                params: {
                    page: 1,
                    limit: 100 // Carica più file per la selezione
                }
            });
            setS3Files(response.data.files || []);
        } catch (error) {
            // Error handled silently - UI will show empty state
        } finally {
            setIsLoadingS3Files(false);
        }
    };


    useEffect(() => {
        loadS3Files();
    }, []);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;


        const newFiles: SelectedFile[] = Array.from(files).map((file, index) => ({
            id: `local-${Date.now()}-${index}`,
            name: file.name,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.type,
            isFromS3: false,
            file: file,
            uploadToS3: false, // Default: non caricare su S3
            uploadStatus: 'pending' as const,
            fileStatus: 'active' as const // Nuovo stato
        }));

        setSelectedFiles(prev => [...prev, ...newFiles]);

        // Reset input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Gestione drag and drop
    const handleFilesDropped = (files: File[]) => {
        const newFiles: SelectedFile[] = files.map((file, index) => ({
            id: `local-${Date.now()}-${index}`,
            name: file.name,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.type,
            isFromS3: false,
            file: file,
            uploadToS3: false, // Default: non caricare su S3
            uploadStatus: 'pending' as const,
            fileStatus: 'active' as const // Nuovo stato
        }));

        setSelectedFiles(prev => [...prev, ...newFiles]);
    };

    const { isDragOver, dragProps, dropZoneRef } = useFileDragAndDrop({
        onFilesDropped: handleFilesDropped,
        multiple: true,
        disabled: isLoading
    });

    const handleS3FileSelect = (s3File: DynamoDBFile) => {
        const newFile: SelectedFile = {
            id: `s3-${s3File.s3Key || s3File.fileName}`,
            name: s3File.originalName || s3File.fileName,
            size: s3File.size || 'N/A',
            type: s3File.fileType || 'application/octet-stream',
            isFromS3: true,
            s3Key: s3File.s3Key,
            fileStatus: 'active' as const // Nuovo stato
        };

        setSelectedFiles(prev => [...prev, newFile]);
    };

    const removeFile = (fileId: string) => {
        setSelectedFiles(prev => prev.filter(file => file.id !== fileId));
    };

    const toggleUploadToS3 = (fileId: string) => {
        setSelectedFiles(prev =>
            prev.map(file =>
                file.id === fileId
                    ? { ...file, uploadToS3: !file.uploadToS3 }
                    : file
            )
        );
    };

    // Gestione destinatari multipli
    const addRecipient = () => {
        if (currentEmail.trim() && !recipientEmails.includes(currentEmail.trim())) {
            setRecipientEmails(prev => [...prev, currentEmail.trim()]);
            setCurrentEmail('');
        }
    };

    const removeRecipient = (email: string) => {
        setRecipientEmails(prev => prev.filter(e => e !== email));
    };

    const handleEmailKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addRecipient();
        }
    };

    const uploadFileToS3 = async (file: File, fileId: string): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);

        // Inizializza il progresso nei file selezionati
        setSelectedFiles(prev =>
            prev.map(f =>
                f.id === fileId
                    ? { ...f, uploadStatus: 'uploading' as const, uploadProgress: 0 }
                    : f
            )
        );

        try {
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/upload-file`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${Cookies.get('idToken')}`
                },
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    setSelectedFiles(prev =>
                        prev.map(f =>
                            f.id === fileId
                                ? { ...f, uploadProgress: progress }
                                : f
                        )
                    );
                }
            });

            // Aggiorna lo stato a successo
            setSelectedFiles(prev =>
                prev.map(f =>
                    f.id === fileId
                        ? {
                            ...f,
                            uploadStatus: 'success' as const,
                            uploadProgress: 100,
                            isFromS3: true,
                            s3Key: response.data.key
                        }
                        : f
                )
            );

            return response.data.key;
        } catch (error: unknown) {
            // Aggiorna lo stato a errore
            setSelectedFiles(prev =>
                prev.map(f =>
                    f.id === fileId
                        ? {
                            ...f,
                            uploadStatus: 'error' as const,
                            uploadError: (error as any).response?.data?.message || 'Errore durante il caricamento del file'
                        }
                        : f
                )
            );
            throw error;
        }
    };

    const sendFiles = async () => {
        if (selectedFiles.length === 0) {
            Swal.fire('Errore', 'Seleziona almeno un file da inviare', 'error');
            return;
        }

        if (recipientEmails.length === 0) {
            Swal.fire('Errore', 'Aggiungi almeno un destinatario', 'error');
            return;
        }

        setIsLoading(true);

        try {
            const filesToProcess = [];

            // Processa i file locali
            for (const file of selectedFiles) {
                if (!file.isFromS3 && file.file) {
                    if (file.uploadToS3) {
                        // Carica su S3 prima di inviare con progress bar
                        const s3Key = await uploadFileToS3(file.file, file.id);
                        filesToProcess.push({
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            s3Key: s3Key
                        });
                    } else {
                        // Invia direttamente senza caricare su S3
                        filesToProcess.push({
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            file: file.file // Invia il file direttamente
                        });
                    }
                } else if (file.isFromS3 && file.s3Key) {
                    filesToProcess.push({
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        s3Key: file.s3Key
                    });
                }
            }

            // Ottieni dati utente corrente
            const currentUser = getCurrentUser();

            // Determina quale endpoint usare
            const useMultipleEndpoint = recipientEmails.length > 1 || filesToProcess.length > 1;
            const endpoint = useMultipleEndpoint
                ? `${import.meta.env.VITE_API_URL}/send-email-files`
                : `${import.meta.env.VITE_API_URL}/send-email`;

            // Prepara il payload in base all'endpoint
            let payload;
            if (useMultipleEndpoint) {
                // Nuovo endpoint per destinatari/file multipli
                payload = {
                    from: 'onboarding@resend.dev',
                    to: recipientEmails,
                    files: filesToProcess.map(file => ({
                        name: file.name,
                        size: parseInt(file.size),
                        type: file.type,
                        s3Key: file.s3Key,
                        url: file.s3Key
                    })),
                    senderName: currentUser?.username || 'LeTransfer User',
                    message: customMessage.trim()
                };
            } else {
                // Endpoint originale per singolo destinatario/file
                payload = {
                    from: 'onboarding@resend.dev',
                    to: recipientEmails[0], // Singolo destinatario
                    fileName: filesToProcess.map(f => f.name).join(', '),
                    senderName: currentUser?.username || 'LeTransfer User',
                    username: currentUser?.username || 'User',
                    // Aggiungi fileKey per compatibilità con il backend
                    fileKey: filesToProcess[0]?.s3Key || null,
                    files: filesToProcess,
                    message: customMessage.trim(),
                    // URL per download diretto
                    downloadUrls: filesToProcess.map(file => {
                        if (file.s3Key) {
                            // File su S3 - URL diretto
                            return {
                                name: file.name,
                                url: file.s3Key,
                                type: 's3'
                            };
                        } else if (file.file) {
                            // File locale - invia come allegato
                            return {
                                name: file.name,
                                file: file.file,
                                type: 'attachment'
                            };
                        }
                        return null;
                    }).filter(f => f !== null)
                };
            }

            // Invia i file via email
            const response = await axios.post(endpoint, payload, {
                headers: {
                    Authorization: `Bearer ${Cookies.get('idToken')}`
                }
            });

            // Mostra modale con dettagli del link invece di SweetAlert
            if (onLinkGenerated && response.data) {
                const finalUrl = response.data.data?.shareUrl || response.data.data?.downloadUrl;

                onLinkGenerated({
                    url: response.data.data?.downloadUrl || finalUrl, // URL per download
                    previewUrl: response.data.data?.shareUrl || finalUrl, // URL per preview
                    fileName: filesToProcess.map(f => f.name).join(', '),
                    fileSize: filesToProcess.reduce((total, f) => total + parseFloat(f.size), 0).toFixed(2) + ' MB',
                    uploadDate: new Date().toISOString(),
                    expiresIn: '1 ora',
                    fileType: filesToProcess.map(f => f.type).join(', '),
                    recipientEmails: recipientEmails,
                    message: customMessage,
                    // Campi specifici per endpoint multipli
                    emailId: response.data.data?.id,
                    recipientsCount: response.data.data?.recipientsCount || recipientEmails.length,
                    filesCount: response.data.data?.filesCount || filesToProcess.length,
                    // Flag per distinguere il tipo di risposta
                    isMultipleEndpoint: useMultipleEndpoint
                });
            } else {
                const successMessage = useMultipleEndpoint
                    ? (response.data.message || `File inviati con successo a ${recipientEmails.length} destinatari`)
                    : `File inviati con successo a ${recipientEmails[0]}`;
                Swal.fire('Successo!', successMessage, 'success');
            }

            // Aggiorna lo stato dei file a "sent" prima di resettare
            setSelectedFiles(prev =>
                prev.map(file => ({
                    ...file,
                    fileStatus: 'sent' as const,
                    sentTo: [...recipientEmails],
                    sentAt: new Date().toISOString()
                }))
            );

            // Reset form dopo un breve delay per mostrare lo stato "sent"
            setTimeout(() => {
                setSelectedFiles([]);
                setRecipientEmails([]);
                setCurrentEmail('');
                setCustomMessage('');
                onFileSent?.();
            }, 2000);

            onFileSent?.();

        } catch (error: unknown) {
            // Error already handled in progress bar
        } finally {
            setIsLoading(false);
        }
    };

    // Gestisce il retry di un upload fallito
    const handleRetryUpload = async (fileId: string) => {
        const file = selectedFiles.find(f => f.id === fileId);
        if (!file || !file.file) return;

        try {
            await uploadFileToS3(file.file, fileId);
        } catch (error) {
            // L'errore è già gestito in uploadFileToS3
        }
    };


    return (
        <div className="bg-[#3c364c] rounded-lg">
            {/* Selezione file locali */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-[#DBD4D3] mb-2">
                    Carica file dal computer
                </label>
                <p className="text-xs text-[#DBD4D3] mb-2">
                    💡 <strong>Opzioni download:</strong> Se spunti "Carica su S3" → link diretto nell'email.
                    Se non spunti → file allegato all'email.
                </p>

                {/* Area drag and drop */}
                <div
                    ref={dropZoneRef}
                    {...dragProps}
                    className={`
                        relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer
                        ${isDragOver
                            ? 'border-[#724CF9] bg-[#724CF9]/10 scale-105'
                            : 'border-[#4a4554] hover:border-[#724CF9] hover:bg-[#2c2638]/50'
                        }
                        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                    onClick={() => !isLoading && fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                        disabled={isLoading}
                    />

                    <div className="flex flex-col items-center space-y-3">
                        <InboxOutlined
                            className={`text-4xl !text-[#724CF9]`}
                        />
                        <div>
                            <p className={`text-lg font-medium ${isDragOver ? 'text-[#724CF9]' : 'text-white'}`}>
                                {isDragOver ? 'Rilascia i file qui' : 'Trascina i file qui o clicca per selezionare'}
                            </p>
                            <p className="text-sm text-[#DBD4D3] mt-1">
                                Supporta file multipli • Max 100MB per file
                            </p>
                        </div>
                        <Button
                            icon={<UploadOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                fileInputRef.current?.click();
                            }}
                            disabled={isLoading}
                            className="!bg-[#724CF9] !border-[#724CF9] !text-white !hover:bg-[#5a3fd4] !hover:border-[#5a3fd4]"
                        >
                            Sfoglia File
                        </Button>
                    </div>
                </div>
            </div>

            {/* Selezione file da S3 */}
            <div className="mb-4">
                <label className="block text-sm font-medium text-[#DBD4D3] mb-2">
                    Oppure seleziona file già caricati
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {isLoadingS3Files ? (
                        <div className="col-span-full text-center text-[#DBD4D3] py-4">
                            Caricamento file...
                        </div>
                    ) : s3Files.length > 0 ? (
                        s3Files.map((file) => (
                            <div
                                key={file.s3Key || file.fileName}
                                onClick={() => handleS3FileSelect(file)}
                                className="p-3 bg-[#2c2638] rounded-lg cursor-pointer hover:bg-[#3c364c] border border-transparent hover:border-[#724CF9] transition-colors"
                            >
                                <div className="flex items-center space-x-2">
                                    <FileOutlined className="!text-[#724CF9]" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm truncate">{decodeURIComponent(file.originalName || file.fileName)}</p>
                                        <p className="text-[#DBD4D3] text-xs">
                                            {file.size ? file.size : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full text-start text-[#DBD4D3] py-4">
                            Nessun file caricato su S3
                        </div>
                    )}
                </div>
            </div>

            {/* File selezionati */}
            {selectedFiles.length > 0 && (
                <div className="mb-4">
                    <label className="block text-sm font-medium text-[#DBD4D3] mb-2">
                        File selezionati ({selectedFiles.length})
                    </label>
                    <div className="space-y-2">
                        {selectedFiles.map((file) => (
                            <div key={file.id} className={`p-3 rounded-lg transition-colors ${file.uploadStatus === 'error'
                                ? 'bg-red-900/20 border border-red-500/30'
                                : file.uploadStatus === 'success'
                                    ? 'bg-green-900/20 border border-green-500/30'
                                    : 'bg-[#2c2638]'
                                }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3 flex-1">
                                        <FileOutlined className="!text-[#724CF9]" />
                                        <div className="flex-1">
                                            <p className="text-white text-sm">{file.isFromS3 ? decodeURIComponent(file.name) : file.name}</p>
                                            <p className="text-[#DBD4D3] text-xs">
                                                {file.size} • {file.isFromS3 ? 'Da S3' : 'Locale'}
                                            </p>
                                            <FileUploadIndicator
                                                uploadStatus={file.uploadStatus}
                                                uploadProgress={file.uploadProgress}
                                                uploadError={file.uploadError}
                                                onRetry={() => handleRetryUpload(file.id)}
                                            />
                                            <FileStatusIndicator file={file} />
                                        </div>
                                        {!file.isFromS3 && (
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={file.uploadToS3 || false}
                                                    onChange={() => toggleUploadToS3(file.id)}
                                                    disabled={file.uploadStatus === 'uploading'}
                                                    className="w-4 h-4 text-[#724CF9] bg-[#2c2638] border-[#4a4554] rounded focus:ring-[#724CF9] focus:ring-2 disabled:opacity-50"
                                                />
                                                <span className="text-[#DBD4D3] text-xs">Carica su S3 (per link download)</span>
                                            </label>
                                        )}
                                    </div>
                                    <Button
                                        type="text"
                                        icon={<DeleteOutlined />}
                                        onClick={() => removeFile(file.id)}
                                        disabled={file.uploadStatus === 'uploading'}
                                        className="!text-[#724CF9] !hover:text-red-300 ml-2 disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Form invio */}
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-[#DBD4D3] mb-2">
                        Destinatari *
                    </label>

                    {/* Lista destinatari esistenti */}
                    {recipientEmails.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-2">
                            {recipientEmails.map((email, index) => (
                                <Tag
                                    key={index}
                                    closable
                                    onClose={() => removeRecipient(email)}
                                    className="bg-[#724CF9] text-white border-[#724CF9]"
                                >
                                    {email}
                                </Tag>
                            ))}
                        </div>
                    )}

                    {/* Input per aggiungere nuovi destinatari */}
                    <div className="flex flex-row items-center gap-2">
                        <input
                            type="email"
                            value={currentEmail}
                            onChange={(e) => setCurrentEmail(e.target.value)}
                            onKeyPress={handleEmailKeyPress}
                            placeholder="Aggiungi destinatario..."
                            className="flex-1 p-3 rounded-lg bg-[#2c2638] text-white placeholder-[#676178] border border-[#4a4554] focus:border-[#724CF9] focus:outline-none"
                        />
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={addRecipient}
                            disabled={!currentEmail.trim()}
                            className="!text-white !bg-[#724CF9] !hover:bg-[#5a3fd1] !border-[#724CF9]"
                        >
                            Aggiungi
                        </Button>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-[#DBD4D3] mb-2">
                        Messaggio personalizzato (opzionale)
                    </label>
                    <textarea
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        placeholder="Aggiungi un messaggio per il destinatario..."
                        rows={3}
                        className="w-full p-3 rounded-lg bg-[#2c2638] text-white placeholder-[#676178] border border-[#4a4554] focus:border-[#724CF9] focus:outline-none resize-none"
                    />
                </div>

                <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={sendFiles}
                    loading={isLoading}
                    disabled={selectedFiles.length === 0 || recipientEmails.length === 0}
                    className="w-full !bg-[#724CF9] !border-[#724CF9] !text-white !hover:bg-[#5a3fd4] !hover:border-[#5a3fd4] h-12 text-lg"
                >
                    {isLoading ? 'Invio in corso...' : 'Invia File'}
                </Button>
            </div>
        </div>
    );
};

export default FileSender;
