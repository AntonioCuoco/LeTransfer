/**
 * LinkExpiredError - Componente per mostrare errori sui link
 * 
 * Mostra messaggi appropriati per:
 * - Link non trovato
 * - Link scaduto
 * - Link revocato
 * - Limite download raggiunto
 * - Errori generici
 */

import { Button } from 'antd';
import {
    CloseCircleOutlined,
    ClockCircleOutlined,
    StopOutlined,
    WarningOutlined,
    HomeFilled
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import type { LinkStatus } from '../../hooks/usePublicLink';

interface LinkExpiredErrorProps {
    /** Stato del link */
    status: LinkStatus;
    /** Messaggio di errore personalizzato */
    message?: string;
}

/**
 * Configurazione per ogni tipo di errore
 */
const errorConfig: Record<string, {
    icon: React.ReactNode;
    title: string;
    description: string;
    color: string;
}> = {
    not_found: {
        icon: <CloseCircleOutlined className="text-6xl text-red-400" />,
        title: 'Link non trovato',
        description: 'Il link che stai cercando non esiste o è stato eliminato.',
        color: 'red'
    },
    expired: {
        icon: <ClockCircleOutlined className="text-6xl text-yellow-400" />,
        title: 'Link scaduto',
        description: 'Questo link è scaduto e non è più accessibile. Contatta il proprietario per richiederne uno nuovo.',
        color: 'yellow'
    },
    revoked: {
        icon: <StopOutlined className="text-6xl text-orange-400" />,
        title: 'Link revocato',
        description: 'Il proprietario ha revocato questo link. Non è più possibile accedere al file.',
        color: 'orange'
    },
    download_limit: {
        icon: <WarningOutlined className="text-6xl text-purple-400" />,
        title: 'Limite raggiunto',
        description: 'Questo link ha raggiunto il numero massimo di download consentiti.',
        color: 'purple'
    },
    error: {
        icon: <WarningOutlined className="text-6xl text-red-400" />,
        title: 'Errore',
        description: 'Si è verificato un errore durante il caricamento. Riprova più tardi.',
        color: 'red'
    }
};

export const LinkExpiredError = ({ status, message }: LinkExpiredErrorProps) => {
    const navigate = useNavigate();
    const config = errorConfig[status] || errorConfig.error;

    return (
        <div className="min-h-screen bg-[#2c2638] flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                {/* Icon */}
                <div className="mb-6">
                    {config.icon}
                </div>

                {/* Title */}
                <h1 className="text-2xl font-bold text-white mb-3">
                    {config.title}
                </h1>

                {/* Description */}
                <p className="text-[#9ca3af] mb-6">
                    {message || config.description}
                </p>

                {/* Info Box */}
                <div className="bg-[#1a1625] border border-[#4a4554] rounded-xl p-4 mb-6">
                    <p className="text-[#676178] text-sm m-0">
                        Se ritieni che questo sia un errore, contatta la persona che ti ha inviato il link.
                    </p>
                </div>

                {/* Home Button */}
                <Button
                    type="primary"
                    icon={<HomeFilled />}
                    onClick={() => navigate('/')}
                    size="large"
                    className="!bg-[#724CF9] hover:!bg-[#9d7bfa] !text-white !border-[#724CF9]"
                    style={{ borderRadius: '10px', height: '48px', padding: '0 32px' }}
                >
                    Torna alla home
                </Button>
            </div>
        </div>
    );
};

export default LinkExpiredError;
