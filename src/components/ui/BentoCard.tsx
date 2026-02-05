import React from 'react';

export interface BentoCardProps {
    children: React.ReactNode;
    /** Card size variant */
    size?: '1x1' | '2x1' | '1x2' | '2x2' | 'full';
    /** Optional header title */
    title?: string;
    /** Optional header subtitle */
    subtitle?: string;
    /** Optional header action element */
    action?: React.ReactNode;
    /** Enable glass effect */
    glass?: boolean;
    /** Enable hover glow effect */
    glow?: boolean;
    /** Additional className */
    className?: string;
    /** Optional onClick handler */
    onClick?: () => void;
    /** Optional icon for header */
    icon?: React.ReactNode;
    /** Padding variant */
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

const sizeClasses = {
    '1x1': 'col-span-1 row-span-1',
    '2x1': 'col-span-2 row-span-1',
    '1x2': 'col-span-1 row-span-2',
    '2x2': 'col-span-2 row-span-2',
    'full': 'col-span-full',
};

const paddingClasses = {
    'none': 'p-0',
    'sm': 'p-3',
    'md': 'p-5',
    'lg': 'p-6',
};

export const BentoCard: React.FC<BentoCardProps> = ({
    children,
    size = '1x1',
    title,
    subtitle,
    action,
    glass = false,
    glow = true,
    className = '',
    onClick,
    icon,
    padding = 'md',
}) => {
    return (
        <div
            className={`
                bg-[#3c364c] border border-[#4a4554]/50 rounded-2xl transition-all duration-200 flex flex-col overflow-hidden
                ${sizeClasses[size]}
                ${paddingClasses[padding]}
                ${glass ? 'bg-[#2c2638]/60 backdrop-blur-xl' : ''}
                ${glow ? 'hover:border-[#724CF9] hover:shadow-[0_0_10px_rgba(114,76,249,0.4)] hover:-translate-y-0.5' : ''}
                ${onClick ? 'cursor-pointer active:translate-y-0' : ''}
                ${className}
            `}
            onClick={onClick}
        >
            {(title || action) && (
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        {icon && (
                            <span className="flex items-center justify-center w-9 h-9 bg-[#724CF9]/15 rounded-[10px] text-[#724CF9] text-lg">
                                {icon}
                            </span>
                        )}
                        <div className="flex flex-col gap-0.5">
                            {title && <h3 className="m-0 text-base font-semibold text-white leading-tight">{title}</h3>}
                            {subtitle && <p className="m-0 text-sm text-[#9ca3af] leading-tight">{subtitle}</p>}
                        </div>
                    </div>
                    {action && <div className="flex-shrink-0">{action}</div>}
                </div>
            )}
            <div className="flex-1 flex flex-col">
                {children}
            </div>
        </div>
    );
};
