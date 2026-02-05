import { useEffect } from "react";
import Cookies from "js-cookie";
import { useNavigate } from "react-router";

const OAuthCallback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const run = async () => {
            try {
                const params = new URLSearchParams(window.location.search);
                const code = params.get("code");
                const error = params.get("error");
                if (error) {
                    navigate("/login");
                    return;
                }
                if (!code) {
                    navigate("/login");
                    return;
                }

                const domain = import.meta.env.VITE_COGNITO_DOMAIN as string; // e.g. https://your-domain.auth.eu-central-1.amazoncognito.com
                const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
                const redirectUri = (import.meta.env.VITE_COGNITO_REDIRECT_URI as string) || `${window.location.origin}/oauth2/callback`;
                const verifier = sessionStorage.getItem("pkce_verifier") || "";

                const body = new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: clientId,
                    code,
                    redirect_uri: redirectUri,
                    code_verifier: verifier,
                });

                const res = await fetch(`${domain}/oauth2/token`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body,
                });

                if (!res.ok) {
                    navigate("/login");
                    return;
                }
                const data = await res.json();
                // { access_token, id_token, refresh_token?, expires_in, token_type }
                if (data.access_token && data.id_token) {
                    Cookies.set("accessToken", data.access_token, { expires: 1 / 24 });
                    Cookies.set("idToken", data.id_token, { expires: 1 / 24 });
                    if (data.refresh_token) {
                        Cookies.set("refreshToken", data.refresh_token, { expires: 30 });
                    }
                }

                sessionStorage.removeItem("pkce_verifier");
                navigate("/");
            } catch (e) {
                navigate("/login");
            }
        };
        run();
    }, [navigate]);

    return null;
};

export default OAuthCallback;
