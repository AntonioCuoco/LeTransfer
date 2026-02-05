import { useState, useCallback } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import Swal from 'sweetalert2';
import type {
    DynamoDBFile,
    LoadFilesOptions,
    UploadFileOptions,
    DeleteFileOptions,
    ShareLinkData
} from '../types';
import { useEncryptionOptional } from '../contexts/EncryptionContext';
import { decryptFile, importKeyFromBase64, importIVFromBase64 } from '../utils/crypto';

export const useFileFromDynamoDB = () => {
    const [files, setFiles] = useState<DynamoDBFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nextKey, setNextKey] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    const encryption = useEncryptionOptional();

    /**
     * Carica i file da DynamoDB
     */
    const loadFiles = useCallback(async (options?: LoadFilesOptions) => {
        setIsLoading(true);
        setError(null);

        try {
            const token = Cookies.get('idToken');
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }

            const params: Record<string, string | number | boolean> = {};
            if (options?.limit) params.limit = options.limit;
            if (options?.lastKey) params.lastKey = options.lastKey;
            if (options?.fileType) params.fileType = options.fileType;
            if (options?.onlyOwned) params.onlyOwned = options.onlyOwned;

            const { data } = await axios.get(
                `${import.meta.env.VITE_API_URL}/user/files/dynamo`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    params
                }
            );


            setFiles(data.files || []);
            setNextKey(data.nextKey || null);
            setHasMore(data.hasMore || false);

            return {
                files: data.files || [],
                count: data.count || 0,
                nextKey: data.nextKey || null,
                hasMore: data.hasMore || false
            };
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } }; message?: string };
            const errorMessage = error.response?.data?.message || error.message || 'Errore durante il caricamento dei file';
            setError(errorMessage);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Carica più file (paginazione)
     */
    const loadMoreFiles = useCallback(async (options?: LoadFilesOptions) => {
        if (!nextKey || isLoading) return null;

        setIsLoading(true);
        setError(null);

        try {
            const token = Cookies.get('idToken');
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }

            const params: Record<string, string | number | boolean> = {
                lastKey: nextKey
            };
            if (options?.limit) params.limit = options.limit;
            if (options?.fileType) params.fileType = options.fileType;

            const { data } = await axios.get(
                `${import.meta.env.VITE_API_URL}/user/files/dynamo`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    params
                }
            );

            setFiles(prev => [...prev, ...(data.files || [])]);
            setNextKey(data.nextKey || null);
            setHasMore(data.hasMore || false);

            return {
                files: data.files || [],
                count: data.count || 0,
                nextKey: data.nextKey || null,
                hasMore: data.hasMore || false
            };
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } }; message?: string };
            const errorMessage = error.response?.data?.message || error.message || 'Errore durante il caricamento dei file';
            setError(errorMessage);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [nextKey, isLoading]);

    /**
     * Carica un file su S3
     */
    const uploadFile = useCallback(async (
        file: File,
        options?: UploadFileOptions
    ): Promise<string | null> => {
        setIsUploading(true);
        setError(null);

        try {
            const token = Cookies.get('idToken');
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }

            // 1. Ottieni URL presigned per upload
            const { data: presignedData } = await axios.get(
                `${import.meta.env.VITE_API_URL}/presigned-url`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    params: {
                        fileName: file.name,
                        fileType: file.type
                    }
                }
            );


            // 2. Upload diretto a S3
            await axios.put(presignedData.uploadUrl, file, {
                headers: {
                    'Content-Type': file.type
                },
                onUploadProgress: (progressEvent) => {
                    if (options?.onProgress && progressEvent.total) {
                        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        options.onProgress(progress);
                    }
                }
            });


            // Ricarica i file per aggiornare la lista
            await loadFiles();

            // Callback di successo
            if (options?.onSuccess && presignedData.file) {
                options.onSuccess(presignedData.file);
            }

            return presignedData.key;
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } }; message?: string };
            const errorMessage = error.response?.data?.message || error.message || 'Errore durante l\'upload del file';
            setError(errorMessage);

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
            setIsUploading(false);
        }
    }, [loadFiles]);

    /**
     * Elimina un file
     */
    const deleteFile = useCallback(async (
        fileId: string,
        s3Key: string,
        options?: DeleteFileOptions
    ): Promise<boolean> => {
        setIsDeleting(true);
        setError(null);

        try {
            const token = Cookies.get('idToken');
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }

            await axios.delete(
                `${import.meta.env.VITE_API_URL}/uploads/files`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                    data: {
                        fileId: s3Key
                    }
                }

            );


            // Rimuovi il file dalla lista locale
            setFiles(prev => prev.filter(f => f.fileId !== fileId));

            // Callback di successo
            if (options?.onSuccess) {
                options.onSuccess();
            }

            return true;
        } catch (err: unknown) {
            const error = err as { response?: { data?: { message?: string } }; message?: string };
            const errorMessage = error.response?.data?.message || error.message || 'Errore durante l\'eliminazione del file';
            setError(errorMessage);

            if (options?.onError) {
                options.onError(new Error(errorMessage));
            }

            Swal.fire({
                title: 'Errore!',
                text: errorMessage,
                icon: 'error'
            });

            return false;
        } finally {
            setIsDeleting(false);
        }
    }, []);

    /**
     * Resetta lo stato dell'hook
     */
    const reset = useCallback(() => {
        setFiles([]);
        setIsLoading(false);
        setIsUploading(false);
        setIsDeleting(false);
        setError(null);
        setNextKey(null);
        setHasMore(false);
    }, []);

    /**
     * Scarica un file direttamente
     */
    const downloadFile = useCallback(async (file: DynamoDBFile): Promise<boolean> => {
        try {
            const downloadUrl = file.s3Url;
            if (!downloadUrl) {
                throw new Error('URL del file non disponibile');
            }

            const response = await fetch(downloadUrl);
            const blob = await response.blob();
            let finalBlob = blob;

            // Check if we have an encryption key for this file
            const keyData = encryption ? await encryption.getKey(file.s3Key) : null;

            if (keyData) {
                try {
                    const key = await importKeyFromBase64(keyData.key);
                    const iv = importIVFromBase64(keyData.iv);
                    finalBlob = await decryptFile(blob, key, iv);
                } catch (decryptErr) {
                    Swal.fire({
                        title: 'Errore Decifratura!',
                        text: 'Impossibile decifrare il file. La chiave potrebbe essere non valida.',
                        icon: 'error'
                    });
                    return false;
                }
            } else if (file.isEncrypted) {
                // File cifrato ma nessuna chiave trovata
                await Swal.fire({
                    title: 'File Cifrato',
                    text: 'Stai scaricando un file cifrato ma la chiave di decifratura non è stata trovata. Il file potrebbe risultare illeggibile.',
                    icon: 'warning',
                    confirmButtonText: 'Scarica comunque',
                    showCancelButton: true,
                    cancelButtonText: 'Annulla'
                }).then((result) => {
                    if (!result.isConfirmed) {
                        throw new Error('Download annullato dall\'utente');
                    }
                });
            }

            const url = window.URL.createObjectURL(finalBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = file.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            return true;
        } catch (error) {
            Swal.fire({
                title: 'Errore!',
                text: 'Errore durante il download del file',
                icon: 'error'
            });
            return false;
        }
    }, [encryption]);

    /**
     * Crea un link di condivisione per un file
     */
    const createShareLink = useCallback(async (file: DynamoDBFile): Promise<ShareLinkData | null> => {
        try {
            const { data } = await axios.get(
                `${import.meta.env.VITE_API_URL}/file-url?key=${file.s3Key}&download=true&expires=3600`,
                {
                    headers: {
                        Authorization: `Bearer ${Cookies.get('idToken')}`
                    }
                }
            );


            return {
                url: data.url,
                fileName: file.fileName,
                fileSize: file.fileSize,
                uploadDate: file.uploadedAt,
                expiresIn: '1 ora',
                fileType: file.fileType
            };
        } catch (error: unknown) {
            const err = error as { response?: { data?: { message?: string } } };
            Swal.fire({
                title: 'Errore',
                text: err.response?.data?.message || 'Impossibile creare il link',
                icon: 'error'
            });
            return null;
        }
    }, []);

    return {
        // State
        files,
        isLoading,
        isUploading,
        isDeleting,
        error,
        hasMore,
        nextKey,

        // Actions
        loadFiles,
        loadMoreFiles,
        uploadFile,
        deleteFile,
        downloadFile,
        createShareLink,
        reset
    };
};
