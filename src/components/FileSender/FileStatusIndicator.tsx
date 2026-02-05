import React, { useState } from 'react';
import { Tag, Button, Tooltip } from 'antd';
import {
    CheckCircleOutlined,
    DeleteOutlined,
    SendOutlined,
    UserOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import { RecipientsModal } from './RecipientsModal';

interface FileStatusIndicatorProps {
    file: {
        id: string;
        name: string;
        fileStatus?: 'active' | 'deleted' | 'sent';
        sentTo?: string[];
        sentAt?: string;
    };
}

export const FileStatusIndicator: React.FC<FileStatusIndicatorProps> = ({ file }) => {
    const [showRecipients, setShowRecipients] = useState(false);

    const getStatusInfo = () => {
        switch (file.fileStatus) {
            case 'deleted':
                return {
                    color: 'red',
                    icon: <DeleteOutlined />,
                    text: 'Cancellato',
                    className: 'bg-red-100 text-red-700 border-red-200'
                };
            case 'sent':
                return {
                    color: 'green',
                    icon: <SendOutlined />,
                    text: 'Inviato',
                    className: 'bg-green-100 text-green-700 border-green-200'
                };
            case 'active':
            default:
                return {
                    color: 'blue',
                    icon: <CheckCircleOutlined />,
                    text: 'Attivo',
                    className: 'bg-blue-100 text-blue-700 border-blue-200'
                };
        }
    };

    const statusInfo = getStatusInfo();
    const recipientCount = file.sentTo?.length || 0;

    const formatSentTime = (sentAt?: string) => {
        if (!sentAt) return '';
        const date = new Date(sentAt);
        return date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <>
            <div className="flex items-center gap-2 mt-2">
                <Tag
                    color={statusInfo.color}
                    className={`${statusInfo.className} border`}
                >
                    {statusInfo.icon} {statusInfo.text}
                </Tag>

                {file.fileStatus === 'sent' && recipientCount > 0 && (
                    <div className="flex items-center gap-2">
                        <Tooltip title="Visualizza destinatari">
                            <Button
                                type="link"
                                size="small"
                                icon={<UserOutlined />}
                                onClick={() => setShowRecipients(true)}
                                className="p-0 h-auto text-[#724CF9] hover:text-[#5a3fd4]"
                            >
                                {recipientCount === 1
                                    ? file.sentTo![0]
                                    : `${file.sentTo![0]} +${recipientCount - 1}`
                                }
                            </Button>
                        </Tooltip>

                        {file.sentAt && (
                            <Tooltip title={`Inviato il ${formatSentTime(file.sentAt)}`}>
                                <ClockCircleOutlined className="text-gray-400 text-xs" />
                            </Tooltip>
                        )}
                    </div>
                )}
            </div>

            <RecipientsModal
                visible={showRecipients}
                onClose={() => setShowRecipients(false)}
                recipients={file.sentTo || []}
                fileName={file.name}
            />
        </>
    );
};
