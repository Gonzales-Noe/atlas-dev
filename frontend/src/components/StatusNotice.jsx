// Same success and error toast faculty uses: bottom center, closable, gone after 3 seconds.
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

let pushNotice = null

export function showStatusNotice(message, severity = 'error') {
  if (!message) return
  pushNotice?.({ message: String(message), severity, key: Date.now() })
}

export function StatusNotice({ message, severity = 'error' }) {
  useEffect(() => {
    if (message) showStatusNotice(message, severity)
  }, [message, severity])
  return null
}

export default function StatusNoticeHost() {
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    pushNotice = setNotice
    return () => {
      pushNotice = null
    }
  }, [])

  return (
    <Snackbar
      key={notice?.key}
      open={Boolean(notice)}
      autoHideDuration={3000}
      onClose={(_, reason) => { if (reason !== 'clickaway') setNotice(null) }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert
        severity={notice?.severity || 'success'}
        onClose={() => setNotice(null)}
      >
        {notice?.message}
      </Alert>
    </Snackbar>
  )
}
