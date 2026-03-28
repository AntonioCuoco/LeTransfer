import { Button, Spin, Modal, message, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import {
    SettingOutlined,
    SaveOutlined,
    UndoOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import { useSettings } from '../hooks/useSettings';
import {
    GeneralSection
} from '../components/Settings';
import NotificationSection from '../components/Settings/NotificationSection';
import IntegrationSettings from '../components/Settings/integrationSettings';

const items: TabsProps['items'] = [
    {
        key: '1',
        label: 'Generali&Sicurezza',
        children: <GeneralSection />,
    },
    {
        key: '2',
        label: 'Notifiche',
        children: <NotificationSection />,
    },
    {
        key: '3',
        label: 'Integrazioni',
        children: <IntegrationSettings />,
    },
    {
        key: '4',
        label: 'Organizzazione',
        children: <IntegrationSettings />,
    },
];

/**
 * Pagina Impostazioni
 * 
 * Organizzata in sezioni:
 * - Notifiche: preferenze email e push
 * - Privacy: visibilità profilo e condivisione
 * - Aspetto: tema e animazioni
 * - Trasferimenti: limiti e comportamenti default
 * - Sicurezza: configurazione E2E encryption
 */
export default function SettingsPage() {

    const {
        isLoading,
        isSaving,
        saveSettings,
        resetSettings,
        hasUnsavedChanges
    } = useSettings();

    // Gestisce il salvataggio con conferma per modifiche non salvate
    const handleSave = async () => {
        try {
            await saveSettings();
        } catch (error) {
            // Error già gestito nell'hook
        }
    };

    // Gestisce il reset con conferma
    const handleReset = () => {
        Modal.confirm({
            title: 'Ripristinare le impostazioni?',
            icon: <ExclamationCircleOutlined />,
            content: 'Tutte le impostazioni verranno riportate ai valori predefiniti.',
            okText: 'Ripristina',
            cancelText: 'Annulla',
            okButtonProps: { danger: true },
            onOk: () => {
                resetSettings();
                message.info('Impostazioni ripristinate ai valori predefiniti');
            }
        });
    };

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-[900px] mx-auto animate-[fadeIn_300ms_ease-out]">
            {/* Header */}
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="m-0 text-3xl font-bold text-white flex items-center gap-3">
                        <SettingOutlined className="text-[#724CF9]" />
                        Impostazioni
                    </h1>
                    <p className="mt-1 mb-0 text-base text-[#9ca3af]">
                        Personalizza la tua esperienza LeTransfer
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        icon={<UndoOutlined />}
                        onClick={handleReset}
                        disabled={isSaving}
                        className="!bg-transparent !border-[#4a4554] !text-[#DBD4D3] hover:!text-white hover:!border-[#724CF9]"
                    >
                        Ripristina
                    </Button>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleSave}
                        loading={isSaving}
                        disabled={!hasUnsavedChanges}
                        className="!bg-[#724CF9] hover:!bg-[#5a3fd1] !border-none !text-white"
                    >
                        Salva Modifiche
                    </Button>
                </div>
            </header>

            <Tabs defaultActiveKey="1" items={items} />

            {/* Unsaved changes indicator */}
            {hasUnsavedChanges && (
                <div className="mb-4 px-4 py-2 bg-[#724CF9]/10 border border-[#724CF9]/30 rounded-lg">
                    <p className="text-[#724CF9] text-sm m-0">
                        ⚠️ Hai modifiche non salvate
                    </p>
                </div>
            )}
        </div>
    );
}
