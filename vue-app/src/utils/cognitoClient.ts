import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'

export const cognitoClient = new CognitoIdentityProviderClient({
  region: import.meta.env.VITE_AWS_REGION || 'eu-central-1',
  maxAttempts: 3,
})

export const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID

if (!clientId) {
  throw new Error("VITE_COGNITO_CLIENT_ID non è configurato nelle variabili d'ambiente")
}

const errorMessages: Record<string, string> = {
  NotAuthorizedException: 'Email o password non corretti',
  UserNotFoundException: 'Utente non trovato',
  UserNotConfirmedException: 'Account non confermato. Controlla la tua email',
  PasswordResetRequiredException: 'È necessario reimpostare la password',
  TooManyRequestsException: 'Troppi tentativi. Riprova più tardi',
  LimitExceededException: 'Limite di tentativi superato',
  InvalidPasswordException: 'La password non rispetta i criteri richiesti',
  UsernameExistsException: 'Un utente con questa email esiste già',
  InvalidParameterException: 'Parametri non validi',
  CodeMismatchException: 'Codice di verifica non corretto',
  ExpiredCodeException: 'Codice di verifica scaduto',
  AliasExistsException: 'Email già in uso',
  NetworkingError: 'Errore di connessione. Controlla la tua connessione internet',
}

export const handleCognitoError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name: string }).name
    if (errorMessages[name]) return errorMessages[name]
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return (error as { message: string }).message
  }
  return "Si è verificato un errore durante l'operazione"
}
