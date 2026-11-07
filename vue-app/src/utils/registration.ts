/**
 * Registrazione chiusa temporaneamente (deciso il 2026-09-16): si riapre quando la fatturazione è
 * pronta.
 *
 * ⚠️ **Con Novren ID questo interruttore spegne solo l'interfaccia.** Gli account nascono in
 * Novren ID (account.novren.net/registrati), una volta per tutta la famiglia: chiunque abbia un
 * Novren ID può collegarsi a Novren. Per tenere Novren davvero chiuso serve un filtro nel server
 * di Novren (per esempio una lista di inviti per email, controllata in `middleware/auth.js`):
 * decisione aperta, vedi novrenID/docs/STATO.md §7.2. E «crea account» dal pannello admin non
 * esiste più (gli account non si creano per conto d'altri).
 */
export const REGISTRATION_OPEN = false

/** Il perché, detto a chi preme il pulsante. Usato come tooltip e come testo in pagina. */
export const REGISTRATION_CLOSED_MESSAGE =
  'Per il momento la registrazione è chiusa: gli account li crea l’amministratore. Contattalo per averne uno.'
