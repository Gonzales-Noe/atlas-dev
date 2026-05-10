import { Navigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { useAuth } from '../store/authStore'
import { getDashboardRoute } from '../utils'

export default function PublicOnlyRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <CircularProgress sx={{ color: '#8B0000' }} />
      </Box>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={getDashboardRoute(user?.role)} replace />
  }

  return children
}