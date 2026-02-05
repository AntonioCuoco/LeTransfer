import axios from "axios";
import Cookies from "js-cookie";
import { useNavigate } from "react-router";
import UploadCircle from "../UploadCircle/UploadCircle";
// import { useProfileImage } from "../../hooks/useProfileImage";

const Header = () => {
  const navigate = useNavigate();

  // Hook per gestire la foto profilo S3 (sincronizzato con l'upload)
  // const { profileImageUrl, isLoading: imageLoading } = useProfileImage();

  const handleLogout = async () => {
    try {
      // 1. Call backend to invalidate AWS Cognito session
      await axios.post(`${import.meta.env.VITE_API_URL}/auth/logout`, {}, {
        headers: {
          Authorization: `Bearer ${Cookies.get('idToken')}`
        }
      });
    } catch (error) {
      // Continue with cookie removal even if the call fails
    }

    // 2. Remove all authentication cookies
    Cookies.remove('accessToken');
    Cookies.remove('idToken');
    Cookies.remove('refreshToken');

    // 3. Redirect to login page
    navigate('/login');
  };


  return (
    <div className="w-full h-fit">
      <header className="w-full h-fit p-4 px-2 sm:px-10 flex items-center justify-between">
        <p className="text-[#DBD4D3] text-4xl font-bold cursor-pointer" onClick={() => navigate('/')}>L.E</p>

        <div className="w-fit h-fit flex flex-row items-center gap-4">
          {/* Pulsante Logout */}
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
          >
            Logout
          </button>

          <UploadCircle isPreview={true} useS3={true} />
        </div>
      </header>
    </div>
  )
}

export default Header;