import React, { useEffect, useState } from 'react';
import { useEncryption } from '../contexts/EncryptionContext';
import { RecoveryKeyPrompt } from './RecoveryKeyPrompt';

export const AppSecurityPrompt: React.FC = () => {
    const { isLocked, lockedSalt, lockedVerificationHash, initializeMasterKey } = useEncryption();
    const [promptVisible, setPromptVisible] = useState(false);

    useEffect(() => {
        // Show prompt if locked (meaning we need the key)
        if (isLocked) {
            setPromptVisible(true);
        } else {
            setPromptVisible(false);
        }
    }, [isLocked]);

    const handleSuccess = (masterKey: CryptoKey) => {
        initializeMasterKey(masterKey);
        setPromptVisible(false);
    };

    if (!isLocked || !lockedSalt) return null;

    return (
        <RecoveryKeyPrompt
            open={promptVisible}
            saltBase64={lockedSalt}
            verificationHash={lockedVerificationHash || ''}
            onSuccess={handleSuccess}
            onCancel={() => {
                // Cannot cancel lock. Maybe logout or keep locked (files inaccessible).
                // UI logic: if cancelled, maybe just close modal but app remains locked?
                // For now, allow close, but prompt reappears on next check or simply stays 'locked' in context
                // so files won't load.
                setPromptVisible(false);
            }}
        />
    );
};
