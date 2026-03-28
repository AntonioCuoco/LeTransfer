import React from 'react';

/**
 * Props per il componente SectionHeader
 */
export interface SectionHeaderProps {
    /** Badge/tag opzionale sopra il titolo */
    badge?: string;
    /** Titolo principale */
    title: string;
    /** Parte del titolo con gradiente (opzionale) */
    titleGradient?: string;
    /** Sottotitolo/descrizione */
    subtitle?: string;
    /** Allineamento (default: center) */
    align?: 'left' | 'center' | 'right';
    /** Classe CSS aggiuntiva */
    className?: string;
}

/**
 * SectionHeader - Header per sezioni della landing page
 * 
 * Caratteristiche:
 * - Badge con sfondo glassmorphism
 * - Titolo con supporto per gradiente su parte del testo
 * - Sottotitolo opzionale
 * - Allineamento configurabile
 * 
 * @example
 * <SectionHeader
 *   badge="Early Access"
 *   title="Unisciti alla"
 *   titleGradient="Waitlist"
 *   subtitle="Sii tra i primi a provare leTransfer."
 * />
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
    badge,
    title,
    titleGradient,
    subtitle,
    align = 'center',
    className = ''
}) => {
    const alignClasses = {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right'
    };

    const subtitleAlignClasses = {
        left: 'mx-0',
        center: 'mx-auto',
        right: 'ml-auto'
    };

    return (
        <div className={`${alignClasses[align]} ${className}`}>
            {badge && (
                <span className="inline-block px-4 py-1.5 rounded-full border border-black/10 bg-white/40 backdrop-blur-md text-sm font-medium uppercase tracking-wide mb-6">
                    {badge}
                </span>
            )}
            <h2 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tighter text-gray-900">
                {title}{' '}
                {titleGradient && (
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">
                        {titleGradient}
                    </span>
                )}
            </h2>
            {subtitle && (
                <p className={`text-xl text-gray-600 max-w-2xl ${subtitleAlignClasses[align]}`}>
                    {subtitle}
                </p>
            )}
        </div>
    );
};

export default SectionHeader;
