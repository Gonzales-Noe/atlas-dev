import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ROUTES } from './config/route'
import SignInPage from './pages/auth/signInPage.jsx'
import ProtectedRoute from './components/protectedRoute'
import PublicOnlyRoute from './components/publicOnlyRoute'

const SignUpPage = lazy(() => import('./pages/auth/signUpPage.jsx'))
const PasswordReset = lazy(() => import('./pages/auth/passwordReset.jsx'))
const FacultyDashboardPage = lazy(() => import('./pages/dashboards/facultyDashboard.jsx'))
const FacultyWorkspacePage = lazy(() => import('./components/FacultyWorkspacePage.jsx'))
const FacultySyllabusPage = lazy(() => import('./pages/faculty/syllabusPage.jsx'))
const FacultyModulePage = lazy(() => import('./pages/faculty/modulePage.jsx'))
const FacultyAssessmentPage = lazy(() => import('./pages/faculty/assessmentPage.jsx'))
const FacultyGradingPage = lazy(() => import('./pages/faculty/gradingPage.jsx'))
const AdminDashboardPage = lazy(() => import('./pages/dashboards/adminDashboard.jsx'))
const SuperAdminDashboardPage = lazy(() => import('./pages/dashboards/superadminDashboard.jsx'))
const AdminAccountManagementPage = lazy(() => import('./pages/admin/accountManagement.jsx'))
const AdminGlobalKnowledgePage = lazy(() => import('./pages/admin/globalKnowledgeUpload.jsx'))
const SuperAdminAccountManagementPage = lazy(() => import('./pages/superadmin/accountManagement.jsx'))

function AppFallback() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#fff' }}>
      Loading...
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<AppFallback />}>
        <Routes>
          <Route path={ROUTES.HOME} element={<PublicOnlyRoute><SignInPage /></PublicOnlyRoute>} />
          <Route path={ROUTES.SIGN_IN} element={<PublicOnlyRoute><SignInPage /></PublicOnlyRoute>} />
          <Route path={ROUTES.SIGN_UP} element={<PublicOnlyRoute><SignUpPage /></PublicOnlyRoute>} />
          <Route path={ROUTES.RESET_PASSWORD} element={<PublicOnlyRoute><PasswordReset /></PublicOnlyRoute>} />
          <Route
            path={ROUTES.FACULTY.DASHBOARD}
            element={<ProtectedRoute role="faculty"><FacultyDashboardPage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.FACULTY.WORKSPACE}
            element={<ProtectedRoute role="faculty"><FacultyWorkspacePage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.FACULTY.SYLLABUS}
            element={<ProtectedRoute role="faculty"><FacultySyllabusPage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.FACULTY.MODULE}
            element={<ProtectedRoute role="faculty"><FacultyModulePage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.FACULTY.ASSESSMENT}
            element={<ProtectedRoute role="faculty"><FacultyAssessmentPage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.FACULTY.GRADING}
            element={<ProtectedRoute role="faculty"><FacultyGradingPage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.ADMIN.DASHBOARD}
            element={<ProtectedRoute role="admin"><AdminDashboardPage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.ADMIN.ACCOUNT_MANAGEMENT}
            element={<ProtectedRoute role="admin"><AdminAccountManagementPage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.ADMIN.GLOBAL_KNOWLEDGE}
            element={<ProtectedRoute role="admin"><AdminGlobalKnowledgePage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.SUPERADMIN.DASHBOARD}
            element={<ProtectedRoute role="superadmin"><SuperAdminDashboardPage /></ProtectedRoute>}
          />
          <Route
            path={ROUTES.SUPERADMIN.ACCOUNT_MANAGEMENT}
            element={<ProtectedRoute role="superadmin"><SuperAdminAccountManagementPage /></ProtectedRoute>}
          />
          <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
