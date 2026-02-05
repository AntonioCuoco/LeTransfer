/**
 * Types for user settings/preferences
 */

// Notification preferences
export interface NotificationSettings {
    emailNotifications: boolean;
    uploadComplete: boolean;
    downloadComplete: boolean;
    shareReceived: boolean;
    linkExpiring: boolean;
}

// Privacy settings
export interface PrivacySettings {
    publicProfile: boolean;
    showActivity: boolean;
    allowSharing: boolean;
}

// Appearance settings
export interface AppearanceSettings {
    theme: 'light' | 'dark' | 'system';
    language: 'it' | 'en';
}

// Transfer settings
export interface TransferSettings {
    maxConcurrentUploads: number;
    maxConcurrentDownloads: number;
    defaultExpiryDays: number;
    autoDeleteAfterDownload: boolean;
}

// Complete user settings object
export interface UserSettings {
    notifications: NotificationSettings;
    privacy: PrivacySettings;
    appearance: AppearanceSettings;
    transfer: TransferSettings;
}

// Default settings
export const DEFAULT_SETTINGS: UserSettings = {
    notifications: {
        emailNotifications: true,
        uploadComplete: true,
        downloadComplete: false,
        shareReceived: true,
        linkExpiring: true
    },
    privacy: {
        publicProfile: false,
        showActivity: true,
        allowSharing: true
    },
    appearance: {
        theme: 'dark',
        language: 'it'
    },
    transfer: {
        maxConcurrentUploads: 3,
        maxConcurrentDownloads: 2,
        defaultExpiryDays: 7,
        autoDeleteAfterDownload: false
    }
};

// Settings section for UI organization
export type SettingsSection = 'notifications' | 'privacy' | 'appearance' | 'transfer' | 'security';
