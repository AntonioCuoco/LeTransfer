import React from 'react';
import { Modal, List, Avatar, Typography, Button } from 'antd';
import { UserOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface RecipientsModalProps {
    visible: boolean;
    onClose: () => void;
    recipients: string[];
    fileName: string;
}

export const RecipientsModal: React.FC<RecipientsModalProps> = ({
    visible,
    onClose,
    recipients,
    fileName
}) => {
    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <UserOutlined className="text-[#724CF9]" />
                    <span>Destinatari del file</span>
                </div>
            }
            open={visible}
            onCancel={onClose}
            footer={[
                <Button key="close" onClick={onClose} className="bg-[#724CF9] border-[#724CF9] text-white hover:bg-[#5a3fd4]">
                    Chiudi
                </Button>
            ]}
            className="recipients-modal"
            width={400}
        >
            <div className="mb-4">
                <Text strong className="text-gray-700">File: </Text>
                <Text className="text-gray-600">{fileName}</Text>
            </div>

            <div className="mb-4">
                <Text strong className="text-gray-700">
                    Inviato a {recipients.length} destinatari:
                </Text>
            </div>

            <List
                dataSource={recipients}
                renderItem={(email, index) => (
                    <List.Item className="!px-0 !py-2">
                        <div className="flex items-center gap-3 w-full">
                            <Avatar
                                size="small"
                                icon={<UserOutlined />}
                                className="bg-[#724CF9]"
                            />
                            <div className="flex-1">
                                <Text className="text-gray-700">{email}</Text>
                            </div>
                            <Text className="text-gray-400 text-xs">
                                #{index + 1}
                            </Text>
                        </div>
                    </List.Item>
                )}
                className="max-h-60 overflow-y-auto"
            />
        </Modal>
    );
};
