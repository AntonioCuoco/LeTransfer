import { InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { Navigate } from "react-router";
import Cookies from "js-cookie"
import Swal from "sweetalert2";
import { cognitoClient, clientId } from "../../utils/cognitoClient";

export interface DecodedToken {
    // Basic information
    sub: string;           // Unique user ID
    iss: string;          // Issuer (Provider URL)
    aud: string;          // Audience (Client ID)
    exp: number;          // Expiration time (timestamp)
    iat: number;          // Issued at (timestamp)
    nbf: number;          // Not before (timestamp)

    // User information
    email: string;        // User email
    email_verified: boolean; // If email is verified
    username: string;     // Username
    name?: string;        // User first name
    surname?: string;     // User last name

    // Authentication information
    auth_time: number;    // Authentication timestamp
    token_use: string;    // Token use (access/id)
    scope: string;        // Token scope

    // Client information
    client_id: string;    // Client ID
    origin_jti: string;   // Original JWT ID

    // Security information
    jti: string;         // JWT ID
    nonce?: string;      // Nonce (if used)

    // Additional information
    'cognito:groups'?: string[];  // User groups
    'cognito:roles'?: string[];   // User roles
    'cognito:preferred_role'?: string; // Preferred role

    // Custom attributes
    [key: string]: any;  // Other custom attributes
}

export const isTokenExpired = (token: string): boolean => {
    try {
        // Decode JWT token
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const decodedToken: DecodedToken = JSON.parse(jsonPayload);

        // Compare expiration date with current date
        const currentTime = Math.floor(Date.now() / 1000); // Convert to seconds
        return decodedToken.exp < currentTime;
    } catch (error) {
        // If there's an error in decoding, consider token as expired
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error decoding token',
            confirmButtonText: 'OK'
        });
        return true;
    }
};

export const checkAndRefreshToken = async () => {
    const accessToken = Cookies.get('accessToken');
    const refreshToken = Cookies.get('refreshToken');

    // If there's no access token, we can't do anything
    if (!accessToken) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Access token expired or invalid',
            confirmButtonText: 'OK'
        });
        return <Navigate to="/login" />
    }

    // If token is expired or about to expire (within 5 minutes)
    if (isTokenExpired(accessToken)) {
        // If there's no refresh token, remove everything and return false
        if (!refreshToken) {
            Cookies.remove('accessToken');
            Cookies.remove('idToken');
            Cookies.remove('refreshToken');
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Refresh token expired or invalid',
                confirmButtonText: 'OK'
            });
            return <Navigate to="/login" />
        }

        try {
            // Prova a fare il refresh del token
            const command = new InitiateAuthCommand({
                AuthFlow: "REFRESH_TOKEN_AUTH",
                ClientId: clientId,
                AuthParameters: {
                    REFRESH_TOKEN: refreshToken
                }
            });

            const response = await cognitoClient.send(command);

            if (response.AuthenticationResult) {
                const { AccessToken, IdToken } = response.AuthenticationResult;

                // Remove old tokens
                Cookies.remove('accessToken');
                Cookies.remove('idToken');

                if (!!AccessToken && !!IdToken) {
                    // Set new tokens
                    Cookies.set('accessToken', AccessToken, { expires: 1 / 24 }); // 1 hour
                    Cookies.set('idToken', IdToken, { expires: 1 / 24 });

                    return true;
                }
            }
        } catch (error) {
            // Se il refresh fallisce, rimuovi tutti i token
            Cookies.remove('accessToken');
            Cookies.remove('idToken');
            Cookies.remove('refreshToken');
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Errore nel refresh del token, verrai rimandato alla pagina di login',
                confirmButtonText: 'OK'
            });
            return <Navigate to="/login" />
        }
    }

    return true; // Token is still valid
};