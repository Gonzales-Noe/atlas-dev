// Reusable auto-dismissing alert with close button.
// Closes itself after 3 seconds or when the user clicks X.
import { useEffect } from 'react'
import Alert from '@mui/material/Alert'

const DURATION = 3000

export default function AutoAlert({ message, severity = 'error', onClose, sx }) {
  useEffect(() => {
    if (!message) return undefined
    const t = setTimeout(onClose, DURATION)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null

  return (
    <Alert severity={severity} onClose={onClose} sx={sx}>
      {message}
    </Alert>
  )
}
