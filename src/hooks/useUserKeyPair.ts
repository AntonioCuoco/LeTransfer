/**
 * Hook per la gestione della keypair RSA dell'utente
 * 
 * Responsabilità:
 * - Genera keypair RSA al primo login
 * - Salva private key cifrata su localStorage
 * - Sincronizza public key con il server
 * - Gestisce backup/restore della private key
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import Cookies from 'js-cookie';
import { message } from 'antd';
import {
    generateRSAKeyPair,
    exportPublicKeyToJWK,
    importPublicKeyFromJWK,
    exportPrivateKeyToJWK,
    importPrivateKeyFromJWK,
    encryptPrivateKeyForBackup,
    decryptPrivateKeyFromBackup,
    type KeyPairBackup
} from '../utils/crypto';

// API base URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// localStorage keys
const PRIVATE_KEY_STORAGE_KEY = 'letransfer_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'letransfer_public_key';
const KEYPAIR_INITIALIZED_KEY = 'letransfer_keypair_initialized';

export interface UseUserKeyPairReturn {
    // State
    publicKey: CryptoKey | null;
    privateKey: CryptoKey | null;
    isKeyPairReady: boolean;
    isInitializing: boolean;
    error: string | null;
    needsPasswordForRestore: boolean;

    // Actions
    initializeKeyPair: () => Promise<void>;
    restoreFromBackup: (password: string) => Promise<boolean>;
    backupToServer: (password: string) => Promise<boolean>;
    getRecipientPublicKey: (email: string) => Promise<CryptoKey | null>;
    exportPublicKeyJWK: () => Promise<JsonWebKey | null>;
}

export const useUserKeyPair = (): UseUserKeyPairReturn => {
    const [publicKey, setPublicKey] = useState<CryptoKey | null>(null);
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [isInitializing, setIsInitializing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsPasswordForRestore, setNeedsPasswordForRestore] = useState(false);

    const initializationAttempted = useRef(false);

    const isKeyPairReady = publicKey !== null && privateKey !== null;

    /**
     * Get auth headers
     */
    const getHeaders = useCallback(() => {
        const token = Cookies.get('idToken');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    /**
     * Save keypair to localStorage
     */
    const saveToLocalStorage = useCallback(async (
        pubKey: CryptoKey,
        privKey: CryptoKey
    ) => {
        try {
            const publicKeyJWK = await exportPublicKeyToJWK(pubKey);
            const privateKeyJWK = await exportPrivateKeyToJWK(privKey);

            localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, JSON.stringify(publicKeyJWK));
            localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, JSON.stringify(privateKeyJWK));
            localStorage.setItem(KEYPAIR_INITIALIZED_KEY, 'true');
        } catch (err) {
            message.error('Errore nel salvataggio delle chiavi nel browser');
            throw err;
        }
    }, []);

    /**
     * Load keypair from localStorage
     */
    const loadFromLocalStorage = useCallback(async (): Promise<{
        publicKey: CryptoKey;
        privateKey: CryptoKey;
    } | null> => {
        try {
            const publicKeyJWKString = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
            const privateKeyJWKString = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);

            if (!publicKeyJWKString || !privateKeyJWKString) {
                return null;
            }

            const publicKeyJWK = JSON.parse(publicKeyJWKString);
            const privateKeyJWK = JSON.parse(privateKeyJWKString);

            const pubKey = await importPublicKeyFromJWK(publicKeyJWK);
            const privKey = await importPrivateKeyFromJWK(privateKeyJWK);

            return { publicKey: pubKey, privateKey: privKey };
        } catch (err) {
            message.error('Errore nel caricamento delle chiavi dal browser');
            return null;
        }
    }, []);

    /**
     * Upload public key to server
     */
    const uploadPublicKeyToServer = useCallback(async (pubKey: CryptoKey): Promise<boolean> => {
        try {
            const publicKeyJWK = await exportPublicKeyToJWK(pubKey);

            await axios.post(
                `${API_BASE_URL}/user/public-key`,
                { publicKeyJWK },
                { headers: getHeaders() }
            );

            return true;
        } catch (err) {
            message.error('Errore nell\'invio della chiave pubblica al server');
            return false;
        }
    }, [getHeaders]);

    /**
     * Check if server has a backup of the keypair
     */
    const checkServerBackup = useCallback(async (): Promise<KeyPairBackup | null> => {
        try {
            const { data } = await axios.get(
                `${API_BASE_URL}/user/keypair-backup`,
                { headers: getHeaders() }
            );

            if (data.success && data.data) {
                return data.data;
            }
            return null;
        } catch (err: unknown) {
            const error = err as { response?: { status?: number } };
            if (error.response?.status === 404) {
                return null; // No backup exists
            }
            message.error('Errore nel controllo del backup sul server');
            return null;
        }
    }, [getHeaders]);

    /**
     * Initialize keypair - generates new or loads existing
     */
    const initializeKeyPair = useCallback(async (): Promise<void> => {
        if (isInitializing || isKeyPairReady) return;

        setIsInitializing(true);
        setError(null);

        try {
            // 1. Try to load from localStorage
            const localKeys = await loadFromLocalStorage();
            if (localKeys) {
                setPublicKey(localKeys.publicKey);
                setPrivateKey(localKeys.privateKey);
                setIsInitializing(false);
                return;
            }

            // 2. Check if server has a backup
            const serverBackup = await checkServerBackup();
            if (serverBackup) {
                // Need password to restore
                setNeedsPasswordForRestore(true);
                setIsInitializing(false);
                return;
            }

            // 3. Generate new keypair
            const keyPair = await generateRSAKeyPair();

            // Save to localStorage
            await saveToLocalStorage(keyPair.publicKey, keyPair.privateKey);

            // Upload public key to server
            await uploadPublicKeyToServer(keyPair.publicKey);

            setPublicKey(keyPair.publicKey);
            setPrivateKey(keyPair.privateKey);

        } catch (err) {
            message.error('Impossibile inizializzare le chiavi di cifratura');
            setError('Impossibile inizializzare le chiavi di cifratura');
        } finally {
            setIsInitializing(false);
        }
    }, [isInitializing, isKeyPairReady, loadFromLocalStorage, checkServerBackup, saveToLocalStorage, uploadPublicKeyToServer]);

    /**
     * Restore keypair from server backup using password
     */
    const restoreFromBackup = useCallback(async (password: string): Promise<boolean> => {
        setIsInitializing(true);
        setError(null);

        try {
            const serverBackup = await checkServerBackup();
            if (!serverBackup) {
                setError('Nessun backup trovato sul server');
                return false;
            }

            // Decrypt private key with password
            const privKey = await decryptPrivateKeyFromBackup(serverBackup, password);

            // Get public key from server
            const { data } = await axios.get(
                `${API_BASE_URL}/user/public-key`,
                { headers: getHeaders() }
            );

            if (!data.success || !data.data?.publicKeyJWK) {
                throw new Error('Failed to get public key from server');
            }

            const pubKey = await importPublicKeyFromJWK(data.data.publicKeyJWK);

            // Save to localStorage
            await saveToLocalStorage(pubKey, privKey);

            setPublicKey(pubKey);
            setPrivateKey(privKey);
            setNeedsPasswordForRestore(false);

            message.success('Chiavi ripristinate con successo dal backup');
            return true;
        } catch (err) {
            message.error('Password non corretta o backup corrotto');
            setError('Password non corretta o backup corrotto');
            return false;
        } finally {
            setIsInitializing(false);
        }
    }, [checkServerBackup, getHeaders, saveToLocalStorage]);

    /**
     * Backup keypair to server (encrypted with password)
     */
    const backupToServer = useCallback(async (password: string): Promise<boolean> => {
        if (!privateKey) {
            setError('Nessuna chiave privata da salvare');
            return false;
        }

        try {
            const backup = await encryptPrivateKeyForBackup(privateKey, password);

            await axios.post(
                `${API_BASE_URL}/user/keypair-backup`,
                backup,
                { headers: getHeaders() }
            );

            message.success('Backup delle chiavi salvato sul server');
            return true;
        } catch (err) {
            message.error('Impossibile salvare il backup sul server');
            setError('Impossibile salvare il backup sul server');
            return false;
        }
    }, [privateKey, getHeaders]);

    /**
     * Get recipient's public key by email
     */
    const getRecipientPublicKey = useCallback(async (email: string): Promise<CryptoKey | null> => {
        try {
            const { data } = await axios.get(
                `${API_BASE_URL}/user/by-email/${encodeURIComponent(email)}/public-key`,
                { headers: getHeaders() }
            );

            if (data.success && data.data?.publicKeyJWK) {
                return await importPublicKeyFromJWK(data.data.publicKeyJWK);
            }
            return null;
        } catch (err) {
            message.error(`Impossibile recuperare la chiave pubblica per ${email}`);
            return null;
        }
    }, [getHeaders]);

    /**
     * Export own public key as JWK
     */
    const exportPublicKeyJWK = useCallback(async (): Promise<JsonWebKey | null> => {
        if (!publicKey) return null;
        return await exportPublicKeyToJWK(publicKey);
    }, [publicKey]);

    /**
     * Auto-initialize on mount if user is authenticated
     */
    useEffect(() => {
        const token = Cookies.get('idToken');
        if (token && !initializationAttempted.current) {
            initializationAttempted.current = true;
            initializeKeyPair();
        }
    }, [initializeKeyPair]);

    return {
        // State
        publicKey,
        privateKey,
        isKeyPairReady,
        isInitializing,
        error,
        needsPasswordForRestore,

        // Actions
        initializeKeyPair,
        restoreFromBackup,
        backupToServer,
        getRecipientPublicKey,
        exportPublicKeyJWK
    };
};
