/**
 * Costanti per il modulo Waitlist
 */

import { RoleOption } from '../components/forms';
import { BenefitData } from '../components/landing';
import { WaitlistRole } from '../types/waitlist';

/**
 * Opzione ruolo per la waitlist
 */
export interface WaitlistRoleOption extends RoleOption {
    value: WaitlistRole;
}

/**
 * Opzioni disponibili per il selettore di ruolo nella waitlist
 */
export const WAITLIST_ROLE_OPTIONS: readonly WaitlistRoleOption[] = [
    { value: 'developer', label: 'Developer', icon: '💻' },
    { value: 'creative', label: 'Creative', icon: '🎨' },
    { value: 'founder', label: 'Founder', icon: '👥' },
    { value: 'other', label: 'Other', icon: '✨' },
] as const;

/**
 * Benefici mostrati sotto il form waitlist
 */
export const WAITLIST_BENEFITS: readonly BenefitData[] = [
    {
        icon: '🎁',
        title: 'Accesso Anticipato',
        description: 'Prova le nuove feature prima di tutti'
    },
    {
        icon: '💰',
        title: 'Prezzo Speciale',
        description: 'Sconto lifetime per i primi 500 iscritti'
    },
    {
        icon: '🗣️',
        title: 'Voce in Capitolo',
        description: 'Influenza lo sviluppo con il tuo feedback'
    },
] as const;

/**
 * Configurazione social proof per la waitlist
 */
export const WAITLIST_SOCIAL_PROOF = {
    avatars: ['🧑‍💻', '👩‍🎨', '👨‍💼', '👩‍💻'],
    count: '500+',
    countLabel: 'già in lista',
    statusText: 'Lancio previsto Q2 2026',
} as const;
