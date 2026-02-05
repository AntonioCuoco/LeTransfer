import React, { useState } from 'react';
import { Button, Steps, Typography, Space, message, Input } from 'antd';
import { CopyOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { generateRecoveryKey, deriveMasterKeyFromMnemonic } from '../utils/recovery-key';
import { generateSalt, arrayBufferToBase64 } from '../utils/crypto';
import { useEncryption } from '../contexts/EncryptionContext';

// Re-imports
import { useRecoveryKeyAPI } from '../hooks/useRecoveryKeyAPI';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

interface RecoveryKeySetupProps {
    onComplete: () => void;
    onCancel: () => void;
}

export const RecoveryKeySetup: React.FC<RecoveryKeySetupProps> = ({ onComplete, onCancel }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [mnemonic, setMnemonic] = useState<string>('');
    const [confirmMnemonic, setConfirmMnemonic] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    const { setupRecoveryKey, isLoading } = useRecoveryKeyAPI();
    const { initializeMasterKey } = useEncryption();


    // Step 1: Generate
    const handleGenerate = async () => {
        const key = await generateRecoveryKey();
        setMnemonic(key);
        setCurrentStep(1);
    };

    // Step 2: Confirm
    const handleConfirm = async () => {
        const original = mnemonic.trim().toLowerCase();
        const input = confirmMnemonic.trim().toLowerCase();

        if (original !== input) {
            message.error('Le parole inserite non corrispondono. Riprova.');
            return;
        }

        // Proceed to setup API
        await performSetup();
    };

    const performSetup = async () => {
        setIsVerifying(true);
        try {
            const salt = generateSalt();

            // Derive master key
            const masterKey = await deriveMasterKeyFromMnemonic(mnemonic, salt);

            // Create verification hash: Encrypt fixed string "VERIFY"
            const encoder = new TextEncoder();
            const dataToEncrypt = encoder.encode('VERIFY');

            const iv = crypto.getRandomValues(new Uint8Array(12));

            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                masterKey,
                dataToEncrypt
            );

            // Combine IV + Encrypted Data for the hash
            // Pack it: IV (12 bytes) + Ciphertext
            const encArr = new Uint8Array(encryptedBuffer);
            const packed = new Uint8Array(12 + encArr.byteLength);
            packed.set(iv);              // iv is already Uint8Array(12), use directly
            packed.set(encArr, 12);      // Set ciphertext starting at byte 12

            // Convert to Base64 - use slice() to get a clean copy of just our data
            const verificationHash = arrayBufferToBase64(packed.slice().buffer);
            const saltBase64 = arrayBufferToBase64(salt.slice().buffer);

            const success = await setupRecoveryKey({
                salt: saltBase64,
                verificationHash
            });

            if (success) {
                message.success('Sicurezza configurata con successo!');
                // 🔐 Initialize the Master Key in the Encryption Context
                // This is CRITICAL - without this, file encryption keys won't be saved!
                initializeMasterKey(masterKey);
                onComplete();
            }
        } catch (error) {
            message.error('Errore durante la configurazione.');
        } finally {
            setIsVerifying(false);
        }
    };

    // Helper to print words
    const renderMnemonic = () => {
        const words = mnemonic.split(' ');
        return (
            <div className="grid grid-cols-4 gap-2 bg-gray-50 p-4 rounded-lg border border-gray-200 my-4">
                {words.map((word, i) => (
                    <div key={i} className="flex items-center space-x-1">
                        <span className="!text-gray-400 text-xs w-4">{i + 1}.</span>
                        <span className="!font-mono !font-medium">{word}</span>
                    </div>
                ))}
            </div>
        );
    };

    const steps = [
        { title: 'Genera Chiave' },
        { title: 'Salva' },
        { title: 'Verifica' }
    ];

    // Helper from crypto.ts needed here, importing manually or copy-paste helper for now due to limitation of context.
    // I should export arrayBufferToBase64 from crypto.ts. I already checked it resides there.
    // But I can't import it if it's not exported. `arrayBufferToBase64` IS exported in crypto.ts (checked in file view).

    return (
        <div className="w-full px-4 pb-4">
            <Steps
                current={currentStep}
                className="!mb-10 custom-steps p-4"
                items={steps.map(step => ({ ...step, className: 'text-white' }))}
            />

            {currentStep === 0 && (
                <div className="text-center space-y-8 px-4">
                    <div className="w-20 h-20 mx-auto bg-[#724CF9]/20 rounded-full flex items-center justify-center ring-4 ring-[#724CF9]/10">
                        <SafetyCertificateOutlined className="!text-[#724CF9] text-4xl" />
                    </div>

                    <div className="space-y-3">
                        <Title level={3} className="!text-white !mb-0 text-3xl">Proteggi i tuoi file</Title>
                        <Paragraph className="!text-[#DBD4D3] text-lg leading-relaxed max-w-lg mx-auto">
                            LeTransfer utilizza la crittografia End-to-End. Per proteggere i tuoi file in modo permanente e renderli accessibili da qualsiasi dispositivo, dobbiamo generare una <span className="text-[#724CF9] font-bold">Chiave di Ripristino</span> (Recovery Key).
                        </Paragraph>
                    </div>

                    <div className="bg-[#1a1625] border border-[#4a4554] p-5 rounded-xl flex gap-4 text-left shadow-lg">
                        <div className="text-[#F4743B] text-2xl">⚠️</div>
                        <span className="text-[#F4743B] text-base leading-relaxed">
                            Questa chiave è l'<strong>UNICO</strong> modo per recuperare i tuoi file se dimentichi la password o cambi dispositivo.
                        </span>
                    </div>

                    <Space className="pt-6" size="middle">
                        <Button
                            size="large"
                            onClick={onCancel}
                            className="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white !h-12 !px-8 !rounded-lg"
                        >
                            Annulla
                        </Button>
                        <Button
                            type="primary"
                            size="large"
                            onClick={handleGenerate}
                            className="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none !h-12 !px-8 !rounded-lg !text-base !font-medium !shadow-[0_0_15px_rgba(114,76,249,0.3)]"
                        >
                            Genera Recovery Key
                        </Button>
                    </Space>
                </div>
            )}

            {currentStep === 1 && (
                <div>
                    <div className="text-center mb-6">
                        <Title level={4} className="!text-white">Salva la tua Recovery Key</Title>
                        <Paragraph className="!text-[#DBD4D3]">
                            Salva queste 24 parole in un luogo sicuro (password manager, carta e penna).
                            <br />Non condividerle mai con nessuno.
                        </Paragraph>
                    </div>

                    {renderMnemonic()}

                    <div className="flex justify-between items-center mt-6">
                        <Button
                            icon={<CopyOutlined />}
                            onClick={() => {
                                navigator.clipboard.writeText(mnemonic);
                                message.success('Copiata negli appunti');
                            }}
                            className="!bg-[#2c2638] !border-[#4a4554] !text-white hover:!border-[#724CF9]"
                        >
                            Copia tutto
                        </Button>
                        <Button
                            type="primary"
                            onClick={() => setCurrentStep(2)}
                            className="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none"
                        >
                            Ho salvato le parole
                        </Button>
                    </div>
                </div>
            )}

            {currentStep === 2 && (
                <div className="flex flex-col gap-6">
                    <div className="text-center">
                        <Title level={4} className="!text-white">Verifica Recovery Key</Title>
                        <Paragraph className="!text-[#DBD4D3]">
                            Per sicurezza, inserisci le parole che hai appena salvato per confermare che siano corrette.
                        </Paragraph>
                    </div>

                    <TextArea
                        rows={4}
                        value={confirmMnemonic}
                        onChange={e => setConfirmMnemonic(e.target.value)}
                        placeholder="Incolla qui le 24 parole separate da spazio..."
                        className="mb-4 !bg-[#1a1625] !border-[#4a4554] !text-white placeholder:!text-[#676178]"
                    />

                    <div className="flex justify-end gap-2">
                        <Button
                            onClick={() => setCurrentStep(1)}
                            className="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9] hover:!text-white"
                        >
                            Indietro
                        </Button>
                        <Button
                            type="primary"
                            onClick={handleConfirm}
                            loading={isVerifying || isLoading}
                            disabled={!confirmMnemonic}
                            className="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none disabled:!opacity-50 disabled:!bg-[#4a4554]"
                        >
                            Verifica e Attiva
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
