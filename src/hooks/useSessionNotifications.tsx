import { useState, useCallback } from 'react';
import { SessionNotification } from '../components/SessionNotification/SessionNotification';

interface Notification {
    id: string;
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
    duration?: number;
}

export const useSessionNotifications = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const addNotification = useCallback((
        type: 'success' | 'warning' | 'error' | 'info',
        message: string,
        duration?: number
    ) => {
        const id = Math.random().toString(36).substr(2, 9);
        setNotifications(prev => [...prev, { id, type, message, duration }]);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    const showSuccess = useCallback((message: string, duration?: number) => {
        addNotification('success', message, duration);
    }, [addNotification]);

    const showWarning = useCallback((message: string, duration?: number) => {
        addNotification('warning', message, duration);
    }, [addNotification]);

    const showError = useCallback((message: string, duration?: number) => {
        addNotification('error', message, duration);
    }, [addNotification]);

    const showInfo = useCallback((message: string, duration?: number) => {
        addNotification('info', message, duration);
    }, [addNotification]);

    const NotificationContainer = () => (
        <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map(notification => (
                <SessionNotification
                    key={notification.id}
                    type={notification.type}
                    message={notification.message}
                    duration={notification.duration}
                    onClose={() => removeNotification(notification.id)}
                />
            ))}
        </div>
    );

    return {
        notifications,
        addNotification,
        removeNotification,
        clearAll,
        showSuccess,
        showWarning,
        showError,
        showInfo,
        NotificationContainer
    };
};
