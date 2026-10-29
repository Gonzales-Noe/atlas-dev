import { useEffect, useState } from 'react'
import { Box } from '@mui/material'

import AtlasErrorCard, { isServerUnavailable, plainServerMessage } from './AtlasErrorCard'

let showServerError = null

export function reportServerError(err) {
  if (!isServerUnavailable(err) || err?.config?.skipAtlasErrorCard) return
  showServerError?.(plainServerMessage(err))
}

export default function AtlasErrorHost() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    showServerError = setMessage
    return () => {
      showServerError = null
    }
  }, [])

  if (!message) return null

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'grid',
        placeItems: 'center',
        p: 3,
        background: 'rgba(8,8,10,0.72)',
      }}
    >
      <AtlasErrorCard message={message} onRetry={() => setMessage('')} />
    </Box>
  )
}
