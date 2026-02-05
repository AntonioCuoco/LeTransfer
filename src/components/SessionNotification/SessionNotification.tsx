import React, { useState, useEffect } from 'react';
import { CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';

interface SessionNotificationProps {
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
    duration?: number;
    onClose?: () => void;
}

export const SessionNotification: React.FC<SessionNotificationProps> = ({
    type,
    message,
    duration = 5000,
    onClose
}) => {
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                setIsVisible(false);
                setTimeout(() => onClose?.(), 300); // Aspetta l'animazione
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircleOutlined className="text-green-500" />;
            case 'warning':
                return <ExclamationCircleOutlined className="text-yellow-500" />;
            case 'error':
                return <ExclamationCircleOutlined className="text-red-500" />;
            case 'info':
            default:
                return <InfoCircleOutlined className="text-blue-500" />;
        }
    };

    const getBgColor = () => {
        switch (type) {
            case 'success':
                return 'bg-green-900/20 border-green-500/30';
            case 'warning':
                return 'bg-yellow-900/20 border-yellow-500/30';
            case 'error':
                return 'bg-red-900/20 border-red-500/30';
            case 'info':
            default:
                return 'bg-blue-900/20 border-blue-500/30';
        }
    };

    const getTextColor = () => {
        switch (type) {
            case 'success':
                return 'text-green-400';
            case 'warning':
                return 'text-yellow-400';
            case 'error':
                return 'text-red-400';
            case 'info':
            default:
                return 'text-blue-400';
        }
    };

    if (!isVisible) return null;

    return (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg border ${getBgColor()} transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}>
            <div className="flex items-center space-x-3">
                {getIcon()}
                <span className={`text-sm font-medium ${getTextColor()}`}>
                    {message}
                </span>
                <button
                    onClick={() => {
                        setIsVisible(false);
                        setTimeout(() => onClose?.(), 300);
                    }}
                    className="text-gray-400 hover:text-white transition-colors ml-2"
                >
                    ×
                </button>
            </div>
        </div>
    );
};
