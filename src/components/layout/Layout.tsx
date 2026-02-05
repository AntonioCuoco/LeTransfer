import { AppSidebar } from "./AppSidebar";
import '../../styles/design-tokens.css';

interface LayoutProps {
    children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
    return (
        <div className="flex min-h-screen bg-[#2c2638]">
            <AppSidebar />
            <main className="flex-1 ml-[72px] min-h-screen bg-[#2c2638] overflow-x-hidden">
                {children}
            </main>
        </div>
    );
};

export default Layout;