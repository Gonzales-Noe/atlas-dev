import { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
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

  return (
    <FacultyLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            Faculty Analytics
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Track course progress and module engagement across the semester.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 320 }}>
              <CardHeader title="Course Overview" titleTypographyProps={{ fontWeight: 700 }} />
              <CardContent>
                <Typography sx={{ mb: 1, color: '#666' }}>
                  {course ? `Course: ${course.courseName}` : 'No course data available.'}
                </Typography>
                <Typography sx={{ mb: 1, color: '#666' }}>
                  Modules Created: {moduleCount}
                </Typography>
                <Typography sx={{ mb: 1, color: '#666' }}>
                  Syllabus Status: {localStorage.getItem('atlas_faculty_syllabus_created') === 'true' ? 'Ready' : 'Pending'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 320 }}>
              <CardHeader title="Progress Snapshot" titleTypographyProps={{ fontWeight: 700 }} />
              <CardContent sx={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sampleData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Bar dataKey="progress" fill="#8B0000" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, border: '1px solid #EEE' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Behavioral Analytics
              </Typography>
              <List>
                <ListItem>
                  <ListItemText primary="Student engagement" secondary="High engagement on interactive modules" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Assessment readiness" secondary="More formative items needed for Week 3" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Syllabus completion" secondary="Syllabus ready to support module planning" />
                </ListItem>
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, border: '1px solid #EEE' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Immediate Actions
              </Typography>
              <List>
                <ListItem>
                  <ListItemText primary="Finish module plans" secondary="Complete Week 4 and Week 5 details" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Review assessments" secondary="Align questions with learning outcomes" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Share syllabus" secondary="Publish course syllabus to students" />
                </ListItem>
              </List>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </FacultyLayout>
  )
}
