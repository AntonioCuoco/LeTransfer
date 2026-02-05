import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import FileSender from "../components/FileSender/FileSender";
import { Modal, Button, Input, message, Tooltip } from "antd";
import {
    CopyOutlined,
    LinkOutlined,
    FileOutlined,
    ClockCircleOutlined,
    InboxOutlined,
    UploadOutlined,
    CloudUploadOutlined,
    ShareAltOutlined,
    FolderOpenOutlined
} from "@ant-design/icons";
import { useFolderDragAndDrop } from "../hooks/useFolderDragAndDrop";
import { useTokenManager } from "../hooks/useTokenManager";
import { initializeAxiosInterceptors } from "../utils/axiosInterceptor";
import { useSessionNotifications } from "../hooks/useSessionNotifications";
import { useFileFromDynamoDB } from "../hooks/useFileFromDynamoDB";
import { useTransfer } from "../contexts/TransferContext";
import { ShareFileModal } from "../components/ShareFileModal/ShareFileModal";
import { MultipartFileUploader } from "../components/MultipartFileUploader";
import { TransferStatusPanel } from "../components/TransferStatusPanel";
import { BentoCard } from "../components/ui/BentoCard";
import { StatCard } from "../components/ui/StatCard";
import { FilePreviewModal } from "../components/FileSender/FilePreviewModal";
import type { DynamoDBFile, ShareLinkData } from "../types";

