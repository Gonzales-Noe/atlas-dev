import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ROUTES } from './config/route'
import SignInPage from './pages/auth/signInPage.jsx'
import SignUpPage from './pages/auth/signUpPage.jsx'
import PasswordReset from './pages/auth/passwordReset.jsx'
import ProtectedRoute from './components/protectedRoute.jsx'
import SuperAdminDashboard from './features/Superadmin/Dashboard.jsx'
import SuperAdminAuditLogs from './features/Superadmin/AuditLogs.jsx'
import SuperAdminSystemManagement from './features/Superadmin/SystemManagement.jsx'
import SuperAdminAccountManagement from './features/Superadmin/AccountManagement.jsx'
import FacultyDashboard from './features/roles/Faculty/Dashboard.jsx'
import FacultySyllabus from './features/roles/Faculty/Syllabus.jsx'
import FacultyModule from './features/roles/Faculty/Module.jsx'
import FacultyAssessment from './features/roles/Faculty/Assessment.jsx'
import FacultyGrading from './features/roles/Faculty/Grading.jsx'
import FacultyAnalytics from './features/roles/Faculty/Analytics.jsx'
import AdminDashboard from './features/roles/Admin/Dashboard.jsx'
import AdminAuditLogs from './features/roles/Admin/AuditLogs.jsx'
import AdminAccountManagement from './features/roles/Admin/AccountManagement.jsx'
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

        {/* Super Admin Routes */}
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

        {/* Faculty Routes */}
        <Route
          path={ROUTES.FACULTY.DASHBOARD}
          element={
            <ProtectedRoute role="faculty">
              <FacultyDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.SYLLABUS}
          element={
            <ProtectedRoute role="faculty">
              <FacultySyllabus />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.MODULE}
          element={
            <ProtectedRoute role="faculty">
              <FacultyModule />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.ASSESSMENT}
          element={
            <ProtectedRoute role="faculty">
              <FacultyAssessment />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.GRADING}
          element={
            <ProtectedRoute role="faculty">
              <FacultyGrading />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.ANALYTICS}
          element={
            <ProtectedRoute role="faculty">
              <FacultyAnalytics />
            </ProtectedRoute>
          }
        />

        {/* Admin Routes */}
        <Route
          path={ROUTES.ADMIN.DASHBOARD}
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.ADMIN.AUDIT_LOGS}
          element={
            <ProtectedRoute role="admin">
              <AdminAuditLogs />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.ADMIN.ACCOUNT_MANAGEMENT}
          element={
            <ProtectedRoute role="admin">
              <AdminAccountManagement />
            </ProtectedRoute>
          }
        />

        {/* 3. Optional: Redirect unknown routes back to the landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App