import { useState, useCallback } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import Swal from 'sweetalert2';
import type {
    ShareFileRequest,
    ShareFileResponse,
    SharedFile,
    ShareFileOptions
} from '../types';
import { useEncryptionOptional } from '../contexts/EncryptionContext';
import { useUserKeyPair } from './useUserKeyPair';
import { wrapKeyWithPublicKey, importKeyFromBase64 } from '../utils/crypto';

// URL base dell'API - usa la variabile d'ambiente o il fallback alla Lambda AWS
const API_BASE_URL = import.meta.env.VITE_LAMBDA_URL || '';

interface UseShareFileReturn {
    // State
    isSharing: boolean;
    isLoadingShared: boolean;
    sharedFiles: SharedFile[];
    shareError: string | null;

    // Actions
    shareFile: (s3Key: string, targetEmail: string, options?: ShareFileOptions) => Promise<ShareFileResponse | null>;
    getSharedWithMe: () => Promise<SharedFile[]>;
    reset: () => void;
}

export const useShareFile = (): UseShareFileReturn => {
    const [isSharing, setIsSharing] = useState(false);
    const [isLoadingShared, setIsLoadingShared] = useState(false);
    const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
    const [shareError, setShareError] = useState<string | null>(null);

    const { getRecipientPublicKey } = useUserKeyPair();
    const encryption = useEncryptionOptional();

    /**
     * Condivide un file con un altro utente tramite email
     * POST /share
     */
    const shareFile = useCallback(async (
        s3Key: string,
        targetEmail: string,
        options?: ShareFileOptions
    ): Promise<ShareFileResponse | null> => {
        setIsSharing(true);
        setShareError(null);

        try {
            const token = Cookies.get('idToken');
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }

            // Check for E2E encryption
            let encryptedAESKey: string | undefined;
            let encryptionIV: string | undefined;

            const keyData = await encryption?.getKey(s3Key);
            if (keyData) {
                // File is encrypted locally, we need to share the key securely
                const recipientPublicKey = await getRecipientPublicKey(targetEmail);

                if (!recipientPublicKey) {
                    throw new Error('Il destinatario non ha ancora configurato la cifratura E2E (nessuna chiave pubblica trovata). Impossibile condividere file cifrato in sicurezza.');
                }

                // Import our AES key
                const aesKey = await importKeyFromBase64(keyData.key);

                // Wrap (encrypt) the AES key with recipient's public RSA key
                encryptedAESKey = await wrapKeyWithPublicKey(aesKey, recipientPublicKey);
                encryptionIV = keyData.iv;
            }

            const requestBody: ShareFileRequest = {
                s3Key,
                type: 'user',
                targetEmail,
                encryptedAESKey,
                encryptionIV
            };


            const { data } = await axios.post<ShareFileResponse>(
                `${API_BASE_URL}/share`,
                requestBody,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );


            // Callback di successo
            if (options?.onSuccess) {
                options.onSuccess(data);
            }

            Swal.fire({
                title: 'Condiviso!',
                text: `File condiviso con successo con ${targetEmail}`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });

            return data;
        } catch (err: unknown) {
            const error = err as {
                response?: {
                    status?: number;
                    data?: { message?: string }
                };
                message?: string
            };

            let errorMessage = 'Errore durante la condivisione del file';

            // Gestione errori specifici
            if (error.response?.status === 404) {
                errorMessage = 'Utente non trovato. Verifica che l\'email sia corretta e che l\'utente sia registrato.';
            } else if (error.response?.status === 400) {
                errorMessage = error.response?.data?.message || 'Non puoi inviare un file a te stesso.';
            } else if (error.response?.data?.message) {
                errorMessage = error.response.data.message;
            } else if (error.message) {
                errorMessage = error.message;
            }

            setShareError(errorMessage);

            if (options?.onError) {
                options.onError(new Error(errorMessage));
            }

            Swal.fire({
                title: 'Errore!',
                text: errorMessage,
                icon: 'error'
            });

            return null;
        } finally {
            setIsSharing(false);
        }
    }, []);

    /**
     * Recupera i file condivisi con l'utente corrente
     * GET /shared-files
     */
    const getSharedWithMe = useCallback(async (): Promise<SharedFile[]> => {
        setIsLoadingShared(true);
        setShareError(null);

        try {
            const token = Cookies.get('idToken');
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }


            const { data } = await axios.get<{ files: SharedFile[] }>(
                `${API_BASE_URL}/shared-files`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );


            const files = data.files || [];
            setSharedFiles(files);
            return files;
        } catch (err: unknown) {
            const error = err as {
                response?: { data?: { message?: string } };
                message?: string
            };

            const errorMessage = error.response?.data?.message ||
                error.message ||
                'Errore durante il caricamento dei file condivisi';

            setShareError(errorMessage);
            return [];
        } finally {
            setIsLoadingShared(false);
        }
    }, []);

    /**
     * Resetta lo stato dell'hook
     */
    const reset = useCallback(() => {
        setIsSharing(false);
        setIsLoadingShared(false);
        setSharedFiles([]);
        setShareError(null);
    }, []);

    return {
        // State
        isSharing,
        isLoadingShared,
        sharedFiles,
        shareError,

        // Actions
        shareFile,
        getSharedWithMe,
        reset
    };
};
