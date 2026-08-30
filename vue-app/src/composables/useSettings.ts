import { ref, computed } from 'vue'
import axios from 'axios'
import { notify } from '@/src/utils/notify'
import type {
  UserSettings,
  NotificationSettings,
  PrivacySettings,
  AppearanceSettings,
  TransferSettings,
  ProfileSettings,
  PasswordSettings,
} from '@/src/types/settings'
import { DEFAULT_SETTINGS } from '@/src/types/settings'
import { getCurrentUser } from '@/src/utils/getCurrentUser'

/**
 * Impostazioni utente.
 *
 * ── Stato condiviso a livello di modulo ─────────────────────────────────────────
 * I ref stanno **fuori** dalla funzione, e non è un dettaglio di stile: prima venivano
 * creati a ogni chiamata, e `useSettings()` viene invocata da tre punti diversi
 * (SettingsPage, GeneralSection, NotificationSection). Ognuno aveva quindi la **sua**
 * copia: l'utente muoveva un interruttore nella sezione, ma `hasUnsavedChanges` della
 * pagina — che guarda un'altra copia — restava `false`, il pulsante «Salva Modifiche»
 * restava disabilitato, e la modifica spariva al reload. Il salvataggio era rotto per
 * costruzione. Una sola istanza condivisa lo risolve.
 *
 * ── Dove finiscono i dati ───────────────────────────────────────────────────────
 * | Sezione | Dove vive | Perché |
 * |---|---|---|
 * | `notifications` | **Server** (con ripiego locale) | È il backend che deve mandare le email: se la preferenza resta nel browser, nessuno la legge |
 * | `privacy`, `appearance`, `transfer` | `localStorage` | Preferenze di questo browser, non riguardano nessun altro |
 * | `profile` | Cognito (sola lettura qui) | |
 * | `password` | **Da nessuna parte** — vedi sotto | |
 *
 * ⚠️ **La password non viene mai persistita.** I tre campi del form di cambio password
 * sono legati a `settings.password`, e prima finivano **in chiaro in `localStorage`**
 * insieme al resto: `JSON.stringify(settings.value)` non faceva distinzioni. Il difetto
 * era mascherato dal bug qui sopra — con il pulsante di salvataggio sempre disabilitato
 * non si salvava niente, quindi non si notava. Sistemare lo stato condiviso **senza**
 * sistemare anche questo avrebbe attivato la perdita. `stripEphemeral()` toglie la
 * sezione prima di ogni scrittura, e i campi si azzerano dopo il salvataggio.
 *
 * ── Contratto atteso dal backend (preferenze notifiche) ─────────────────────────
 *   GET  /api/user/notification-preferences        (autenticata)
 *     200 → { success: true, data: { emailNotifications, uploadComplete,
 *                                    downloadComplete, shareReceived, linkExpiring } }
 *   PUT  /api/user/notification-preferences        (autenticata)
 *     body: gli stessi campi, tutti opzionali (merge lato server)
 *     200 → { success: true, data: { ...stato aggiornato } }
 * Se l'endpoint non esiste (404/501) si continua a lavorare in locale e
 * `preferencesAreAuthoritative` resta `false`: la UI lo dichiara invece di fingere.
 * ────────────────────────────────────────────────────────────────────────────────
 */

const SETTINGS_STORAGE_KEY = 'letransfer_user_settings'
const PREFS_ENDPOINT = `${import.meta.env.VITE_API_URL || ''}/user/notification-preferences`

/** Copia profonda: `hasUnsavedChanges` confronta JSON, quindi la stessa serializzazione. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Le sezioni che non devono sopravvivere alla sessione. Oggi solo `password`: sono i
 * campi di un form, non impostazioni, e non hanno alcun motivo di essere scritti su disco.
 */
function stripEphemeral(value: UserSettings): Omit<UserSettings, 'password'> {
  const { password: _password, ...persistable } = value
  return persistable
}

