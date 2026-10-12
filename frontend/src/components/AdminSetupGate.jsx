// src/components/AdminSetupGate.jsx
// Blocks an institution admin from reaching any other module until the
// first-time setup wizard has been completed.

import { useCallback, useEffect, useState } from 'react'
import { Alert, Box, CircularProgress } from '@mui/material'

import { useAuth } from '../store/authStore'
import AdminSetupWizard from '../features/roles/Admin/AdminSetupWizard'
import { fetchSetupStatus } from '../features/roles/Admin/academicApi'

const DONE_KEY = 'atlas_setup_completed'

function flagDone(value) {
  try {
    if (value) localStorage.setItem(DONE_KEY, '1')
    else localStorage.removeItem(DONE_KEY)
  } catch {
    // Storage unavailable — the server-side flag remains the source of truth.
  }
}

function toMessage(err, fallback) {
  const data = err?.response?.data
  if (typeof data === 'string') return data
  if (typeof data?.detail === 'string') return data.detail
  return fallback
}

export default function AdminSetupGate({ children }) {
  const { user } = useAuth()
  const [checking, setChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [statusKnown, setStatusKnown] = useState(false)
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    setChecking(true)
    setError('')
    try {
      const status = await fetchSetupStatus()
      const done = Boolean(status?.setup_completed)
      setNeedsSetup(!done)
      setStatusKnown(true)
      flagDone(done)
    } catch (err) {
      setStatusKnown(false)
      setNeedsSetup(false)
      setError(toMessage(err, 'Could not verify setup status.'))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'admin') {
      setChecking(false)
      setNeedsSetup(false)
      setStatusKnown(true)
      return
    }
    check()
  }, [user, check])

  const handleFinished = useCallback(() => {
    flagDone(true)
    setNeedsSetup(false)
    setStatusKnown(true)
    // Keep the cached user payload in sync so a page refresh skips the wizard.
    try {
      const cached = localStorage.getItem('atlas_user')
      if (cached) {
        const parsed = JSON.parse(cached)
        localStorage.setItem('atlas_user', JSON.stringify({ ...parsed, setup_completed: true }))
      }
    } catch {
      // Ignore malformed cache.
    }
  }, [])

  if (user?.role !== 'admin') return children
  if (checking) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page, #0B0B0F)' }}>
        <CircularProgress size={28} sx={{ color: '#FF9F0A' }} />
      </Box>
    )
  }

  if (!statusKnown && error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, background: 'var(--bg-page, #0B0B0F)' }}>
        <Alert
          severity="error"
          action={<button onClick={check} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Retry</button>}
          sx={{ maxWidth: 560 }}
        >
          {error} Admin modules remain locked until setup status can be verified.
        </Alert>
      </Box>
    )
  }

  return (
    <>
      <Box aria-hidden={needsSetup} sx={{ pointerEvents: needsSetup ? 'none' : 'auto', userSelect: needsSetup ? 'none' : 'auto' }}>
        {children}
      </Box>
      <AdminSetupWizard open={needsSetup} onFinished={handleFinished} />
    </>
  )
}
