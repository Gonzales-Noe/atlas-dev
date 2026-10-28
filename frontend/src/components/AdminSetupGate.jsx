// src/components/AdminSetupGate.jsx
// Blocks an institution admin from reaching any other module until the
// first-time setup wizard has been completed.

import { useCallback, useEffect, useState } from 'react'
import { Alert, Box } from '@mui/material'

import { useAuth } from '../store/authStore'
import AdminSetupWizard from '../features/roles/Admin/AdminSetupWizard'
import { fetchSetupStatus } from '../features/roles/Admin/academicApi'
import LoadingState from './LoadingState'

function toMessage(err, fallback) {
  const status = err?.response?.status
  if (status === 502 || status === 503 || status === 504) {
    return 'The server is still starting. Wait a moment, then retry.'
  }
  const data = err?.response?.data
  if (typeof data === 'string') {
    if (/<\s*html|bad gateway|<\s*title/i.test(data)) {
      return 'The server is still starting. Wait a moment, then retry.'
    }
    return data
  }
  if (typeof data?.detail === 'string') return data.detail
  return fallback
}

export default function AdminSetupGate({ children }) {
  const { user } = useAuth()
  const [checking, setChecking] = useState(
    () => user?.role === 'admin' && user?.setup_completed !== true,
  )
  const [needsSetup, setNeedsSetup] = useState(false)
  const [statusKnown, setStatusKnown] = useState(
    () => user?.role !== 'admin' || user?.setup_completed === true,
  )
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    setChecking(true)
    setError('')
    try {
      const status = await fetchSetupStatus(false)
      const done = Boolean(status?.setup_completed)
      setNeedsSetup(!done)
      setStatusKnown(true)
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

  if (checking && !statusKnown) {
    return <LoadingState fullScreen label="Checking your setup..." />
  }

  if (!statusKnown && error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, background: 'var(--bg-page)' }}>
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
      <Box
        aria-hidden={needsSetup}
        sx={{
          pointerEvents: needsSetup ? 'none' : 'auto',
          userSelect: needsSetup ? 'none' : 'auto',
        }}
      >
        {children}
      </Box>
      <AdminSetupWizard open={needsSetup} onFinished={handleFinished} />
    </>
  )
}
