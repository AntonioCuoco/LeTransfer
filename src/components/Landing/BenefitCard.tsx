import React from 'react';

/**
 * Dati per una singola benefit card
 */
export interface BenefitData {
    /** Icona emoji */
    icon: string;
    /** Titolo del beneficio */
    title: string;
    /** Descrizione del beneficio */
    description: string;
}

/**
 * Props per il componente BenefitCard
 */
export interface BenefitCardProps extends BenefitData {
    /** Classe CSS aggiuntiva */
    className?: string;
}

/**
 * BenefitCard - Card per mostrare un singolo beneficio/feature
 * 
 * Caratteristiche:
 * - Stile glassmorphism con backdrop blur
 * - Icona emoji grande
 * - Layout orizzontale con testo a destra
 * - Bordi sottili e shadow morbida
 * 
 * @example
 * <BenefitCard
 *   icon="🎁"
 *   title="Accesso Anticipato"
 *   description="Prova le nuove feature prima di tutti"
 * />
 */
export const BenefitCard: React.FC<BenefitCardProps> = ({
    icon,
    title,
    description,
    className = ''
}) => {
    return (
        <div
            className={`
                flex items-start gap-4 p-4 rounded-xl 
                bg-white/60 backdrop-blur-sm border border-white/40 shadow-sm
                ${className}
            `}
        >
            <span className="text-2xl">{icon}</span>
            <div>
                <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
                <p className="text-sm text-gray-600">{description}</p>
            </div>
        </div>
    );
};

/**
 * Props per il componente BenefitsList
 */
export interface BenefitsListProps {
    /** Array di benefici da mostrare */
    benefits: BenefitData[];
    /** Numero di colonne (default: 3) */
    columns?: 1 | 2 | 3 | 4;
    /** Classe CSS aggiuntiva */
    className?: string;
}

/**
 * BenefitsList - Grid di benefit cards
 * 
 * @example
 * <BenefitsList
 *   benefits={[
 *     { icon: '🎁', title: 'Feature 1', description: 'Desc 1' },
 *     { icon: '💰', title: 'Feature 2', description: 'Desc 2' },
 *   ]}
 *   columns={3}
 * />
 */
export const BenefitsList: React.FC<BenefitsListProps> = ({
    benefits,
    columns = 3,
    className = ''
}) => {
    const columnClasses: Record<number, string> = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 md:grid-cols-2',
        3: 'grid-cols-1 md:grid-cols-3',
        4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
    };

    return (
        <div className={`grid ${columnClasses[columns]} gap-6 ${className}`}>
            {benefits.map((benefit, index) => (
                <BenefitCard
                    key={index}
                    icon={benefit.icon}
                    title={benefit.title}
                    description={benefit.description}
                />
            ))}
        </div>
    );
};

export default BenefitCard;
