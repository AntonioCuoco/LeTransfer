import { ref, computed, onMounted } from 'vue'
import { notify } from '@/src/utils/notify'
import type { UserSettings, NotificationSettings, PrivacySettings, AppearanceSettings, TransferSettings, ProfileSettings, PasswordSettings } from '@/src/types/settings'
import { DEFAULT_SETTINGS } from '@/src/types/settings'
import { getCurrentUser } from '@/src/utils/getCurrentUser'

const SETTINGS_STORAGE_KEY = 'letransfer_user_settings'

export const useSettings = () => {
  const user = getCurrentUser()
  const initialDefaults: UserSettings = {
    ...DEFAULT_SETTINGS,
    profile: { name: user?.name?.split(' ')[0] || '', surname: user?.name?.split(' ')[1] || '', email: user?.email || '' },
  }

  const settings = ref<UserSettings>({ ...initialDefaults })
  const originalSettings = ref<UserSettings>({ ...initialDefaults })
  const isLoading = ref(true)
  const isSaving = ref(false)

  const hasUnsavedChanges = computed(() => JSON.stringify(settings.value) !== JSON.stringify(originalSettings.value))

  const loadSettings = () => {
    isLoading.value = true
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as UserSettings
        const merged: UserSettings = {
          notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
          privacy: { ...DEFAULT_SETTINGS.privacy, ...parsed.privacy },
          appearance: { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance },
          transfer: { ...DEFAULT_SETTINGS.transfer, ...parsed.transfer },
          profile: { ...initialDefaults.profile, ...parsed.profile },
          password: { ...DEFAULT_SETTINGS.password, ...parsed.password },
        }
        settings.value = merged
        originalSettings.value = { ...merged }
      }
    } catch { /* use defaults */ } finally {
      isLoading.value = false
    }
  }

  onMounted(loadSettings)

  const updateNotifications = (updates: Partial<NotificationSettings>) => {
    settings.value = { ...settings.value, notifications: { ...settings.value.notifications, ...updates } }
  }
  const updatePrivacy = (updates: Partial<PrivacySettings>) => {
    settings.value = { ...settings.value, privacy: { ...settings.value.privacy, ...updates } }
  }
  const updateAppearance = (updates: Partial<AppearanceSettings>) => {
    settings.value = { ...settings.value, appearance: { ...settings.value.appearance, ...updates } }
  }
  const updateTransfer = (updates: Partial<TransferSettings>) => {
    settings.value = { ...settings.value, transfer: { ...settings.value.transfer, ...updates } }
  }
  const updateProfile = (updates: Partial<ProfileSettings>) => {
    settings.value = { ...settings.value, profile: { ...settings.value.profile, ...updates } }
  }
  const updatePassword = (updates: Partial<PasswordSettings>) => {
    settings.value = { ...settings.value, password: { ...settings.value.password, ...updates } }
  }

  const saveSettings = async () => {
    isSaving.value = true
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings.value))
      originalSettings.value = { ...settings.value }
      notify.success('Impostazioni salvate con successo')
    } catch {
      notify.error('Errore durante il salvataggio delle impostazioni')
      throw new Error('Save failed')
    } finally {
      isSaving.value = false
    }
  }

  const resetSettings = () => { settings.value = { ...initialDefaults } }

  return { settings, isLoading, isSaving, hasUnsavedChanges, updateNotifications, updatePrivacy, updateAppearance, updateTransfer, updateProfile, updatePassword, saveSettings, resetSettings }
}
