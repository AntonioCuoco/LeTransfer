import React from 'react';

/**
 * Dati per un avatar nel social proof
 */
export interface SocialProofAvatar {
    /** Emoji o testo breve per l'avatar */
    emoji: string;
    /** Alt text opzionale per accessibilità */
    alt?: string;
}

/**
 * Props per il componente SocialProof
 */
export interface SocialProofProps {
    /** Array di avatar/emoji da mostrare */
    avatars?: SocialProofAvatar[] | string[];
    /** Numero di utenti/iscritti da mostrare */
    count: number | string;
    /** Testo dopo il contatore */
    countLabel?: string;
    /** Testo per lo status (es. "Lancio previsto Q2 2026") */
    statusText?: string;
    /** Se mostrare l'indicatore di status verde */
    showStatusIndicator?: boolean;
    /** Classe CSS aggiuntiva */
    className?: string;
}

/**
 * SocialProof - Componente per mostrare social proof con avatar e contatori
 * 
 * Caratteristiche:
 * - Avatar sovrapposti con emoji
 * - Contatore evidenziato
 * - Indicatore di status con pallino verde
 * - Layout flessibile e responsive
 * 
 * @example
 * <SocialProof
 *   avatars={['🧑‍💻', '👩‍🎨', '👨‍💼']}
 *   count="500+"
 *   countLabel="già in lista"
 *   statusText="Lancio previsto Q2 2026"
 *   showStatusIndicator
 * />
 */
export const SocialProof: React.FC<SocialProofProps> = ({
    avatars = ['🧑‍💻', '👩‍🎨', '👨‍💼', '👩‍💻'],
    count,
    countLabel = 'utenti',
    statusText,
    showStatusIndicator = true,
    className = ''
}) => {
    // Normalizza avatars a array di oggetti
    const normalizedAvatars: SocialProofAvatar[] = avatars.map((avatar) =>
        typeof avatar === 'string' ? { emoji: avatar } : avatar
    );

    return (
        <div className={`flex flex-wrap justify-center gap-8 ${className}`}>
            {/* Avatar stack con contatore */}
            <div className="flex items-center gap-3 text-gray-600">
                <div className="flex -space-x-2">
                    {normalizedAvatars.map((avatar, i) => (
                        <div
                            key={i}
                            className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-sm border-2 border-[#f4f3ef] shadow-sm"
                            title={avatar.alt}
                        >
                            {avatar.emoji}
                        </div>
                    ))}
                </div>
                <span className="text-sm">
                    <strong className="text-gray-900">{count}</strong> {countLabel}
                </span>
            </div>

            {/* Status indicator */}
            {statusText && (
                <div className="flex items-center gap-2 text-gray-600 text-sm">
                    {showStatusIndicator && <span className="text-green-500">●</span>}
                    {statusText}
                </div>
            )}
        </div>
    );
};

export default SocialProof;
