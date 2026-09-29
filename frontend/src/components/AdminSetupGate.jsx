// src/components/AdminSetupGate.jsx
// Blocks an institution admin from reaching any other module until the
// first-time setup wizard has been completed. The wizard itself is
// non-dismissable, so the admin has to finish the academic structure first.

import { useCallback, useEffect, useState } from 'react'
import { Alert, Box } from '@mui/material'

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
  const [needsSetup, setNeedsSetup] = useState(false)
  const [statusKnown, setStatusKnown] = useState(false)
  const [error, setError] = useState('')

  const check = useCallback(async () => {
    setError('')
    try {
      const status = await fetchSetupStatus()
      const done = Boolean(status?.setup_completed)
      setNeedsSetup(!done)
      setStatusKnown(true)
      flagDone(done)
    } catch (err) {
      // Never trap the admin because the status call failed. Only block when the
      // server has positively told us setup is incomplete.
      setStatusKnown(false)
      setNeedsSetup(false)
      setError(toMessage(err, 'Could not verify setup status. Other modules stay available until this succeeds.'))
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'admin') {
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

  // No gate-level loader on purpose. AdminLayout is remounted by every admin
  // page, so any loading state here flashed a full-screen backdrop on each
  // sidebar click. The pages render straight away and show their own in-page
  // loading state instead.
  return (
    <>
      {!statusKnown && error && (
        <Alert
          severity="warning"
          action={<button onClick={check} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Retry</button>}
          sx={{ mb: 2, mx: 2 }}
        >
          {error}
        </Alert>
      )}

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
