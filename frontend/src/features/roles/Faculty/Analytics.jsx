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

  // Shared styling for the cards
  const cardStyles = { borderRadius: 3, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' };

  return (
    <FacultyLayout>
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
            Faculty Analytics
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
            Track course progress and module engagement across the semester.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Course Overview */}
          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardStyles, minHeight: 320 }}>
              <CardHeader title="Course Overview" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent>
                <Typography sx={{ mb: 2, color: '#475569', fontSize: '1.1rem' }}>
                  {course ? <strong style={{ color: '#0F172A' }}>{course.courseName}</strong> : 'No course data available.'}
                </Typography>
                <Box sx={{ p: 2, bgcolor: '#F8FAFC', borderRadius: 2, mb: 2 }}>
                  <Typography sx={{ color: '#64748B', fontWeight: 600 }}>Modules Created</Typography>
                  <Typography sx={{ color: '#A52028', fontSize: '1.8rem', fontWeight: 800 }}>{moduleCount}</Typography>
                </Box>
                <Typography sx={{ color: '#64748B' }}>
                  Syllabus Status: <strong style={{ color: localStorage.getItem('atlas_faculty_syllabus_created') === 'true' ? '#166534' : '#854D0E' }}>{localStorage.getItem('atlas_faculty_syllabus_created') === 'true' ? 'Ready' : 'Pending'}</strong>
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Progress Snapshot */}
          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardStyles, minHeight: 320 }}>
              <CardHeader title="Progress Snapshot" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sampleData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748B' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748B' }} />
                    <Tooltip cursor={{ fill: '#F1F5F9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="progress" fill="#A52028" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Behavioral Analytics (Restored) */}
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Behavioral Analytics" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent sx={{ pt: 0 }}>
                <List disablePadding>
                  <ListItem disableGutters sx={{ borderBottom: '1px solid #F1F5F9' }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, color: '#1E293B' }}>Student engagement</Typography>} 
                      secondary="High engagement on interactive modules" 
                    />
                  </ListItem>
                  <ListItem disableGutters sx={{ borderBottom: '1px solid #F1F5F9' }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, color: '#1E293B' }}>Assessment readiness</Typography>} 
                      secondary="More formative items needed for Week 3" 
                    />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, color: '#1E293B' }}>Syllabus completion</Typography>} 
                      secondary="Syllabus ready to support module planning" 
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>

          {/* Immediate Actions (Restored) */}
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Immediate Actions" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent sx={{ pt: 0 }}>
                <List disablePadding>
                  <ListItem disableGutters sx={{ borderBottom: '1px solid #F1F5F9' }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, color: '#1E293B' }}>Finish module plans</Typography>} 
                      secondary="Complete Week 4 and Week 5 details" 
                    />
                  </ListItem>
                  <ListItem disableGutters sx={{ borderBottom: '1px solid #F1F5F9' }}>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, color: '#1E293B' }}>Review assessments</Typography>} 
                      secondary="Align questions with learning outcomes" 
                    />
                  </ListItem>
                  <ListItem disableGutters>
                    <ListItemText 
                      primary={<Typography sx={{ fontWeight: 600, color: '#1E293B' }}>Share syllabus</Typography>} 
                      secondary="Publish course syllabus to students" 
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