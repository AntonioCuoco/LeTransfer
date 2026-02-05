import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

// Configurazione centralizzata del client Cognito
const cognitoConfig = {
    region: import.meta.env.VITE_AWS_REGION || "eu-central-1",
    // Aggiungi altre configurazioni se necessario
    maxAttempts: 3, // Retry automatici
    requestTimeout: 30000, // 30 secondi timeout
};

// Client singleton per riutilizzo
export const cognitoClient = new CognitoIdentityProviderClient(cognitoConfig);

// Client ID centralizzato
export const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

// Validazione della configurazione
if (!clientId) {
    throw new Error("VITE_COGNITO_CLIENT_ID non è configurato nelle variabili d'ambiente");
}

// Map of most common Cognito errors with Italian messages
const errorMessages: Record<string, string> = {
    "NotAuthorizedException": "Email o password non corretti",
    "UserNotFoundException": "Utente non trovato",
    "UserNotConfirmedException": "Account non confermato. Controlla la tua email",
    "PasswordResetRequiredException": "È necessario reimpostare la password",
    "TooManyRequestsException": "Troppi tentativi. Riprova più tardi",
    "LimitExceededException": "Limite di tentativi superato",
    "InvalidPasswordException": "La password non rispetta i criteri richiesti",
    "UsernameExistsException": "Un utente con questa email esiste già",
    "InvalidParameterException": "Parametri non validi",
    "CodeMismatchException": "Codice di verifica non corretto",
    "ExpiredCodeException": "Codice di verifica scaduto",
    "AliasExistsException": "Email già in uso",
    "NetworkingError": "Errore di connessione. Controlla la tua connessione internet"
};

// Funzione per gestire gli errori Cognito
export const handleCognitoError = (error: unknown): string => {

    // Se l'errore è un oggetto con una proprietà name
    if (typeof error === 'object' && error !== null && 'name' in error) {
        const errName = (error as { name: string }).name;
        if (errorMessages[errName]) {
            return errorMessages[errName];
        }
    }

    // Se l'errore è un'istanza di Error o ha una proprietà message
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
        return (error as { message: string }).message;
    }

    // Fallback generico
    return "Si è verificato un errore durante l'operazione";
}; 