import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import Cookies from 'js-cookie';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient, clientId } from '../utils/cognitoClient';
import { isTokenExpired, DecodedToken } from '../components/checkAuth/checkAuth';
import { useSessionNotifications } from './useSessionNotifications';

interface TokenManagerState {
    isAuthenticated: boolean;
    isRefreshing: boolean;
    lastRefreshTime: number;
}

export const useTokenManager = () => {
    const [state, setState] = useState<TokenManagerState>({
        isAuthenticated: false,
        isRefreshing: false,
        lastRefreshTime: 0
    });

    // Usiamo useRef per isRefreshing per evitare problemi di stale closure
    const isRefreshingRef = useRef(false);

    const navigate = useNavigate();
    const { showInfo, showError } = useSessionNotifications();

    // Funzione per pulire i token
    const clearTokens = useCallback(() => {
        Cookies.remove('accessToken');
        Cookies.remove('idToken');
        Cookies.remove('refreshToken');
        setState(prev => ({ ...prev, isAuthenticated: false }));
        showError('Sessione scaduta. Effettua nuovamente il login.');
    }, [showError]);

    // Funzione per aggiornare i token
    const updateTokens = useCallback((accessToken: string, idToken: string, refreshToken?: string) => {
        Cookies.set('accessToken', accessToken, { expires: 1 / 24 }); // 1 hour
        Cookies.set('idToken', idToken, { expires: 1 / 24 });
        if (refreshToken) {
            Cookies.set('refreshToken', refreshToken, { expires: 30 }); // 30 days
        }
        setState(prev => ({
            ...prev,
            isAuthenticated: true,
            lastRefreshTime: Date.now()
        }));
    }, []);

    // Funzione per verificare e refresh automatico del token
    const ensureValidToken = useCallback(async (): Promise<boolean> => {
        const accessToken = Cookies.get('accessToken');
        const refreshTokenValue = Cookies.get('refreshToken');

        // Se non c'è nessun token, non possiamo fare nulla
        if (!accessToken && !refreshTokenValue) {
            clearTokens();
            return false;
        }

        // Se il token è valido, ritorna true
        if (accessToken && !isTokenExpired(accessToken)) {
            setState(prev => ({ ...prev, isAuthenticated: true }));
            return true;
        }

        // Se il token è scaduto o mancante, prova a fare refresh
        // (il cookie potrebbe essere stato rimosso perché scaduto)

        if (!refreshTokenValue) {
            clearTokens();
            return false;
        }

        // Usa ref per controllo real-time dello stato di refresh
        if (isRefreshingRef.current) {
            // Se già in corso un refresh, aspetta che finisca
            return new Promise((resolve) => {
                const checkRefresh = () => {
                    if (!isRefreshingRef.current) {
                        resolve(!!Cookies.get('accessToken'));
                    } else {
                        setTimeout(checkRefresh, 100);
                    }
                };
                checkRefresh();
            });
        }

        isRefreshingRef.current = true;
        setState(prev => ({ ...prev, isRefreshing: true }));

        try {
            const command = new InitiateAuthCommand({
                AuthFlow: "REFRESH_TOKEN_AUTH",
                ClientId: clientId,
                AuthParameters: {
                    REFRESH_TOKEN: refreshTokenValue
                }
            });

            const response = await cognitoClient.send(command);

            if (response.AuthenticationResult) {
                const { AccessToken, IdToken } = response.AuthenticationResult;

                if (AccessToken && IdToken) {
                    updateTokens(AccessToken, IdToken);
                    showInfo('Sessione rinnovata con successo');
                    return true;
                }
            }

            clearTokens();
            return false;
        } catch (error) {
            showError('Impossibile rinnovare la sessione. Effettua nuovamente il login.');
            clearTokens();
            return false;
        } finally {
            isRefreshingRef.current = false;
            setState(prev => ({ ...prev, isRefreshing: false }));
        }
    }, [clearTokens, updateTokens, showInfo, showError]);

    // Funzione per refresh del token (wrapper per ensureValidToken)
    const refreshToken = useCallback(async (): Promise<boolean> => {
        return await ensureValidToken();
    }, [ensureValidToken]);

    // Funzione per controllare se il token sta per scadere (entro 5 minuti)
    const isTokenExpiringSoon = useCallback((): boolean => {
        const accessToken = Cookies.get('accessToken');
        if (!accessToken) return true;

        try {
            const base64Url = accessToken.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            const decodedToken: DecodedToken = JSON.parse(jsonPayload);
            const currentTime = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = decodedToken.exp - currentTime;

            // Considera "soon" se scade entro 5 minuti
            return timeUntilExpiry < 300;
        } catch (error) {
            return true;
        }
    }, []);

    // Inizializzazione al mount
    useEffect(() => {
        const initializeAuth = async () => {
            const isValid = await ensureValidToken();
            if (!isValid) {
                navigate('/login');
            }
        };

        initializeAuth();
    }, [ensureValidToken, navigate]);

    // Refresh automatico periodico e su focus/visibility
    useEffect(() => {
        const checkToken = async () => {
            if (isTokenExpiringSoon() && !isRefreshingRef.current) {
                // Se non siamo in un ciclo di refresh, proviamo a rinnovare
                const success = await ensureValidToken();
                if (!success) {
                    navigate('/login');
                }
            }
        };

        // Check periodico
        const interval = setInterval(checkToken, 60000); // 1 minuto

        // Check quando la pagina torna visibile o riceve focus
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkToken();
            }
        };

        const handleFocus = () => {
            checkToken();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [isTokenExpiringSoon, ensureValidToken, navigate]);

    return {
        isAuthenticated: state.isAuthenticated,
        isRefreshing: state.isRefreshing,
        ensureValidToken,
        refreshToken,
        clearTokens
    };
};
