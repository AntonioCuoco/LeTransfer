import { SubmitHandler, useForm } from "react-hook-form"
import Slider from "../components/Slider/Slider"
import { Navigate, useNavigate } from "react-router"
import Swal from "sweetalert2"
import { Modal } from "antd"
import { useRef, useState } from "react"
import Cookies from "js-cookie"
import UploadCircle from "../components/UploadCircle/UploadCircle"
import {
    SignUpCommand,
    ConfirmSignUpCommand,
    InitiateAuthCommand,
    AuthFlowType
} from "@aws-sdk/client-cognito-identity-provider"
import { cognitoClient, clientId, handleCognitoError } from "../utils/cognitoClient"
import axios from "axios"
import PasswordInput from "../components/PasswordInput/PasswordInput"
import GoogleLoginButton from "../components/GoogleLoginButton/GoogleLoginButton"

type Inputs = {
    name: string
    surname: string
    email: string
    password: string
    image: string;
}

const RegisterPage = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [imageUpload, setImageUpload] = useState<File>(new File([], ""));


    if (Cookies.get('accessToken')) {
        return <Navigate to="/" />
    }

    const showModal = () => {
        setIsModalOpen(true);
    };

    const {
        register,
        handleSubmit,
        watch,
        reset,
        setValue,
        formState: { errors },
    } = useForm<Inputs>({
        mode: "onChange",
    })
    const onSubmit: SubmitHandler<Inputs> = (data) => postUser(data);

    const handleOk = async () => {
        try {
            const confirmSignUpCommand = new ConfirmSignUpCommand({
                ClientId: clientId,
                Username: watch("email"),
                ConfirmationCode: inputRef.current?.value || ""
            });

            const confirmResponse = await cognitoClient.send(confirmSignUpCommand);

            if (confirmResponse.$metadata.httpStatusCode === 200) {
                // 2. Automatic login after confirmation
                const loginCommand = new InitiateAuthCommand({
                    AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
                    AuthParameters: {
                        USERNAME: watch("email"),
                        PASSWORD: watch("password"), // You need to save the password in state
                    },
                    ClientId: clientId,
                });

                const loginResponse = await cognitoClient.send(loginCommand);

                if (loginResponse.AuthenticationResult) {
                    const { AccessToken, IdToken, RefreshToken } = loginResponse.AuthenticationResult;

                    // 3. Save tokens
                    if (!!AccessToken && !!IdToken && !!RefreshToken) {
                        Cookies.set('accessToken', AccessToken, { expires: 1 / 24 });
                        Cookies.set('idToken', IdToken, { expires: 1 / 24 });
                        Cookies.set('refreshToken', RefreshToken, { expires: 30 });
                    }

                    // 4. Upload image if present
                    if (imageUpload && imageUpload.size > 0) {
                        const formData = new FormData();
                        formData.append("image", imageUpload);

                        await axios.post("http://localhost:3000/api/upload-image", formData, {
                            headers: {
                                "Authorization": `Bearer ${IdToken}`
                            }
                        });
                    }

                    setIsModalOpen(false);
                    Swal.fire({
                        title: "Registrazione completata!",
                        text: "Benvenuto nella piattaforma",
                        icon: "success"
                    });
                    navigate('/');
                    reset();
                }
            }
        } catch (error: any) {
            const errorMessage = handleCognitoError(error);
            Swal.fire({
                title: "Errore!",
                text: errorMessage,
                icon: "error"
            });
        }
    };

    const handleCancel = () => {
        setIsModalOpen(false);
    };

    const navigate = useNavigate()

    const postUser = async (data: Inputs) => {
        try {
            // Prepare user attributes
            const userAttributes = [
                { Name: "email", Value: data.email },
                { Name: "name", Value: `${data.name} ${data.surname}` }
            ];

            // Registration command
            const signUpCommand = new SignUpCommand({
                ClientId: clientId,
                Username: data.email,
                Password: data.password,
                UserAttributes: userAttributes
            });

            const response = await cognitoClient.send(signUpCommand);

            if (response.$metadata.httpStatusCode === 200) {
                Swal.fire({
                    title: "Utente registrato con successo!",
                    text: "Controlla la tua email per il codice di verifica",
                    icon: "success"
                });
                showModal();
            }

            return response;
        } catch (error: any) {
            const errorMessage = handleCognitoError(error);
            Swal.fire({
                title: "Errore durante la registrazione!",
                text: errorMessage,
                icon: "error"
            });
        }
    }


    return (
        <div className="w-full h-full flex flex-row justify-center items-center bg-[#2c2638]">
            <Modal
                closable={false}
                open={isModalOpen}
                onOk={handleOk}
                onCancel={handleCancel}
                centered
            >
                <div className="flex flex-col items-center justify-center gap-4 py-4">
                    <p className="text-[#DBD4D3] text-2xl font-bold">Codice di verifica</p>
                    <input type="text" ref={inputRef} placeholder="Codice di verifica" className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white" />
                </div>
            </Modal>
            <div className="w-1/2 h-full">
                <Slider />
            </div>
            <div className="w-1/2 h-full flex flex-col gap-12">
                <form onSubmit={handleSubmit(onSubmit)} className="pr-12 h-full flex flex-col justify-center items-center gap-8">
                    <h1 className="text-[#DBD4D3] text-4xl font-bold text-center">Registrati all'applicazione</h1>
                    <div className="flex flex-row w-full justify-center">
                        <UploadCircle setValue={setValue} setImageUpload={setImageUpload} />
                    </div>
                    <div className="flex flex-row gap-4 w-full">
                        <div className="w-full">
                            <input {...register("name", { required: "Nome obbligatorio" })} type="text" placeholder="Nome" className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white" />
                            {errors.name && <p className="text-[#F4743B] mt-1 text-sm">{errors.name.message}</p>}
                        </div>
                        <div className="w-full">
                            <input {...register("surname", { required: "Cognome obbligatorio" })} type="text" placeholder="Cognome" className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white" />
                            {errors.surname && <p className="text-[#F4743B] mt-1 text-sm">{errors.surname.message}</p>}
                        </div>
                    </div>
                    <div className="w-full">
                        <input {...register("email", { required: "Email obbligatoria", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Formato email non valido" } })} type="email" placeholder="Email" className="w-full p-2 rounded-md focus:border-2 focus:outline-none focus:border-[#724CF9] bg-[#3c364c] placeholder:text-[#676178] text-white" />
                        {errors.email && <p className="text-[#F4743B] mt-1 text-sm">{errors.email.message}</p>}
                    </div>
                    <PasswordInput
                        register={register("password", { required: "Password obbligatoria", minLength: { value: 8, message: "La password deve essere di almeno 8 caratteri" } })}
                        error={errors.password?.message}
                        placeholder="Password"
                        showTooltip={true}
                    />
                    <div className="flex flex-row gap-4 w-full">
                        <button type="submit" className="bg-[#724CF9] w-full text-[#DBD4D3] p-4 rounded-md">Register</button>
                        <button type="submit" className="bg-[#724CF9] w-full text-[#DBD4D3] p-4 rounded-md" onClick={() => navigate("/login")}>Login</button>
                    </div>
                    <div className="flex flex-row gap-4 w-full items-center">
                        <div className="w-full h-[1px] bg-[#DBD4D3]" />
                        <p className="text-[#DBD4D3] text-sm whitespace-nowrap">Or register with</p>
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
                </form>
            </div>
        </div>
    )
}

export default RegisterPage