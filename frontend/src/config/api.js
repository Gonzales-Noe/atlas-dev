// src/config/api.js
// Central Axios instance — all API calls go through here.
// Local: Vite proxy forwards /api/* → Django (localhost:8000).
// VPS (Hostinger): prefer VITE_API_URL=/api (same origin via nginx).
// Avoid baking a Render URL into production builds.

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const PUBLIC_AUTH_PATHS = [
  '/auth/token/',
  '/auth/google/',
  '/auth/register/',
  '/auth/password-reset/',
]

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,    // send cookies (CSRF) with every request
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 300000,          // 5 min — LLM generation can be slow
})

let sessionGeneration = 0
let refreshPromise = null

function requestUrl(config) {
  return `${config?.baseURL || ''}${config?.url || ''}`
}

function isPublicAuthRequest(config) {
  const url = requestUrl(config)
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path))
}

function isDemoToken(token) {
  return typeof token === 'string' && token.endsWith('-test-token')
}

export function beginCredentialLogin() {
  // Ignore refresh failures that started before this sign-in attempt.
  sessionGeneration += 1
  localStorage.removeItem('atlas_access_token')
  localStorage.removeItem('atlas_refresh_token')
  localStorage.removeItem('atlas_user')
}

function clearSessionAndRedirect(generation) {
  if (generation !== sessionGeneration) return
  localStorage.removeItem('atlas_access_token')
  localStorage.removeItem('atlas_refresh_token')
  localStorage.removeItem('atlas_user')
  if (window.location.pathname === '/signin') return
  window.location.assign('/signin')
}

function refreshAccessToken() {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem('atlas_refresh_token')
    refreshPromise = axios.post(`${API_BASE}/auth/token/refresh/`, {
      refresh: refreshToken,
    }, { timeout: 20000 })
      .then(({ data }) => {
        localStorage.setItem('atlas_access_token', data.access)
        if (data.refresh) localStorage.setItem('atlas_refresh_token', data.refresh)
        return data.access
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

// ── Request interceptor: attach JWT access token ──────────────────────────
api.interceptors.request.use(
  (config) => {
    if (isPublicAuthRequest(config)) {
      if (config.headers) delete config.headers.Authorization
      return config
    }
    const token = localStorage.getItem('atlas_access_token')
    if (token && !isDemoToken(token)) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle 401 → refresh token ─────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (
      error.response?.status !== 401
      || !originalRequest
      || originalRequest._retry
      || isPublicAuthRequest(originalRequest)
    ) {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem('atlas_refresh_token')
    if (!refreshToken || isDemoToken(refreshToken)) {
      return Promise.reject(error)
    }

    originalRequest._retry = true
    const generation = sessionGeneration
    try {
      const access = await refreshAccessToken()
      if (generation !== sessionGeneration) return Promise.reject(error)
      originalRequest.headers = originalRequest.headers || {}
      originalRequest.headers.Authorization = `Bearer ${access}`
      return api(originalRequest)
    } catch (_) {
      clearSessionAndRedirect(generation)
      return Promise.reject(error)
    }
  }
)

export default api
