// src/config/api.js
// Central Axios instance — all API calls go through here.
// Local: Vite proxy forwards /api/* → Django (localhost:8000).
// Render: set VITE_API_URL=https://your-backend.onrender.com/api at build time.

import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,    // send cookies (CSRF) with every request
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,           // 30s — LLM calls can be slow
})

// ── Request interceptor: attach JWT access token ──────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('atlas_access_token')
    if (token) {
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

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const refreshToken = localStorage.getItem('atlas_refresh_token')
        const { data } = await axios.post(`${API_BASE}/auth/token/refresh/`, {
          refresh: refreshToken,
        })
        localStorage.setItem('atlas_access_token', data.access)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return api(originalRequest)
      } catch (_) {
        // Refresh failed — clear tokens and redirect to login
        localStorage.removeItem('atlas_access_token')
        localStorage.removeItem('atlas_refresh_token')
        window.location.href = '/signin'
      }
    }
    return Promise.reject(error)
  }
)

export default api
