import { Button, Modal, message } from "antd";
import { SettingsSection } from "./SettingsSection"
import { FormatPainterOutlined, SafetyCertificateOutlined } from "@ant-design/icons"
import { useEncryption } from "@/src/contexts/EncryptionContext";
import { useState } from "react";
import { RecoveryKeySetup } from "../RecoveryKeySetup";
import { SettingsSelect } from "./SettingsInputs";
import { SettingsToggle } from "./SettingsToggle";
import { useSettings } from "@/src/hooks/useSettings";

export default function GeneralSection() {
    const { isSetupRequired, refreshStatus } = useEncryption();
    // Encryption context per la sezione sicurezza

    const {
        settings,
        updateAppearance,
    } = useSettings();

    const [securityModalVisible, setSecurityModalVisible] = useState(false);

    return (
        <div className="flex flex-col gap-4">
            <SettingsSection
                title="Aspetto"
                description="Personalizza l'interfaccia"
                icon={<FormatPainterOutlined />}
            >
                <SettingsSelect
                    label="Tema"
                    description="Scegli il tema dell'applicazione"
                    value={settings.appearance.theme}
                    onChange={(value) => updateAppearance({ theme: value })}
                    options={[
                        { value: 'dark', label: '🌙 Scuro' },
                        { value: 'light', label: '☀️ Chiaro' },
                        { value: 'system', label: '💻 Sistema' }
                    ]}
                />
                <SettingsSelect
                    label="Cambia lingua"
                    description="Cambia la lingua dell'applicazione"
                    value={settings.appearance.language}
                    onChange={(value) => updateAppearance({ language: value })}
                    options={[
                        { value: 'it', label: '🇮🇹 Italiano' },
                        { value: 'en', label: '🇬🇧 Inglese' }
                    ]}
                />
            </SettingsSection>

            <SettingsSection
                title="Sicurezza"
                description="Crittografia end-to-end e recovery key"
                icon={<SafetyCertificateOutlined />}
            >
                <div className="py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="text-white font-medium m-0">Recovery Key</h4>
                            <p className="text-[#9ca3af] text-xs mt-1">
                                {isSetupRequired
                                    ? 'Non configurata - necessaria per crittografia E2E'
                                    : 'Configurata - i tuoi file sono protetti'
                                }
                            </p>
                        </div>
                        <Button
                            type={isSetupRequired ? 'primary' : 'default'}
                            onClick={() => setSecurityModalVisible(true)}
                            danger={isSetupRequired}
                            className={isSetupRequired
                                ? ''
                                : '!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!border-[#724CF9]'
                            }
                        >
                            {isSetupRequired ? 'Configura Ora' : 'Gestisci'}
                        </Button>
                    </div>

                    {isSetupRequired && (
                        <div className="mt-4 p-3 bg-[#cf1322]/10 border border-[#cf1322]/30 rounded-lg">
                            <p className="text-[#cf1322] text-sm m-0">
                                ⚠️ La crittografia end-to-end non è configurata. I tuoi file non sono completamente protetti.
                            </p>
                        </div>
                    )}
                </div>
            </SettingsSection>

            {/* Section per le integrazioni come github e altri repository, figma e altri strumenti per designer e developer */}
            {/* Section per cambiare informazioni generali e password e aggiungere 2 factor authentication */}

            <Modal
                open={securityModalVisible}
                footer={null}
                onCancel={() => setSecurityModalVisible(false)}
                closable={false}
                width={800}
                centered
                destroyOnClose
                maskClosable={false}
                className="custom-modal-transparent"
                styles={{
                    content: {
                        backgroundColor: '#1a1625',
                        border: '1px solid #4a4554',
                        borderRadius: '16px',
                        padding: '0'
                    },
                    mask: {
                        backdropFilter: 'blur(5px)',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)'
                    }
                }}
            >
                <div className="p-8">
                    <RecoveryKeySetup
                        onComplete={() => {
                            setSecurityModalVisible(false);
                            refreshStatus();
                            message.success("Sicurezza configurata!");
                        }}
                        onCancel={() => setSecurityModalVisible(false)}
                    />
                </div>
            </Modal>
        </div>
    );
}