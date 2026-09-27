/**
 * Il messaggio degli errori di Cognito, detto in italiano **senza cambiarne il senso**.
 *
 * ── Il difetto che chiude ────────────────────────────────────────────────────────
 * Prima si traduceva per NOME dell'errore: ogni `NotAuthorizedException` diventava «Email o
 * password non corretti». Ma Cognito usa quel nome per cose molto diverse — password
 * sbagliata, sessione di accesso scaduta durante la 2FA, account disabilitato, troppi
 * tentativi — e cosa è successo davvero sta nel **testo** del messaggio. Un utente con la
 * sessione scaduta si sentiva dire di aver sbagliato la password, e la ribatteva all'infinito.
 *
 * ── Come funziona ora ────────────────────────────────────────────────────────────
 * Si traduce il MESSAGGIO, frase per frase, con lo stesso significato. Un messaggio che non è
 * in tabella si mostra **così com'è**: meglio l'inglese di Cognito che una traduzione che dice
 * un'altra cosa. L'unico testo nostro è quello per gli errori di rete, dove Cognito non ha
 * risposto affatto.
 */

const TRANSLATIONS: Array<[RegExp, string]> = [
  // NotAuthorizedException — lo stesso nome, significati opposti.
  [/^Incorrect username or password\.?$/i, 'Email o password non corretti.'],
  [/session is expired/i, 'La sessione di accesso è scaduta: ricomincia inserendo email e password.'],
  [/session can only be used once/i, 'Questa sessione di accesso è già stata usata: ricomincia inserendo email e password.'],
  [/^Invalid session for the user\.?$/i, 'La sessione di accesso non è più valida: ricomincia inserendo email e password.'],
  [/^User is disabled\.?$/i, 'Questo account è disabilitato.'],
  [/^Password attempts exceeded\.?$/i, 'Troppi tentativi con la password sbagliata: riprova tra qualche minuto.'],
  [/^User cannot be confirmed\. Current status is CONFIRMED\.?$/i, 'Questo account è già confermato: puoi accedere.'],
  [/^User password cannot be reset in the current state\.?$/i, 'La password di questo account non si può reimpostare nel suo stato attuale (per esempio se l’account non è ancora confermato).'],
  [/^Refresh Token has expired\.?$/i, 'La sessione è scaduta: accedi di nuovo.'],
  [/^Invalid Refresh Token\.?$/i, 'La sessione non è più valida: accedi di nuovo.'],
  [/^Refresh Token has been revoked\.?$/i, 'La sessione è stata chiusa: accedi di nuovo.'],
  [/^Access Token has expired\.?$/i, 'La sessione è scaduta: accedi di nuovo.'],
  [/^Access Token has been revoked\.?$/i, 'La sessione è stata chiusa: accedi di nuovo.'],

  // Account
  [/^User is not confirmed\.?$/i, 'L’account non è ancora confermato.'],
  [/^User does not exist\.?$/i, 'Non esiste un account con questa email.'],
  [/^Username\/client id combination not found\.?$/i, 'Non esiste un account con questa email.'],
  [/^An account with the given email already exists\.?$/i, 'Esiste già un account con questa email.'],
  [/^Password reset required for the user\.?$/i, 'Per questo account va reimpostata la password.'],

  // Codici
  [/^Invalid verification code provided, please try again\.?$/i, 'Il codice di verifica non è corretto: controllalo e riprova.'],
  [/^Invalid code provided, please request a code again\.?$/i, 'Il codice non è più valido: chiedine uno nuovo.'],
  [/^Invalid code received for user\.?$/i, 'Il codice dell’app di autenticazione non è corretto.'],
  [/^Code mismatch/i, 'Il codice dell’app di autenticazione non è corretto.'],

  // Limiti
  [/^Attempt limit exceeded, please try after some time\.?$/i, 'Troppi tentativi: riprova tra qualche minuto.'],
  [/^Rate exceeded\.?$/i, 'Troppe richieste in poco tempo: riprova tra qualche istante.'],
]

/** Il dettaglio dopo «Password did not conform with policy: », voce per voce. */
const PASSWORD_POLICY: Record<string, string> = {
  'password not long enough': 'è troppo corta',
  'password must have uppercase characters': 'serve almeno una lettera maiuscola',
  'password must have lowercase characters': 'serve almeno una lettera minuscola',
  'password must have numeric characters': 'serve almeno un numero',
  'password must have symbol characters': 'serve almeno un simbolo',
}

const NETWORK_ERROR = 'Non riusciamo a raggiungere il servizio di accesso: controlla la connessione e riprova.'

export function cognitoErrorMessage(error: unknown): string {
  const { name, message } = (error ?? {}) as { name?: string; message?: string }

  if (name === 'NetworkingError' || name === 'TimeoutError' || /failed to fetch|network/i.test(message ?? '')) {
    // La frase resta per l'utente; il dettaglio dice se era timeout, DNS, CORS o rete assente.
    const detail = [name, message].filter(Boolean).join(': ')
    return detail ? `${NETWORK_ERROR} [${detail}]` : NETWORK_ERROR
  }

  const text = (message ?? '').trim()
  if (!text) {
    const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode
    const detail = [name, status ? `HTTP ${status}` : null].filter(Boolean).join(' · ')
    return detail ? `Errore del servizio di accesso [${detail}].` : `Errore del servizio di accesso [${String(error)}].`
  }

  const policy = /^Password did not conform with policy:\s*(.+?)\.?$/i.exec(text)
  if (policy) {
    const detail = policy[1].trim()
    return `La password non rispetta i requisiti: ${PASSWORD_POLICY[detail.toLowerCase()] ?? detail}.`
  }

  for (const [pattern, translation] of TRANSLATIONS) {
    if (pattern.test(text)) return translation
  }
  return text
}
