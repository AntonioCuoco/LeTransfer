import axios, { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import Cookies from 'js-cookie';
// import { isTokenExpired } from '../components/checkAuth/checkAuth';
import { InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { cognitoClient, clientId } from './cognitoClient';

// Flag per evitare refresh multipli simultanei
let isRefreshing = false;
let failedQueue: Array<{
    resolve: (value: string | null) => void;
    reject: (error: unknown) => void;
}> = [];

// Funzione per processare la coda di richieste fallite
const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error);
        } else {
            resolve(token);
        }
    });

    failedQueue = [];
};

// Funzione per refresh del token
const refreshToken = async (): Promise<string | null> => {
    const refreshTokenValue = Cookies.get('refreshToken');

    if (!refreshTokenValue) {
        throw new Error('No refresh token available');
    }

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
                // Aggiorna i cookie
                Cookies.set('accessToken', AccessToken, { expires: 1 / 24 });
                Cookies.set('idToken', IdToken, { expires: 1 / 24 });

                return AccessToken;
            }
        }

        throw new Error('Invalid refresh response');
    } catch (error: unknown) {
        // Se il refresh fallisce, pulisci tutto
        Cookies.remove('accessToken');
        Cookies.remove('idToken');
        Cookies.remove('refreshToken');
        throw error;
    }
};

// Interceptor per le richieste
export const setupRequestInterceptor = () => {
    axios.interceptors.request.use(
        (config) => {
            const accessToken = Cookies.get('accessToken');

            if (accessToken && config.headers) {
                config.headers.Authorization = `Bearer ${accessToken}`;
            }

            return config;
        },
        (error) => {
            return Promise.reject(error);
        }
    );
};

// Interceptor per le risposte
export const setupResponseInterceptor = () => {
    axios.interceptors.response.use(
        (response: AxiosResponse) => {
            return response;
        },
        async (error: AxiosError) => {
            const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

            // Se la risposta è 401 (Unauthorized) e non è già un retry
            if (error.response?.status === 401 && !originalRequest._retry) {
                if (isRefreshing) {
                    // Se già in corso un refresh, metti in coda la richiesta
                    return new Promise((resolve, reject) => {
                        failedQueue.push({ resolve, reject });
                    }).then((token) => {
                        if (originalRequest.headers) {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                        }
                        return axios(originalRequest);
                    }).catch((err) => {
                        return Promise.reject(err);
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    const newToken = await refreshToken();
                    processQueue(null, newToken);

                    // Riprova la richiesta originale con il nuovo token
                    if (originalRequest.headers) {
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    }
                    return axios(originalRequest);
                } catch (refreshError: unknown) {
                    processQueue(refreshError as Error, null);

                    // Reindirizza al login se il refresh fallisce
                    window.location.href = '/login';
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            return Promise.reject(error);
        }
    );
};

// Funzione per inizializzare tutti gli interceptor
export const initializeAxiosInterceptors = () => {
    setupRequestInterceptor();
    setupResponseInterceptor();
};
