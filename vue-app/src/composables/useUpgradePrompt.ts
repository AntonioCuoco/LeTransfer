import { ref } from 'vue'

/**
 * Il prompt "hai superato il limite del piano", condiviso fra chi lo mostra
 * (`UpgradeDialog` montato una volta sola in `AppLayout`) e chi lo invoca.
 *
 * **Perché a livello di modulo.** Chi incontra il limite è codice che sta in profondità e
 * lontano dalla UI: il composable di upload multipart, la coda dei trasferimenti, la
 * creazione di un link. Nessuno di questi ha un posto sensato dove montare una finestra
 * di dialogo, e farla risalire per props attraverso quattro livelli significherebbe
 * costringere ogni intermediario a conoscere una cosa che non lo riguarda. Lo stesso
 * schema di [useSecurityPrompt](useSecurityPrompt.ts), per lo stesso motivo.
 */

const isOpen = ref(false)
/** Dimensione del file che ha sforato, quando il limite è quello. */
const offendingBytes = ref<number | undefined>(undefined)
/** Spiegazione alternativa, quando a sforare non è la dimensione (es. la retention). */
const reason = ref<string | undefined>(undefined)

export function useUpgradePrompt() {
  /** Il file è troppo grande per il piano: mostra quanto pesa e cosa basterebbe. */
  function promptForFileSize(bytes: number) {
    offendingBytes.value = bytes
    reason.value = undefined
    isOpen.value = true
  }

  /** Un limite diverso dalla dimensione, spiegato a parole. */
  function promptWithReason(text: string) {
    offendingBytes.value = undefined
    reason.value = text
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, offendingBytes, reason, promptForFileSize, promptWithReason, close }
}
