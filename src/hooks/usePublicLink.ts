/**
 * Hook per gestire l'accesso pubblico ai link condivisibili
 * Usato nella pagina di accesso ai link (ShareAccessPage)
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import type {
    SharedLinkAccessInfo,
    SharedLinkAccessRequest,
    SharedLinkAccessResponse,
    SharedLinkFileResponse,
    SharedLinkError
} from '../types';

// URL base dell'API
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Stato del link condivisibile
 */
export type LinkStatus = 'loading' | 'valid' | 'expired' | 'revoked' | 'not_found' | 'download_limit' | 'error';

/**
 * Return type dell'hook
 */
interface UsePublicLinkReturn {
    // State
    linkInfo: SharedLinkAccessInfo | null;
    linkStatus: LinkStatus;
    isLoading: boolean;
    error: string | null;

    // Session state
    sessionToken: string | null;
    sessionExpiresAt: string | null;
    isAuthenticated: boolean;

    // Actions
    getLinkInfo: (publicToken: string) => Promise<SharedLinkAccessInfo | null>;
    accessLink: (publicToken: string, request: SharedLinkAccessRequest) => Promise<SharedLinkAccessResponse | null>;
    downloadFile: (publicToken: string, action?: 'download' | 'preview') => Promise<string | null>;
    clearSession: () => void;
}

export const usePublicLink = (): UsePublicLinkReturn => {
    // Link info state
    const [linkInfo, setLinkInfo] = useState<SharedLinkAccessInfo | null>(null);
    const [linkStatus, setLinkStatus] = useState<LinkStatus>('loading');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Session state
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);

    /**
     * Verifica se la sessione è ancora valida
     */
    const isAuthenticated = sessionToken !== null &&
        sessionExpiresAt !== null &&
        new Date(sessionExpiresAt) > new Date();

    /**
     * Mappa gli errori API allo stato del link
     */
    const mapErrorToStatus = (errorCode: string): LinkStatus => {
        switch (errorCode) {
            case 'LINK_NOT_FOUND':
                return 'not_found';
            case 'LINK_EXPIRED':
                return 'expired';
            case 'LINK_REVOKED':
                return 'revoked';
            case 'DOWNLOAD_LIMIT_REACHED':
                return 'download_limit';
            default:
                return 'error';
        }
    };

    /**
     * Recupera le informazioni pubbliche di un link
     * GET /shared-links/:publicToken
     */
    const getLinkInfo = useCallback(async (publicToken: string): Promise<SharedLinkAccessInfo | null> => {
        setIsLoading(true);
        setError(null);
        setLinkStatus('loading');

        try {
            const { data } = await axios.get<{ success: boolean; data: SharedLinkAccessInfo }>(
                `${API_BASE_URL}/shared-links/${publicToken}`
            );

            if (data.success && data.data) {
                setLinkInfo(data.data);
                setLinkStatus('valid');
                return data.data;
            }

            setLinkStatus('error');
            setError('Risposta non valida dal server');
            return null;

        } catch (err: unknown) {
            const axiosError = err as {
                response?: {
                    status?: number;
                    data?: SharedLinkError;
                };
                message?: string;
            };

            // Mappiamo lo status code e/o il codice errore allo stato
            if (axiosError.response?.data?.code) {
                setLinkStatus(mapErrorToStatus(axiosError.response.data.code));
                setError(axiosError.response.data.message);
            } else if (axiosError.response?.status === 404) {
                setLinkStatus('not_found');
                setError('Link non trovato');
            } else if (axiosError.response?.status === 410) {
                setLinkStatus('expired');
                setError('Link scaduto o revocato');
            } else {
                setLinkStatus('error');
                setError(axiosError.message || 'Errore durante il recupero delle informazioni');
            }

            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Autentica l'accesso al link con nome e password
     * POST /shared-links/:publicToken/access
     */
    const accessLink = useCallback(async (
        publicToken: string,
        request: SharedLinkAccessRequest
    ): Promise<SharedLinkAccessResponse | null> => {
        setIsLoading(true);
        setError(null);

        try {
            const { data } = await axios.post<{ success: boolean; data: SharedLinkAccessResponse }>(
                `${API_BASE_URL}/shared-links/${publicToken}/access`,
                request
            );

            if (data.success && data.data) {
                // Salva il session token
                setSessionToken(data.data.sessionToken);
                setSessionExpiresAt(data.data.expiresAt);
                return data.data;
            }

            setError('Risposta non valida dal server');
            return null;

        } catch (err: unknown) {
            const axiosError = err as {
                response?: {
                    status?: number;
                    data?: SharedLinkError;
                };
                message?: string;
            };

            if (axiosError.response?.status === 401) {
                setError('Password non corretta');
            } else if (axiosError.response?.data?.message) {
                setError(axiosError.response.data.message);
            } else {
                setError(axiosError.message || 'Errore durante l\'autenticazione');
            }

            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Scarica o visualizza il file
     * GET /shared-links/:publicToken/file
     */
    const downloadFile = useCallback(async (
        publicToken: string,
        action: 'download' | 'preview' = 'download'
    ): Promise<string | null> => {
        if (!sessionToken) {
            setError('Sessione non valida. Effettua nuovamente l\'accesso.');
            return null;
        }

        setIsLoading(true);
        setError(null);

        try {
            const { data } = await axios.get<SharedLinkFileResponse>(
                `${API_BASE_URL}/shared-links/${publicToken}/file`,
                {
                    params: { action },
                    headers: {
                        Authorization: `Bearer ${sessionToken}`
                    }
                }
            );

            if (data.success && data.data?.url) {
                return data.data.url;
            }

            setError('Risposta non valida dal server');
            return null;

        } catch (err: unknown) {
            const axiosError = err as {
                response?: {
                    status?: number;
                    data?: SharedLinkError;
                };
                message?: string;
            };

            if (axiosError.response?.status === 401) {
                setError('Sessione scaduta. Effettua nuovamente l\'accesso.');
                // Pulisci la sessione
                setSessionToken(null);
                setSessionExpiresAt(null);
            } else if (axiosError.response?.data?.message) {
                setError(axiosError.response.data.message);
            } else {
                setError(axiosError.message || 'Errore durante il download');
            }

            return null;
        } finally {
            setIsLoading(false);
        }
    }, [sessionToken]);

    /**
     * Pulisce la sessione corrente
     */
    const clearSession = useCallback(() => {
        setSessionToken(null);
        setSessionExpiresAt(null);
    }, []);

    return {
        // State
        linkInfo,
        linkStatus,
        isLoading,
        error,

        // Session state
        sessionToken,
        sessionExpiresAt,
        isAuthenticated,

        // Actions
        getLinkInfo,
        accessLink,
        downloadFile,
        clearSession
    };
};
