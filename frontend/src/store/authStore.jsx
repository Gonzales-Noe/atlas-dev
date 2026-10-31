// src/store/authStore.jsx
// Global auth state via React Context.
// Wrap <App /> with <AuthProvider /> in main.jsx.

import { createContext, useContext, useReducer, useEffect, useMemo, useRef, useState } from 'react'
import api, { beginCredentialLogin, isDemoToken } from '../config/api'
import {
  IDLE_MS,
  IDLE_WARNING_MS,
  clearBrowserSession,
  getAccessToken,
  idleForMs,
  markSharedActivity,
  readCachedUser,
  requestSessionHandoff,
  revokeServerSession,
  sessionIsIdle,
  SESSION_NOTICES,
  writeCachedUser,
  writeSession,
  forceSignOut,
} from '../config/session'

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

  // A closed tab has no session. An open tab on this browser can hand its session over.
  useEffect(() => {
    let cancelled = false

    async function restore() {
      let token = getAccessToken()
      if (!token) {
        await requestSessionHandoff()
        token = getAccessToken()
      }
      if (cancelled) return
      if (!token) {
        dispatch({ type: 'AUTH_ERROR', payload: null })
        return
      }
      if (sessionIsIdle()) {
        forceSignOut('session_idle')
        dispatch({ type: 'LOGOUT' })
        return
      }
      if (isDemoToken(token)) {
        const savedUser = readCachedUser()
        if (savedUser) dispatch({ type: 'AUTH_SUCCESS', payload: savedUser })
        else dispatch({ type: 'AUTH_ERROR', payload: null })
        return
      }
      try {
        const { data } = await api.get('/auth/me/')
        if (cancelled) return
        writeCachedUser(data)
        dispatch({ type: 'AUTH_SUCCESS', payload: data })
      } catch {
        if (cancelled) return
        clearBrowserSession()
        dispatch({ type: 'AUTH_ERROR', payload: null })
      }
    }

    restore()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function onSync() {
      const user = readCachedUser()
      if (user) dispatch({ type: 'AUTH_SUCCESS', payload: user })
    }
    function onRemoteLogout() {
      dispatch({ type: 'LOGOUT' })
    }
    window.addEventListener('atlas-session-sync', onSync)
    window.addEventListener('atlas-session-logout', onRemoteLogout)
    return () => {
      window.removeEventListener('atlas-session-sync', onSync)
      window.removeEventListener('atlas-session-logout', onRemoteLogout)
    }
  }, [])

  function finishLogin(data) {
    writeSession({
      access: data.access,
      refresh: data.refresh,
      user: data.user || undefined,
    })
    return data.user
  }

  async function profileFor(data) {
    const bundled = finishLogin(data)
    if (bundled?.role) return bundled
    const { data: user } = await api.get('/auth/me/')
    writeCachedUser(user)
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
          writeSession({
            access: 'superadmin-test-token',
            refresh: 'superadmin-test-token',
            user: SUPERADMIN_USER,
          })
          dispatch({ type: 'AUTH_SUCCESS', payload: SUPERADMIN_USER })
          return SUPERADMIN_USER
        }
      }

      if (
        email === FACULTY_CREDENTIALS.email &&
        password === FACULTY_CREDENTIALS.password
      ) {
        writeSession({
          access: 'faculty-test-token',
          refresh: 'faculty-test-token',
          user: FACULTY_USER,
        })
        dispatch({ type: 'AUTH_SUCCESS', payload: FACULTY_USER })
        return FACULTY_USER
      }

      if (
        email === ADMIN_CREDENTIALS.email &&
        password === ADMIN_CREDENTIALS.password
      ) {
        writeSession({
          access: 'admin-test-token',
          refresh: 'admin-test-token',
          user: ADMIN_USER,
        })
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
        writeSession({
          access: data.access,
          refresh: data.refresh,
          user: data.user,
        })
        dispatch({ type: 'AUTH_SUCCESS', payload: data.user })
      } else {
        dispatch({ type: 'AUTH_ERROR', payload: null })
      }
      return data.user
    } catch (err) {
      const data = err.response?.data || {}
      const passwordError = Array.isArray(data.password) ? data.password[0] : data.password
      const institutionError = Array.isArray(data.institution_name) ? data.institution_name[0] : data.institution_name
      const msg = institutionError
        || passwordError
        || data.email?.[0]
        || data.detail
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
    writeCachedUser(data)
    dispatch({ type: 'AUTH_SUCCESS', payload: data })
    return data
  }

  function logout(reason) {
    const code = typeof reason === 'string' ? reason : ''
    revokeServerSession()
    clearBrowserSession({
      broadcast: true,
      notice: code ? (SESSION_NOTICES[code] || '') : '',
    })
    dispatch({ type: 'LOGOUT' })
    if (code) window.location.assign('/signin')
  }

  const actionsRef = useRef(null)
  actionsRef.current = { login, loginWithGoogle, register, sendOtp, verifyOtp, resetPassword, updateProfile, logout }
  const actions = useMemo(() => ({
    login: (...args) => actionsRef.current.login(...args),
    loginWithGoogle: (...args) => actionsRef.current.loginWithGoogle(...args),
    register: (...args) => actionsRef.current.register(...args),
    sendOtp: (...args) => actionsRef.current.sendOtp(...args),
    verifyOtp: (...args) => actionsRef.current.verifyOtp(...args),
    resetPassword: (...args) => actionsRef.current.resetPassword(...args),
    updateProfile: (...args) => actionsRef.current.updateProfile(...args),
    logout: (...args) => actionsRef.current.logout(...args),
  }), [])
  const value = useMemo(
    () => ({ ...state, ...actions }),
    [state, actions],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionWatch enabled={state.isAuthenticated} onSignOut={actions.logout} />
    </AuthContext.Provider>
  )
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function SessionWatch({ enabled, onSignOut }) {
  const [remainingMs, setRemainingMs] = useState(IDLE_MS)
  const warning = enabled && remainingMs <= IDLE_WARNING_MS
  const warningRef = useRef(warning)
  warningRef.current = warning
  const lastBeat = useRef(0)

  useEffect(() => {
    if (!enabled) return undefined
    setRemainingMs(Math.max(0, IDLE_MS - idleForMs()))

    const soft = new Set(['mousemove', 'scroll', 'touchmove', 'pointermove'])
    const onActivity = (event) => {
      if (warningRef.current && soft.has(event.type)) return
      markSharedActivity()
      const now = Date.now()
      if (now - lastBeat.current < 60000) return
      if (isDemoToken(getAccessToken())) return
      lastBeat.current = now
      api.post('/auth/activity/', {}).catch(() => {})
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'pointerdown', 'mousemove', 'scroll']
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }))

    const signedOut = { current: false }
    const tick = window.setInterval(() => {
      const remaining = IDLE_MS - idleForMs()
      setRemainingMs(remaining)
      if (remaining <= 0 && !signedOut.current) {
        signedOut.current = true
        onSignOut('session_idle')
      }
    }, 1000)

    const probe = () => {
      if (isDemoToken(getAccessToken())) return
      api.get('/auth/me/', { atlasCache: false }).catch(() => {})
    }
    const firstProbe = window.setTimeout(probe, 3000)
    const probeTimer = window.setInterval(probe, 60000)

    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }))
      window.clearInterval(tick)
      window.clearTimeout(firstProbe)
      window.clearInterval(probeTimer)
    }
  }, [enabled, onSignOut])

  if (!warning) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="atlas-idle-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(8, 8, 10, 0.62)',
      }}
    >
      <div style={{
        width: 'min(440px, 100%)',
        background: 'var(--bg-elevated, #fff)',
        color: 'var(--text-primary, #1A1A1A)',
        borderRadius: 16,
        padding: '1.5rem',
        boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
      }}>
        <h2 id="atlas-idle-title" style={{ margin: '0 0 0.5rem', fontSize: '1.15rem' }}>
          Still there?
        </h2>
        <p style={{ margin: '0 0 1.25rem', lineHeight: 1.5, color: 'var(--text-secondary, rgba(0,0,0,0.7))' }}>
          This page has been idle. ATLAS will sign you out in {formatRemaining(remainingMs)} to protect grades and course records.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onSignOut('session_ended')}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color, rgba(0,0,0,0.16))',
              borderRadius: 10,
              padding: '0.6rem 0.9rem',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            Sign out
          </button>
          <button
            type="button"
            onClick={() => {
              markSharedActivity()
              lastBeat.current = 0
              setRemainingMs(IDLE_MS)
              if (!isDemoToken(getAccessToken())) {
                api.post('/auth/activity/', {}).catch(() => {})
              }
            }}
            style={{
              background: 'var(--brand-primary, #AA2423)',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '0.6rem 0.9rem',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}