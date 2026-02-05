import { BrowserRouter, Route, Routes } from 'react-router'
import Home from './pages/Homepage'
import LoginPage from './pages/LoginPage'
import ProtectedRoutes from './components/ProtectedRoutes/protectedRoutes'
import './App.css'
import RegisterPage from './pages/RegisterPage'
import OAuthCallback from './pages/OAuthCallback'
import Profile from './pages/Profile'
import SettingsPage from './pages/SettingsPage'
import ShareAccessPage from './pages/ShareAccessPage'
import { ThemeProvider } from './contexts/ThemeContext'
import LandingPageRef from './components/LandingPageRef'

function App() {

  return (
    <ThemeProvider>
      <div className='w-[100dvw] h-[100dvh] bg-[#2c2638]'>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/landing" element={<LandingPageRef />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/oauth2/callback" element={<OAuthCallback />} />

            {/* Public share access route */}
            <Route path="/share/:publicToken" element={<ShareAccessPage />} />

            {/* Protected routes */}
            <Route path="/" element={<ProtectedRoutes />}>
              <Route index element={<Home />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </div>
    </ThemeProvider>
  )
}

export default App

