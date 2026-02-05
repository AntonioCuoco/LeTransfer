import React, { useState } from 'react';
import { Modal, Input, Typography, Button, message, Alert } from 'antd';
import { deriveMasterKeyFromMnemonic } from '../utils/recovery-key';
import { base64ToArrayBuffer } from '../utils/crypto';

const { Paragraph } = Typography;
const { TextArea } = Input;

interface RecoveryKeyPromptProps {
    open: boolean;
    onSuccess: (masterKey: CryptoKey) => void;
    onCancel: () => void;
    saltBase64: string; // The user's salt from backend
    verificationHash: string; // The encrypted "VERIFY" string (IV + Ciphertext)
}

export const RecoveryKeyPrompt: React.FC<RecoveryKeyPromptProps> = ({
    open,
    onSuccess,
    onCancel,
    saltBase64,
    verificationHash
}) => {
    const [mnemonic, setMnemonic] = useState('');
    const [verifying, setVerifying] = useState(false);

    const handleVerify = async () => {
        if (!mnemonic.trim()) return;

        setVerifying(true);
        try {
            const salt = base64ToArrayBuffer(saltBase64);

            // Derive key locally
            const masterKey = await deriveMasterKeyFromMnemonic(mnemonic, new Uint8Array(salt));

            // Local verification using the "LockBox" approach
            const packedBuffer = base64ToArrayBuffer(verificationHash);
            const packedArray = new Uint8Array(packedBuffer);

            // Extract IV (first 12 bytes) and Ciphertext
            const iv = packedArray.slice(0, 12);
            const ciphertext = packedArray.slice(12);

            // Attempt to decrypt
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                masterKey,
                ciphertext
            );

            // Decode
            const decoder = new TextDecoder();
            const decryptedString = decoder.decode(decryptedBuffer);

            if (decryptedString === 'VERIFY') {
                message.success('Recovery Key verificata!');
                onSuccess(masterKey);
            } else {
                throw new Error('Decryption result invalid');
            }
        } catch (error: any) {
            // Check for specific Crypto API error indicating wrong key
            if (error.name === 'OperationError' || error.message?.includes('operation-specific reason')) {
                message.error('La Recovery Key inserita non è corretta. Controlla le parole e riprova.');
            } else {
                message.error('Errore tecnico durante la verifica. Riprova più tardi.');
            }
        } finally {
            setVerifying(false);
        }
    };

    return (
        <Modal
            open={open}
            title="Richiesta Chiave di Sicurezza"
            footer={null}
            onCancel={onCancel}
            maskClosable={false}
            width={600}
            centered
        >
            <div className="flex flex-col gap-4">
                <Alert
                    type="info"
                    message="Nuovo dispositivo rilevato"
                    description="Per accedere ai tuoi file cifrati E2E, devi inserire la tua Recovery Key (le 24 parole) generata durante la configurazione."
                    className='!bg-[#724CF9]/70 !border-[#724CF9]/20 !text-white'
                />

                <div>
                    <Paragraph strong className='!text-white'>Inserisci la Recovery Key</Paragraph>
                    <TextArea
                        rows={4}
                        placeholder="parola1 parola2 parola3 ..."
                        value={mnemonic}
                        onChange={(e) => setMnemonic(e.target.value)}
                        className="font-mono"
                    />
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <Button onClick={onCancel} className='!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white'>Annulla</Button>
                    <Button
                        type="primary"
                        onClick={handleVerify}
                        loading={verifying}
                        disabled={!mnemonic.trim()}
                        className='!bg-[#724CF9] hover:!bg-[#9d7bfa] !text-white !border-[#724CF9] hover:!border-[#724CF9]'
                    >
                        Sblocca File
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
