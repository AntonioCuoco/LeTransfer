import React from 'react';
import { Modal, ModalProps } from 'antd';
import { CloseOutlined } from '@ant-design/icons';

interface StyledModalProps extends ModalProps {
    title: React.ReactNode;
    subtitle?: string;
    icon?: React.ReactNode;
}

export const StyledModal: React.FC<StyledModalProps> = ({
    children,
    title,
    subtitle,
    icon,
    ...props
}) => {
    return (
        <Modal
            footer={null}
            centered
            destroyOnClose
            closeIcon={<CloseOutlined className="text-[#9ca3af] hover:text-white" />}
            styles={{
                content: {
                    backgroundColor: '#2c2638',
                    borderRadius: '16px',
                    border: '1px solid #4a4554',
                    padding: 0
                },
                header: {
                    backgroundColor: '#2c2638',
                    borderBottom: '1px solid #4a4554',
                    padding: '20px 24px',
                    borderRadius: '16px 16px 0 0'
                },
                body: {
                    backgroundColor: '#2c2638',
                    padding: '24px'
                }
            }}
            title={
                <div className="flex items-center gap-3">
                    {icon && React.isValidElement(icon) && (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#724CF9] to-[#9d7bfa] flex items-center justify-center">
                            {React.cloneElement(icon as React.ReactElement<any>, { className: "text-white text-lg" })}
                        </div>
                    )}
                    <div>
                        <h3 className="text-white text-lg font-semibold m-0 transition-colors">{title}</h3>
                        {subtitle && <p className="text-[#9ca3af] text-xs m-0">{subtitle}</p>}
                    </div>
                </div>
            }
            {...props}
        >
            {children}
        </Modal>
    );
};
