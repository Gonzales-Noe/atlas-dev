import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ROUTES } from './config/route'
import SignInPage from './pages/auth/signInPage.jsx'
import SignUpPage from './pages/auth/signUpPage.jsx'
import PasswordReset from './pages/auth/passwordReset.jsx'
import LandingPage from './pages/landing.jsx'
import ProtectedRoute from './components/protectedRoute.jsx'
import SuperAdminDashboard from './features/Superadmin/Dashboard.jsx'
import SuperAdminAuditLogs from './features/Superadmin/AuditLogs.jsx'
import SuperAdminSystemManagement from './features/Superadmin/SystemManagement.jsx'
import SuperAdminAccountManagement from './features/Superadmin/AccountManagement.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path={ROUTES.HOME} element={<LandingPage />} />
        <Route path={ROUTES.SIGN_IN} element={<SignInPage />} />
        <Route path={ROUTES.SIGN_UP} element={<SignUpPage />} />
        <Route path={ROUTES.RESET_PASSWORD} element={<PasswordReset />} />

        {/* Super Admin */}
        <Route
          path={ROUTES.SUPERADMIN.DASHBOARD}
          element={
            <ProtectedRoute role="superadmin">
              <SuperAdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.SUPERADMIN.AUDIT_LOGS}
          element={
            <ProtectedRoute role="superadmin">
              <SuperAdminAuditLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.SUPERADMIN.SYSTEM_MANAGEMENT}
          element={
            <ProtectedRoute role="superadmin">
              <SuperAdminSystemManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.SUPERADMIN.ACCOUNT_MANAGEMENT}
          element={
            <ProtectedRoute role="superadmin">
              <SuperAdminAccountManagement />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
