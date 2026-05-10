// src/hooks/useRoleRedirect.js
// After login, redirect user to the correct dashboard based on their role.

import { useNavigate } from 'react-router-dom'
import { useAuth }     from '../store/authStore'
import { ROUTES }      from '../config/routes'
import { getDashboardRoute } from '../utils'

export default function useRoleRedirect() {
  const navigate    = useNavigate()
  const { user }    = useAuth()

  function redirectToDashboard(role) {
    const target = getDashboardRoute(role) || ROUTES.SIGN_IN
    navigate(target, { replace: true })
  }

  function redirectCurrentUser() {
    if (user?.role) redirectToDashboard(user.role)
  }

  return { redirectToDashboard, redirectCurrentUser }
}