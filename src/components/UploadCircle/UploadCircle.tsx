import React, { useState, useEffect } from 'react';
import { UseFormSetValue } from 'react-hook-form';
import { getBase64 } from '../../utils/utils';
import { useNavigate } from 'react-router';
import { UploadOutlined, DeleteOutlined, LoadingOutlined } from '@ant-design/icons';
import { useProfileImage } from '../../hooks/useProfileImage';

interface Inputs {
    name: string;
    surname: string;
    email: string;
    password: string;
    image: string;
}

interface UploadCircleProps {
    setValue?: UseFormSetValue<Inputs>;
    setImageUpload?: (file: File) => void;
    isPreview?: boolean;
    imgProfilePreview?: string;
    useS3?: boolean; // Nuovo prop per usare S3
}

const UploadCircle: React.FC<UploadCircleProps> = ({
    setValue,
    setImageUpload,
    isPreview,
    imgProfilePreview,
    useS3 = false
}) => {
    const [imgProfile, setImgProfile] = useState<string>(imgProfilePreview ?? '');
    const [isUploading, setIsUploading] = useState(false);
    const navigate = useNavigate();

    // Hook per gestire foto profilo su S3
    const {
        profileImageUrl,
        isLoading: s3Loading,
        error: s3Error,
        uploadProfileImage,
        deleteProfileImage,
        refreshProfileImage
    } = useProfileImage();

    // Se usa S3, usa l'URL da S3, altrimenti usa l'immagine locale
    const displayImage = useS3 ? profileImageUrl : imgProfile;
    const isUploadingState = useS3 ? s3Loading : isUploading;

    // Sincronizza con S3 quando cambia
    useEffect(() => {
        if (useS3 && profileImageUrl) {
            setImgProfile(profileImageUrl);
            setValue?.("image", profileImageUrl);
        }
    }, [profileImageUrl, useS3, setValue]);

    // Forza il refresh quando useS3 è true
    useEffect(() => {
        if (useS3) {
            // Il hook useProfileImage gestisce già il caricamento
            // Qui forziamo solo la sincronizzazione
        }
    }, [useS3]);

    // Ascolta gli eventi di aggiornamento foto profilo per sincronizzazione
    useEffect(() => {
        const handleProfileImageUpdate = () => {
            if (useS3) {
                // Forza il refresh del hook useProfileImage
                refreshProfileImage();
            }
        };

        window.addEventListener('profileImageUpdated', handleProfileImageUpdate);

        return () => {
            window.removeEventListener('profileImageUpdated', handleProfileImageUpdate);
        };
    }, [useS3, refreshProfileImage]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];

            try {
                if (useS3) {
                    // Upload su S3
                    setIsUploading(true);
                    await uploadProfileImage(file);

                    // Notifica tutti i componenti dell'aggiornamento
                    window.dispatchEvent(new CustomEvent('profileImageUpdated'));
                } else {
                    // Logica originale per base64
                    setImageUpload?.(file);
                    const base64Image = await getBase64(file);
                    setImgProfile(base64Image);
                    setValue?.("image", base64Image);
                }
            } catch (error: any) {
                alert(error.message || 'Errore durante l\'upload');
            } finally {
                setIsUploading(false);
            }
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Sei sicuro di voler eliminare la foto profilo?')) {
            try {
                if (useS3) {
                    await deleteProfileImage();
                    // Notifica tutti i componenti dell'eliminazione
                    window.dispatchEvent(new CustomEvent('profileImageUpdated'));
                } else {
                    setImgProfile('');
                    setValue?.("image", '');
                }
            } catch (error: any) {
                alert(error.message || 'Errore durante l\'eliminazione');
            }
        }
    };

    if (isPreview) {
        return (
            <div className="relative">
                {displayImage ? (
                    <img
                        src={displayImage}
                        alt="Profile"
                        className="w-[60px] h-[60px] rounded-full border border-[#676178] bg-[#3c364c] cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => navigate("/profile")}
                    />
                ) : (
                    <div
                        className="w-[60px] h-[60px] rounded-full border border-[#676178] bg-[#3c364c] cursor-pointer hover:opacity-80 transition-opacity flex items-center justify-center"
                        onClick={() => navigate("/profile")}
                    >
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative">
            {displayImage ? (
                <div className="relative group">
                    <img
                        src={displayImage}
                        alt="Profile"
                        className="w-[120px] h-[120px] rounded-full border border-[#676178] bg-[#3c364c]"
                    />

                    {/* Overlay con pulsanti */}
                    <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                        <label htmlFor="image" className="cursor-pointer">
                            <UploadOutlined className="text-white text-lg hover:text-blue-300" />
                        </label>
                        <button
                            onClick={handleDelete}
                            className="text-white text-lg hover:text-red-300"
                            disabled={isUploadingState}
                        >
                            <DeleteOutlined />
                        </button>
                    </div>
                </div>
            ) : (
                <label htmlFor="image" className="cursor-pointer">
                    <div className="w-[120px] h-[120px] border border-[#676178] rounded-full flex flex-col items-center justify-center transition-all duration-300 ease-in-out bg-[#3c364c] group hover:bg-[#4a4554]">
                        {isUploadingState ? (
                            <LoadingOutlined className="text-[#676178] text-3xl animate-spin" />
                        ) : (
                            <>
                                <span className="text-3xl text-[#676178] mb-2">+</span>
                                <span className="text-base text-[#676178] font-medium">Upload</span>
                            </>
                        )}
                    </div>
                </label>
            )}

            <input
                type="file"
                accept="image/*"
                className="sr-only hidden"
                id="image"
                onChange={handleFileChange}
                disabled={isUploadingState}
            />

            {s3Error && (
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-3 text-red-400 text-sm text-center w-max max-w-[250px] z-10">
                    {s3Error}
                </div>
            )}
        </div>
    );
};

export default UploadCircle; 