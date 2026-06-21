export interface NotificationSettings {
  emailNotifications: boolean
  uploadComplete: boolean
  downloadComplete: boolean
  shareReceived: boolean
  linkExpiring: boolean
}

export interface PrivacySettings {
  publicProfile: boolean
  showActivity: boolean
  allowSharing: boolean
}

export interface ProfileSettings {
  name: string
  surname: string
  email: string
}

export interface PasswordSettings {
  actualPassword: string
  newPassword: string
  newPasswordConfirm: string
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system'
  language: 'it' | 'en'
}

export interface TransferSettings {
  maxConcurrentUploads: number
  maxConcurrentDownloads: number
  defaultExpiryDays: number
  autoDeleteAfterDownload: boolean
}

export interface UserSettings {
  notifications: NotificationSettings
  privacy: PrivacySettings
  appearance: AppearanceSettings
  transfer: TransferSettings
  profile: ProfileSettings
  password: PasswordSettings
}

export type SettingsSection = 'notifications' | 'privacy' | 'appearance' | 'transfer' | 'security' | 'profile' | 'password'

export const DEFAULT_SETTINGS: UserSettings = {
  notifications: {
    emailNotifications: true,
    uploadComplete: true,
    downloadComplete: false,
    shareReceived: true,
    linkExpiring: true,
  },
  privacy: {
    publicProfile: false,
    showActivity: true,
    allowSharing: true,
  },
  appearance: {
    theme: 'dark',
    language: 'it',
  },
  profile: {
    name: '',
    surname: '',
    email: '',
  },
  password: {
    actualPassword: '',
    newPassword: '',
    newPasswordConfirm: '',
  },
  transfer: {
    maxConcurrentUploads: 3,
    maxConcurrentDownloads: 2,
    defaultExpiryDays: 7,
    autoDeleteAfterDownload: false,
  },
}
