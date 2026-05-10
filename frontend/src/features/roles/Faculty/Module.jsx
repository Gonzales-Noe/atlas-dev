// src/features/Faculty/Module.jsx
import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, CardHeader, Grid, Stack, TextField, Typography, Alert, Divider, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import FacultyLayout from './FacultyLayout'

function loadCourse() { try { return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null } catch { return null } }
function loadModuleList() { try { return JSON.parse(localStorage.getItem('atlas_faculty_modules')) || [] } catch { return [] } }

export default function FacultyModule() {
  const [course, setCourse] = useState(loadCourse())
  const [syllabusReady, setSyllabusReady] = useState(localStorage.getItem('atlas_faculty_syllabus_created') === 'true')
  const [moduleList, setModuleList] = useState(loadModuleList())
  const [formState, setFormState] = useState({ title: '', week: '', outcome: '', summary: '' })
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setCourse(loadCourse())
    setSyllabusReady(localStorage.getItem('atlas_faculty_syllabus_created') === 'true')
  }, [])

  const isEnabled = Boolean(course && course.courseName && syllabusReady)

  function handleSubmit() {
    const nextList = [...moduleList, { ...formState, id: moduleList.length + 1 }]
    setModuleList(nextList)
    localStorage.setItem('atlas_faculty_modules', JSON.stringify(nextList))
    setSuccess('Module added successfully.')
    setFormState({ title: '', week: '', outcome: '', summary: '' })
  }

  const cardStyles = { borderRadius: 3, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' };

  return (
    <FacultyLayout>
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
            Module Builder
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
            Create course modules aligned with your syllabus. Each module can contain week, outcome, and summary details.
          </Typography>
        </Box>

        {!course?.courseName && (
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
            Add a course from the dashboard first before creating modules.
          </Alert>
        )}

        {!syllabusReady && course?.courseName && (
          <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
            You need to create a syllabus first before module creation becomes available.
          </Alert>
        )}

        {success && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{success}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Create New Module" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} avatar={<ViewModuleIcon sx={{ color: '#A52028' }} />} />
              <CardContent>
                <Stack spacing={2}>
                  <TextField label="Module Title" value={formState.title} disabled={!isEnabled} onChange={(e) => setFormState({ ...formState, title: e.target.value })} fullWidth size="small" />
                  <TextField label="Week" value={formState.week} disabled={!isEnabled} onChange={(e) => setFormState({ ...formState, week: e.target.value })} fullWidth size="small" />
                  <TextField label="Intended Outcome" value={formState.outcome} disabled={!isEnabled} onChange={(e) => setFormState({ ...formState, outcome: e.target.value })} fullWidth size="small" />
                  <TextField label="Summary" value={formState.summary} disabled={!isEnabled} onChange={(e) => setFormState({ ...formState, summary: e.target.value })} multiline rows={4} fullWidth size="small" />
                  <Button variant="contained" disabled={!isEnabled || !formState.title} onClick={handleSubmit} sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2, textTransform: 'none', py: 1.5 }}>
                    Add Module
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardStyles, minHeight: 420 }}>
              <CardHeader title="Modules Created" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent>
                {moduleList.length === 0 ? (
                  <Typography sx={{ color: '#64748B' }}>No modules created yet.</Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Week</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Title</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Outcome</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {moduleList.map((module) => (
                          <TableRow key={module.id} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                            <TableCell>{module.week}</TableCell>
                            <TableCell sx={{ fontWeight: 600, color: '#0F172A' }}>{module.title}</TableCell>
                            <TableCell sx={{ color: '#64748B' }}>{module.outcome}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </FacultyLayout>
  )
}