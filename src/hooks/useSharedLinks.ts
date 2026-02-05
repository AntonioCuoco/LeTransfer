import { useState, useCallback } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { message } from 'antd';
import type { SharedLink, CreateSharedLinkRequest, CreateSharedLinkResponse } from '../types';
import { createKeyHash } from '../utils/crypto';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL || window.location.origin;

/**
 * Opzioni per la creazione di un nuovo link condivisibile
 */
export interface CreateLinkOptions {
    password?: string;
    expiresInHours?: number;
    maxDownloads?: number;
    // E2E Encryption data (base64 encoded)
    encryptionKey?: string;
    encryptionIV?: string;
}

/**
 * Shared link with encryption URL (includes key in fragment)
 */
export interface SharedLinkWithEncryption extends SharedLink {
    encryptedUrl?: string; // Full URL with #key=...&iv=...
}

interface UseSharedLinksReturn {
    links: SharedLink[];
    isLoading: boolean;
    isCreating: boolean;
    error: string | null;
    fetchLinks: () => Promise<void>;
    createLink: (
        s3Key: string,
        fileName: string,
        fileSize: string,
        fileType: string,
        options?: CreateLinkOptions
    ) => Promise<SharedLinkWithEncryption | null>;
    revokeLink: (linkId: string) => Promise<boolean>;
    regenerateLink: (linkId: string) => Promise<boolean>;
    updateLink: (linkId: string, updates: Partial<SharedLink>) => Promise<boolean>;
    deleteLink: (linkId: string) => Promise<boolean>;
}

export const useSharedLinks = (): UseSharedLinksReturn => {
    const [links, setLinks] = useState<SharedLink[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getAuthToken = () => Cookies.get('idToken');

    /**
     * Recupera tutti i link dell'utente corrente
     * GET /shared-links
     */
    const fetchLinks = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = getAuthToken();

            const { data } = await axios.get<{ data?: SharedLink[] }>(`${API_BASE_URL}/shared-links`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Handle both array response and object with links property
            const linksArray = Array.isArray(data.data) ? data.data : [];

            setLinks(linksArray);
        } catch (err: unknown) {
            message.error('Errore durante il caricamento dei link condivisi');
            setLinks([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Crea un nuovo link condivisibile
     * POST /shared-links
     */
    const createLink = useCallback(async (
        s3Key: string,
        fileName: string,
        fileSize: string,
        fileType: string,
        options?: CreateLinkOptions
    ): Promise<SharedLink | null> => {
        setIsCreating(true);
        setError(null);

        try {
            const token = getAuthToken();
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }

            const requestBody: CreateSharedLinkRequest = {
                s3Key,
                fileName,
                fileSize,
                fileType,
                password: options?.password,
                expiresInHours: options?.expiresInHours || 168, // Default 7 giorni
                maxDownloads: options?.maxDownloads
            };

            const { data } = await axios.post<CreateSharedLinkResponse>(
                `${API_BASE_URL}/shared-links`,
                requestBody,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (data.success && data.data) {
                // Build the full encrypted URL if encryption data was provided
                let linkWithEncryption: SharedLinkWithEncryption = { ...data.data };

                if (options?.encryptionKey && options?.encryptionIV) {
                    // Create URL with encryption key in fragment (never sent to server!)
                    const keyHash = createKeyHash({
                        key: options.encryptionKey,
                        iv: options.encryptionIV
                    });
                    linkWithEncryption.encryptedUrl = `${FRONTEND_URL}/share/${data.data.publicToken}${keyHash}`;
                }

                // Aggiungi il nuovo link alla lista
                setLinks(prev => [data.data, ...prev]);
                return linkWithEncryption;
            }

            setError('Risposta non valida dal server');
            return null;

        } catch (err: unknown) {
            const axiosError = err as {
                response?: { data?: { message?: string } };
                message?: string;
            };

            const errorMessage = axiosError.response?.data?.message ||
                axiosError.message ||
                'Errore durante la creazione del link';
            message.error(errorMessage);
            setError(errorMessage);
            return null;
        } finally {
            setIsCreating(false);
        }
    }, []);

    /**
     * Revoca un link esistente
     * POST /shared-links/:id/revoke
     */
    const revokeLink = useCallback(async (linkId: string) => {
        try {
            const token = getAuthToken();
            await axios.post(`${API_BASE_URL}/shared-links/${linkId}/revoke`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Optimistic update
            setLinks(prev => prev.map(link =>
                link.id === linkId ? { ...link, revokedAt: new Date().toISOString() } : link
            ));
            return true;
        } catch (err) {
            message.error('Errore durante la revoca del link');
            return false;
        }
    }, []);

    /**
     * Rigenera un link (nuovo publicToken)
     * POST /shared-links/:id/regenerate
     */
    const regenerateLink = useCallback(async (linkId: string) => {
        try {
            const token = getAuthToken();
            const response = await axios.post(`${API_BASE_URL}/shared-links/${linkId}/regenerate`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const responseData = response.data;
            // Handle potential data wrapper from API
            const newLink = responseData.data || responseData;

            // Update list with new link data
            setLinks(prev => prev.map(link =>
                link.id === linkId ? newLink : link
            ));

            // Fetch fresh links to ensure consistency
            await fetchLinks();

            return true;
        } catch (err) {
            message.error('Errore durante la rigenerazione del link');
            return false;
        }
    }, [fetchLinks]);

    /**
     * Aggiorna le impostazioni di un link
     * PATCH /shared-links/:id
     */
    const updateLink = useCallback(async (linkId: string, updates: Partial<SharedLink>) => {
        try {
            const token = getAuthToken();
            const { data } = await axios.patch<SharedLink>(`${API_BASE_URL}/shared-links/${linkId}`, updates, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setLinks(prev => prev.map(link =>
                link.id === linkId ? data : link
            ));
            return true;
        } catch (err) {
            message.error('Errore durante l\'aggiornamento del link');
            return false;
        }
    }, []);

    /**
     * Elimina definitivamente un link
     * DELETE /shared-links/:id
     */
    const deleteLink = useCallback(async (linkId: string) => {
        try {
            const token = getAuthToken();
            await axios.delete(`${API_BASE_URL}/shared-links/${linkId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Rimuovi dalla lista locale
            setLinks(prev => prev.filter(link => link.id !== linkId));
            return true;
        } catch (err) {
            message.error('Errore durante l\'eliminazione del link');
            return false;
        }
    }, []);

    return {
        links,
        isLoading,
        isCreating,
        error,
        fetchLinks,
        createLink,
        revokeLink,
        regenerateLink,
        updateLink,
        deleteLink
    };
};
