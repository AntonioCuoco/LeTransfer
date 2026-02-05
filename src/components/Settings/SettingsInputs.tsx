import React from 'react';
import { InputNumber, Slider, Select } from 'antd';

interface SettingsNumberInputProps {
    /** Label for the input */
    label: string;
    /** Optional description */
    description?: string;
    /** Current value */
    value: number;
    /** Change handler */
    onChange: (value: number) => void;
    /** Minimum value */
    min?: number;
    /** Maximum value */
    max?: number;
    /** Step */
    step?: number;
    /** Suffix text (e.g., "giorni", "MB") */
    suffix?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Show slider */
    showSlider?: boolean;
}

/**
 * Componente per input numerici nelle impostazioni.
 * Supporta slider opzionale e suffisso.
 */
export const SettingsNumberInput: React.FC<SettingsNumberInputProps> = ({
    label,
    description,
    value,
    onChange,
    min = 1,
    max = 100,
    step = 1,
    suffix,
    disabled = false,
    showSlider = false
}) => {
    return (
        <div className="py-3 border-b border-[#4a4554]/30 last:border-b-0">
            <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                    <span className="text-white font-medium text-sm">{label}</span>
                    {description && (
                        <p className="text-[#9ca3af] text-xs mt-0.5">{description}</p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <InputNumber
                        value={value}
                        onChange={(val) => onChange(val ?? min)}
                        min={min}
                        max={max}
                        step={step}
                        disabled={disabled}
                        className="!w-20"
                        style={{
                            backgroundColor: '#2c2638',
                            borderColor: '#4a4554',
                            color: 'white'
                        }}
                    />
                    {suffix && (
                        <span className="text-[#9ca3af] text-sm">{suffix}</span>
                    )}
                </div>
            </div>
            {showSlider && (
                <Slider
                    value={value}
                    onChange={onChange}
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    className="!m-0"
                    styles={{
                        track: { backgroundColor: '#724CF9' },
                        rail: { backgroundColor: '#4a4554' }
                    }}
                />
            )}
        </div>
    );
};

interface SettingsSelectProps<T extends string> {
    /** Label for the select */
    label: string;
    /** Optional description */
    description?: string;
    /** Current value */
    value: T;
    /** Change handler */
    onChange: (value: T) => void;
    /** Options */
    options: { value: T; label: string }[];
    /** Disabled state */
    disabled?: boolean;
}

/**
 * Componente per select nelle impostazioni.
 */
export const SettingsSelect = <T extends string>({
    label,
    description,
    value,
    onChange,
    options,
    disabled = false
}: SettingsSelectProps<T>) => {
    return (
        <div className="flex items-center justify-between py-3 border-b border-[#4a4554]/30 last:border-b-0">
            <div className="flex-1">
                <span className="text-white font-medium text-sm">{label}</span>
                {description && (
                    <p className="text-[#9ca3af] text-xs mt-0.5">{description}</p>
                )}
            </div>
            <Select
                value={value}
                onChange={onChange}
                options={options}
                disabled={disabled}
                className="!w-36 !bg-[#2c2638]"
            />
        </div>
    );
};
