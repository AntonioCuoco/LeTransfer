/**
 * Types per il modulo Waitlist
 */

/**
 * Ruoli disponibili per la waitlist
 */
export type WaitlistRole = 'developer' | 'creative' | 'founder' | 'other';

/**
 * Dati del form waitlist
 */
export interface WaitlistFormData {
    /** Nome dell'utente */
    firstName: string;
    /** Cognome dell'utente */
    lastName: string;
    /** Email dell'utente */
    email: string;
    /** Ruolo selezionato */
    role: WaitlistRole;
    /** Nome dell'azienda (opzionale) */
    companyName?: string;
}

/**
 * Props per il componente WaitlistForm
 */
export interface WaitlistFormProps {
}
