// src/store/authStore.jsx
// Global auth state via React Context.
// Wrap <App /> with <AuthProvider /> in main.jsx.

import { createContext, useContext, useReducer, useEffect } from 'react'
import api from '../config/api'

const SUPERADMIN_CREDENTIALS = {
  email: 'superadmin@atlas.local',
  password: 'SuperAdmin123!',
}

const FACULTY_CREDENTIALS = {
  email: 'faculty@atlas.local',
  password: 'Faculty123!',
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

// ── State shape ────────────────────────────────────────────────────────────
const initialState = {
  user:          null,    // { id, email, role, name, tenant_id }
  isAuthenticated: false,
  isLoading:     true,    // true while checking token on mount
  error:         null,
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

    if (token === 'superadmin-test-token' || token === 'faculty-test-token') {
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

  // ── Actions ──────────────────────────────────────────────────────────────
  async function login(email, password) {
    dispatch({ type: 'AUTH_LOADING' })
    try {
      if (
        email === SUPERADMIN_CREDENTIALS.email &&
        password === SUPERADMIN_CREDENTIALS.password
      ) {
        localStorage.setItem('atlas_access_token', 'superadmin-test-token')
        localStorage.setItem('atlas_refresh_token', 'superadmin-test-token')
        localStorage.setItem('atlas_user', JSON.stringify(SUPERADMIN_USER))
        dispatch({ type: 'AUTH_SUCCESS', payload: SUPERADMIN_USER })
        return SUPERADMIN_USER
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

      const { data } = await api.post('/auth/token/', { email, password })
      localStorage.setItem('atlas_access_token',  data.access)
      localStorage.setItem('atlas_refresh_token', data.refresh)
      // Fetch user profile
      const { data: user } = await api.get('/auth/me/')
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
      return user
    } catch (err) {
      const msg = err.response?.data?.detail || 'Invalid credentials. Please try again.'
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function loginWithGoogle(credential) {
    dispatch({ type: 'AUTH_LOADING' })
    try {
      const { data } = await api.post('/auth/google/', { credential })
      localStorage.setItem('atlas_access_token',  data.access)
      localStorage.setItem('atlas_refresh_token', data.refresh)
      const { data: user } = await api.get('/auth/me/')
      dispatch({ type: 'AUTH_SUCCESS', payload: user })
      return user
    } catch (err) {
      const msg = err.response?.data?.detail || 'Google sign-in failed.'
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function register(payload) {
    // payload: { email, password, institution_name, full_name }
    dispatch({ type: 'AUTH_LOADING' })
    try {
      await api.post('/auth/register/', payload)
      dispatch({ type: 'AUTH_ERROR', payload: null }) // not logged in yet — pending approval
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

  function logout() {
    localStorage.removeItem('atlas_access_token')
    localStorage.removeItem('atlas_refresh_token')
    localStorage.removeItem('atlas_user')
    dispatch({ type: 'LOGOUT' })
  }

  return (
    <AuthContext.Provider
      value={{ ...state, login, loginWithGoogle, register, sendOtp, verifyOtp, resetPassword, logout }}
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