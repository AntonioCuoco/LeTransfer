import { useState, useCallback } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import Swal from 'sweetalert2';

// URL base dell'API che usa VITE_API_URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface UsePresignedUrlReturn {
    // State
    isLoading: boolean;
    error: string | null;

    // Actions
    generateFileLink: (s3Key: string, options?: { download?: boolean; expires?: number }) => Promise<string | null>;
    reset: () => void;
}

export const usePresignedUrl = (): UsePresignedUrlReturn => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Genera un link condivisibile per un file
     * POST /api/file-url
     */
    const generateFileLink = useCallback(async (
        s3Key: string,
        options?: { download?: boolean; expires?: number }
    ): Promise<string | null> => {
        setIsLoading(true);
        setError(null);

        try {
            const token = Cookies.get('idToken');
            if (!token) {
                throw new Error('Token di autenticazione non trovato');
            }

            // Costruisce l'endpoint usando VITE_API_URL
            // Se VITE_API_URL non termina con /, aggiungiamolo se necessario, 
            // ma di solito le variabili env non hanno slash finale.
            // Assumiamo che VITE_API_URL sia tipo "https://api.example.com"
            // E l'endpoint è "/file-url" (oppure /api/file-url se VITE_API_URL è solo il dominio base, ma le istruzioni dicono di usare VITE_API_URL invece di LAMBDA_URL)
            // Se VITE_API_URL include già "/api" (come spesso accade in VITE projects), allora "/file-url" è corretto.
            // Se non lo include, potremmo dover aggiungere "/api/file-url".
            // Dato che la request precedente usava `${API_BASE_URL}/file-url` dove API_BASE_URL era LAMBDA_URL, e l'user ha corretto in `/file-url`,
            // assumeremo che l'endpoint finale desiderato sia `.../file-url`.

            // Per sicurezza, controllo se la url base finisce con / o no.
            const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
            const endpoint = `${baseUrl}/file-url`;

            const { data } = await axios.get<{ url: string }>(
                endpoint,
                {
                    params: {
                        key: s3Key,
                        download: options?.download || false,
                        expires: options?.expires || 3600
                    },
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return data.url;

        } catch (err: unknown) {
            const errObj = err as {
                response?: { data?: { message?: string } };
                message?: string
            };

            const errorMessage = errObj.response?.data?.message || errObj.message || 'Errore nella generazione del link';

            setError(errorMessage);

            Swal.fire({
                title: 'Errore!',
                text: errorMessage,
                icon: 'error'
            });
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const reset = useCallback(() => {
        setIsLoading(false);
        setError(null);
    }, []);

    return {
        isLoading,
        error,
        generateFileLink,
        reset
    };
};
