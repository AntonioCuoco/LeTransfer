import Cookies from 'js-cookie';
import { DecodedToken } from '../checkAuth/checkAuth';

export const getCurrentUser = (): DecodedToken | null => {
    try {
        const idToken = Cookies.get('idToken');

        if (!idToken) {
            return null;
        }

        // Decodifica il token JWT
        const base64Url = idToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const decodedToken: DecodedToken = JSON.parse(jsonPayload);
        return decodedToken;
    } catch (error) {
        return null;
    }
}; 