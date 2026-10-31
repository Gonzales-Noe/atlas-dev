import { Component, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ROUTES } from './config/route'
import ProtectedRoute from './components/protectedRoute.jsx'
import LandingPage from './pages/LandingPage.jsx'
import AtlasErrorHost from './components/AtlasErrorHost.jsx'
import StatusNoticeHost from './components/StatusNotice.jsx'
import MaintenanceGate from './components/MaintenanceGate.jsx'
import RouteSkeleton from './components/RouteSkeleton.jsx'

const SignInPage = lazy(() => import('./pages/auth/signInPage.jsx'))
const SignUpPage = lazy(() => import('./pages/auth/signUpPage.jsx'))
const PasswordReset = lazy(() => import('./pages/auth/passwordReset.jsx'))
const SuperAdminDashboard = lazy(() => import('./features/Superadmin/Dashboard.jsx'))
const SuperAdminAuditLogs = lazy(() => import('./features/Superadmin/AuditLogs.jsx'))
const SuperAdminSystemManagement = lazy(() => import('./features/Superadmin/SystemManagement.jsx'))
const SuperAdminAccountManagement = lazy(() => import('./features/Superadmin/AccountManagement.jsx'))
const SuperAdminAppearance = lazy(() => import('./features/Superadmin/Appearance.jsx'))
const FacultyWorkspacePage = lazy(() => import('./components/FacultyWorkspacePage.jsx'))
const FacultyDashboardPage = lazy(() => import('./features/roles/Faculty/Dashboard.jsx'))
const AdminDashboard = lazy(() => import('./features/roles/Admin/Dashboard.jsx'))
const AdminAuditLogs = lazy(() => import('./features/roles/Admin/AuditLogs.jsx'))
const AdminAccountManagement = lazy(() => import('./features/roles/Admin/AccountManagement.jsx'))
const AdminAcademicStructure = lazy(() => import('./features/roles/Admin/AcademicStructure.jsx'))
const AdminSyllabusFormat = lazy(() => import('./features/roles/Admin/SyllabusFormat.jsx'))
const AdminKnowledgeBase = lazy(() => import('./features/roles/Admin/KnowledgeBased.jsx'))
const BillingOnboarding = lazy(() => import('./pages/billing/BillingOnboarding.jsx'))
const LegalPage = lazy(() => import('./pages/legal/LegalPage.jsx'))

class FacultyWorkspaceErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Faculty workspace render failed.', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        padding: '48px 24px',
        background: '#08080A',
        color: '#F0F0F2',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <section style={{ maxWidth: 760, margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.4rem' }}>This course workspace could not be displayed.</h1>
          <p>Reload the workspace or return to your course list. If the problem continues, share the error details below with your administrator.</p>
          <div style={{ display: 'flex', gap: 12, margin: '24px 0' }}>
            <button type="button" onClick={() => window.location.reload()}>Reload workspace</button>
            <button type="button" onClick={() => { window.location.href = '/faculty/dashboard' }}>Back to courses</button>
          </div>
          <details>
            <summary>Error details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {this.state.error?.stack || String(this.state.error)}
            </pre>
          </details>
        </section>
      </main>
    )
  }
}

function App() {
  return (
    <BrowserRouter>
      <MaintenanceGate>
      <AtlasErrorHost />
      <StatusNoticeHost />
      <Suspense fallback={<RouteSkeleton />}>
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
        <Route path={ROUTES.LEGAL_TERMS} element={<LegalPage />} />
        <Route path="/legal/:doc" element={<LegalPage />} />

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
        <Route
          path={ROUTES.SUPERADMIN.APPEARANCE}
          element={
            <ProtectedRoute role="superadmin">
              <SuperAdminAppearance />
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
              <FacultyWorkspaceErrorBoundary>
                <FacultyWorkspacePage />
              </FacultyWorkspaceErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.SYLLABUS}
          element={
            <ProtectedRoute role="faculty">
              <Navigate to={ROUTES.FACULTY.DASHBOARD} replace />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.MODULE}
          element={
            <ProtectedRoute role="faculty">
              <Navigate to={ROUTES.FACULTY.DASHBOARD} replace />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.ASSESSMENT}
          element={
            <ProtectedRoute role="faculty">
              <Navigate to={ROUTES.FACULTY.DASHBOARD} replace />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.GRADING}
          element={
            <ProtectedRoute role="faculty">
              <Navigate to={ROUTES.FACULTY.DASHBOARD} replace />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.FACULTY.ANALYTICS}
          element={
            <ProtectedRoute role="faculty">
              <Navigate to={ROUTES.FACULTY.DASHBOARD} replace />
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
          path={ROUTES.ADMIN.ACADEMIC_STRUCTURE}
          element={
            <ProtectedRoute role="admin">
              <AdminAcademicStructure />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.ADMIN.SYLLABUS_FORMAT}
          element={
            <ProtectedRoute role="admin">
              <AdminSyllabusFormat />
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
      </Suspense>
      </MaintenanceGate>
    </BrowserRouter>
  )
}

export default App