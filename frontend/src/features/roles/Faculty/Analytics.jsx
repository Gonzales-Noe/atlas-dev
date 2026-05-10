// src/features/Faculty/Analytics.jsx
import { useEffect, useState } from 'react'
import { Box, Card, CardContent, Grid, Typography, List, ListItem, ListItemText } from '@mui/material'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import FacultyLayout from './FacultyLayout'

const sampleData = [
  { name: 'Week 1', progress: 80 }, { name: 'Week 2', progress: 65 }, { name: 'Week 3', progress: 50 }, { name: 'Week 4', progress: 70 }, { name: 'Week 5', progress: 85 },
]

export default function FacultyAnalytics() {
  const [course, setCourse] = useState(null)
  const [moduleCount, setModuleCount] = useState(0)

  useEffect(() => {
    setCourse(JSON.parse(localStorage.getItem('atlas_faculty_course')))
    const modules = JSON.parse(localStorage.getItem('atlas_faculty_modules'))
    setModuleCount(modules ? modules.length : 0)
  }, [])

  const cardStyles = { borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: 'none' };

  return (
    <FacultyLayout>
      <Box sx={{ mb: 4, textAlign: 'center', pt: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
          Faculty Analytics
        </Typography>
        <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
          Track course progress and module engagement.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ ...cardStyles, minHeight: 280 }}>
            <CardContent sx={{ p: 4 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 2 }}>Course Overview</Typography>
              <Typography sx={{ mb: 3, color: '#475569', fontSize: '1.1rem' }}>
                {course ? <strong style={{ color: '#0F172A' }}>{course.courseName}</strong> : 'No course data available.'}
              </Typography>
              <Box sx={{ p: 2.5, bgcolor: '#F8FAFC', borderRadius: '16px', mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: '#64748B', fontWeight: 700 }}>Modules Created</Typography>
                <Typography sx={{ color: '#A52028', fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{moduleCount}</Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ ...cardStyles, minHeight: 280 }}>
            <CardContent sx={{ p: 4, height: 280, display: 'flex', flexDirection: 'column' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 2 }}>Progress Snapshot</Typography>
              <Box sx={{ flexGrow: 1, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sampleData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: '0.8rem' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748B', fontSize: '0.8rem' }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="progress" fill="#A52028" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card sx={cardStyles}>
            <CardContent sx={{ p: 4 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 2 }}>Behavioral Actions</Typography>
              <List disablePadding>
                <ListItem disableGutters sx={{ borderBottom: '1px solid #F1F5F9', py: 1.5 }}>
                  <ListItemText primary={<Typography sx={{ fontWeight: 700, color: '#1E293B' }}>Student engagement</Typography>} secondary="High engagement on interactive modules" />
                </ListItem>
                <ListItem disableGutters sx={{ borderBottom: '1px solid #F1F5F9', py: 1.5 }}>
                  <ListItemText primary={<Typography sx={{ fontWeight: 700, color: '#1E293B' }}>Finish module plans</Typography>} secondary="Complete Week 4 and Week 5 details" />
                </ListItem>
                <ListItem disableGutters sx={{ py: 1.5 }}>
                  <ListItemText primary={<Typography sx={{ fontWeight: 700, color: '#1E293B' }}>Review assessments</Typography>} secondary="Align questions with learning outcomes" />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </FacultyLayout>
  )
}