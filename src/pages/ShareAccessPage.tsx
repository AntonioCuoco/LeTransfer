/**
 * ShareAccessPage - Pagina pubblica per accedere a un link condivisibile
 * 
 * Flow:
 * 1. Recupera publicToken da URL params
 * 2. Estrae encryption key dal URL fragment (se presente)
 * 3. Verifica validità link (GET /shared-links/:publicToken)
 * 4. Se valido → mostra form nome/password
 * 5. Se scaduto/revocato → mostra errore
 * 6. Dopo autenticazione → mostra preview/download
 * 7. Se encrypted → decifra il file prima di salvarlo
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'react-router';
import { Spin, message } from 'antd';
import { FileOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { usePublicLink } from '../hooks/usePublicLink';
import { LinkAccessForm, FilePreviewCard, LinkExpiredError } from '../components/LinkAccess';
import {
    parseKeyFromHash,
    importKeyFromBase64,
    importIVFromBase64,
    decryptFile
} from '../utils/crypto';

/**
 * Stato della pagina
 */
type PageState = 'loading' | 'access_form' | 'authenticated' | 'error';

interface EncryptionInfo {
    key: CryptoKey;
    iv: Uint8Array;
}

const ShareAccessPage = () => {
    const { publicToken } = useParams<{ publicToken: string }>();
    const location = useLocation();
    const [pageState, setPageState] = useState<PageState>('loading');
    const [isDownloading, setIsDownloading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [encryptionInfo, setEncryptionInfo] = useState<EncryptionInfo | null>(null);
    const [isDecrypting, setIsDecrypting] = useState(false);

    const {
        linkInfo,
        linkStatus,
        isLoading,
        error,
        getLinkInfo,
        accessLink,
        downloadFile
    } = usePublicLink();

    /**
     * Estrae e importa la chiave di cifratura dal fragment URL
     */
    const extractEncryptionKey = useCallback(async () => {
        const keyData = parseKeyFromHash(location.hash);
        if (!keyData) return null;

        try {
            const key = await importKeyFromBase64(keyData.key);
            const iv = importIVFromBase64(keyData.iv);
            return { key, iv };
        } catch (err) {
            message.error('Impossibile importare la chiave di cifratura');
            return null;
        }
    }, [location.hash]);

    /**
     * Carica le info del link all'avvio
     */
    useEffect(() => {
        const loadLinkInfo = async () => {
            if (!publicToken) {
                setPageState('error');
                return;
            }

            // Estrai encryption key dal fragment
            const encInfo = await extractEncryptionKey();
            if (encInfo) {
                setEncryptionInfo(encInfo);
            }

            const info = await getLinkInfo(publicToken);
            if (info) {
                setPageState('access_form');
            } else {
                setPageState('error');
            }
        };

        loadLinkInfo();
    }, [publicToken, getLinkInfo, extractEncryptionKey]);

    /**
     * Gestisce il submit del form di accesso
     */
    const handleAccessSubmit = async (visitorName: string, password?: string) => {
        if (!publicToken) return;

        const response = await accessLink(publicToken, { visitorName, password });

        if (response) {
            setPageState('authenticated');

            // Se la preview è supportata e NON è cifrato, carica l'URL
            // (preview non supportata per file cifrati - richiederebbe decifratura client-side)
            if (response.previewSupported && !encryptionInfo) {
                const url = await downloadFile(publicToken, 'preview');
                if (url) {
                    setPreviewUrl(url);
                }
            }
        }
    };

    /**
     * Gestisce il download del file (con decifratura se necessario)
     */
    const handleDownload = async () => {
        if (!publicToken) return;

        setIsDownloading(true);
        const url = await downloadFile(publicToken, 'download');

        if (url) {
            if (encryptionInfo) {
                // File è cifrato - scarica, decifra, e salva
                setIsDecrypting(true);
                try {
                    // Scarica il blob cifrato
                    const response = await fetch(url);
                    const encryptedBlob = await response.blob();

                    // Decifra
                    const decryptedBlob = await decryptFile(
                        encryptedBlob,
                        encryptionInfo.key,
                        encryptionInfo.iv
                    );

                    // Salva il file decifrato
                    const downloadUrl = URL.createObjectURL(decryptedBlob);
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = linkInfo?.fileName || 'download';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(downloadUrl);

                    message.success('File decifrato e scaricato!');
                } catch (err) {
                    message.error('Errore durante la decifratura del file');
                } finally {
                    setIsDecrypting(false);
                }
            } else {
                // File non cifrato - download diretto
                window.open(url, '_blank');
                message.success('Download avviato!');
            }
        }

        setIsDownloading(false);
    };

    /**
     * Apre la preview in una nuova tab
     */
    const handlePreview = () => {
        if (previewUrl) {
            window.open(previewUrl, '_blank');
        }
    };

    // Mostra errore se il link non è valido
    if (pageState === 'error' || (linkStatus !== 'valid' && linkStatus !== 'loading')) {
        return <LinkExpiredError status={linkStatus} message={error || undefined} />;
    }

    // Loading iniziale
    if (pageState === 'loading' || !linkInfo) {
        return (
            <div className="min-h-screen bg-[#2c2638] flex items-center justify-center">
                <div className="text-center">
                    <Spin size="large" />
                    <p className="text-[#9ca3af] mt-4">Caricamento...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#2c2638] flex items-center justify-center p-4">
            <div className="max-w-lg w-full">
                {/* Header con logo */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">
                        le<span className="text-[#724CF9]">Transfer</span>
                    </h1>
                    <p className="text-[#9ca3af]">
                        {pageState === 'access_form'
                            ? 'Accedi per visualizzare il file condiviso'
                            : 'File pronto per il download'
                        }
                    </p>
                </div>

                {/* Card principale */}
                <div className="bg-[#3c364c] border border-[#4a4554] rounded-2xl overflow-hidden">
                    {/* Header file info */}
                    <div className="bg-gradient-to-r from-[#724CF9]/20 to-transparent p-6 border-b border-[#4a4554]">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl bg-[#724CF9] flex items-center justify-center flex-shrink-0">
                                <FileOutlined className="text-white text-2xl" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2
                                    className="text-white font-semibold text-lg truncate"
                                    title={linkInfo.fileName}
                                >
                                    {linkInfo.fileName}
                                </h2>
                                <div className="flex items-center gap-3 text-sm text-[#9ca3af]">
                                    <span>{linkInfo.fileSize}</span>
                                    <span className="w-1 h-1 rounded-full bg-[#4a4554]"></span>
                                    <span className="truncate">{linkInfo.fileType}</span>
                                    {linkInfo.isPasswordProtected && (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-[#4a4554]"></span>
                                            <span className="flex items-center gap-1 text-[#724CF9]">
                                                <LockOutlined /> Protetto
                                            </span>
                                        </>
                                    )}
                                    {encryptionInfo && (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-[#4a4554]"></span>
                                            <span className="flex items-center gap-1 text-green-400">
                                                <SafetyCertificateOutlined /> E2E Encrypted
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {pageState === 'access_form' && (
                            <LinkAccessForm
                                isPasswordProtected={linkInfo.isPasswordProtected}
                                isLoading={isLoading}
                                error={error}
                                onSubmit={handleAccessSubmit}
                            />
                        )}

                        {pageState === 'authenticated' && (
                            <FilePreviewCard
                                fileName={linkInfo.fileName}
                                fileSize={linkInfo.fileSize}
                                fileType={linkInfo.fileType}
                                previewUrl={previewUrl || undefined}
                                previewSupported={!!previewUrl}
                                isDownloading={isDownloading}
                                isDecrypting={isDecrypting}
                                onDownload={handleDownload}
                                onPreview={handlePreview}
                            />
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-6">
                    <p className="text-[#676178] text-sm">
                        {linkInfo.ownerName
                            ? `Condiviso da ${linkInfo.ownerName}`
                            : 'File condiviso tramite leTransfer'
                        }
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ShareAccessPage;
