import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { getCurrentUser } from '../components/getCurrentUser/getCurrentUser';

export const useProfileImage = () => {
    const [profileImageUrl, setProfileImageUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const user = getCurrentUser();

    // Carica foto profilo esistente
    const loadProfileImage = useCallback(async () => {
        if (!user?.sub) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/user/profile-image`, {
                headers: {
                    Authorization: `Bearer ${Cookies.get('idToken')}`
                }
            });

            if (response.data.profileImage && response.data.profileImage.url) {
                setProfileImageUrl(response.data.profileImage.url);
            } else {
                setProfileImageUrl('');
            }
        } catch (err: unknown) {
            if ((err as any).response?.status === 404) {
                // Foto profilo non trovata, usa placeholder
                setProfileImageUrl('');
            } else {
                setError((err as any).response?.data?.error || 'Errore nel caricamento della foto profilo');
            }
        } finally {
            setIsLoading(false);
        }
    }, [user?.sub]);

    // Upload nuova foto profilo (stessa struttura di upload-file)
    const uploadProfileImage = useCallback(async (file: File) => {
        if (!user?.sub) {
            setError('Utente non autenticato');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Valida il file
            if (!file.type.startsWith('image/')) {
                throw new Error('Il file deve essere un\'immagine');
            }

            if (file.size > 5 * 1024 * 1024) { // 5MB max
                throw new Error('L\'immagine deve essere inferiore a 5MB');
            }

            // Crea FormData per l'upload (usa 'profileImage' come campo)
            const formData = new FormData();
            formData.append('profileImage', file);

            // Upload tramite API backend ottimizzata
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/upload-profile-image`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${Cookies.get('idToken')}`
                }
            });

            // Adatta alla struttura di risposta della tua API
            if (response.data.profileImage && response.data.profileImage.location) {
                // Imposta immediatamente l'URL dalla risposta
                setProfileImageUrl(response.data.profileImage.location);

                // Forza il refresh per ottenere l'URL presignato
                setTimeout(() => {
                    loadProfileImage();
                }, 500);

                return response.data.profileImage.location;
            } else {
                throw new Error(response.data.error || 'Errore durante l\'upload');
            }
        } catch (err: unknown) {
            const errorMessage = (err as any).response?.data?.error || (err as any).message || 'Errore durante l\'upload';
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [user?.sub]);

    // Elimina foto profilo
    const deleteProfileImage = useCallback(async () => {
        if (!user?.sub) {
            setError('Utente non autenticato');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await axios.delete(`${import.meta.env.VITE_API_URL}/user/profile-image`, {
                headers: {
                    Authorization: `Bearer ${Cookies.get('idToken')}`
                }
            });

            if (response.data.message && response.data.deletedCount > 0) {
                setProfileImageUrl('');
            } else if (response.data.deletedCount === 0) {
                // Nessuna foto da eliminare, ma non è un errore
                setProfileImageUrl('');
            } else {
                throw new Error(response.data.error || 'Errore durante l\'eliminazione');
            }
        } catch (err: unknown) {
            const errorMessage = (err as any).response?.data?.error || (err as any).message || 'Errore durante l\'eliminazione';
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [user?.sub]);

    // Carica foto profilo al mount
    useEffect(() => {
        loadProfileImage();
    }, [loadProfileImage]);

    // Ascolta gli eventi di aggiornamento foto profilo
    useEffect(() => {
        const handleProfileImageUpdate = () => {
            loadProfileImage();
        };

        // Aggiungi listener per eventi personalizzati
        window.addEventListener('profileImageUpdated', handleProfileImageUpdate);

        return () => {
            window.removeEventListener('profileImageUpdated', handleProfileImageUpdate);
        };
    }, [loadProfileImage]);

    // Refresh automatico dell'URL presignato ogni 50 minuti (prima della scadenza)
    useEffect(() => {
        if (!profileImageUrl) return;

        const refreshInterval = setInterval(() => {
            loadProfileImage();
        }, 50 * 60 * 1000); // 50 minuti

        return () => clearInterval(refreshInterval);
    }, [loadProfileImage, profileImageUrl]);

    return {
        profileImageUrl,
        isLoading,
        error,
        uploadProfileImage,
        deleteProfileImage,
        refreshProfileImage: loadProfileImage
    };
};
