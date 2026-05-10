import { useMemo, useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import { useAuth } from '../store/authStore'
import useApi from '../hooks/useApi'
import DashboardLayout from './dashboardLayout'
import AutoAlert from './AutoAlert'

const ROLE_THEME = {
  faculty: { accent: '#8B0000', bg: 'linear-gradient(135deg, #fff, #fff7f7)' },
  admin: { accent: '#1565C0', bg: 'linear-gradient(135deg, #fff, #f7fbff)' },
  superadmin: { accent: '#6A1B9A', bg: 'linear-gradient(135deg, #fff, #faf5ff)' },
}

function StatCard({ label, value, accent }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 4, borderColor: 'rgba(0,0,0,0.06)' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Typography variant="caption" sx={{ color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {label}
        </Typography>
        <Typography variant="h4" sx={{ mt: 1, fontWeight: 800, color: accent }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function RoleDashboardPage({ role, fallbackTitle, fallbackSubtitle }) {
  const { user } = useAuth()
  const { data, loading, error, execute } = useApi('/users/dashboard/summary/')

  const theme = ROLE_THEME[role] || ROLE_THEME.faculty
  const navItems = useMemo(() => data?.nav_items || [], [data])
  const cards = data?.cards || []
  const recent = data?.recent || []
  const [errorDismissed, setErrorDismissed] = useState(false)
  useEffect(() => { setErrorDismissed(false) }, [error])

  if (loading && !data) {
    return (
      <DashboardLayout role={role} navItems={[]}>
        <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress sx={{ color: theme.accent }} />
        </Box>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role={role} navItems={navItems}>
      <Box sx={{ display: 'grid', gap: 3 }}>
        {error && !errorDismissed && (
          <AutoAlert
            message={error}
            onClose={() => setErrorDismissed(true)}
            sx={{
              '& .MuiAlert-action': { alignItems: 'center', pt: 0 },
            }}
          />
        )}

        <Card
          sx={{
            borderRadius: 4,
            background: theme.bg,
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
              <Box>
                <Typography variant="h4" sx={{ fontWeight: 800, color: '#1A1A1A' }}>
                  {data?.title || fallbackTitle}
                </Typography>
                <Typography variant="body1" sx={{ color: '#666', mt: 1, maxWidth: 760 }}>
                  {data?.subtitle || fallbackSubtitle}
                </Typography>
              </Box>
              <Chip
                label={user?.role || role}
                sx={{
                  alignSelf: { xs: 'flex-start', md: 'center' },
                  background: `${theme.accent}14`,
                  color: theme.accent,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              />
            </Stack>
          </CardContent>
        </Card>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: `repeat(${Math.min(cards.length || 1, 3)}, minmax(0, 1fr))` } }}>
          {cards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} accent={theme.accent} />
          ))}
        </Box>

        {recent.length > 0 && (
          <Card variant="outlined" sx={{ borderRadius: 4, borderColor: 'rgba(0,0,0,0.06)' }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Recent
                </Typography>
              </Box>
              <Box sx={{ p: 3, display: 'grid', gap: 1.5 }}>
                {recent.map((item, index) => (
                  <Box
                    key={`${item.label}-${index}`}
                    sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}
                  >
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {item.label}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#666' }}>
                        {item.detail || ''}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: theme.accent }}>
                      {item.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>
    </DashboardLayout>
  )
}