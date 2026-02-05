import { SubmitHandler, useForm } from "react-hook-form"
import Slider from "../components/Slider/Slider"
import { Navigate, useNavigate } from "react-router"
import { useState } from "react"
import { AuthFlowType, ChallengeNameType, InitiateAuthCommand, RespondToAuthChallengeCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand } from "@aws-sdk/client-cognito-identity-provider"
import Swal from "sweetalert2"
import Cookies from "js-cookie"
import { cognitoClient, clientId, handleCognitoError } from "../utils/cognitoClient"
import { Modal } from "antd"
import PasswordInput from "../components/PasswordInput/PasswordInput"
import GoogleLoginButton from "../components/GoogleLoginButton/GoogleLoginButton"


type Inputs = {
    email: string
    password: string
    newPassword: string
}

const LoginPage = () => {
    const navigate = useNavigate();
    const [view, setView] = useState("login");
    const [session, setSession] = useState("");

    // Password recovery state
    const [isForgotOpen, setIsForgotOpen] = useState(false);
    const [forgotStep, setForgotStep] = useState<'email' | 'confirm'>('email');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotCode, setForgotCode] = useState('');
    const [forgotNewPassword, setForgotNewPassword] = useState('');
    const [isForgotLoading, setIsForgotLoading] = useState(false);

    if (Cookies.get('accessToken')) {
        return <Navigate to="/" />
    }

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<Inputs>({
        mode: "onChange",
    })
    const onSubmit: SubmitHandler<Inputs> = () => {
        handleLogin()
    }

    const handleLogin = async () => {
        const input = {
            "AuthFlow": AuthFlowType.USER_PASSWORD_AUTH,
            "AuthParameters": {
                "USERNAME": watch("email"),
                "PASSWORD": watch("password"),
            },
            "ClientId": clientId,
        };

        try {
            const command = new InitiateAuthCommand(input);
            const response = await cognitoClient.send(command);

            if (response.ChallengeName === "NEW_PASSWORD_REQUIRED") {
                setSession(response.Session || "")
                setView('otp')
            }
            else if (response['$metadata']['httpStatusCode'] === 200) {
                if (response.AuthenticationResult) {
                    const { AccessToken, IdToken, RefreshToken } = response.AuthenticationResult;

                    if (!!AccessToken && !!IdToken && !!RefreshToken) {
                        // Set cookies with 1 hour expiration
                        Cookies.set('accessToken', AccessToken, { expires: 1 / 24 }); // 1 hour
                        Cookies.set('idToken', IdToken, { expires: 1 / 24 });
                        Cookies.set('refreshToken', RefreshToken, { expires: 30 }); // 30 days
                    }

                    Swal.fire({
                        title: 'Login Successfull!',
                        icon: 'success',
                        confirmButtonText: 'OK'
                    })
                    navigate('/')
                }
            }
        }
        catch (error) {
            const errorMessage = handleCognitoError(error);
            Swal.fire({
                title: 'Login Failed!',
                text: errorMessage,
                icon: 'error',
                confirmButtonText: 'OK'
            })
        }
    }

    const handleChallenge = async () => {
        const input = { // RespondToAuthChallengeRequest
            ClientId: clientId, // required
            ChallengeName: ChallengeNameType.NEW_PASSWORD_REQUIRED,
            Session: session,
            ChallengeResponses: {
                "NEW_PASSWORD": watch("newPassword"),
                "USERNAME": watch("email"),
                "NAME": watch("email"),
            },
        };

        try {
            const command = new RespondToAuthChallengeCommand(input);
            const response = await cognitoClient.send(command);

            if (response['$metadata']['httpStatusCode'] === 200) {
                Swal.fire({
                    title: 'Nuova password confermata con successo!',
                    icon: 'success',
                    confirmButtonText: 'OK'
                })
                setView('login')
            }
        } catch (error) {
            const errorMessage = handleCognitoError(error);
            Swal.fire({
                title: 'Confirmation Failed!',
                text: errorMessage,
                icon: 'error',
                confirmButtonText: 'OK'
            })
        }
    }

    // Password Recovery Flow
    const openForgotModal = () => {
        setForgotEmail(watch('email') || '');
        setForgotStep('email');
        setIsForgotOpen(true);
    }

    const sendForgotEmail = async () => {
        try {
            setIsForgotLoading(true);
            const command = new ForgotPasswordCommand({
                ClientId: clientId,
                Username: forgotEmail,
            });
            const res = await cognitoClient.send(command);
            if (res['$metadata']?.httpStatusCode === 200) {
                Swal.fire({
                    title: 'Codice inviato!',
                    text: 'Controlla la tua email e inserisci il codice ricevuto',
                    icon: 'success'
                })
                setForgotStep('confirm');
            }
        } catch (error: any) {
            const errorMessage = handleCognitoError(error);
            Swal.fire({ title: 'Errore!', text: errorMessage, icon: 'error' });
        } finally {
            setIsForgotLoading(false);
        }
    }

    const confirmForgotPassword = async () => {
        try {
            setIsForgotLoading(true);
            const command = new ConfirmForgotPasswordCommand({
                ClientId: clientId,
                Username: forgotEmail,
                ConfirmationCode: forgotCode,
                Password: forgotNewPassword,
            });
            const res = await cognitoClient.send(command);
            if (res['$metadata']?.httpStatusCode === 200) {
                Swal.fire({
                    title: 'Password reimpostata!',
                    text: 'Ora puoi accedere con la nuova password',
                    icon: 'success'
                })
                setIsForgotOpen(false);
                setForgotEmail('');
                setForgotCode('');
                setForgotNewPassword('');
            }
        } catch (error: any) {
            const errorMessage = handleCognitoError(error);
            Swal.fire({ title: 'Errore!', text: errorMessage, icon: 'error' });
        } finally {
            setIsForgotLoading(false);
        }
    }


    return (
        <div className="w-full h-full flex flex-row justify-center items-center bg-[#2c2638]">
            <div className="w-1/2 h-full">
                <Slider />
            </div>
            <div className="w-1/2 h-full flex flex-col gap-12">
                <form onSubmit={handleSubmit(onSubmit)} className="pr-12 h-full flex flex-col justify-center items-center gap-8">
                    {view === "login" ? (
                        <>
                            <h1 className="text-[#DBD4D3] text-4xl font-bold text-center">Accedi al tuo account</h1>
                            <div className="w-full">
                                <input {...register("email", { required: "Email obbligatoria", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Formato email non valido" } })} type="email" placeholder="Email" className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white" />
                                {errors.email && <p className="text-[#F4743B] mt-1 text-sm">{errors.email.message}</p>}
                            </div>
                            <PasswordInput
                                register={register("password", { required: "Password obbligatoria", minLength: { value: 8, message: "La password deve essere di almeno 8 caratteri" } })}
                                error={errors.password?.message}
                                placeholder="Password"
                                showTooltip={false}
                            />
                            <div className="w-full flex flex-col gap-4">
                                <div className="flex flex-row gap-4 w-full">
                                    <button type="submit" className="bg-[#724CF9] w-full text-[#DBD4D3] p-4 rounded-md">Login</button>
                                    <button type="button" className="bg-[#724CF9] w-full text-[#DBD4D3] p-4 rounded-md" onClick={() => navigate("/register")}>Register</button>
                                </div>
                                <button type="button" onClick={openForgotModal} className="text-[#DBD4D3] text-sm cursor-pointer">Recupera password</button>
                            </div>
                            <div className="flex flex-row gap-4 w-full items-center">
                                <div className="w-full h-[1px] bg-[#DBD4D3]" />
                                <p className="text-[#DBD4D3] text-sm whitespace-nowrap">Or login with</p>
                                <div className="w-full h-[1px] bg-[#DBD4D3]" />
                            </div>
                            <div className="w-full">
                                <GoogleLoginButton
                                    className="w-full"
                                    onError={(error) => {
                                        Swal.fire({
                                            title: 'Error',
                                            text: error,
                                            icon: 'error'
                                        });
                                    }}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-full flex flex-col items-start gap-2">
                                <label className="text-[#DBD4D3] text-sm text-start">Enter new password</label>
                                <input placeholder='Enter new password' {...register("newPassword", { required: "Password obbligatoria", minLength: { value: 8, message: "La password deve essere di almeno 8 caratteri" } })} className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white" />
                            </div>
                            <button onClick={() => handleChallenge()} className="bg-[#724CF9] w-full text-[#DBD4D3] p-4 rounded-md">Save New Password</button>
                        </>
                    )}
                </form>
            </div>

            {/* Modale Recupero Password invariata */}
            <Modal
                title={forgotStep === 'email' ? 'Recupera password' : 'Inserisci codice e nuova password'}
                open={isForgotOpen}
                onCancel={() => setIsForgotOpen(false)}
                footer={null}
                centered
            >
                {forgotStep === 'email' ? (
                    <div className="flex flex-col gap-4">
                        <input
                            type="email"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            placeholder="Inserisci la tua email"
                            className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white"
                        />
                        <button
                            disabled={!forgotEmail || isForgotLoading}
                            onClick={sendForgotEmail}
                            className={`w-full p-2 rounded-md text-white ${(!forgotEmail || isForgotLoading) ? 'bg-gray-500 cursor-not-allowed' : 'bg-[#724CF9]'}`}
                        >
                            {isForgotLoading ? 'Invio in corso...' : 'Invia codice'}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <input
                            type="text"
                            value={forgotCode}
                            onChange={(e) => setForgotCode(e.target.value)}
                            placeholder="Codice ricevuto via email"
                            className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white"
                        />
                        <input
                            type="password"
                            value={forgotNewPassword}
                            onChange={(e) => setForgotNewPassword(e.target.value)}
                            placeholder="Nuova password"
                            className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white"
                        />
                        <button
                            disabled={!forgotCode || !forgotNewPassword || isForgotLoading}
                            onClick={confirmForgotPassword}
                            className={`w-full p-2 rounded-md text-white ${(!forgotCode || !forgotNewPassword || isForgotLoading) ? 'bg-gray-500 cursor-not-allowed' : 'bg-[#724CF9]'}`}
                        >
                            {isForgotLoading ? 'Conferma in corso...' : 'Conferma nuova password'}
                        </button>
                    </div>
                )}
            </Modal>
        </div>
    )
}

export default LoginPage