function emptyPassword(): PasswordSettings {
  return { actualPassword: '', newPassword: '', newPasswordConfirm: '' }
}

function withCurrentUser(base: UserSettings): UserSettings {
  const user = getCurrentUser()
  return {
    ...base,
    profile: {
      name: user?.name?.split(' ')[0] || '',
      surname: user?.name?.split(' ')[1] || '',
      email: user?.email || '',
    },
  }
}

// ── Stato condiviso ─────────────────────────────────────────────────────────────
const settings = ref<UserSettings>(clone(DEFAULT_SETTINGS))
const originalSettings = ref<UserSettings>(clone(DEFAULT_SETTINGS))
const isLoading = ref(true)
const isSaving = ref(false)
/** `true` solo quando le preferenze notifiche arrivano davvero dal server. */
const preferencesAreAuthoritative = ref(false)

/** Un solo caricamento per sessione, anche se tre componenti chiamano il composable. */
let loadPromise: Promise<void> | null = null

function readLocal(): UserSettings {
  const base = withCurrentUser(clone(DEFAULT_SETTINGS))
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!stored) return base
    const parsed = JSON.parse(stored) as Partial<UserSettings>
    return {
      notifications: { ...base.notifications, ...parsed.notifications },
      privacy: { ...base.privacy, ...parsed.privacy },
      appearance: { ...base.appearance, ...parsed.appearance },
      transfer: { ...base.transfer, ...parsed.transfer },
      profile: { ...base.profile, ...parsed.profile },
      // Mai riletta: non viene mai scritta.
      password: emptyPassword(),
    }
  } catch {
    return base
  }
}

/**
 * Chiede al server le preferenze notifiche. Un `404`/`501` non è un errore: è un backend
 * che non ha ancora quell'endpoint, e la UI deve continuare a funzionare con i valori
 * locali — dichiarandolo.
 */
async function fetchRemotePreferences(): Promise<NotificationSettings | null> {
  try {
    const { data } = await axios.get<{ data?: Partial<NotificationSettings> }>(PREFS_ENDPOINT)
    if (!data?.data) return null
    return { ...DEFAULT_SETTINGS.notifications, ...data.data }
  } catch {
    return null
  }
}

async function loadSettings(): Promise<void> {
  isLoading.value = true
  const local = readLocal()

  const remote = await fetchRemotePreferences()
  if (remote) {
    local.notifications = remote
    preferencesAreAuthoritative.value = true
  }

  settings.value = local
  originalSettings.value = clone(local)
  isLoading.value = false
}

export const useSettings = () => {
  if (!loadPromise) loadPromise = loadSettings()

  const hasUnsavedChanges = computed(
    () => JSON.stringify(settings.value) !== JSON.stringify(originalSettings.value),
  )

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
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(stripEphemeral(settings.value)))

      // Le notifiche vanno anche al server, che è l'unico che può agire su di esse.
      // Se l'endpoint non c'è, il salvataggio locale è comunque riuscito: non è un errore
      // da mostrare all'utente, è una capacità che il backend non ha ancora.
      try {
        await axios.put(PREFS_ENDPOINT, settings.value.notifications)
        preferencesAreAuthoritative.value = true
      } catch {
        preferencesAreAuthoritative.value = false
      }

      // I campi password non sopravvivono al salvataggio: restano solo il tempo del form.
      settings.value = { ...settings.value, password: emptyPassword() }
      originalSettings.value = clone(settings.value)
      notify.success('Impostazioni salvate con successo')
    } catch {
      notify.error('Errore durante il salvataggio delle impostazioni')
      throw new Error('Save failed')
    } finally {
      isSaving.value = false
    }
  }

  const resetSettings = () => {
    settings.value = withCurrentUser(clone(DEFAULT_SETTINGS))
  }

  return {
    settings,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    preferencesAreAuthoritative,
    updateNotifications,
    updatePrivacy,
    updateAppearance,
    updateTransfer,
    updateProfile,
    updatePassword,
    saveSettings,
    resetSettings,
  }
}
