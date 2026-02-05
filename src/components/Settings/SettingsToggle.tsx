import React from 'react';
import { Switch, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

interface SettingsToggleProps {
    /** Label for the toggle */
    label: string;
    /** Optional description */
    description?: string;
    /** Current value */
    checked: boolean;
    /** Change handler */
    onChange: (checked: boolean) => void;
    /** Disabled state */
    disabled?: boolean;
    /** Optional tooltip */
    tooltip?: string;
}

/**
 * Componente riutilizzabile per toggle nelle impostazioni.
 * Include label, descrizione opzionale e tooltip.
 */
export const SettingsToggle: React.FC<SettingsToggleProps> = ({
    label,
    description,
    checked,
    onChange,
    disabled = false,
    tooltip
}) => {
    return (
        <div className="flex items-center justify-between py-3 border-b border-[#4a4554]/30 last:border-b-0">
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{label}</span>
                    {tooltip && (
                        <Tooltip title={tooltip}>
                            <InfoCircleOutlined className="!text-[#9ca3af] text-xs cursor-help" />
                        </Tooltip>
                    )}
                </div>
                {description && (
                    <p className="text-[#9ca3af] text-xs mt-0.5">{description}</p>
                )}
            </div>
            <Switch
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                className={checked ? '!bg-[#724CF9]' : '!bg-[#4a4554]'}
            />
        </div>
    );
};
