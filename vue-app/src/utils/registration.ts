/**
 * Registrazione chiusa temporaneamente (deciso il 2026-09-16).
 *
 * Gli account li crea l'amministratore dal pannello admin; si riapre quando la fatturazione
 * è pronta. Per riaprire basta rimettere `REGISTRATION_OPEN` a `true` **e** togliere il blocco
 * del backend (`middleware/registrationClosed.js`).
 *
 * ⚠️ **Questo interruttore spegne solo l'interfaccia.** La pagina di registrazione parla
 * direttamente con Cognito (`SignUpCommand`), non con il nostro backend: chi conosce l'id del
 * client può registrarsi lo stesso. Il blocco completo si ottiene disattivando il self sign-up
 * del User Pool (`AdminCreateUserConfig.AllowAdminCreateUserOnly`), che è l'unico punto che
 * nessun client può aggirare.
 */
export const REGISTRATION_OPEN = false

/** Il perché, detto a chi preme il pulsante. Usato come tooltip e come testo in pagina. */
export const REGISTRATION_CLOSED_MESSAGE =
  'Per il momento la registrazione è chiusa: gli account li crea l’amministratore. Contattalo per averne uno.'
