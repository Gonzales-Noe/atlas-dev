// src/config/api.js
// Central Axios instance — all API calls go through here.
// Local: Vite proxy forwards /api/* → Django (localhost:8000).
// VPS (Hostinger): prefer VITE_API_URL=/api (same origin via nginx).
// Avoid baking a Render URL into production builds.

import axios from 'axios'
import { reportServerError } from '../components/AtlasErrorHost'

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

const GET_CACHE_TTL_MS = 12000
const GET_CACHE_LIMIT = 40
const getResponseCache = new Map()

const GET_CACHE_SKIP = [
  '/auth/token',
  '/auth/google',
  '/auth/password-reset',
  '/grading/jobs',
  '/integrations/traffic',
  '/integrations/llm-health',
  '/integrations/rag-documents',
]

function requestPath(config) {
  return `${config?.url || ''}`
}

function shouldCacheGet(config) {
  if (!config || config.atlasCache === false) return false
  const method = (config.method || 'get').toLowerCase()
  if (method !== 'get') return false
  if (config.responseType && config.responseType !== 'json') return false
  const path = requestPath(config)
  return !GET_CACHE_SKIP.some((part) => path.includes(part))
}

function getCacheKey(config) {
  const auth = config.headers?.Authorization || config.headers?.authorization || ''
  const params = config.params ? JSON.stringify(config.params) : ''
  return `${config.baseURL || ''}${config.url || ''}|${params}|${auth}`
}

function readGetCache(config) {
  if (!shouldCacheGet(config)) return null
  const key = getCacheKey(config)
  const hit = getResponseCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > GET_CACHE_TTL_MS) {
    getResponseCache.delete(key)
    return null
  }
  return hit
}

function storeGetCache(config, data, status) {
  if (!shouldCacheGet(config)) return
  try {
    if (JSON.stringify(data).length > 100000) return
  } catch {
    return
  }
  const key = getCacheKey(config)
  if (getResponseCache.has(key)) getResponseCache.delete(key)
  getResponseCache.set(key, { at: Date.now(), data, status })
  while (getResponseCache.size > GET_CACHE_LIMIT) {
    const oldest = getResponseCache.keys().next().value
    getResponseCache.delete(oldest)
  }
}

function clearGetCache() {
  getResponseCache.clear()
}

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
    const cached = readGetCache(config)
    if (cached) {
      config.adapter = async () => ({
        data: cached.data,
        status: cached.status,
        statusText: 'OK',
        headers: {},
        config,
        request: null,
      })
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle 401 → refresh token ─────────────────────
api.interceptors.response.use(
  (response) => {
    const method = (response.config?.method || 'get').toLowerCase()
    if (method === 'get') storeGetCache(response.config, response.data, response.status)
    else clearGetCache()
    return response
  },
  async (error) => {
    reportServerError(error)
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
