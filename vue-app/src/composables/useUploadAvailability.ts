import { computed } from 'vue'
import { useEncryptionStore } from '@/src/stores/encryption'
import { useSecurityPrompt } from '@/src/composables/useSecurityPrompt'

/**
 * Si può caricare un file adesso?
 *
 * Solo con il vault sbloccato: la chiave di ogni file viene salvata cifrata con la master
 * key, e la master key esiste solo dopo aver creato o reinserito le 24 parole. Senza, il
 * file arriverebbe sul server e nessuno potrebbe più aprirlo.
 *
 * - `ready`       vault sbloccato
 * - `needs-setup` la chiave di recupero non esiste: vanno create le 24 parole
 * - `locked`      esiste, ma in questa sessione non è stata reinserita
 * - `checking`    lo stato non è ancora arrivato dal server
 * - `unknown`     il server non ha risposto: nel dubbio non si carica
 */
export type UploadAvailability = 'ready' | 'needs-setup' | 'locked' | 'checking' | 'unknown'

export function useUploadAvailability() {
  const encryptionStore = useEncryptionStore()
  const { recoveryKeyStatus } = useSecurityPrompt()

  const availability = computed<UploadAvailability>(() => {
    if (encryptionStore.isUnlocked) return 'ready'
    switch (recoveryKeyStatus.value) {
      case 'absent': return 'needs-setup'
      case 'present': return 'locked'
      case 'error': return 'unknown'
      default: return 'checking'
    }
  })

  return { availability }
}
