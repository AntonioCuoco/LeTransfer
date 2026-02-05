import { useTokenManager } from "../hooks/useTokenManager";

/**
 * Componente invisibile che gestisce il ciclo di vita della sessione (refresh automatico).
 * Deve essere inserito all'interno di un componente che è figlio di BrowserRouter e dentro ProtectedRoutes.
 */
export const SessionManager = () => {
    // L'hook useTokenManager si occupa già di inizializzare i listener per focus/visibility
    // e di gestire il timer per il refresh periodico.
    // Semplicemente istanziandolo qui, attiviamo quella logica per tutta la durata del componente.
    useTokenManager();

    return null;
};
