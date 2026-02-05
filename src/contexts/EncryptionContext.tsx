/**
 * EncryptionContext - Manages E2E encryption keys via DynamoDB + Recovery Key
 * 
 * New Architecture:
 * - Master Key is derived from User's Recovery Key (24 words).
 * - Master Key is kept in MEMORY ONLY (never persisted).
 * - File Keys are encrypted (wrapped) with Master Key and stored in DynamoDB.
 * - On login/refresh, user must provide Recovery Key to unlock (derive Master Key).
 */

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { message } from 'antd';
import { useRecoveryKeyAPI } from '../hooks/useRecoveryKeyAPI';
import { useFileKeysAPI } from '../hooks/useFileKeysAPI';
import { wrapFileKey, unwrapFileKey, arrayBufferToBase64, base64ToArrayBuffer } from '../utils/crypto';
import type { EncryptionKeyData, WrappedKeyData } from '../types';

interface EncryptionContextType {
    // State
    isInitialized: boolean;   // True when status check is done
    isSetupRequired: boolean; // True if user has NO recovery key (needs setup)
    isLocked: boolean;        // True if user has key but hasn't unlocked it yet
    lockedSalt: string | null; // Salt needed for derivation (if locked)
    lockedVerificationHash: string | null; // Verification hash for local check

    // Actions
    initializeMasterKey: (key: CryptoKey) => void; // Call this after successful unlock/setup
    refreshStatus: () => Promise<void>;

    // File Operations
    storeKey: (s3Key: string, keyData: EncryptionKeyData) => Promise<boolean>;
    getKey: (s3Key: string) => Promise<EncryptionKeyData | null>;
    removeKey: (s3Key: string) => Promise<void>;
    hasKey: (s3Key: string) => boolean; // Checks local cache only
}

const EncryptionContext = createContext<EncryptionContextType | null>(null);

export const EncryptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // The Master Key (in memory only)
    const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);

    // Local cache of decrypted file keys { s3Key: EncryptionKeyData }
    const [keyCache, setKeyCache] = useState<Record<string, EncryptionKeyData>>({});

    // Status
    const [isInitialized, setIsInitialized] = useState(false);
    const [isSetupRequired, setIsSetupRequired] = useState(false);
    const [lockedSalt, setLockedSalt] = useState<string | null>(null);
    const [lockedVerificationHash, setLockedVerificationHash] = useState<string | null>(null);

    // API Hooks
    const { getRecoveryKeyStatus } = useRecoveryKeyAPI();
    const { saveFileKey, getFileKey, deleteFileKey } = useFileKeysAPI();

    // Check status on mount
    const refreshStatus = useCallback(async () => {
        const status = await getRecoveryKeyStatus();
        if (status) {
            setIsSetupRequired(!status.hasRecoveryKey);
            setLockedSalt(status.salt || null);
            setLockedVerificationHash(status.verificationHash || null);
        }
        setIsInitialized(true);
    }, [getRecoveryKeyStatus]);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    const initializeMasterKey = useCallback((key: CryptoKey) => {
        setMasterKey(key);
        setIsSetupRequired(false);
        setLockedSalt(null); // No longer locked
        setLockedVerificationHash(null);
    }, []);

    // Store Key: Encrypts with MasterKey and sends to API
    const storeKey = useCallback(async (s3Key: string, keyData: EncryptionKeyData) => {
        if (!masterKey) {
            message.error('Impossibile salvare la chiave: Master Key non disponibile');
            return false;
        }

        try {
            // Import the AES key from base64
            const rawKey = base64ToArrayBuffer(keyData.key);
            const fileKey = await crypto.subtle.importKey(
                'raw',
                rawKey,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );

            // Wrap it
            const { wrappedKey, wrapIV } = await wrapFileKey(fileKey, masterKey);

            // Save to API
            const success = await saveFileKey({
                s3Key,
                wrappedKey,
                fileIV: keyData.iv,
                wrapIV
            });

            if (success) {
                // Update local cache
                setKeyCache(prev => ({ ...prev, [s3Key]: keyData }));
            }
            return success;
        } catch (err) {
            message.error('Errore nel salvataggio della chiave di cifratura');
            return false;
        }
    }, [masterKey, saveFileKey]);

    // Get Key: Check cache -> Fetch from API -> Decrypt
    const getKey = useCallback(async (s3Key: string): Promise<EncryptionKeyData | null> => {
        // 1. Check cache
        if (keyCache[s3Key]) {
            return keyCache[s3Key];
        }

        if (!masterKey) {
            return null;
        }

        try {
            // 2. Fetch wrapped key
            const wrappedData = await getFileKey(s3Key);
            if (!wrappedData) return null;

            // 3. Unwrap
            const fileKeyFn = await unwrapFileKey(
                wrappedData.wrappedKey,
                wrappedData.wrapIV,
                masterKey
            );

            // Export to raw base64 for compatibility with app format
            const exportedRaw = await crypto.subtle.exportKey('raw', fileKeyFn);
            const keyData: EncryptionKeyData = {
                key: arrayBufferToBase64(exportedRaw),
                iv: wrappedData.fileIV
            };

            // 4. Update cache
            setKeyCache(prev => ({ ...prev, [s3Key]: keyData }));

            return keyData;
        } catch (err) {
            message.error('Errore nel recupero della chiave di cifratura');
            return null;
        }
    }, [keyCache, masterKey, getFileKey]);

    const removeKey = useCallback(async (s3Key: string) => {
        // Remove from cache
        setKeyCache(prev => {
            const next = { ...prev };
            delete next[s3Key];
            return next;
        });
        // Remove from API
        await deleteFileKey(s3Key);
    }, [deleteFileKey]);

    const hasKey = useCallback((s3Key: string) => {
        return !!keyCache[s3Key];
    }, [keyCache]);

    // Is Locked? True if we have a salt (meaning setup is done) but no masterKey
    const isLocked = !!lockedSalt && !masterKey;

    return (
        <EncryptionContext.Provider value={{
            isInitialized,
            isSetupRequired,
            isLocked,
            lockedSalt,
            lockedVerificationHash,
            initializeMasterKey,
            refreshStatus,
            storeKey,
            getKey,
            removeKey,
            hasKey
        }}>
            {children}
        </EncryptionContext.Provider>
    );
};

export const useEncryption = (): EncryptionContextType => {
    const context = useContext(EncryptionContext);
    if (!context) {
        throw new Error('useEncryption must be used within an EncryptionProvider');
    }
    return context;
};

// Optional hook
export const useEncryptionOptional = (): EncryptionContextType | null => {
    return useContext(EncryptionContext);
};
