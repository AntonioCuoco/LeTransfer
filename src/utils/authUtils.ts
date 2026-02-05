import Cookies from 'js-cookie';

/**
 * Extracts the user ID (sub) from the JWT access token stored in cookies.
 * @returns The user ID string or undefined if token is missing or invalid.
 */
export const getUserIdFromToken = (): string | undefined => {
    const token = Cookies.get('accessToken');
    if (!token) return undefined;
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload).sub;
    } catch (e) {
        return undefined;
    }
};

/**
 * Extracts the user Email from the JWT access token stored in cookies.
 * @returns The user Email string or undefined if token is missing or invalid.
 */
export const getUserEmailFromToken = (): string | undefined => {
    const token = Cookies.get('accessToken');
    if (!token) return undefined;
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload).email; // Assuming standard 'email' claim
    } catch (e) {
        return undefined;
    }
};
