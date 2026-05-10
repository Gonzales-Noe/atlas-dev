// src/store/authStore.jsx
// Global auth state via React Context.
// Wrap <App /> with <AuthProvider /> in main.jsx.

import { createContext, useContext, useReducer, useEffect } from 'react'
import api from '../config/api'
import { extractApiError, normalizeRole } from '../utils'

function normalizeUser(user) {
  if (!user) return null
  return {
    ...user,
    role: normalizeRole(user.role),
  }
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
    api.get('/users/me/')
      .then(({ data }) => dispatch({ type: 'AUTH_SUCCESS', payload: normalizeUser(data) }))
      .catch(() => {
        localStorage.removeItem('atlas_access_token')
        localStorage.removeItem('atlas_refresh_token')
        dispatch({ type: 'AUTH_ERROR', payload: null })
      })
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────
  async function login(email, password) {
    dispatch({ type: 'AUTH_LOADING' })
    try {
      const { data } = await api.post('/users/token/', { email, password })
      localStorage.setItem('atlas_access_token',  data.access)
      localStorage.setItem('atlas_refresh_token', data.refresh)
      // Fetch user profile
      const { data: user } = await api.get('/users/me/')
      const normalizedUser = normalizeUser(user)
      dispatch({ type: 'AUTH_SUCCESS', payload: normalizedUser })
      return normalizedUser
    } catch (err) {
      const msg = extractApiError(err) || 'Invalid credentials. Please try again.'
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function loginWithGoogle(credential) {
    dispatch({ type: 'AUTH_LOADING' })
    try {
      const { data } = await api.post('/users/google/', { credential })
      localStorage.setItem('atlas_access_token',  data.access)
      localStorage.setItem('atlas_refresh_token', data.refresh)
      const { data: user } = await api.get('/users/me/')
      const normalizedUser = normalizeUser(user)
      dispatch({ type: 'AUTH_SUCCESS', payload: normalizedUser })
      return normalizedUser
    } catch (err) {
      const msg = extractApiError(err) || 'Google sign-in failed.'
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function register(payload) {
    // payload: { email, password, institution_name, full_name }
    dispatch({ type: 'AUTH_LOADING' })
    try {
      await api.post('/users/register/', payload)
      dispatch({ type: 'AUTH_ERROR', payload: null }) // not logged in yet — pending approval
    } catch (err) {
      const msg = extractApiError(err) || 'Registration failed.'
      dispatch({ type: 'AUTH_ERROR', payload: msg })
      throw new Error(msg)
    }
  }

  async function sendOtp(email) {
    await api.post('/users/password-reset/request/', { email })
  }

  async function verifyOtp(email, otp) {
    const { data } = await api.post('/users/password-reset/verify/', { email, otp })
    return data.reset_token  // use this token to set new password
  }

  async function resetPassword(resetToken, newPassword) {
    await api.post('/users/password-reset/confirm/', {
      reset_token: resetToken,
      new_password: newPassword,
    })
  }

  function logout() {
    localStorage.removeItem('atlas_access_token')
    localStorage.removeItem('atlas_refresh_token')
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