/**
 * Types for user settings/preferences
 */

import { getCurrentUser } from "../components/getCurrentUser/getCurrentUser";

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

// Profile settings
export interface ProfileSettings {
    name: string;
    surname: string;
    email: string;
}

// Password settings
export interface PasswordSettings {
    actualPassword: string;
    newPassword: string;
    newPasswordConfirm: string;
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
    profile: ProfileSettings;
    password: PasswordSettings;
}

const user = getCurrentUser();

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
    profile: {
        name: user?.name?.split(" ")[0] || '',
        surname: user?.name?.split(" ")[1] || '',
        email: user?.email || '',
    },
    password: {
        actualPassword: "",
        newPassword: "",
        newPasswordConfirm: "",
    },
    transfer: {
        maxConcurrentUploads: 3,
        maxConcurrentDownloads: 2,
        defaultExpiryDays: 7,
        autoDeleteAfterDownload: false
    }
};

// Settings section for UI organization
export type SettingsSection = 'notifications' | 'privacy' | 'appearance' | 'transfer' | 'security' | 'profile' | 'password';
