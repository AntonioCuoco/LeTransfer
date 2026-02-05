import { useState } from "react";
import { EyeInvisibleOutlined, EyeOutlined } from "@ant-design/icons";
import { UseFormRegisterReturn } from "react-hook-form";

interface PasswordInputProps {
    register: UseFormRegisterReturn;
    error?: string;
    placeholder?: string;
    showTooltip?: boolean;
    className?: string;
}

const PasswordInput = ({ register, error, placeholder = "Password", showTooltip = false, className = "" }: PasswordInputProps) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    return (
        <div className={`w-full relative ${className}`}>
            {/* Tooltip per criteri password */}
            {showTooltip && isFocused && (
                <div className="absolute bottom-full left-0 mb-2 w-80 bg-gray-800 text-white p-3 rounded-md shadow-lg z-10 border-1 border-[#724CF9]">
                    <div className="text-sm font-medium mb-2">Criteri password:</div>
                    <ul className="text-xs space-y-1">
                        <li>• Almeno 8 caratteri</li>
                        <li>• Almeno 1 numero</li>
                        <li>• Almeno 1 lettera minuscola</li>
                        <li>• Almeno 1 lettera maiuscola</li>
                        <li>• Almeno 1 carattere speciale: ^$*.[]{ }()?-"!@#%&/\,&gt;&lt;':;|_~`+=</li>
                    </ul>
                </div>
            )}
            <input
                {...register}
                type={showPassword ? "text" : "password"}
                placeholder={placeholder}
                className="w-full p-2 pr-10 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
            />
            <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
            >
                {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            </button>
            {error && <p className="text-[#F4743B] mt-1 text-sm">{error}</p>}
        </div>
    );
};

export default PasswordInput;
