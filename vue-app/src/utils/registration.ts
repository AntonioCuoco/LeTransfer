/**
 * Registrazione chiusa temporaneamente (deciso il 2026-09-16).
 *
 * Gli account li crea l'amministratore dal pannello admin; si riapre quando la fatturazione
 * è pronta.
 *
 * ⚠️ **Questo interruttore spegne solo l'interfaccia.** La pagina di registrazione parla
 * direttamente con Cognito (`SignUpCommand`), non con il nostro backend. Il blocco vero sta in
 * Cognito: `AdminCreateUserConfig.AllowAdminCreateUserOnly = true` sul User Pool, l'unico punto
 * che nessun client può aggirare (revisione di sicurezza del 18-10-2026,
 * `novren-desktop/docs/SICUREZZA.md`).
 *
 * ── Per RIAPRIRE la registrazione, tutte e tre le cose ─────────────────────────────────────────
 *  1. Cognito, produzione e staging: `AllowAdminCreateUserOnly = false`. Senza, `SignUp` risponde
 *     «NotAuthorizedException: SignUp is not permitted for this user pool».
 *  2. Qui: `REGISTRATION_OPEN = true` (pulsanti, pagina /register).
 *  3. ⚠️ Prima di farlo, decidere la protezione: con il self sign-up aperto chiunque può
 *     iscriversi chiamando Cognito senza passare dal sito (niente Turnstile, niente limiti
 *     nostri). La via sicura è una rotta del backend con Turnstile e limiti che crea l'utente
 *     (`AdminCreateUser`) lasciando il punto 1 chiuso, oppure un trigger «pre sign-up» di Cognito
 *     che verifica Turnstile. Vedi SICUREZZA.md, «La registrazione chiusa è aperta su Cognito».
 */
export const REGISTRATION_OPEN = false

/** Il perché, detto a chi preme il pulsante. Usato come tooltip e come testo in pagina. */
export const REGISTRATION_CLOSED_MESSAGE =
  'Per il momento la registrazione è chiusa: gli account li crea l’amministratore. Contattalo per averne uno.'