const Home = () => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [shareModalVisible, setShareModalVisible] = useState(false);
    const [shareData, setShareData] = useState<ShareLinkData | null>(null);

    // Stato per la modale di condivisione user-to-user
    const [shareUserModalVisible, setShareUserModalVisible] = useState(false);
    const [fileToShare, setFileToShare] = useState<DynamoDBFile | null>(null);

    // Folder Preview State
    const [previewModalVisible, setPreviewModalVisible] = useState(false);
    const [previewFiles, setPreviewFiles] = useState<File[]>([]);

    const { isAuthenticated, ensureValidToken } = useTokenManager();
    const { NotificationContainer } = useSessionNotifications();

    // Transfer Context
    const { addUpload } = useTransfer();

    // Usa l'hook per gestire i file da DynamoDB
    const {
        isUploading,
        loadFiles: loadFilesFromS3,
        uploadFile: uploadFileToS3Hook
    } = useFileFromDynamoDB();

    const [filesLoaded, setFilesLoaded] = useState(false);
    const [stats, setStats] = useState({ totalFiles: 0, sharedFiles: 0, totalSize: '0 MB' });

    // Inizializza gli interceptor axios
    useEffect(() => {
        initializeAxiosInterceptors();
    }, []);

    // Verifica la validità del token periodicamente
    useEffect(() => {
        const checkToken = async () => {
            if (isAuthenticated) {
                await ensureValidToken();
            }
        };

        const interval = setInterval(checkToken, 30000);
        return () => clearInterval(interval);
    }, [isAuthenticated, ensureValidToken]);

    // Carica stats iniziali
    useEffect(() => {
        const loadStats = async () => {
            const result = await loadFilesFromS3({ limit: 100 });
            if (result && result.files) {
                setFilesLoaded(true);
                const totalSize = result.files.reduce((acc: number, file: DynamoDBFile) => {
                    const size = parseInt(file.fileSize || '0');
                    return acc + (isNaN(size) ? 0 : size);
                }, 0);
                setStats({
                    totalFiles: result.files.length,
                    sharedFiles: result.files.filter((f: DynamoDBFile) => f.isShared).length,
                    totalSize: formatSize(totalSize)
                });
            }
        };
        loadStats();
    }, []);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    // Gestione drag and drop per upload diretto
    // Gestione drag and drop per upload diretto
    const handleFilesDropped = (files: File[]) => {
        if (files.length > 0) {
            setPreviewFiles(files);
            setPreviewModalVisible(true);
        }
    };

    const { isDragOver, dragProps, dropZoneRef } = useFolderDragAndDrop({
        onFilesDropped: handleFilesDropped,
        multiple: true,
        disabled: isUploading
    });

    // Funzione wrapper per caricare i file
    const handleLoadFiles = async () => {
        const result = await loadFilesFromS3({ limit: 100 });
        if (result) {
            setFilesLoaded(true);
        }
    };

    // Funzione wrapper per upload file
    const handleUploadFile = async () => {
        if (!selectedFile) {
            Swal.fire({
                title: "Errore!",
                text: "Seleziona un file prima di caricarlo",
                icon: "error"
            });
            return;
        }

        await uploadFileToS3Hook(selectedFile, {
            onSuccess: () => {
                Swal.fire({
                    title: "Successo!",
                    text: "File caricato con successo",
                    icon: "success"
                });
                setSelectedFile(null);
                if (filesLoaded) {
                    handleLoadFiles();
                }
            }
        });
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            message.success('Link copiato negli appunti!');
        } catch {
            message.error('Errore durante la copia del link');
        }
    };

    const formatLocalFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <>
            <NotificationContainer />
            <div className="p-6 max-w-[1400px] mx-auto animate-[fadeIn_300ms_ease-out]">
                {/* Header */}
                <header className="mb-6">
                    <h1 className="m-0 text-3xl font-bold text-white">Dashboard</h1>
                    <p className="mt-1 mb-0 text-base text-[#9ca3af]">Gestisci e condividi i tuoi file</p>
                </header>

                {/* Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <StatCard
                        value={stats.totalFiles}
                        label="File Totali"
                        icon={<FolderOpenOutlined />}
                        trend="up"
                        change="+12%"
                    />
                    <StatCard
                        value={stats.sharedFiles}
                        label="File Condivisi"
                        icon={<ShareAltOutlined />}
                        variant="primary"
                    />
                    <StatCard
                        value={stats.totalSize}
                        label="Spazio Utilizzato"
                        icon={<CloudUploadOutlined />}
                        subtext="di 10 GB disponibili"
                    />
                </div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

                    {/* Folder Upload Card */}
                    <BentoCard
                        size="2x1"
                        title="Carica Cartella"
                        subtitle="Trascina una cartella o clicca per selezionare"
                        icon={<FolderOpenOutlined />}
                    >
                        <div
                            ref={dropZoneRef}
                            {...dragProps}
                            className={`
                                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 bg-[#4a4554]/20
                                ${isDragOver
                                    ? 'border-[#724CF9] bg-[#2c2638] scale-[1.02]'
                                    : 'border-[#4a4554] hover:border-[#724CF9] hover:bg-[#2c2638]'
                                }
                                ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                            onClick={() => !isUploading && document.getElementById('folder-input')?.click()}
                        >
                            <input
                                id="folder-input"
                                type="file"
                                // @ts-ignore
                                webkitdirectory=""
                                directory=""
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        setPreviewFiles(Array.from(e.target.files));
                                        setPreviewModalVisible(true);
                                        // Reset value to allow re-selecting same folder
                                        e.target.value = '';
                                    }
                                }}
                                className="hidden"
                                disabled={isUploading}
                                multiple
                            />
                            <div className="flex flex-col items-center space-y-3">
                                <FolderOpenOutlined className={`text-4xl !text-[#724CF9]`} />
                                <div>
                                    <p className={`text-base font-medium ${isDragOver ? 'text-[#724CF9]' : 'text-[#DBD4D3]'}`}>
                                        {isDragOver ? 'Rilascia la cartella qui' : 'Trascina una cartella o clicca per selezionare'}
                                    </p>
                                    <p className="text-sm text-[#9ca3af] mt-1">Caricamento ricorsivo • Coda automatica</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); document.getElementById('folder-input')?.click(); }}
                                    disabled={isUploading}
                                    className="px-4 py-2 bg-[#724CF9] text-white rounded-md hover:bg-[#5a3fd1] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    <FolderOpenOutlined />
                                    Sfoglia Cartella
                                </button>
                            </div>
                        </div>

                        {/* File Preview Modal */}
                        <FilePreviewModal
                            visible={previewModalVisible}
                            files={previewFiles}
                            onCancel={() => {
                                setPreviewModalVisible(false);
                                setPreviewFiles([]);
                            }}
                            onConfirm={(files) => {
                                setPreviewModalVisible(false); // Close modal first

                                // Add files to Transfer Queue
                                let count = 0;
                                files.forEach(file => {
                                    addUpload(file);
                                    count++;
                                });

                                // Show success message
                                Swal.fire({
                                    title: "Aggiunti alla Coda",
                                    text: `${count} file aggiunti alla coda di upload. Controlla il pannello Trasferimenti.`,
                                    icon: "success",
                                    timer: 2000,
                                    showConfirmButton: false
                                });

                                setPreviewFiles([]);
                            }}
                        />
                    </BentoCard>

                    {/* Transfer Status Card */}
                    <BentoCard
                        size="1x2"
                        title="Trasferimenti"
                        subtitle="Stato upload/download"
                        icon={<CloudUploadOutlined />}
                        className="overflow-y-auto max-h-[400px]"
                    >
                        <TransferStatusPanel />
                    </BentoCard>

                    {/* Multipart Upload Card */}
                    <BentoCard
                        size="2x1"
                        title="File Grandi"
                        subtitle="Per file superiori a 100MB"
                        icon={<CloudUploadOutlined />}
                    >
                        <MultipartFileUploader
                            apiBaseUrl={import.meta.env.VITE_API_MULTIPART_URL || 'YOUR_API_URL_HERE'}
                            onUploadComplete={() => {
                                Swal.fire({
                                    title: "Upload Completato!",
                                    text: `File caricato con successo.`,
                                    icon: "success"
                                });
                                if (filesLoaded) handleLoadFiles();
                            }}
                        />
                    </BentoCard>
                </div>

                {/* File Sender Section */}
                <section className="mt-4">
                    <BentoCard
                        size="full"
                        title="Invia File"
                        subtitle="Condividi file via email"
                        icon={<ShareAltOutlined />}
                        padding="lg"
                    >
                        <FileSender
                            onFileSent={handleLoadFiles}
                            onLinkGenerated={(linkData) => {
                                setShareData(linkData);
                                setShareModalVisible(true);
                            }}
                        />
                    </BentoCard>
                </section>

                {/* Share Modal - manteniamo la struttura esistente */}
                <Modal
                    title={
                        <div className="flex items-center gap-2">
                            <LinkOutlined className="text-[#724CF9]" />
                            <span className="text-white">Link di Condivisione Creato</span>
                        </div>
                    }
                    open={shareModalVisible}
                    onCancel={() => setShareModalVisible(false)}
                    footer={[
                        <Button key="close" onClick={() => setShareModalVisible(false)}>
                            Chiudi
                        </Button>
                    ]}
                    width={600}
                    styles={{
                        body: { backgroundColor: '#1a1625', color: '#DBD4D3', padding: '16px' },
                        header: { backgroundColor: '#2c2638' },
                        footer: { backgroundColor: '#2c2638' }
                    }}
                >
                    {shareData && (
                        <div className="space-y-6">
                            {/* Link di Download */}
                            <div>
                                <label className="block text-sm font-medium text-[#DBD4D3] mb-2">
                                    🔗 Link per Download:
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        value={shareData.url || ''}
                                        readOnly
                                        className="flex-1"
                                        style={{ backgroundColor: '#2c2638', color: '#DBD4D3', border: '1px solid #4a4554' }}
                                    />
                                    <Button
                                        type="primary"
                                        icon={<CopyOutlined />}
                                        onClick={() => copyToClipboard(shareData.url)}
                                        className="!bg-[#724CF9] !hover:!bg-[#5a3fd1] border-[#724CF9]"
                                    >
                                        Copia
                                    </Button>
                                </div>
                            </div>

                            {/* Link di Preview */}
                            <div>
                                <label className="block text-sm font-medium text-[#DBD4D3] mb-2">
                                    👁️ Link per Preview:
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        value={shareData.previewUrl || 'N/A'}
                                        readOnly
                                        className="flex-1"
                                        style={{ backgroundColor: '#2c2638', color: '#DBD4D3', border: '1px solid #4a4554' }}
                                    />
                                    <Button
                                        type="default"
                                        icon={<CopyOutlined />}
                                        onClick={() => shareData.previewUrl && copyToClipboard(shareData.previewUrl)}
                                        disabled={!shareData.previewUrl}
                                        className="!bg-[#4a4554] !hover:bg-[#5a5460] !border-[#4a4554] !text-white"
                                    >
                                        Copia
                                    </Button>
                                </div>
                            </div>

                            {/* Dettagli del file */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-[#2c2638] p-4 rounded-lg">
                                    <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                                        <FileOutlined className="text-[#724CF9]" />
                                        Informazioni File
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between gap-2 overflow-hidden">
                                            <span className="text-[#DBD4D3]">Nome:</span>
                                            <Tooltip title={shareData.fileName}>
                                                <span className="text-white font-medium truncate cursor-help">{shareData.fileName}</span>
                                            </Tooltip>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-[#DBD4D3]">Dimensione:</span>
                                            <span className="text-white">{shareData.fileSize}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-[#2c2638] p-4 rounded-lg">
                                    <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                                        <ClockCircleOutlined className="text-[#724CF9]" />
                                        Informazioni Link
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-[#DBD4D3]">Scadenza:</span>
                                            <span className="text-white">{shareData.expiresIn}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[#DBD4D3]">Stato:</span>
                                            <span className="text-green-400">✓ Attivo</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </Modal>

                {/* Modale di condivisione user-to-user */}
                <ShareFileModal
                    visible={shareUserModalVisible}
                    file={fileToShare}
                    onClose={() => {
                        setShareUserModalVisible(false);
                        setFileToShare(null);
                    }}
                    onSuccess={() => {
                        handleLoadFiles();
                    }}
                />
            </div>
        </>
    );
};

export default Home;
