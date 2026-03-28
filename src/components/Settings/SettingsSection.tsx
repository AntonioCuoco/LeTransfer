import React from 'react';

interface SettingsSectionProps {
    /** Section title */
    title?: string;
    /** Optional section description */
    description?: string;
    /** Section icon */
    icon?: React.ReactNode;
    /** Children components (toggles, inputs, etc.) */
    children: React.ReactNode;
}

/**
 * Componente contenitore per sezioni di impostazioni.
 * Fornisce un layout coerente con icona, titolo e contenuto.
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
    title,
    description,
    icon,
    children
}) => {
    return (
        <div className="bg-[#3c364c] rounded-xl border border-[#4a4554]/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 bg-[#2c2638]/50 border-b border-[#4a4554]/50">
                <span className="flex items-center justify-center w-9 h-9 bg-[#724CF9]/15 rounded-lg text-[#724CF9] text-lg">
                    {icon}
                </span>
                <div>
                    <h3 className="text-white font-semibold text-base m-0">{title}</h3>
                    {description && (
                        <p className="text-[#9ca3af] text-xs m-0 mt-0.5">{description}</p>
                    )}
                </div>
            </div>
            {/* Content */}
            <div className="px-5 py-2">
                {children}
            </div>
        </div>
    );
};
