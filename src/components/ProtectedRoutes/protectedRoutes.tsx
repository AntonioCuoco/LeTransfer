import { Outlet, Navigate } from "react-router";
import Cookies from "js-cookie";
import { SessionManager } from "../SessionManager";
import { EncryptionProvider } from "../../contexts/EncryptionContext";
import { TransferProvider } from "../../contexts/TransferContext";
import { AppSecurityPrompt } from "../AppSecurityPrompt";

import '../../styles/design-tokens.css';
import Layout from "../layout/Layout";

const ProtectedRoutes = () => {

    const accessToken = Cookies.get("accessToken");
    const refreshToken = Cookies.get("refreshToken");

    // Se non abbiamo né accessToken né refreshToken, vai al login
    // Se abbiamo solo refreshToken, SessionManager proverà a fare il refresh
    if (!accessToken && !refreshToken) {
        return <Navigate to="/landing" />
    }

    return (
        <EncryptionProvider>
            <TransferProvider apiBaseUrl={import.meta.env.VITE_API_MULTIPART_URL || '/api'}>
                <SessionManager />
                <AppSecurityPrompt />
                <Layout>
                    <Outlet />
                </Layout>
            </TransferProvider>
        </EncryptionProvider>
    )
}

export default ProtectedRoutes