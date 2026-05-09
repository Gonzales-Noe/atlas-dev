// src/hooks/useApi.js
// Generic data-fetching hook with loading/error state.

import { useState, useEffect, useCallback } from 'react'
import api from '../config/api'

export default function useApi(url, { method = 'GET', immediate = true, deps = [] } = {}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(immediate)
  const [error,   setError]   = useState(null)

  const execute = useCallback(async (payload) => {
    setLoading(true)
    setError(null)
    try {
      const response = method === 'GET'
        ? await api.get(url)
        : await api[method.toLowerCase()](url, payload)
      setData(response.data)
      return response.data
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Request failed.'
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [url, method])

  useEffect(() => {
    if (immediate && method === 'GET') execute()
  }, [url, ...deps])

  return { data, loading, error, execute, setData }
}