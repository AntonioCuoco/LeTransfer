import React from 'react';

/**
 * Props per il componente InputField
 * Estende le props native dell'input HTML
 */
export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
    /** Label del campo */
    label: string;
    /** Messaggio di errore da mostrare sotto il campo */
    error?: string;
    /** Icona opzionale da mostrare a sinistra del campo */
    icon?: React.ReactNode;
}

/**
 * InputField - Campo input stilizzato con supporto per icone e errori
 * 
 * Caratteristiche:
 * - Stile glassmorphism con bordi arrotondati
 * - Supporto per icona a sinistra
 * - Gestione stato di errore con messaggio
 * - Transizioni smooth su focus
 * - Compatibile con react-hook-form tramite forwardRef
 * 
 * @example
 * <InputField
 *   label="Email"
 *   type="email"
 *   placeholder="email@example.com"
 *   icon={<MailIcon />}
 *   error={errors.email?.message}
 *   {...register('email')}
 * />
 */
export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
    ({ label, error, icon, className = '', ...props }, ref) => {
        return (
            <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    {label}
                </label>
                <div className="relative">
                    {icon && (
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        className={`
                            w-full px-4 py-4 bg-white/80 border border-gray-200 rounded-xl
                            text-gray-900 placeholder-gray-400 outline-none
                            focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20
                            transition-all duration-300
                            ${icon ? 'pl-12' : ''}
                            ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-400/20' : ''}
                            ${className}
                        `}
                        {...props}
                    />
                </div>
                {error && (
                    <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                        <span>⚠️</span> {error}
                    </p>
                )}
            </div>
        );
    }
);

InputField.displayName = 'InputField';

export default InputField;
