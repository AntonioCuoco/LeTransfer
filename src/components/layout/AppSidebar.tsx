import { NavLink, useNavigate } from 'react-router';
import {
    HomeOutlined,
    UserOutlined,
    SettingOutlined,
    LogoutOutlined,
} from '@ant-design/icons';
import Cookies from 'js-cookie';
import Swal from 'sweetalert2';
import axios from 'axios';
import logo from "@/src/assets/logo.png";

interface NavItem {
    path: string;
    icon: React.ReactNode;
    label: string;
}

const navItems: NavItem[] = [
    { path: '/', icon: <HomeOutlined />, label: 'Home' },
    { path: '/profile', icon: <UserOutlined />, label: 'Profilo' },
];

export const AppSidebar = () => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await axios.post(`${import.meta.env.VITE_API_URL}/logout`, {}, {
                headers: { Authorization: `Bearer ${Cookies.get('idToken')}` }
            });
        } catch {
            // Continue with logout even if API call fails
        }

        Cookies.remove('accessToken');
        Cookies.remove('idToken');
        Cookies.remove('refreshToken');

        Swal.fire({
            icon: 'success',
            title: 'Logout effettuato',
            text: 'A presto!',
            timer: 1500,
            showConfirmButton: false
        });

        navigate('/login');
    };

    return (
        <aside className="fixed left-0 top-0 h-screen w-[72px] bg-[#3c364c] border-r border-[#4a4554]/50 flex flex-col items-center justify-between py-4 px-2 z-50">
            {/* Logo */}
            <div className="mb-8">
                <div className="w-14 h-14 flex items-center justify-center rounded-[10px] hover:scale-105 transition-transform">
                    <img src={logo} alt="Logo" />
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col items-center gap-2 w-full">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `relative w-full h-12 flex items-center justify-center rounded-[10px] transition-all duration-150 group
                            ${isActive
                                ? 'bg-[#724CF9] text-white shadow-[0_0_10px_rgba(114,76,249,0.4)]'
                                : 'text-[#9ca3af] hover:bg-[#724CF9]/15 hover:text-white'
                            }`
                        }
                        title={item.label}
                    >
                        <span className="text-xl flex items-center justify-center">{item.icon}</span>
                        {/* Tooltip */}
                        <span className="absolute left-[calc(100%+12px)] bg-[#3c364c] text-white py-2 px-3 rounded-md text-sm font-medium whitespace-nowrap opacity-0 invisible -translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-150 pointer-events-none shadow-md z-[1000] before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent before:border-r-[#3c364c]">
                            {item.label}
                        </span>
                    </NavLink>
                ))}
            </nav>

            {/* Bottom Actions */}
            <div className="flex flex-col items-center gap-2 w-full pt-4">
                <button
                    className="relative w-full h-12 flex items-center justify-center rounded-[10px] text-[#9ca3af] hover:bg-[#724CF9]/15 hover:text-white transition-all duration-150 group"
                    title="Impostazioni"
                    onClick={() => navigate('/settings')}
                >
                    <span className="text-xl flex items-center justify-center"><SettingOutlined /></span>
                    <span className="absolute left-[calc(100%+12px)] bg-[#3c364c] text-white py-2 px-3 rounded-md text-sm font-medium whitespace-nowrap opacity-0 invisible -translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-150 pointer-events-none shadow-md z-[1000] before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent before:border-r-[#3c364c]">
                        Impostazioni
                    </span>
                </button>
                <button
                    className="relative w-full h-12 flex items-center justify-center rounded-[10px] text-[#9ca3af] hover:bg-red-500/15 hover:text-red-500 transition-all duration-150 group"
                    title="Logout"
                    onClick={handleLogout}
                >
                    <span className="text-xl flex items-center justify-center"><LogoutOutlined /></span>
                    <span className="absolute left-[calc(100%+12px)] bg-[#3c364c] text-white py-2 px-3 rounded-md text-sm font-medium whitespace-nowrap opacity-0 invisible -translate-x-1 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-150 pointer-events-none shadow-md z-[1000] before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent before:border-r-[#3c364c]">
                        Logout
                    </span>
                </button>
            </div>
        </aside>
    );
};
