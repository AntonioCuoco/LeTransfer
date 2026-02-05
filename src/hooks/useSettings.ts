import { useState, useCallback, useEffect } from 'react';
import { message } from 'antd';
import type {
    UserSettings,
    NotificationSettings,
    PrivacySettings,
    AppearanceSettings,
    TransferSettings
} from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';

// Storage key for localStorage
const SETTINGS_STORAGE_KEY = 'letransfer_user_settings';

interface UseSettingsReturn {
    /** Current user settings */
    settings: UserSettings;
    /** Loading state */
    isLoading: boolean;
    /** Save state */
    isSaving: boolean;
    /** Update notification settings */
    updateNotifications: (updates: Partial<NotificationSettings>) => void;
    /** Update privacy settings */
    updatePrivacy: (updates: Partial<PrivacySettings>) => void;
    /** Update appearance settings */
    updateAppearance: (updates: Partial<AppearanceSettings>) => void;
    /** Update transfer settings */
    updateTransfer: (updates: Partial<TransferSettings>) => void;
    /** Save all settings to storage/backend */
    saveSettings: () => Promise<void>;
    /** Reset settings to defaults */
    resetSettings: () => void;
    /** Check if settings have unsaved changes */
    hasUnsavedChanges: boolean;
}

/**
 * Hook per gestire le impostazioni utente.
 * Persiste le impostazioni in localStorage e sincronizza con il backend (quando disponibile).
 */
export const useSettings = (): UseSettingsReturn => {
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [originalSettings, setOriginalSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Carica le impostazioni al mount
    useEffect(() => {
        loadSettings();
    }, []);

    /**
     * Carica le impostazioni da localStorage (e in futuro dal backend)
     */
    const loadSettings = useCallback(() => {
        setIsLoading(true);
        try {
            const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as UserSettings;
                // Merge con defaults per gestire nuovi campi
                const merged: UserSettings = {
                    notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
                    privacy: { ...DEFAULT_SETTINGS.privacy, ...parsed.privacy },
                    appearance: { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance },
                    transfer: { ...DEFAULT_SETTINGS.transfer, ...parsed.transfer }
                };
                setSettings(merged);
                setOriginalSettings(merged);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            // Usa i defaults in caso di errore
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Aggiorna le impostazioni di notifica
     */
    const updateNotifications = useCallback((updates: Partial<NotificationSettings>) => {
        setSettings(prev => ({
            ...prev,
            notifications: { ...prev.notifications, ...updates }
        }));
    }, []);

    /**
     * Aggiorna le impostazioni di privacy
     */
    const updatePrivacy = useCallback((updates: Partial<PrivacySettings>) => {
        setSettings(prev => ({
            ...prev,
            privacy: { ...prev.privacy, ...updates }
        }));
    }, []);

    /**
     * Aggiorna le impostazioni di aspetto
     */
    const updateAppearance = useCallback((updates: Partial<AppearanceSettings>) => {
        setSettings(prev => ({
            ...prev,
            appearance: { ...prev.appearance, ...updates }
        }));
    }, []);

    /**
     * Aggiorna le impostazioni di trasferimento
     */
    const updateTransfer = useCallback((updates: Partial<TransferSettings>) => {
        setSettings(prev => ({
            ...prev,
            transfer: { ...prev.transfer, ...updates }
        }));
    }, []);

    /**
     * Salva le impostazioni in localStorage (e in futuro sul backend)
     */
    const saveSettings = useCallback(async () => {
        setIsSaving(true);
        try {
            // Salva in localStorage
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));

            // TODO: Sincronizza con il backend quando l'endpoint sarà disponibile
            // await axios.put('/api/user/settings', settings);

            setOriginalSettings(settings);
            message.success('Impostazioni salvate con successo');
        } catch (error) {
            console.error('Error saving settings:', error);
            message.error('Errore durante il salvataggio delle impostazioni');
            throw error;
        } finally {
            setIsSaving(false);
        }
    }, [settings]);

    /**
     * Ripristina le impostazioni ai valori di default
     */
    const resetSettings = useCallback(() => {
        setSettings(DEFAULT_SETTINGS);
    }, []);

    /**
     * Controlla se ci sono modifiche non salvate
     */
    const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

    return {
        settings,
        isLoading,
        isSaving,
        updateNotifications,
        updatePrivacy,
        updateAppearance,
        updateTransfer,
        saveSettings,
        resetSettings,
        hasUnsavedChanges
    };
};
