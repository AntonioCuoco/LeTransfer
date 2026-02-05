/**
 * ShareFileModal - Modal per condividere file
 * 
 * Due modalità:
 * 1. Condivisione diretta via email (utente registrato)
 * 2. Generazione link condivisibile con token pubblico
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Modal, Button, Spin, Switch, InputNumber, message, Input } from 'antd';
import {
    ShareAltOutlined,
    MailOutlined,
    FileOutlined,
    SendOutlined,
    CloseOutlined,
    LinkOutlined,
    LockOutlined,
    ClockCircleOutlined,
    CopyOutlined,
    CheckOutlined,
    EyeOutlined,
    EyeInvisibleOutlined
} from '@ant-design/icons';
import { useShareFile } from '../../hooks/useShareFile';
import { useSharedLinks } from '../../hooks/useSharedLinks';
import { useEncryptionOptional } from '../../contexts/EncryptionContext';
import type { DynamoDBFile } from '../../types';

// URL base del frontend per generare i link
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || window.location.origin;

interface ShareFileModalProps {
    visible: boolean;
    file: DynamoDBFile | null;
    onClose: () => void;
    onSuccess?: () => void;
    onLinkGenerated?: () => void;
}

interface FormInputs {
    email: string;
}

export const ShareFileModal = ({ visible, file, onClose, onSuccess, onLinkGenerated }: ShareFileModalProps) => {
    const { shareFile, isSharing } = useShareFile();
    const { createLink, isCreating } = useSharedLinks();
    const encryption = useEncryptionOptional();

    // Link generation state
    const [generatedLink, setGeneratedLink] = useState('');
    const [linkCopied, setLinkCopied] = useState(false);

    // Link options state
    const [usePassword, setUsePassword] = useState(false);
    const [password, setPassword] = useState('');
    const [expiresInHours, setExpiresInHours] = useState<number>(); // 7 giorni default
    const [maxDownloads, setMaxDownloads] = useState<number | null>(null);
    const [useMaxDownloads, setUseMaxDownloads] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
        watch
    } = useForm<FormInputs>({
        mode: 'onChange',
        defaultValues: {
            email: ''
        }
    });

    const emailValue = watch('email');

    // Reset form quando si chiude la modale
    useEffect(() => {
        if (!visible) {
            reset();
            setGeneratedLink('');
            setLinkCopied(false);
            setUsePassword(false);
            setPassword('');
            setExpiresInHours(168);
            setMaxDownloads(null);
            setUseMaxDownloads(false);
        }
    }, [visible, reset]);

    /**
     * Condivide il file via email
     */
    const onSubmit = async (data: FormInputs) => {
        if (!file) return;

        await shareFile(file.s3Key, data.email.trim(), {
            onSuccess: () => {
                onClose();
                if (onSuccess) {
                    onSuccess();
                }
            }
        });
    };

    /**
     * Genera un link condivisibile
     */
    const handleGenerateLink = async () => {
        if (!file) return;

        // Get encryption key from context if available
        const encryptionData = encryption ? await encryption.getKey(file.s3Key) : null;

        // Check if file is encrypted but key is missing
        if (file.isEncrypted && !encryptionData) {
            const confirmed = await new Promise<boolean>(resolve => {
                Modal.confirm({
                    title: 'Chiave di cifratura mancante',
                    content: 'Attenzione: Questo file è cifrato (E2E) ma la chiave di decifratura non è stata trovata in questo browser. Il link generato permetterà di scaricare il file solo in formato cifrato (illeggibile/corrotto). Vuoi procedere comunque?',
                    okText: 'Genera comunque',
                    okButtonProps: { danger: true },
                    cancelText: 'Annulla',
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            });
            if (!confirmed) return;
        }

        const link = await createLink(
            file.s3Key,
            file.fileName || file.originalName,
            typeof file.fileSize === 'string' ? file.fileSize : formatFileSize(file.fileSize),
            file.fileType,
            {
                password: usePassword ? password : undefined,
                expiresInHours,
                maxDownloads: useMaxDownloads ? maxDownloads || undefined : undefined,
                // Pass encryption data if available
                encryptionKey: encryptionData?.key,
                encryptionIV: encryptionData?.iv
            }
        );

        if (link) {
            // Use the encryptedUrl if available (contains the key fragment), otherwise fallback
            const fullUrl = link.encryptedUrl || `${FRONTEND_URL}/share/${link.publicToken}`;
            setGeneratedLink(fullUrl);

            if (encryptionData) {
                message.success('Link E2E cifrato generato!');
            } else {
                message.warning('Link generato senza chiavi (File non cifrato o chiave mancante).');
            }

            // Notifica il parent per aggiornare la lista
            if (onLinkGenerated) {
                onLinkGenerated();
            }
        }
    };

    /**
     * Copia il link negli appunti
     */
    const handleCopyLink = () => {
        if (generatedLink) {
            navigator.clipboard.writeText(generatedLink);
            setLinkCopied(true);
            message.success('Link copiato negli appunti!');

            // Reset stato dopo 2 secondi
            setTimeout(() => setLinkCopied(false), 2000);
        }
    };

    /**
     * Formatta la dimensione del file per la visualizzazione
     */
    const formatFileSize = (size: string | number): string => {
        if (typeof size === 'string') return size;
        if (size === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(size) / Math.log(k));
        return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#724CF9] to-[#9d7bfa] flex items-center justify-center">
                        <ShareAltOutlined className="text-white text-lg" />
                    </div>
                    <div>
                        <h3 className="text-white text-lg font-semibold m-0">Condividi File</h3>
                        <p className="text-[#9ca3af] text-xs m-0">Invia o genera un link condivisibile</p>
                    </div>
                </div>
            }
            open={visible}
            onCancel={onClose}
            footer={null}
            width={520}
            centered
            destroyOnClose
            closeIcon={<CloseOutlined className="text-[#9ca3af] hover:text-white" />}
            styles={{
                content: {
                    backgroundColor: '#2c2638',
                    borderRadius: '16px',
                    border: '1px solid #4a4554',
                    padding: 0
                },
                header: {
                    backgroundColor: '#2c2638',
                    borderBottom: '1px solid #4a4554',
                    padding: '20px 24px',
                    borderRadius: '16px 16px 0 0'
                },
                body: {
                    backgroundColor: '#2c2638',
                    padding: '24px'
                }
            }}
        >
            {file && (
                <div className="space-y-6">
                    {/* File Preview Card */}
                    <div className="bg-gradient-to-r from-[#1a1625] to-[#2c2638] border border-[#4a4554] rounded-xl p-4">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-lg bg-[#724CF9] flex items-center justify-center flex-shrink-0">
                                <FileOutlined className="text-white text-xl" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate mb-1" title={decodeURIComponent(file.fileName || file.originalName)}>
                                    {decodeURIComponent(file.fileName || file.originalName)}
                                </p>
                                <div className="flex items-center gap-3 text-sm text-[#9ca3af]">
                                    <span className="whitespace-nowrap">{formatFileSize(file.fileSize || file.formattedSize)}</span>
                                    <span className="w-1 h-1 rounded-full bg-[#4a4554] flex-shrink-0"></span>
                                    <span className="truncate cursor-help" title={file.fileType}>{file.fileType}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Email Form Section */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="w-full">
                            <label className="text-[#DBD4D3] font-medium text-sm mb-2 block">
                                Email del destinatario
                            </label>
                            <div className="relative">
                                <MailOutlined className="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
                                <input
                                    {...register('email', {
                                        required: "Email obbligatoria",
                                        pattern: {
                                            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                            message: "Formato email non valido"
                                        }
                                    })}
                                    type="email"
                                    placeholder="esempio@email.com"
                                    disabled={isSharing}
                                    className="w-full p-3 pl-10 rounded-lg focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#1a1625] border border-[#4a4554] placeholder:text-[#676178] text-white disabled:opacity-50"
                                />
                            </div>
                            {errors.email && (
                                <p className="text-[#F4743B] mt-1 text-sm">{errors.email.message}</p>
                            )}
                        </div>

                        {/* Info Box */}
                        <div className="bg-[#1a1625] border border-[#4a4554] rounded-xl p-4">
                            <p className="text-[#9ca3af] text-sm m-0">
                                <span className="text-[#724CF9] font-medium">ℹ️ Nota:</span> Il destinatario deve essere un utente registrato sulla piattaforma.
                            </p>
                        </div>

                        {/* Submit Button for email */}
                        <div className="flex justify-end">
                            <Button
                                type="primary"
                                htmlType="submit"
                                disabled={!emailValue?.trim() || isSharing}
                                icon={isSharing ? <Spin size="small" /> : <SendOutlined />}
                                size="large"
                                className="!bg-[#724CF9] hover:!bg-[#9d7bfa] !text-white !border-[#724CF9] hover:!border-[#724CF9]"
                                style={{ borderRadius: '10px', height: '44px', padding: '0 24px' }}
                            >
                                {isSharing ? 'Invio...' : 'Invia al destinatario'}
                            </Button>
                        </div>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-2">
                        <div className="h-px bg-[#4a4554] flex-1"></div>
                        <span className="text-[#9ca3af] text-xs uppercase tracking-wider">Oppure genera un link</span>
                        <div className="h-px bg-[#4a4554] flex-1"></div>
                    </div>

                    {/* Link Generation Section */}
                    <div className="space-y-4">
                        {/* Link Options */}
                        <div className="bg-[#1a1625] border border-[#4a4554] rounded-xl p-4 space-y-4">
                            {/* Password Option */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <LockOutlined className="!text-[#724CF9]" />
                                    <span className="text-[#DBD4D3] text-sm">Proteggi con password</span>
                                </div>
                                <Switch
                                    checked={usePassword}
                                    onChange={setUsePassword}
                                    className="!bg-[#4a4554]"
                                />
                            </div>

                            {usePassword && (
                                <Input.Password
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Inserisci password"
                                    className="w-full !bg-[#2c2638] !border-[#4a4554] placeholder:!text-[#676178] !text-white text-sm hover:!border-[#724CF9] focus:!border-[#724CF9]"
                                    style={{ backgroundColor: '#2c2638', color: 'white' }}
                                    iconRender={(visible) => (
                                        visible
                                            ? <EyeOutlined className="!text-[#9ca3af] hover:!text-white" />
                                            : <EyeInvisibleOutlined className="!text-[#9ca3af] hover:!text-white" />
                                    )}
                                />
                            )}

                            {/* Expiry Option */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <ClockCircleOutlined className="!text-[#724CF9]" />
                                    <span className="text-[#DBD4D3] text-sm">Scadenza (ore)</span>
                                </div>
                                <InputNumber
                                    min={1}
                                    max={720}
                                    value={expiresInHours}
                                    onChange={(val) => setExpiresInHours(val!)}
                                    className="!w-24 !bg-[#2c2638] !border-[#4a4554] text-white-important"
                                    style={{ backgroundColor: '#2c2638', color: 'white' }}
                                />
                            </div>

                            {/* Max Downloads Option */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[#724CF9]">📥</span>
                                    <span className="text-[#DBD4D3] text-sm">Limite download</span>
                                </div>
                                <Switch
                                    checked={useMaxDownloads}
                                    onChange={setUseMaxDownloads}
                                    className="!bg-[#4a4554]"
                                />
                            </div>

                            {useMaxDownloads && (
                                <InputNumber
                                    min={1}
                                    max={1000}
                                    value={maxDownloads}
                                    onChange={(val) => setMaxDownloads(val)}
                                    placeholder="Max download"
                                    className="!w-full !bg-[#2c2638] !border-[#4a4554] text-white-important"
                                    style={{ backgroundColor: '#2c2638', color: 'white' }}
                                />
                            )}
                        </div>

                        {/* Generated Link Display */}
                        {generatedLink && (
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <LinkOutlined className="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
                                    <input
                                        readOnly
                                        value={generatedLink}
                                        type="text"
                                        className="w-full p-3 pl-10 rounded-lg bg-[#1a1625] border border-[#4a4554] text-white cursor-text text-sm"
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                </div>
                                <Button
                                    icon={linkCopied ? <CheckOutlined /> : <CopyOutlined />}
                                    onClick={handleCopyLink}
                                    className={`${linkCopied ? '!bg-green-600 !border-green-600' : '!bg-[#724CF9] !border-[#724CF9]'} !text-white`}
                                    style={{ height: '46px', borderRadius: '8px' }}
                                >
                                    {linkCopied ? 'Copiato!' : 'Copia'}
                                </Button>
                            </div>
                        )}

                        {/* Generate Button */}
                        <Button
                            onClick={handleGenerateLink}
                            loading={isCreating}
                            disabled={isCreating || (usePassword && !password)}
                            icon={<LinkOutlined />}
                            size="large"
                            className="w-full !bg-[#2c2638] !border-[#724CF9] !text-[#724CF9] hover:!bg-[#724CF9] hover:!text-white"
                            style={{ borderRadius: '10px', height: '48px' }}
                        >
                            {generatedLink ? 'Rigenera Link' : 'Genera Link Condivisibile'}
                        </Button>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end pt-2">
                        <Button
                            onClick={onClose}
                            disabled={isSharing || isCreating}
                            size="large"
                            className="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white"
                            style={{ borderRadius: '10px', height: '44px', padding: '0 24px' }}
                        >
                            Chiudi
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default ShareFileModal;
