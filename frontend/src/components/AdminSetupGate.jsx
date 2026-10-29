// src/components/AdminSetupGate.jsx
// Blocks an institution admin from reaching any other module until the
// first-time setup wizard has been completed.

import { useCallback, useEffect, useState } from 'react'
import { Box } from '@mui/material'

import { useAuth } from '../store/authStore'
import AdminSetupWizard from '../features/roles/Admin/AdminSetupWizard'
import { fetchSetupStatus } from '../features/roles/Admin/academicApi'
import LoadingState from './LoadingState'
import AtlasErrorCard, { plainServerMessage } from './AtlasErrorCard'

const SETUP_MESSAGE = 'ATLAS could not check whether your school setup is finished. Try again in a moment.'

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
      setError(plainServerMessage(err, SETUP_MESSAGE))
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
        <AtlasErrorCard message={error} onRetry={check} />
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
