// ═══════════════════════════════════════════════════════════
// src/features/Admin/Dashboard.jsx
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import {
  Box, Card, CardContent, CardHeader, Grid, Typography, CircularProgress
} from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import SchoolIcon from '@mui/icons-material/School'
import AssessmentIcon from '@mui/icons-material/Assessment'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import AdminLayout from './AdminLayout'
import { useAuth } from '../../../store/authStore'
import api from '../../../config/api'

// A fun helper function to pick the right icon based on the text Django sends us
const getIconForLabel = (label) => {
  const lowerText = label.toLowerCase();
  if (lowerText.includes('faculty')) return <SchoolIcon sx={{ color: '#8B0000' }} />
  if (lowerText.includes('user') || lowerText.includes('account')) return <PeopleIcon sx={{ color: '#8B0000' }} />
  if (lowerText.includes('assessment')) return <AssessmentIcon sx={{ color: '#8B0000' }} />
  return <ViewModuleIcon sx={{ color: '#8B0000' }} />
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        // Calls the DashboardSummaryView in your Django views.py
        const { data } = await api.get('/auth/dashboard/summary/')
        setDashboardData(data)
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboardStats()
  }, [])

  const recentActivity = [
    { user: 'Dr. John Smith',   action: 'Created syllabus',       time: '2 min ago',  type: '📋' },
    { user: 'Prof. Jane Doe',   action: 'Generated assessment',   time: '18 min ago', type: '📝' },
    { user: 'Dr. Alice Johnson',action: 'Uploaded course material',time: '1 hr ago',  type: '📁' },
    { user: 'Prof. Bob Wilson', action: 'Added module',           time: '2 hr ago',   type: '🧩' },
  ]

  return (
    <AdminLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            {dashboardData?.title || 'Institutional Admin Dashboard'}
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Welcome back, {user?.name || 'Admin'} — {dashboardData?.subtitle || "overview of your institution's activity."}
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress sx={{ color: '#8B0000' }} />
          </Box>
        ) : (
          <Grid container spacing={3}>
            {/* Dynamically render exactly the cards Django tells us to! */}
            {dashboardData?.cards?.map((card, index) => (
              <Grid item xs={12} md={3} key={index}>
                <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 120 }}>
                  <CardHeader
                    title={card.label}
                    titleTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
                    avatar={getIconForLabel(card.label)}
                  />
                  <CardContent>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: '#8B0000' }}>
                      {card.value}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </AdminLayout>
  )
}