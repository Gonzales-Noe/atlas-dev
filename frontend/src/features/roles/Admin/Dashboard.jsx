import { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
} from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import SchoolIcon from '@mui/icons-material/School'
import AssessmentIcon from '@mui/icons-material/Assessment'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import AdminLayout from './AdminLayout'
import { useAuth } from '../../../store/authStore'

export default function AdminDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({
    totalFaculty: 0,
    totalCourses: 0,
    totalAssessments: 0,
    totalModules: 0,
  })

  useEffect(() => {
    // Mock data - in real app, fetch from API
    setStats({
      totalFaculty: 15,
      totalCourses: 8,
      totalAssessments: 24,
      totalModules: 32,
    })
  }, [])

  return (
    <AdminLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            Institutional Admin Dashboard
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Welcome back, {user?.name || 'Admin'} — overview of your institution's activity and management tools.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 120 }}>
              <CardHeader
                title="Total Faculty"
                titleTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
                avatar={<PeopleIcon sx={{ color: '#8B0000' }} />}
              />
              <CardContent>
                <Typography variant="h3" sx={{ fontWeight: 700, color: '#8B0000' }}>
                  {stats.totalFaculty}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 120 }}>
              <CardHeader
                title="Total Courses"
                titleTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
                avatar={<SchoolIcon sx={{ color: '#8B0000' }} />}
              />
              <CardContent>
                <Typography variant="h3" sx={{ fontWeight: 700, color: '#8B0000' }}>
                  {stats.totalCourses}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 120 }}>
              <CardHeader
                title="Total Assessments"
                titleTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
                avatar={<AssessmentIcon sx={{ color: '#8B0000' }} />}
              />
              <CardContent>
                <Typography variant="h3" sx={{ fontWeight: 700, color: '#8B0000' }}>
                  {stats.totalAssessments}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 120 }}>
              <CardHeader
                title="Modules Created"
                titleTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
                avatar={<ViewModuleIcon sx={{ color: '#8B0000' }} />}
              />
              <CardContent>
                <Typography variant="h3" sx={{ fontWeight: 700, color: '#8B0000' }}>
                  {stats.totalModules}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </AdminLayout>
  )
}