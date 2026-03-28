import React, { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { BackgroundAnimated } from '@/src/components/BackgroundAnimated';
import { InputField, RoleSelector, SubmitButton } from '@/src/components/forms';
import { SocialProof, SectionHeader, BenefitsList } from '@/src/components/landing';
import { UserIcon, EmailIcon, BuildingIcon } from '@/src/components/Icons';
import { WaitlistFormData } from '@/src/types/waitlist';
import { WAITLIST_ROLE_OPTIONS, WAITLIST_BENEFITS, WAITLIST_SOCIAL_PROOF } from '@/src/constants/waitlist';
import axios from 'axios';
import Swal from 'sweetalert2';

// Re-export types per retrocompatibilità
export type { WaitlistFormData } from '@/src/types/waitlist';

// -----------------------------------------------------------------------------
// WaitlistForm Component
// -----------------------------------------------------------------------------

/**
 * WaitlistForm - Form per la raccolta dati waitlist
 * 
 * Utilizza react-hook-form per la gestione del form e validazione.
 * Include campi per nome, cognome, email, ruolo e azienda (opzionale).
 */
export const WaitlistForm: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
    } = useForm<WaitlistFormData>({
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
            role: 'developer',
            companyName: '',
        },
    });

    const selectedRole = watch('role');

    const handleFormSubmit: SubmitHandler<WaitlistFormData> = async (data) => {
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append("access_key", import.meta.env.VITE_NEXT_PUBLIC_KEY);
            formData.append("firstName", data.firstName);
            formData.append("lastName", data.lastName);
            formData.append("email", data.email);
            formData.append("role", data.role);

            if (data.companyName) {
                formData.append("companyName", data.companyName);
            }
            const response = await axios.post("https://api.web3forms.com/submit", formData);

            if (response.data.success) {
                Swal.fire({
                    title: "Form inviato con successo",
                    text: "Ti risponderò il prima possibile",
                    icon: "success",
                });
                reset();
            }

            setIsSuccess(true);
        } catch (error) {
            Swal.fire({
                title: "Errore nell'invio del form",
                text: error?.message || "Si è verificato un errore sconosciuto contattare il supporto",
                icon: "error",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
            {/* Name Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                    label="Nome"
                    placeholder="Mario"
                    icon={<UserIcon />}
                    error={errors.firstName?.message}
                    {...register('firstName', {
                        required: 'Il nome è obbligatorio',
                        minLength: { value: 2, message: 'Il nome deve avere almeno 2 caratteri' },
                    })}
                />
                <InputField
                    label="Cognome"
                    placeholder="Rossi"
                    icon={<UserIcon />}
                    error={errors.lastName?.message}
                    {...register('lastName', {
                        required: 'Il cognome è obbligatorio',
                        minLength: { value: 2, message: 'Il cognome deve avere almeno 2 caratteri' },
                    })}
                />
            </div>

            {/* Email */}
            <InputField
                label="Email"
                type="email"
                placeholder="mario.rossi@email.com"
                icon={<EmailIcon />}
                error={errors.email?.message}
                {...register('email', {
                    required: "L'email è obbligatoria",
                    pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Inserisci un indirizzo email valido',
                    },
                })}
            />

            {/* Role Selector */}
            <RoleSelector
                value={selectedRole}
                onChange={(value) => setValue('role', value as WaitlistFormData['role'])}
                error={errors.role?.message}
                label="Qual è il tuo ruolo?"
                options={WAITLIST_ROLE_OPTIONS}
            />

            {/* Company Name (Optional) */}
            <InputField
                label="Azienda (opzionale)"
                placeholder="Nome della tua azienda"
                icon={<BuildingIcon />}
                {...register('companyName')}
            />

            {/* Submit Button */}
            <SubmitButton
                isLoading={isLoading}
                isSuccess={isSuccess}
                defaultText="Unisciti alla Waitlist"
                loadingText="Registrazione in corso..."
                successText="Sei nella lista!"
            />

            {/* Privacy Note */}
            <p className="text-center text-sm text-gray-500">
                Iscrivendoti accetti la nostra{' '}
                <a href="#" className="text-purple-600 hover:text-purple-500 underline">
                    Privacy Policy
                </a>
                . Non invieremo spam, promesso. 🤞
            </p>
        </form>
    );
};

// -----------------------------------------------------------------------------
// WaitlistSection Component
// -----------------------------------------------------------------------------

/**
 * WaitlistSection - Sezione completa waitlist per la landing page
 * 
 * Include:
 * - Background animato 3D
 * - Header con titolo e sottotitolo
 * - Social proof con avatar e contatore
 * - Form waitlist in card glassmorphism
 * - Lista benefici
 */
export const WaitlistSection: React.FC = () => {

    return (
        <section className="bg-[#f4f3ef] text-gray-900 py-32 relative overflow-hidden" id="waitlist-section">
            {/* 3D Background - Interactive */}
            <BackgroundAnimated />

            <div className="max-w-4xl mx-auto px-6 md:px-12 relative z-10">
                {/* Header */}
                <SectionHeader
                    badge="Early Access"
                    title="Unisciti alla"
                    titleGradient="Waitlist"
                    subtitle="Sii tra i primi a provare leTransfer. Accesso anticipato, feature esclusive e prezzi speciali per i primi iscritti."
                    className="mb-16"
                />

                {/* Stats/Social Proof */}
                <SocialProof
                    avatars={[...WAITLIST_SOCIAL_PROOF.avatars]}
                    count={WAITLIST_SOCIAL_PROOF.count}
                    countLabel={WAITLIST_SOCIAL_PROOF.countLabel}
                    statusText={WAITLIST_SOCIAL_PROOF.statusText}
                    showStatusIndicator
                    className="mb-12"
                />

                {/* Form Card */}
                <div className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-3xl p-8 md:p-12 shadow-sm">
                    <WaitlistForm />
                </div>

                {/* Benefits */}
                <BenefitsList
                    benefits={[...WAITLIST_BENEFITS]}
                    columns={3}
                    className="mt-12"
                />
            </div>
        </section>
    );
};

export default WaitlistForm;
