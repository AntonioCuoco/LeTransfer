import { ref } from 'vue'

/**
 * Richiesta di sblocco del vault, condivisa fra chi la mostra (AppSecurityPrompt)
 * e chi la invoca (la barra laterale).
 *
 * Perché serve: il dialogo di sblocco si può chiudere, e l'app resta legittimamente
 * in stato "bloccato" — ma prima non esisteva NESSUN modo di riaprirlo se non
 * ricaricando la pagina. L'utente restava con i file cifrati inaccessibili e nessun
 * bottone da premere. Lo stato vive a livello di modulo (non per componente) perché
 * i due lati stanno in punti diversi dell'albero.
 */

const isPromptOpen = ref(false)
const canUnlock = ref(false)

export function useSecurityPrompt() {
  /** Chiamata dalla barra laterale: riapre il dialogo se c'è una chiave da inserire. */
  function requestUnlock() {
    if (canUnlock.value) isPromptOpen.value = true
  }

  /** Il dialogo dichiara se esiste una recovery key configurata per questo account. */
  function setUnlockAvailable(available: boolean) {
    canUnlock.value = available
  }

  function open() {
    isPromptOpen.value = true
  }

  function close() {
    isPromptOpen.value = false
  }

  return { isPromptOpen, canUnlock, requestUnlock, setUnlockAvailable, open, close }
}
