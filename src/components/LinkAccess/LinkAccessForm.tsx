/**
 * LinkAccessForm - Form per l'accesso a un link condivisibile
 * 
 * Mostra un form per inserire:
 * - Nome del visitatore (obbligatorio)
 * - Password (se il link è protetto)
 */

import { useState } from 'react';
import { Button, Spin } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';

interface LinkAccessFormProps {
    /** Se il link richiede password */
    isPasswordProtected: boolean;
    /** Stato di caricamento */
    isLoading: boolean;
    /** Messaggio di errore da mostrare */
    error?: string | null;
    /** Callback quando il form viene inviato */
    onSubmit: (visitorName: string, password?: string) => void;
}

export const LinkAccessForm = ({
    isPasswordProtected,
    isLoading,
    error,
    onSubmit
}: LinkAccessFormProps) => {
    const [visitorName, setVisitorName] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!visitorName.trim()) return;
        onSubmit(visitorName.trim(), isPasswordProtected ? password : undefined);
    };

    const isFormValid = visitorName.trim().length >= 2;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Nome Visitatore */}
            <div>
                <label className="text-[#DBD4D3] font-medium text-sm mb-2 block">
                    Il tuo nome
                </label>
                <div className="relative">
                    <UserOutlined className="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
                    <input
                        type="text"
                        value={visitorName}
                        onChange={(e) => setVisitorName(e.target.value)}
                        placeholder="Inserisci il tuo nome"
                        disabled={isLoading}
                        minLength={2}
                        required
                        className="w-full p-3 pl-10 rounded-lg focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#1a1625] border border-[#4a4554] placeholder:text-[#676178] text-white disabled:opacity-50"
                    />
                </div>
                <p className="text-[#676178] text-xs mt-1">
                    Questo nome sarà visibile al proprietario del file
                </p>
            </div>

            {/* Password (se richiesta) */}
            {isPasswordProtected && (
                <div>
                    <label className="text-[#DBD4D3] font-medium text-sm mb-2 block">
                        Password
                    </label>
                    <div className="relative">
                        <LockOutlined className="absolute left-3 top-1/2 -translate-y-1/2 !text-[#724CF9] z-10" />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Inserisci la password"
                            disabled={isLoading}
                            required
                            className="w-full p-3 pl-10 rounded-lg focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#1a1625] border border-[#4a4554] placeholder:text-[#676178] text-white disabled:opacity-50"
                        />
                    </div>
                </div>
            )}

            {/* Messaggio di errore */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-red-400 text-sm m-0">{error}</p>
                </div>
            )}

            {/* Submit Button */}
            <Button
                type="primary"
                htmlType="submit"
                disabled={!isFormValid || isLoading}
                icon={isLoading ? <Spin size="small" /> : <LoginOutlined />}
                size="large"
                className="w-full !bg-[#724CF9] hover:!bg-[#9d7bfa] !text-white !border-[#724CF9] hover:!border-[#724CF9] disabled:!bg-[#4a4554] disabled:!border-[#4a4554]"
                style={{ borderRadius: '10px', height: '48px' }}
            >
                {isLoading ? 'Accesso in corso...' : 'Accedi al file'}
            </Button>
        </form>
    );
};

export default LinkAccessForm;
