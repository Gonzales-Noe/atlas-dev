import { Box, Button, Typography } from '@mui/material'

import atlasMascot from '../assets/atlas.webp'

export const ATLAS_STARTING_MESSAGE = 'Things are still getting ready. Give it a moment, then try again.'

export function plainServerMessage(err, fallback = ATLAS_STARTING_MESSAGE) {
  const status = err?.response?.status
  if (status === 502 || status === 503 || status === 504) return ATLAS_STARTING_MESSAGE
  const data = err?.response?.data
  if (typeof data === 'string' && /<\s*html|bad gateway|<\s*title/i.test(data)) return ATLAS_STARTING_MESSAGE
  if (!err?.response && err?.code !== 'ERR_CANCELED') return ATLAS_STARTING_MESSAGE
  if (typeof data?.detail === 'string' && !/<\s*html/i.test(data.detail)) return data.detail
  return fallback
}

export function isServerUnavailable(err) {
  if (!err || err.code === 'ERR_CANCELED' || err.code === 'ECONNABORTED') return false
  const status = err.response?.status
  if (status === 502 || status === 503 || status === 504) return true
  const data = err.response?.data
  if (typeof data === 'string' && /<\s*html|bad gateway/i.test(data)) return true
  return !err.response && err.code === 'ERR_NETWORK'
}

export default function AtlasErrorCard({
  title = 'ATLAS needs a moment',
  message = ATLAS_STARTING_MESSAGE,
  onRetry,
  retryLabel = 'Try again',
}) {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 560,
        display: 'flex',
        alignItems: 'stretch',
        gap: 2.5,
        flexWrap: 'wrap',
        p: 3,
        borderRadius: 3,
        bgcolor: '#16161E',
        border: '1px solid rgba(226,75,74,0.35)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
      }}
    >
      <Box
        component="img"
        src={atlasMascot}
        alt="ATLAS"
        sx={{ width: 148, height: 'auto', flexShrink: 0, alignSelf: 'center', imageRendering: 'pixelated' }}
      />
      <Box sx={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', position: 'relative', textAlign: 'left' }}>
        <Box sx={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)' }}>
          <Typography sx={{ color: '#E24B4A', fontWeight: 800, fontSize: '1.4rem', mb: 0.75 }}>
            {title}
          </Typography>
          <Typography sx={{ color: '#E5E7EB', fontSize: '1.2rem', lineHeight: 1.5 }}>
            {message}
          </Typography>
        </Box>
        {onRetry ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 'auto', pt: 2 }}>
            <Button
              variant="contained"
              onClick={onRetry}
              sx={{ bgcolor: '#8E1C1B', '&:hover': { bgcolor: '#7C1616' }, textTransform: 'none', fontWeight: 700 }}
            >
              {retryLabel}
            </Button>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
