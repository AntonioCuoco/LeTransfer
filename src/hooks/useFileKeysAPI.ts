import { useCallback, useState } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { message } from 'antd';
import { WrappedKeyData, GetFileKeysResponse } from '../types';

export const useFileKeysAPI = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getAuthToken = () => Cookies.get('idToken');

    const saveFileKey = useCallback(async (data: WrappedKeyData): Promise<boolean> => {
        // Silent loading for background saves? Or global loading?
        // We'll keep local loading state.
        setIsLoading(true);
        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            await axios.post(
                `${import.meta.env.VITE_API_URL}/user/file-keys`,
                data,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return true;
        } catch (err: any) {
            message.error('Errore nel salvataggio della chiave di cifratura del file');
            setError(err.response?.data?.message || err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const getFileKey = useCallback(async (s3Key: string): Promise<WrappedKeyData | null> => {
        setIsLoading(true);
        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            // Encode s3Key because it contains slashes
            const encodedKey = encodeURIComponent(s3Key);
            const { data } = await axios.get(
                `${import.meta.env.VITE_API_URL}/user/file-keys/${encodedKey}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return data.data; // Assuming API returns { success: true, data: WrappedKeyData }
        } catch (err: any) {
            if (err.response?.status === 404) return null;

            message.error('Errore nel recupero della chiave di cifratura del file');
            setError(err.response?.data?.message || err.message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const getAllFileKeys = useCallback(async (): Promise<WrappedKeyData[]> => {
        setIsLoading(true);
        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            const { data } = await axios.get(
                `${import.meta.env.VITE_API_URL}/user/file-keys`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return (data as GetFileKeysResponse).keys || [];
        } catch (err: any) {
            message.error('Errore nel recupero delle chiavi di cifratura');
            setError(err.response?.data?.message || err.message);
            return [];
        } finally {
            setIsLoading(false);
        }
    }, []);

    const deleteFileKey = useCallback(async (s3Key: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            const encodedKey = encodeURIComponent(s3Key);
            await axios.delete(
                `${import.meta.env.VITE_API_URL}/user/file-keys/${encodedKey}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return true;
        } catch (err: any) {
            message.error('Errore nell\'eliminazione della chiave di cifratura');
            setError(err.response?.data?.message || err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        saveFileKey,
        getFileKey,
        getAllFileKeys,
        deleteFileKey,
        isLoading,
        error
    };
};
