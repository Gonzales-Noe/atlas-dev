// src/components/ProtectedRoute.jsx
// Wraps routes that require authentication and/or specific roles.
// Usage:
//   <ProtectedRoute>               — just needs login
//   <ProtectedRoute role="admin">  — needs admin role

import { Navigate, useLocation } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import Box             from '@mui/material/Box'
import { useAuth }     from '../store/authStore'
import { ROUTES }      from '../config/routes'
import { getDashboardRoute, normalizeRole } from '../utils'

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
        }}
      >
        <CircularProgress sx={{ color: '#8B0000' }} />
      </Box>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />
  }

  if (role && normalizeRole(user?.role) !== normalizeRole(role)) {
    // Redirect to their correct dashboard
    return <Navigate to={getDashboardRoute(user?.role) || ROUTES.SIGN_IN} replace />
  }

  return children
}