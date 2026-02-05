import { ProfileHeader } from "@/src/components/ProfileHeader";
import { FileStatsGrid } from "@/src/components/FileStatsGrid";
import { FilesTable } from "@/src/components/FilesTable";
import { ShareFileModal } from "@/src/components/ShareFileModal/ShareFileModal";
import { useState, useEffect } from "react";
import { Pagination, Spin, message, Button, Select, Tabs, Modal } from "antd";
import { ReloadOutlined, CloudUploadOutlined, InboxOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useFileFromDynamoDB } from "../hooks/useFileFromDynamoDB";
import { useShareFile } from "../hooks/useShareFile";
import type { DynamoDBFile, TableFile, SharedFile } from "../types";
import { SharedLinksTable } from "@/src/components/SharedLinksTable";
import { useSharedLinks } from "@/src/hooks/useSharedLinks";
import { useEncryption } from "../contexts/EncryptionContext";
import { RecoveryKeySetup } from "../components/RecoveryKeySetup";

// Opzioni per il filtro tipo di file
const fileTypeOptions = [
  { value: '', label: 'Tutti i tipi' },
  { value: 'image', label: 'Immagini' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documenti' },
  { value: 'archive', label: 'Archivi' },
  { value: 'application', label: 'Applicazioni' }
];

export default function Profile() {
  // Hook per i file propri da DynamoDB
  const {
    files: dynamoFiles,
    isLoading: hookLoading,
    loadFiles: loadFilesFromDynamo,
    deleteFile: deleteFileFromDynamo,
    downloadFile
  } = useFileFromDynamoDB();

  // Hook per la condivisione file
  const {
    sharedFiles,
    isLoadingShared,
    getSharedWithMe
  } = useShareFile();

  const {
    links: sharedLinks,
    isLoading: isLinksLoading,
    fetchLinks,
    revokeLink,
    regenerateLink,
    updateLink,
    deleteLink
  } = useSharedLinks();

  // Encryption Context
  const { isSetupRequired, refreshStatus } = useEncryption();
  const [securitySetupVisible, setSecuritySetupVisible] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalFiles, setTotalFiles] = useState(0);
  const [pageSize] = useState(10);
  const [stats, setStats] = useState({
    uploaded: 0,
    downloaded: 0,
    sent: 0,
    received: 0,
    archived: 0,
    deleted: 0
  });
  const [selectedFileType, setSelectedFileType] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('all');

  // Stato per la modale di condivisione
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [fileToShare, setFileToShare] = useState<DynamoDBFile | null>(null);

  // Combina i file propri e quelli ricevuti
  const [allFiles, setAllFiles] = useState<TableFile[]>([]);

  // Carica i file usando l'hook
  const loadFiles = async (page: number = 1) => {
    try {
      const options: { limit: number; fileType?: string } = {
        limit: pageSize * page
      };

      if (selectedFileType) {
        options.fileType = selectedFileType;
      }

      const result = await loadFilesFromDynamo(options);

      if (result) {
        setTotalFiles(result.count);
        updateStats(result.count, sharedFiles.length);
      }
    } catch (error: unknown) {
      message.error("Errore durante il caricamento dei file");
    }
  };

  // Carica i file ricevuti
  const loadSharedFiles = async () => {
    try {
      const files = await getSharedWithMe();
      updateStats(dynamoFiles.length, files.length);
    } catch (error: unknown) {
      message.error("Errore durante il caricamento dei file condivisi");
    }
  };

  // Aggiorna le statistiche
  const updateStats = (uploadedCount: number, receivedCount: number) => {
    // Conta i file condivisi (quelli con sharedWith)
    const sentCount = dynamoFiles.filter(f => f.sharedWith && f.sharedWith.length > 0).length;

    setStats({
      uploaded: uploadedCount,
      downloaded: 0,
      sent: sentCount,
      received: receivedCount,
      archived: 0,
      deleted: 0
    });
  };

  // Carica i file al mount del componente
  useEffect(() => {
    loadFiles(1);
    loadSharedFiles();
    fetchLinks();
  }, []);

  // Combina e converte i file quando cambiano
  useEffect(() => {
    const ownFiles = convertFilesToTableFormat(dynamoFiles);
    const receivedFiles = convertSharedFilesToTableFormat(sharedFiles);

    // Combina i file in base al tab attivo
    if (activeTab === 'uploaded') {
      setAllFiles(ownFiles);
      setTotalFiles(ownFiles.length);
    } else if (activeTab === 'received') {
      setAllFiles(receivedFiles);
      setTotalFiles(receivedFiles.length);
    } else {
      // 'all' - mostra tutti
      setAllFiles([...ownFiles, ...receivedFiles]);
      setTotalFiles(ownFiles.length + receivedFiles.length);
    }
  }, [dynamoFiles, sharedFiles, activeTab]);

  // Ottieni i file per la pagina corrente (paginazione lato client)
  const getCurrentPageFiles = () => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allFiles.slice(startIndex, endIndex);
  };

  // Gestisce il cambio di pagina
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Gestisce il cambio di filtro tipo file
  const handleFileTypeChange = (fileType: string) => {
    setSelectedFileType(fileType);
    setCurrentPage(1);
    loadFiles(1);
  };

  // Gestisce il cambio di tab
  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setCurrentPage(1);
  };

  // Gestisce l'eliminazione di un file usando l'hook
  const handleDeleteFile = async (fileId: string) => {
    try {
      const file = dynamoFiles.find(f => f.fileId === fileId || f.s3Key === fileId);

      if (!file) {
        message.error("File non trovato");
        return;
      }

      await deleteFileFromDynamo(file.fileId, file.s3Key, {
        onSuccess: () => {
          message.success('File eliminato con successo');
          loadFiles(currentPage);
        },
        onError: () => {
          message.error("Errore durante l'eliminazione del file");
        }
      });
    } catch (error: unknown) {
      message.error("Errore durante l'eliminazione del file");
    }
  };

  // Gestisce l'apertura della modale di condivisione
  const handleShareFile = (file: DynamoDBFile) => {
    setFileToShare(file);
    setShareModalVisible(true);
  };

  // Gestisce la chiusura della modale di condivisione
  const handleShareModalClose = () => {
    setShareModalVisible(false);
    setFileToShare(null);
  };

  // Callback dopo condivisione riuscita
  const handleShareSuccess = () => {
    // Ricarica i file per aggiornare lo stato
    loadFiles(currentPage);
    message.success('File condiviso con successo!');
  };

  // Gestisce il download di un file (wrapper per supportare SharedFile)
  const handleDownloadFile = async (file: DynamoDBFile) => {
    await downloadFile(file);
  };

  // Converte i dati DynamoDB nel formato della tabella
  const convertFilesToTableFormat = (dynamoDBFiles: DynamoDBFile[]): TableFile[] => {
    return dynamoDBFiles.map((file, index) => ({
      id: file.fileId || file.s3Key || index.toString(),
      name: file.fileName || file.originalName || 'File sconosciuto',
      type: file.fileType || 'application/octet-stream',
      size: file.fileSize || 'N/A',
      status: (file.sharedWith && file.sharedWith.length > 0) ? 'sent' as const : 'uploaded' as const,
      date: file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('it-IT') : 'Sconosciuta',
      recipient: file.sharedWith && file.sharedWith.length > 0
        ? file.sharedWith.map(r => r.email).join(', ')
        : '-',
      originalFile: file,
      sharedWith: file.sharedWith,
      isShared: file.sharedWith && file.sharedWith.length > 0,
      isReceived: false
    }));
  };

  // Converte i file ricevuti nel formato della tabella
  const convertSharedFilesToTableFormat = (files: SharedFile[]): TableFile[] => {
    return files.map((file, index) => {
      // Crea un DynamoDBFile compatibile per le azioni
      const dynamoFile: DynamoDBFile = {
        fileId: file.shareId,
        fileName: file.fileName,
        originalName: file.fileName,
        fileSize: typeof file.fileSize === 'number'
          ? formatFileSize(file.fileSize)
          : file.fileSize,
        formattedSize: typeof file.fileSize === 'number'
          ? formatFileSize(file.fileSize)
          : file.fileSize,
        fileType: file.fileType,
        s3Key: file.s3Key,
        s3Url: file.s3Url,
        urlExpires: null,
        ownerUserId: file.ownerId,
        uploadedAt: file.createdAt,
        isReceived: true,
        senderEmail: file.ownerEmail,
        senderId: file.ownerId,
        shareId: file.shareId,
        sharedAt: file.createdAt
      };

      return {
        id: file.shareId || index.toString(),
        name: file.fileName || 'File sconosciuto',
        type: file.fileType || 'application/octet-stream',
        size: typeof file.fileSize === 'number'
          ? formatFileSize(file.fileSize)
          : file.fileSize,
        status: 'received' as const,
        date: file.createdAt ? new Date(file.createdAt).toLocaleDateString('it-IT') : 'Sconosciuta',
        recipient: '-',
        originalFile: dynamoFile,
        isReceived: true,
        senderEmail: file.ownerEmail || 'Utente sconosciuto'
      };
    });
  };

  // Formatta la dimensione del file
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Refresh tutti i file


  const handleRefreshAll = () => {
    loadFiles(currentPage);
    loadSharedFiles();
    fetchLinks();
  };

  const isLoading = hookLoading || isLoadingShared || isLinksLoading;

  return (
    <div className="h-fit bg-[#2c2638]">
      <div className="h-fit bg-[#2c2638]">
        <ProfileHeader />

        {isSetupRequired && (
          <div className="mx-8 mt-6">
            <div className="bg-[#fff1f0] border border-[#ffa39e] p-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SafetyCertificateOutlined className="!text-[#cf1322] text-xl" />
                <div>
                  <h4 className="text-[#cf1322] font-semibold m-0">Sicurezza End-to-End non configurata</h4>
                  <p className="text-[#cf1322] text-sm m-0">Per proteggere i tuoi file e accedervi da altri dispositivi, configura la Recovery Key.</p>
                </div>
              </div>
              <Button type="primary" danger onClick={() => setSecuritySetupVisible(true)}>
                Configura Ora
              </Button>
            </div>
          </div>
        )}

        <FileStatsGrid stats={stats} />

        <div className="p-8">
          <div className="shadow-card border-0 bg-[#3c364c] rounded-lg">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">Tutti i File</h2>
                  {totalFiles > 0 && (
                    <p className="text-[#DBD4D3] text-sm mt-1">
                      {totalFiles} file totali
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedFileType}
                    onChange={handleFileTypeChange}
                    options={fileTypeOptions}
                    placeholder="Filtra per tipo"
                    className="w-48"
                    style={{
                      backgroundColor: '#2c2638',
                      color: '#DBD4D3',
                      border: '1px solid #4a4554'
                    }}
                  />
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleRefreshAll}
                    loading={isLoading}
                    className="bg-[#724CF9] hover:bg-[#5a3fd1] border-[#724CF9] text-white"
                  >
                    Aggiorna
                  </Button>
                </div>
              </div>

              {/* Tabs per filtrare i file */}
              <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                className="mb-4"
                items={[
                  {
                    key: 'all',
                    label: (
                      <span className="flex items-center gap-2">
                        <CloudUploadOutlined />
                        Tutti ({dynamoFiles.length + sharedFiles.length})
                      </span>
                    ),
                  },
                  {
                    key: 'uploaded',
                    label: (
                      <span className="flex items-center gap-2">
                        <CloudUploadOutlined />
                        Caricati ({dynamoFiles.length})
                      </span>
                    ),
                  },
                  {
                    key: 'received',
                    label: (
                      <span className="flex items-center gap-2">
                        <InboxOutlined />
                        Ricevuti({sharedFiles.length})
                      </span >
                    ),
                  }
                ]}
                style={{
                  marginBottom: '16px'
                }}
              />

              {
                isLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <Spin size="large" />
                  </div>
                ) : allFiles.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[#DBD4D3] text-lg">
                      {activeTab === 'received'
                        ? 'Nessun file ricevuto'
                        : activeTab === 'uploaded'
                          ? 'Nessun file caricato'
                          : 'Nessun file'}
                    </p>
                    <p className="text-[#DBD4D3] text-sm mt-2">
                      {activeTab === 'received'
                        ? 'I file che riceverai dagli altri utenti appariranno qui'
                        : 'I file che carichi appariranno qui'}
                    </p>
                  </div>
                ) : (
                  <>
                    <FilesTable
                      files={getCurrentPageFiles()}
                      hideHeader={true}
                      onDeleteFile={handleDeleteFile}
                      onDownloadFile={handleDownloadFile}
                      onShareFile={handleShareFile}
                    />

                    {totalFiles > pageSize && (
                      <div className="flex justify-center mt-6">
                        <Pagination
                          current={currentPage}
                          total={totalFiles}
                          pageSize={pageSize}
                          onChange={handlePageChange}
                          showSizeChanger={false}
                          showQuickJumper
                          showTotal={(total, range) =>
                            `${range[0]}-${range[1]} di ${total} file`
                          }
                          className="custom-pagination"
                        />
                      </div>
                    )}
                  </>
                )
              }
            </div >
          </div >

          {/* Sezione Link Generati */}
          < div className="shadow-card border-0 bg-[#3c364c] rounded-lg mt-8" >
            <div className="p-6">
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-white">Link Generati</h2>
                <p className="text-[#DBD4D3] text-sm mt-1">
                  {sharedLinks.length} link attivi
                </p>
              </div>

              {isLinksLoading ? (
                <div className="flex justify-center items-center py-8">
                  <Spin size="large" />
                </div>
              ) : (
                <SharedLinksTable
                  links={sharedLinks}
                  onRevoke={revokeLink}
                  onRegenerate={regenerateLink}
                  onUpdate={updateLink}
                  onDelete={deleteLink}
                />
              )}
            </div>
          </div >
        </div >

        {/* Modale di condivisione */}
        <ShareFileModal
          visible={shareModalVisible}
          file={fileToShare}
          onClose={handleShareModalClose}
          onSuccess={handleShareSuccess}
          onLinkGenerated={fetchLinks}
        />

        {/* Security Setup Modal */}
        <Modal
          open={securitySetupVisible}
          footer={null}
          onCancel={() => setSecuritySetupVisible(false)}
          closable={false}
          width={800}
          centered
          destroyOnClose
          maskClosable={false}
          className="custom-modal-transparent"
          styles={{
            content: {
              backgroundColor: '#1a1625',
              border: '1px solid #4a4554',
              borderRadius: '16px',
              padding: '0'
            },
            mask: {
              backdropFilter: 'blur(5px)',
              backgroundColor: 'rgba(0, 0, 0, 0.7)'
            }
          }}
        >
          <div className="p-8">
            <RecoveryKeySetup
              onComplete={() => {
                setSecuritySetupVisible(false);
                refreshStatus();
                message.success("Sicurezza configurata!");
              }}
              onCancel={() => setSecuritySetupVisible(false)}
            />
          </div>
        </Modal>
      </div >
    </div >
  );
}