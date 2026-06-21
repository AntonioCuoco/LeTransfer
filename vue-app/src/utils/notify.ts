import ToastEventBus from 'primevue/toasteventbus'

/**
 * Centralized toast notifications.
 *
 * Drop-in replacement for ant-design-vue's global `message`. Uses PrimeVue's
 * ToastEventBus directly (the same channel `useToast()` writes to), so it works
 * everywhere — components, composables, Pinia stores and plain .ts utils —
 * without needing the component inject context that `useToast()` requires.
 *
 * The `<Toast />` mounted in App.vue renders these messages.
 */
type Severity = 'success' | 'info' | 'warn' | 'error'

function add(severity: Severity, detail: string, summary: string, life = 3500) {
  ToastEventBus.emit('add', { severity, summary, detail, life })
}

export const notify = {
  success: (detail: string, summary = 'Successo') => add('success', detail, summary),
  error: (detail: string, summary = 'Errore') => add('error', detail, summary),
  warning: (detail: string, summary = 'Attenzione') => add('warn', detail, summary),
  info: (detail: string, summary = 'Info') => add('info', detail, summary),
}

export default notify
