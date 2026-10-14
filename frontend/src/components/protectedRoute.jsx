// src/components/ProtectedRoute.jsx
// Wraps routes that require authentication and/or specific roles.
// Usage:
//   <ProtectedRoute>               — just needs login
//   <ProtectedRoute role="admin">  — needs admin role

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth }     from '../store/authStore'
import { ROUTES }      from '../config/route'
import LoadingState from './LoadingState'

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <LoadingState fullScreen label="Restoring your session..." />
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.SIGN_IN} state={{ from: location }} replace />
  }

  const applicationNeedsBilling = user?.role === 'admin'
    && user?.institution_application_status
    && user.institution_application_status !== 'active'
  const institutionAccessExpired = user?.role !== 'superadmin'
    && user?.institution_access_active === false
  if (
    (applicationNeedsBilling || institutionAccessExpired)
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