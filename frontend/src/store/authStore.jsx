// src/store/authStore.jsx
// Global auth state via React Context.
// Wrap <App /> with <AuthProvider /> in main.jsx.

import { createContext, useContext, useReducer, useEffect } from 'react'
import api, { beginCredentialLogin } from '../config/api'

const SUPERADMIN_CREDENTIALS = {
  email: 'superadmin@atlas.local',
  password: 'SuperAdmin123!',
}

const FACULTY_CREDENTIALS = {
  email: 'faculty@atlas.local',
  password: 'Faculty123!',
}

const ADMIN_CREDENTIALS = {
  email: 'admin@atlas.local',
  password: 'Admin123!',
}

const SUPERADMIN_USER = {
  id: 'superadmin',
  email: 'superadmin@atlas.local',
  role: 'superadmin',
  name: 'ATLAS Super Admin',
  tenant_id: null,
}

const FACULTY_USER = {
  id: 'faculty',
  email: 'faculty@atlas.local',
  role: 'faculty',
  name: 'ATLAS Faculty',
  tenant_id: 'faculty-01',
}

const ADMIN_USER = {
  id: 'admin',
  email: 'admin@atlas.local',
  role: 'admin',
  name: 'Institutional Admin',
  tenant_id: 'institution-01',
}

// ── State shape ────────────────────────────────────────────────────────────
const initialState = {
  user:          null,    // { id, email, role, name, tenant_id }
  isAuthenticated: false,
  isLoading:     true,    // true while checking token on mount
  error:         null,
}

