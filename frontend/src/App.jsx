import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ROUTES } from './config/route'
import SignInPage from './pages/auth/signInPage.jsx'
import SignUpPage from './pages/auth/signUpPage.jsx'
import PasswordReset from './pages/auth/passwordReset.jsx'
// 1. Import your new Landing Page
import LandingPage from './pages/LandingPage.jsx' 

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 2. Set the Landing Page as the root route */}
        <Route path="/" element={<LandingPage />} />
        
        {/* Your existing Auth Routes */}
        <Route path={ROUTES.SIGN_IN} element={<SignInPage />} />
        <Route path={ROUTES.SIGN_UP} element={<SignUpPage />} />
        <Route path={ROUTES.RESET_PASSWORD} element={<PasswordReset />} />
        
        {/* 3. Optional: Redirect unknown routes back to the landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App