import { useState } from "react";
import GoogleButton from "react-google-button";
import { generateCodeVerifier, generateCodeChallenge } from "../../utils/pkce";

interface GoogleLoginButtonProps {
    className?: string;
    disabled?: boolean;
    onError?: (error: string) => void;
}

const GoogleLoginButton = ({ className = "", disabled = false, onError }: GoogleLoginButtonProps) => {
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleLogin = async () => {
        if (disabled || isLoading) return;

        setIsLoading(true);

        try {
            const domain = import.meta.env.VITE_COGNITO_DOMAIN as string;
            const redirect = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string) || `${window.location.origin}/oauth2/callback`;
            const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
            const scope = "openid email profile";

            if (!domain || !clientId) {
                throw new Error("Missing Cognito configuration. Please check your environment variables.");
            }

            const verifier = generateCodeVerifier();
            sessionStorage.setItem("pkce_verifier", verifier);
            const challenge = await generateCodeChallenge(verifier);

            const url = `${domain}/oauth2/authorize?identity_provider=Google&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&client_id=${clientId}&scope=${encodeURIComponent(scope)}&code_challenge_method=S256&code_challenge=${challenge}`;


            window.location.href = url;
        } catch (error: any) {
            onError?.(error.message || 'Error during Google login');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={className}>
            <GoogleButton
                onClick={handleGoogleLogin}
                disabled={disabled || isLoading}
                label="Continua con Google"
                type="light"
                style={{
                    width: '100%',
                    opacity: (disabled || isLoading) ? 0.6 : 1,
                    cursor: (disabled || isLoading) ? 'not-allowed' : 'pointer'
                }}
            />
            {isLoading && (
                <p className="text-sm text-gray-400 mt-2 text-center">
                    Redirecting to Google...
                </p>
            )}
        </div>
    );
};

export default GoogleLoginButton;
