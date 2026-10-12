// src/components/ProtectedRoute.jsx
// Wraps routes that require authentication and/or specific roles.
// Usage:
//   <ProtectedRoute>               — just needs login
//   <ProtectedRoute role="admin">  — needs admin role

import { Navigate, useLocation } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import Box             from '@mui/material/Box'
import { useAuth }     from '../store/authStore'
import { ROUTES }      from '../config/route'

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    // Reached only on a hard page load or during sign-in, never on navigation,
    // so nothing is mounted yet. No background paint: the page background from
    // index.css shows through, so there is no white/black flash.
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={28} sx={{ color: 'var(--red-mid, #C0392B)' }} />
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />
  }

  let locallyApproved = false
  try {
    locallyApproved = JSON.parse(localStorage.getItem('atlas_signup_application'))?.status === 'active'
  } catch {
    locallyApproved = false
  }

  if (
    user?.role === 'admin'
    && user?.institution_application_status
    && user.institution_application_status !== 'active'
    && !locallyApproved
    && location.pathname !== ROUTES.BILLING
  ) {
    return <Navigate to={ROUTES.BILLING} replace />
  }

  if (role && user?.role !== role) {
    // Redirect to their correct dashboard
    const dashboards = {
      faculty:    ROUTES.FACULTY.DASHBOARD,
      admin:      ROUTES.ADMIN.DASHBOARD,
      superadmin: ROUTES.SUPERADMIN.DASHBOARD,
    }
    return <Navigate to={dashboards[user.role] || ROUTES.SIGN_IN} replace />
  }

  return children
}