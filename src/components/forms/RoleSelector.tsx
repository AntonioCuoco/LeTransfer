import React from 'react';

/**
 * Opzione per il selettore di ruolo
 */
export interface RoleOption {
    value: string;
    label: string;
    icon: string;
}

/**
 * Props per il componente RoleSelector
 */
export interface RoleSelectorProps {
    /** Valore attualmente selezionato */
    value: string;
    /** Callback chiamata quando cambia la selezione */
    onChange: (value: string) => void;
    /** Messaggio di errore opzionale */
    error?: string;
    /** Label del campo */
    label?: string;
    /** Array di opzioni disponibili */
    options: readonly RoleOption[];
}

/**
 * RoleSelector - Selettore di ruolo a bottoni con icone emoji
 * 
 * Caratteristiche:
 * - Grid responsive (2 colonne mobile, 4 desktop)
 * - Stato attivo con colore viola
 * - Hover effects per feedback visivo
 * - Supporto per errori di validazione
 * 
 * @example
 * const ROLES = [
 *   { value: 'developer', label: 'Developer', icon: '💻' },
 *   { value: 'designer', label: 'Designer', icon: '🎨' },
 * ];
 * 
 * <RoleSelector
 *   value={selectedRole}
 *   onChange={setSelectedRole}
 *   options={ROLES}
 *   label="Qual è il tuo ruolo?"
 * />
 */
export const RoleSelector: React.FC<RoleSelectorProps> = ({
    value,
    onChange,
    error,
    label = 'Seleziona un ruolo',
    options
}) => {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
                {label}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => onChange(option.value)}
                        className={`
                            p-4 rounded-xl border transition-all duration-300 text-center
                            ${value === option.value
                                ? 'bg-purple-100 border-purple-400 text-purple-700'
                                : 'bg-white/80 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-white'
                            }
                        `}
                    >
                        <span className="text-2xl block mb-2">{option.icon}</span>
                        <span className="text-sm font-medium">{option.label}</span>
                    </button>
                ))}
            </div>
            {error && (
                <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                    <span>⚠️</span> {error}
                </p>
            )}
        </div>
    );
};

export default RoleSelector;
