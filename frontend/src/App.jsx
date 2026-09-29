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
import FacultyWorkspacePage from './components/FacultyWorkspacePage.jsx'
import FacultyDashboardPage from './features/roles/Faculty/Dashboard.jsx'
import FacultySyllabusPage from './features/roles/Faculty/Syllabus.jsx'
import FacultyModulePage from './features/roles/Faculty/Module.jsx'
import FacultyAssessmentPage from './features/roles/Faculty/Assessment.jsx'
import FacultyGradingPage from './features/roles/Faculty/Grading.jsx'
import FacultyAnalytics from './features/roles/Faculty/Analytics.jsx'
import AdminDashboard from './features/roles/Admin/Dashboard.jsx'
import AdminAuditLogs from './features/roles/Admin/AuditLogs.jsx'
import AdminAccountManagement from './features/roles/Admin/AccountManagement.jsx'
import AdminKnowledgeBase from './features/roles/Admin/KnowledgeBased.jsx'
// 1. Import your new Landing Page
import LandingPage from './pages/LandingPage.jsx' 
import BillingOnboarding from './pages/billing/BillingOnboarding.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 2. Set the Landing Page as the root route */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<LandingPage />} />
        <Route path="/contact" element={<LandingPage />} />
        
        {/* Your existing Auth Routes */}
        <Route path={ROUTES.SIGN_IN} element={<SignInPage />} />
        <Route path={ROUTES.SIGN_UP} element={<SignUpPage />} />
        <Route path={ROUTES.RESET_PASSWORD} element={<PasswordReset />} />
        <Route path={ROUTES.BILLING} element={<BillingOnboarding />} />

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
              <FacultyDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.WORKSPACE}
          element={
            <ProtectedRoute role="faculty">
              <FacultyWorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.SYLLABUS}
          element={
            <ProtectedRoute role="faculty">
              <FacultySyllabusPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.MODULE}
          element={
            <ProtectedRoute role="faculty">
              <FacultyModulePage />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.ASSESSMENT}
          element={
            <ProtectedRoute role="faculty">
              <FacultyAssessmentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.GRADING}
          element={
            <ProtectedRoute role="faculty">
              <FacultyGradingPage />
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
        <Route
          path={ROUTES.ADMIN.KNOWLEDGE_BASE}
          element={
            <ProtectedRoute role="admin">
              <AdminKnowledgeBase />
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