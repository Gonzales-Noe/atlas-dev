import { useState, useMemo, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { ROUTES } from './config/route'
import SignInPage from './pages/auth/signInPage.jsx'
import SignUpPage from './pages/auth/signUpPage.jsx'
import PasswordReset from './pages/auth/passwordReset.jsx'
import ProtectedRoute from './components/protectedRoute.jsx'
import SuperAdminDashboard from './features/Superadmin/Dashboard.jsx'
import SuperAdminAuditLogs from './features/Superadmin/AuditLogs.jsx'
import SuperAdminSystemManagement from './features/Superadmin/SystemManagement.jsx'
import SuperAdminAccountManagement from './features/Superadmin/AccountManagement.jsx'
import FacultyDashboardPage from './pages/dashboards/facultyDashboard.jsx'
import FacultyWorkspacePage from './features/roles/Faculty/FacultyWorkspacePage.jsx'
import FacultySyllabusPage from './pages/faculty/syllabusPage.jsx'
import FacultyModulePage from './pages/faculty/modulePage.jsx'
import FacultyAssessmentPage from './pages/faculty/assessmentPage.jsx'
import FacultyGradingPage from './pages/faculty/gradingPage.jsx'
import FacultyAnalytics from './features/roles/Faculty/Analytics.jsx'
import AdminDashboard from './features/roles/Admin/Dashboard.jsx'
import AdminAuditLogs from './features/roles/Admin/AuditLogs.jsx'
import AdminAccountManagement from './features/roles/Admin/AccountManagement.jsx'
import AdminKnowledgeBase from './features/roles/Admin/KnowledgeBased.jsx'
import BillingPage from './pages/billing/BillingPage.jsx'
// 1. Import your new Landing Page
import LandingPage from './pages/LandingPage.jsx' 

export const ThemeContext = createContext()

function GlobalStyles({ mode }) {
  const isDarkMode = mode === 'dark';
  return (
    <style>{`
      :root {
        --border-color:       ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
        --bg-card:            ${isDarkMode ? '#1a1a22' : '#ffffff'};
        --bg-page:            ${isDarkMode ? '#0a0a0f' : '#F7F9FC'};
        --bg-header:          ${isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6'};
        --text-primary:       ${isDarkMode ? '#ffffff' : '#111827'};
        --text-secondary:     ${isDarkMode ? 'rgba(255,255,255,0.6)' : '#4B5563'};
        --text-tertiary:      ${isDarkMode ? 'rgba(255,255,255,0.4)' : '#6B7280'};
        --active-color:       ${isDarkMode ? '#ff2d55' : '#8B0000'};
        --active-color-hover: ${isDarkMode ? '#d01e40' : '#6B0000'};
        --active-bg:          ${isDarkMode ? 'rgba(255,45,85,0.15)' : '#FFF5F5'};
        --input-border:       ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.23)'};
        --input-bg:           ${isDarkMode ? 'rgba(255,255,255,0.04)' : '#ffffff'};
        --sidebar-bg:         ${isDarkMode ? '#111118' : '#ffffff'};
        --topbar-bg:          ${isDarkMode ? 'rgba(17,17,24,0.85)' : 'rgba(255,255,255,0.92)'};
      }
      body {
        background-color: var(--bg-page);
        color: var(--text-primary);
      }
    `}</style>
  );
}

function ThemeWrapper({ children, globalColorMode }) {
  const location = useLocation()
  const effectiveMode = globalColorMode.mode

  const effectiveColorMode = useMemo(() => ({
    ...globalColorMode,
    mode: effectiveMode
  }), [globalColorMode, effectiveMode])

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: effectiveMode,
          primary: { main: effectiveMode === 'dark' ? '#ff2d55' : '#8B0000' },
        },
      }),
    [effectiveMode],
  )

  return (
    <ThemeContext.Provider value={effectiveColorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles mode={effectiveMode} />
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  )
}

function App() {
  const [mode, setMode] = useState(() => localStorage.getItem('atlas_theme_mode') || 'light')

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => {
          const newMode = prevMode === 'light' ? 'dark' : 'light'
          localStorage.setItem('atlas_theme_mode', newMode)
          return newMode
        })
      },
      mode,
    }),
    [mode],
  )

  return (
    <BrowserRouter>
      <ThemeWrapper globalColorMode={colorMode}>
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

        <Route
          path={ROUTES.BILLING}
          element={
            <ProtectedRoute>
              <BillingPage />
            </ProtectedRoute>
          }
        />

        {/* 3. Optional: Redirect unknown routes back to the landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ThemeWrapper>
    </BrowserRouter>
  )
}

export default App