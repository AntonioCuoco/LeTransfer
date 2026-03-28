import { useCallback, useState } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { message } from 'antd';
import { SetupRecoveryKeyRequest, UserRecoveryKeyStatus } from '../types';

export const useRecoveryKeyAPI = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getAuthToken = () => Cookies.get('idToken');

    const setupRecoveryKey = useCallback(async (data: SetupRecoveryKeyRequest): Promise<boolean> => {
        setIsLoading(true);
        setError(null);
        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            await axios.post(
                `${import.meta.env.VITE_API_URL}/user/recovery-key/setup`,
                data,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return true;
        } catch (err: any) {
            message.error('Errore durante la configurazione della chiave di ripristino');
            setError(err.response?.data?.message || err.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const getRecoveryKeyStatus = useCallback(async (): Promise<UserRecoveryKeyStatus | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const token = getAuthToken();
            if (!token) throw new Error('Not authenticated');

            const { data } = await axios.get(
                `${import.meta.env.VITE_API_URL}/user/recovery-key/status`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            return data;
        } catch (err: any) {
            message.error('Errore nel recupero dello stato della chiave di ripristino');
            setError(err.response?.data?.message || err.message);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        setupRecoveryKey,
        getRecoveryKeyStatus,
        isLoading,
        error
    };
};
