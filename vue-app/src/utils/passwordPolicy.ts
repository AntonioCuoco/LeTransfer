/**
 * La policy password del User Pool Cognito (`eu-central-1_RKWgXhZIf`), ricopiata qui per
 * mostrarla mentre si scrive.
 *
 * ⚠️ È un DOPPIONE: quella che conta vive su Cognito. Se la cambi nella console AWS, va
 * cambiata anche qui. Il form diceva «8+ caratteri» mentre il pool ne vuole 12: le spunte
 * erano tutte verdi e poi il server rifiutava con un generico «criteri non rispettati».
 * Verificata il 2026-09-12 con `aws cognito-idp describe-user-pool`.
 */
export const PASSWORD_MIN_LENGTH = 12

/**
 * I soli caratteri che Cognito conta come simbolo. Prima valeva qualunque non-alfanumerico,
 * quindi anche `è` o `€` spuntavano «un simbolo» — e Cognito li rifiutava.
 * Lo spazio, che Cognito accetta solo in mezzo, resta fuori di proposito: meglio un client
 * più severo del server che il contrario.
 */
const COGNITO_SYMBOL = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`=+-]/

export interface PasswordRule {
  label: string
  ok: boolean
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: `${PASSWORD_MIN_LENGTH}+ caratteri`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'una maiuscola', ok: /[A-Z]/.test(password) },
    { label: 'una minuscola', ok: /[a-z]/.test(password) },
    { label: 'un numero', ok: /\d/.test(password) },
    { label: 'un simbolo', ok: COGNITO_SYMBOL.test(password) },
  ]
}

export function isPasswordValid(password: string): boolean {
  return passwordRules(password).every((rule) => rule.ok)
}
