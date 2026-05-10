import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Stack,
  TextField,
  Typography,
  Alert,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import FacultyLayout from './FacultyLayout'

function loadCourse() {
  try {
    return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null
  } catch {
    return null
  }
}

function loadModuleList() {
  try {
    return JSON.parse(localStorage.getItem('atlas_faculty_modules')) || []
  } catch {
    return []
  }
}

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

  return (
    <FacultyLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            Module Builder
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Create course modules aligned with your syllabus. Each module can contain week, outcome, and summary details.
          </Typography>
        </Box>

        {!course?.courseName && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            Add a course from the dashboard first before creating modules.
          </Alert>
        )}

        {!syllabusReady && course?.courseName && (
          <Alert severity="info" sx={{ mb: 3 }}>
            You need to create a syllabus first before module creation becomes available.
          </Alert>
        )}

        {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
              <CardHeader
                title="Create New Module"
                titleTypographyProps={{ fontWeight: 700 }}
                avatar={<ViewModuleIcon sx={{ color: '#8B0000' }} />}
              />
              <CardContent>
                <Stack spacing={2}>
                  <TextField
                    label="Module Title"
                    value={formState.title}
                    disabled={!isEnabled}
                    onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Week"
                    value={formState.week}
                    disabled={!isEnabled}
                    onChange={(e) => setFormState({ ...formState, week: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Intended Outcome"
                    value={formState.outcome}
                    disabled={!isEnabled}
                    onChange={(e) => setFormState({ ...formState, outcome: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Summary"
                    value={formState.summary}
                    disabled={!isEnabled}
                    onChange={(e) => setFormState({ ...formState, summary: e.target.value })}
                    multiline
                    rows={4}
                    fullWidth
                    size="small"
                  />
                  <Button
                    variant="contained"
                    disabled={!isEnabled || !formState.title}
                    onClick={handleSubmit}
                    sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}
                  >
                    Add Module
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', minHeight: 420 }}>
              <CardHeader title="Modules Created" titleTypographyProps={{ fontWeight: 700 }} />
              <CardContent>
                {moduleList.length === 0 ? (
                  <Typography sx={{ color: '#666' }}>
                    No modules created yet.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Week</TableCell>
                          <TableCell>Title</TableCell>
                          <TableCell>Outcome</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {moduleList.map((module) => (
                          <TableRow key={module.id}>
                            <TableCell>{module.week}</TableCell>
                            <TableCell>{module.title}</TableCell>
                            <TableCell>{module.outcome}</TableCell>
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

        <Divider sx={{ my: 4 }} />

        <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
          <CardHeader title="Module Design Tips" titleTypographyProps={{ fontWeight: 700 }} />
          <CardContent>
            <Typography sx={{ color: '#666', mb: 1 }}>
              Use modules to break the course into digestible learning segments. Each module should include:
            </Typography>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#444' }}>
              <li>Week-based topics</li>
              <li>Learning outcome alignment</li>
              <li>Assessment and reflection activities</li>
            </ul>
          </CardContent>
        </Card>
      </Box>
    </FacultyLayout>
  )
}
