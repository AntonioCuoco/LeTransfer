import axios from 'axios'

/**
 * Chiede al server l'email di benvenuto. La registrazione passa da Novren ID, quindi il server
 * di Novren non vede nascere l'account: glielo dice il sito al primo ingresso (`AccessPage.vue`).
 *
 * Fuoco e dimentica: il server la manda solo a un account nuovo e una volta sola, e un errore
 * qui non deve mai fermare l'ingresso (chi resta senza lo recupera il giro giornaliero).
 */
export function requestWelcomeEmail(): void {
  axios.post(`${import.meta.env.VITE_API_URL}/user/welcome`).catch(() => {})
}
