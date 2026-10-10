export interface NotificationSettings {
  emailNotifications: boolean
  uploadComplete: boolean
  downloadComplete: boolean
  shareReceived: boolean
  linkExpiring: boolean
}

/**
 * ⚠️ INTERRUTTORE UNICO — l'invio delle email è agganciato?
 *
 * Finché è `false`, la pagina impostazioni lo **dichiara apertamente**: le preferenze si
 * possono esprimere, ma nessuna email parte. Un interruttore che finge di fare qualcosa è
 * peggio di un interruttore assente — insegna a non fidarsi della UI.
 *
 * Si mette a `true` **solo quando le email arrivano davvero**, non quando esiste
 * l'endpoint delle preferenze: sono due fatti diversi, e il secondo arriva prima.
 * Stessa logica di `PLAN_PRICES_PROVISIONAL` in `types/plan.ts`.
 */
export const EMAIL_DELIVERY_LIVE = false

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
    // Spenta di default, come sul server: chi carica vede già la barra arrivare in fondo.
    uploadComplete: false,
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
