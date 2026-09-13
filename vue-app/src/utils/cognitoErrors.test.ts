import { describe, it, expect } from 'vitest'
import { cognitoErrorMessage } from './cognitoErrors'

/**
 * La traduzione degli errori di Cognito.
 *
 * Cosa difendono questi test: che il messaggio mostrato dica **la stessa cosa** di Cognito.
 * Il caso che li ha fatti nascere: una sessione di accesso scaduta durante la 2FA arriva come
 * `NotAuthorizedException`, e l'app rispondeva «Email o password non corretti» — l'utente
 * ribatteva la password giusta senza capire perché non entrasse.
 */

const cognito = (name: string, message: string) => Object.assign(new Error(message), { name })

describe('cognitoErrorMessage', () => {
  it('una sessione scaduta non diventa «password sbagliata»', () => {
    const message = cognitoErrorMessage(cognito('NotAuthorizedException', 'Invalid session for the user, session is expired.'))

    expect(message).toMatch(/sessione di accesso è scaduta/)
    expect(message).not.toMatch(/password non corrett/i)
  })

  it('la password sbagliata resta password sbagliata', () => {
    expect(cognitoErrorMessage(cognito('NotAuthorizedException', 'Incorrect username or password.')))
      .toBe('Email o password non corretti.')
  })

  it('stesso nome, altro significato: account disabilitato', () => {
    expect(cognitoErrorMessage(cognito('NotAuthorizedException', 'User is disabled.')))
      .toBe('Questo account è disabilitato.')
  })

  it('dice quale requisito della password manca', () => {
    expect(cognitoErrorMessage(cognito('InvalidPasswordException', 'Password did not conform with policy: Password not long enough')))
      .toBe('La password non rispetta i requisiti: è troppo corta.')
  })

  it('un messaggio che non conosce lo mostra così com\'è, invece di inventarne uno', () => {
    expect(cognitoErrorMessage(cognito('NotAuthorizedException', 'Something Cognito never said before.')))
      .toBe('Something Cognito never said before.')
  })

  it('se Cognito non ha risposto parla di connessione, non di credenziali', () => {
    expect(cognitoErrorMessage(new TypeError('Failed to fetch'))).toMatch(/connessione/)
  })
})
