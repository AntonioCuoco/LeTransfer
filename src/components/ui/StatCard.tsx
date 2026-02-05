import React from 'react';
import { ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from '@ant-design/icons';

export interface StatCardProps {
    /** Main value to display */
    value: string | number;
    /** Label describing the stat */
    label: string;
    /** Trend direction */
    trend?: 'up' | 'down' | 'neutral';
    /** Percentage change */
    change?: string;
    /** Optional icon */
    icon?: React.ReactNode;
    /** Optional subtext */
    subtext?: string;
    /** Color variant */
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
    /** Additional className */
    className?: string;
}

const variantClasses = {
    default: 'bg-[#3c364c] border-[#4a4554]/50',
    primary: 'bg-gradient-to-br from-[#724CF9] to-purple-600 border-transparent',
    success: 'bg-[#3c364c] border-l-[3px] border-l-green-500 border-[#4a4554]/50',
    warning: 'bg-[#3c364c] border-l-[3px] border-l-amber-500 border-[#4a4554]/50',
    error: 'bg-[#3c364c] border-l-[3px] border-l-red-500 border-[#4a4554]/50',
};

const trendClasses = {
    up: 'bg-green-500/15 text-green-500',
    down: 'bg-red-500/15 text-red-500',
    neutral: 'bg-[#4a4554] text-[#9ca3af]',
};

export const StatCard: React.FC<StatCardProps> = ({
    value,
    label,
    trend,
    change,
    icon,
    subtext,
    variant = 'default',
    className = '',
}) => {
    const getTrendIcon = () => {
        switch (trend) {
            case 'up':
                return <ArrowUpOutlined />;
            case 'down':
                return <ArrowDownOutlined />;
            default:
                return <MinusOutlined />;
        }
    };

    const isPrimary = variant === 'primary';

    return (
        <div className={`
            border rounded-2xl p-5 flex items-start gap-4 transition-all duration-200
            hover:border-[#724CF9] hover:-translate-y-0.5 hover:shadow-[0_0_10px_rgba(114,76,249,0.4)]
            ${variantClasses[variant]}
            ${isPrimary ? 'hover:border-transparent hover:shadow-[0_0_20px_rgba(114,76,249,0.4)]' : ''}
            ${className}
        `}>
            {icon && (
                <div className={`
                    flex items-center justify-center w-12 h-12 rounded-[10px] text-2xl flex-shrink-0
                    ${isPrimary ? 'bg-white/20 text-white' : 'bg-[#724CF9]/15 text-[#724CF9]'}
                `}>
                    {icon}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className={`m-0 mb-1 text-sm font-medium ${isPrimary ? 'text-white/80' : 'text-[#9ca3af]'}`}>
                    {label}
                </p>
                <div className="flex items-baseline gap-3 flex-wrap">
                    <span className={`text-3xl font-bold leading-tight ${isPrimary ? 'text-white' : 'text-white'}`}>
                        {value}
                    </span>
                    {(trend || change) && (
                        <div className={`
                            inline-flex items-center gap-1 py-1 px-2 rounded-full text-xs font-semibold
                            ${trendClasses[trend || 'neutral']}
                        `}>
                            {trend && <span className="flex items-center text-[10px]">{getTrendIcon()}</span>}
                            {change && <span className="whitespace-nowrap">{change}</span>}
                        </div>
                    )}
                </div>
                {subtext && (
                    <p className={`mt-2 mb-0 text-xs ${isPrimary ? 'text-white/70' : 'text-[#9ca3af]'}`}>
                        {subtext}
                    </p>
                )}
            </div>
        </div>
    );
};