function readDetail(detail) {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    const text = detail
      .map((item) => (typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .join(' ')
    if (text) return text
  }
  return null
}

function getAuthErrorMessage(err, fallback) {
  const status = err.response?.status
  const data = err.response?.data && typeof err.response.data === 'object' ? err.response.data : null
  const authMessage = readDetail(data?.detail)
    || (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(' ') : null)

  if (!err.response) {
    return 'Unable to contact the authentication server. Check your network or try again later.'
  }

  if (status === 401) {
    return authMessage || 'Incorrect email or password. Please try again.'
  }

  if (status === 403) {
    return authMessage || 'Your account is not authorized to sign in yet.'
  }

  if (status === 400) {
    return authMessage || 'Login request is missing required information. Please check your email and password.'
  }

  if (status >= 500) {
    return authMessage || 'Authentication service is unavailable. Please try again later.'
  }

  return authMessage || fallback
}

// ── Reducer ────────────────────────────────────────────────────────────────
function authReducer(state, action) {
  switch (action.type) {
    case 'AUTH_LOADING':
      return { ...state, isLoading: true, error: null }

    case 'AUTH_SUCCESS':
      return {
        ...state,
        user:            action.payload,
        isAuthenticated: true,
        isLoading:       false,
        error:           null,
      }

    case 'AUTH_ERROR':
      return {
        ...state,
        user:            null,
        isAuthenticated: false,
        isLoading:       false,
        error:           action.payload,
      }

    case 'LOGOUT':
      return { ...initialState, isLoading: false }

    default:
      return state
  }
}

// ── Context ────────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Check existing token on app load
  useEffect(() => {
    const token = localStorage.getItem('atlas_access_token')
    if (!token) {
      dispatch({ type: 'AUTH_ERROR', payload: null })
      return
    }

    if (token === 'superadmin-test-token' || token === 'faculty-test-token' || token === 'admin-test-token') {
      const savedUser = localStorage.getItem('atlas_user')
      if (savedUser) {
        dispatch({ type: 'AUTH_SUCCESS', payload: JSON.parse(savedUser) })
        return
      }
    }

    api.get('/auth/me/')
      .then(({ data }) => dispatch({ type: 'AUTH_SUCCESS', payload: data }))
      .catch(() => {
        localStorage.removeItem('atlas_access_token')
        localStorage.removeItem('atlas_refresh_token')
        localStorage.removeItem('atlas_user')
        dispatch({ type: 'AUTH_ERROR', payload: null })
      })
  }, [])

  function finishLogin(data) {
    localStorage.setItem('atlas_access_token', data.access)
    localStorage.setItem('atlas_refresh_token', data.refresh)
    const user = data.user
    if (user) localStorage.setItem('atlas_user', JSON.stringify(user))
    return user
  }

  async function profileFor(data) {
    const bundled = finishLogin(data)
    if (bundled?.role) return bundled
    const { data: user } = await api.get('/auth/me/')
    localStorage.setItem('atlas_user', JSON.stringify(user))
    return user
  }

  // ── Actions ──────────────────────────────────────────────────────────────
  async function login(email, password) {
    dispatch({ type: 'AUTH_LOADING' })
    beginCredentialLogin()
    try {
      if (
        email === SUPERADMIN_CREDENTIALS.email &&
        password === SUPERADMIN_CREDENTIALS.password
      ) {
        try {
          const { data } = await api.post('/auth/token/', { email, password })
          const user = await profileFor(data)
          dispatch({ type: 'AUTH_SUCCESS', payload: user })
          return user
        } catch {
          // Keep the local demo account usable when the backend is offline.
          localStorage.setItem('atlas_access_token', 'superadmin-test-token')
          localStorage.setItem('atlas_refresh_token', 'superadmin-test-token')
          localStorage.setItem('atlas_user', JSON.stringify(SUPERADMIN_USER))
          dispatch({ type: 'AUTH_SUCCESS', payload: SUPERADMIN_USER })
          return SUPERADMIN_USER
        }
      }

      if (
        email === FACULTY_CREDENTIALS.email &&
        password === FACULTY_CREDENTIALS.password
      ) {
        localStorage.setItem('atlas_access_token', 'faculty-test-token')
        localStorage.setItem('atlas_refresh_token', 'faculty-test-token')
        localStorage.setItem('atlas_user', JSON.stringify(FACULTY_USER))
        dispatch({ type: 'AUTH_SUCCESS', payload: FACULTY_USER })
        return FACULTY_USER
      }

      if (
        email === ADMIN_CREDENTIALS.email &&
        password === ADMIN_CREDENTIALS.password
      ) {
        localStorage.setItem('atlas_access_token', 'admin-test-token')
        localStorage.setItem('atlas_refresh_token', 'admin-test-token')
        localStorage.setItem('atlas_user', JSON.stringify(ADMIN_USER))
        dispatch({ type: 'AUTH_SUCCESS', payload: ADMIN_USER })
        return ADMIN_USER
      }

      // For real database authentication. The token response already
      // includes the profile, so sign-in does not depend on a second call
      // that can fail after the previous session expired.
      const { data } = await api.post('/auth/token/', { email, password })
      const user = await profileFor(data)
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
      return user
    } catch (err) {
      const msg = getAuthErrorMessage(err, 'Login failed. Please try again.')
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function loginWithGoogle(credential) {
    dispatch({ type: 'AUTH_LOADING' })
    beginCredentialLogin()
    try {
      const { data } = await api.post('/auth/google/', { credential })
      if (data.user_exists === false) {
        const msg = 'No ATLAS account exists for this Google email. Sign in with email, or ask an admin to create your account.'
        dispatch({ type: 'AUTH_ERROR', payload: msg })
        throw new Error(msg)
      }
      const user = await profileFor(data)
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
      return user
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Google sign-in failed.'
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function register(payload) {
    // payload: { email, password, institution_name, full_name }
    dispatch({ type: 'AUTH_LOADING' })
    try {
      const { data } = await api.post('/auth/register/', {
        email: payload.email,
        password: payload.password,
        institution_name: payload.institution_name,
        full_name: payload.full_name,
        selected_plan: localStorage.getItem('atlas_selected_plan') || '',
        role: 'faculty',
      })
      if (data.access && data.refresh) {
        localStorage.setItem('atlas_access_token', data.access)
        localStorage.setItem('atlas_refresh_token', data.refresh)
        localStorage.setItem('atlas_user', JSON.stringify(data.user))
        dispatch({ type: 'AUTH_SUCCESS', payload: data.user })
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: null })
      }
      return data.user
    } catch (err) {
      const msg = err.response?.data?.email?.[0]
        || err.response?.data?.detail
        || 'Registration failed.'
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function sendOtp(email) {
    await api.post('/auth/password-reset/request/', { email })
  }

  async function verifyOtp(email, otp) {
    const { data } = await api.post('/auth/password-reset/verify/', { email, otp })
    return data.reset_token  // use this token to set new password
  }

  async function resetPassword(resetToken, newPassword) {
    await api.post('/auth/password-reset/confirm/', {
      reset_token: resetToken,
      new_password: newPassword,
    })
  }

  async function updateProfile(payload) {
    const { data } = await api.patch('/auth/me/', payload)
    localStorage.setItem('atlas_user', JSON.stringify(data))
    dispatch({ type: 'AUTH_SUCCESS', payload: data })
    return data
  }

  function logout() {
    localStorage.removeItem('atlas_access_token')
    localStorage.removeItem('atlas_refresh_token')
    localStorage.removeItem('atlas_user')
    dispatch({ type: 'LOGOUT' })
  }

  return (
    <AuthContext.Provider
      value={{ ...state, login, loginWithGoogle, register, sendOtp, verifyOtp, resetPassword, updateProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}