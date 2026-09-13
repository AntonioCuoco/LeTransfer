import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider'

export const cognitoClient = new CognitoIdentityProviderClient({
  region: import.meta.env.VITE_AWS_REGION || 'eu-central-1',
  maxAttempts: 3,
})

export const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID

if (!clientId) {
  throw new Error("VITE_COGNITO_CLIENT_ID non è configurato nelle variabili d'ambiente")
}

// ⚠️ Gli errori si traducono per MESSAGGIO, non per nome: vedi utils/cognitoErrors.ts per il
// perché (una sessione scaduta veniva mostrata come «email o password non corretti»).
export { cognitoErrorMessage as handleCognitoError } from './cognitoErrors'
