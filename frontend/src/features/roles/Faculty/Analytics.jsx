// src/features/Faculty/Analytics.jsx
import { useEffect, useState } from 'react'
import {
  Box, Card, CardContent, CardHeader, Grid, Typography, List, ListItem, ListItemText,
} from '@mui/material'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import FacultyLayout from './FacultyLayout'

const sampleData = [
  { name: 'Week 1', progress: 80 }, 
  { name: 'Week 2', progress: 65 }, 
  { name: 'Week 3', progress: 50 }, 
  { name: 'Week 4', progress: 70 }, 
  { name: 'Week 5', progress: 85 },
]

export default function FacultyAnalytics() {
  const [course, setCourse] = useState(null)
  const [moduleCount, setModuleCount] = useState(0)

  useEffect(() => {
    const stored = localStorage.getItem('atlas_faculty_course')
    const modules = localStorage.getItem('atlas_faculty_modules')
    setCourse(stored ? JSON.parse(stored) : null)
    setModuleCount(modules ? JSON.parse(modules).length : 0)
  }, [])

  // Dark Neon Glassmorphism Card Style
  const cardStyles = { 
    borderRadius: 4, 
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  };

  return (
    <FacultyLayout>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '85vh' }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Faculty Analytics
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.95rem' }}>
            Track course progress and module engagement across the semester.
          </Typography>
        </Box>

        <Grid container spacing={2} sx={{ flex: 1 }}>
          {/* Top row: Summary numbers */}
          <Grid item xs={12} md={4} sx={{ display: 'flex' }}>
            <Card sx={{ ...cardStyles, width: '100%' }}>
              <CardHeader title="Course Overview" titleTypographyProps={{ fontWeight: 700, fontSize: '1.1rem' }} sx={{ pb: 0, pt: 2.5 }} />
              <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography color="text.secondary" sx={{ mb: 2, fontSize: '1.05rem' }}>
                  {course ? <strong style={{ color: 'var(--text-primary)' }}>{course.courseName}</strong> : 'No course data available.'}
                </Typography>
                <Box sx={{ p: 2, bgcolor: 'rgba(255, 45, 85, 0.1)', borderRadius: 3, mb: 2, border: '1px solid rgba(255, 45, 85, 0.2)' }}>
                  <Typography color="text.secondary" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>Modules Created</Typography>
                  <Typography sx={{ color: '#ff2d55', fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.1 }}>{moduleCount}</Typography>
                </Box>
                <Typography color="text.secondary" sx={{ fontSize: '0.9rem' }}>
                  Syllabus Status: <strong style={{ color: localStorage.getItem('atlas_faculty_syllabus_created') === 'true' ? '#34C759' : '#FF9F0A' }}>{localStorage.getItem('atlas_faculty_syllabus_created') === 'true' ? 'Ready' : 'Pending'}</strong>
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Progress Snapshot */}
          <Grid item xs={12} md={8} sx={{ display: 'flex' }}>
            <Card sx={{ ...cardStyles, width: '100%' }}>
              <CardHeader title="Progress Snapshot" titleTypographyProps={{ fontWeight: 700, fontSize: '1.1rem' }} sx={{ pb: 0, pt: 2.5 }} />
              <CardContent sx={{ flex: 1, minHeight: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sampleData} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'var(--border-color)' }} contentStyle={{ borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', backdropFilter: 'blur(10px)' }} itemStyle={{ color: '#ff2d55', fontWeight: 700 }} />
                    <Bar dataKey="progress" fill="#ff2d55" radius={[4, 4, 0, 0]} barSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Behavioral Analytics */}
          <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
            <Card sx={{ ...cardStyles, width: '100%' }}>
              <CardHeader title="Behavioral Analytics" titleTypographyProps={{ fontWeight: 700, fontSize: '1.1rem' }} sx={{ pb: 0, pt: 2.5 }} />
              <CardContent sx={{ pt: 1, flex: 1, pb: '16px !important' }}>
                <List disablePadding>
                  <ListItem disableGutters sx={{ py: 1.5 }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Student engagement</Typography>} 
                      secondary={<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>High engagement on interactive modules</Typography>} 
                    />
                  </ListItem>
                  <ListItem disableGutters sx={{ py: 1.5 }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Assessment readiness</Typography>} 
                      secondary={<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>More formative items needed for Week 3</Typography>} 
                    />
                  </ListItem>
                  <ListItem disableGutters sx={{ py: 1.5 }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Syllabus completion</Typography>} 
                      secondary={<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Syllabus ready to support module planning</Typography>} 
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Immediate Actions */}
          <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
            <Card sx={{ ...cardStyles, width: '100%' }}>
              <CardHeader title="Immediate Actions" titleTypographyProps={{ fontWeight: 700, fontSize: '1.1rem' }} sx={{ pb: 0, pt: 2.5 }} />
              <CardContent sx={{ pt: 1, flex: 1, pb: '16px !important' }}>
                <List disablePadding>
                  <ListItem disableGutters sx={{ py: 1.5 }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Finish module plans</Typography>} 
                      secondary={<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Complete Week 4 and Week 5 details</Typography>} 
                    />
                  </ListItem>
                  <ListItem disableGutters sx={{ py: 1.5 }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Review assessments</Typography>} 
                      secondary={<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Align questions with learning outcomes</Typography>} 
                    />
                  </ListItem>
                  <ListItem disableGutters sx={{ py: 1.5 }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>Share syllabus</Typography>} 
                      secondary={<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Publish course syllabus to students</Typography>} 
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

        </Grid>
      </Box>
    </FacultyLayout>
  )
}