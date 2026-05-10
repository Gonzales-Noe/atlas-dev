// src/features/Faculty/Dashboard.jsx
import { useEffect, useMemo, useState } from 'react'
import {
  Box, Button, Card, CardContent, CardHeader, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Stack, TextField, Typography, Alert, Chip,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CreateIcon from '@mui/icons-material/Create'
import QuizIcon from '@mui/icons-material/Quiz'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import FacultyLayout from './FacultyLayout'
import { ROUTES } from '../../../config/route'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../store/authStore'

const defaultCourse = { instructorName: '', courseName: '', courseCode: '', yearLevel: '', semester: '', section: '' }

function loadCourse() {
  try { return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null } 
  catch { return null }
}

function saveCourse(course) { localStorage.setItem('atlas_faculty_course', JSON.stringify(course)) }
function hasSyllabus() { return localStorage.getItem('atlas_faculty_syllabus_created') === 'true' }

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [course, setCourse] = useState(loadCourse() || defaultCourse)
  const [showSuccess, setShowSuccess] = useState(false)
  const [formState, setFormState] = useState(course)
  const [promptOpen, setPromptOpen] = useState(false)

  const syllabusReady = useMemo(() => hasSyllabus(), [course])

  useEffect(() => {
    if (!course || !course.courseName) { setOnboardingOpen(true) }
  }, [course])

  function handleOnboardingSubmit() {
    const nextCourse = { ...formState }
    saveCourse(nextCourse)
    setCourse(nextCourse)
    setShowSuccess(true)
    setOnboardingOpen(false)
  }

  function handleAction(action) {
    if (action === 'syllabus') navigate(ROUTES.FACULTY.SYLLABUS)
    if (action === 'module') navigate(ROUTES.FACULTY.MODULE)
    if (action === 'assessment') navigate(ROUTES.FACULTY.ASSESSMENT)
  }

  const cardStyles = { borderRadius: 3, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' };

  return (
    <FacultyLayout>
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
            Faculty Dashboard
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
            Welcome back, {user?.name || course.instructorName || 'Faculty'} — manage your course, syllabus, modules, assessments, and grading from one place.
          </Typography>
        </Box>

        {showSuccess && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }} iconMapping={{ success: <CheckCircleIcon /> }}>
            Your course was added successfully. Choose what to do next.
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Onboarding" titleTypographyProps={{ fontWeight: 700, color: '#A52028' }} />
              <CardContent>
                <Typography sx={{ color: '#475569', mb: 3 }}>
                  Add your first course and start building your syllabus, modules, and assessments.
                </Typography>
                <Button variant="contained" onClick={() => setOnboardingOpen(true)} sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2, textTransform: 'none', px: 3 }}>
                  Add / Update Course
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Quick Actions" titleTypographyProps={{ fontWeight: 700, color: '#A52028' }} />
              <CardContent>
                <Stack spacing={2}>
                  <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => handleAction('syllabus')} sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2, textTransform: 'none' }}>
                    Create Syllabus
                  </Button>
                  <Button variant="outlined" startIcon={<CreateIcon />} disabled={!syllabusReady} onClick={() => handleAction('module')} sx={{ borderRadius: 2, textTransform: 'none', color: '#A52028', borderColor: '#A52028' }}>
                    Build Module
                  </Button>
                  <Button variant="outlined" startIcon={<QuizIcon />} disabled={!syllabusReady} onClick={() => handleAction('assessment')} sx={{ borderRadius: 2, textTransform: 'none', color: '#A52028', borderColor: '#A52028' }}>
                    Generate Assessment
                  </Button>
                  <Button variant="outlined" startIcon={<AnalyticsIcon />} onClick={() => navigate(ROUTES.FACULTY.ANALYTICS)} sx={{ borderRadius: 2, textTransform: 'none', color: '#475569', borderColor: '#CBD5E1' }}>
                    View Analytics
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ ...cardStyles, minHeight: 200 }}>
              <CardHeader title="Course Details" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent>
                <Typography sx={{ fontWeight: 700, mb: 1, color: '#0F172A' }}>{course.courseName || 'No course added yet'}</Typography>
                <Typography sx={{ color: '#64748B', mb: 0.5 }}>Course Code: {course.courseCode || '—'}</Typography>
                <Typography sx={{ color: '#64748B', mb: 0.5 }}>Year Level: {course.yearLevel || '—'}</Typography>
                <Typography sx={{ color: '#64748B', mb: 0.5 }}>Semester: {course.semester || '—'}</Typography>
                <Typography sx={{ color: '#64748B', mb: 0.5 }}>Section: {course.section || '—'}</Typography>
                {course.courseName && (
                  <Chip label="Course ready" size="small" sx={{ mt: 2, background: '#DCFCE7', color: '#166534', fontWeight: 600 }} />
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ ...cardStyles, minHeight: 200 }}>
              <CardHeader title="Syllabus Status" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent>
                <Typography sx={{ color: '#64748B', mb: 2 }}>
                  {syllabusReady ? 'Syllabus is ready. You can now build modules and assessments.' : 'Create a syllabus first to unlock module and assessment workflows.'}
                </Typography>
                <Chip
                  label={syllabusReady ? 'Completed' : 'Pending'}
                  size="small"
                  sx={{
                    background: syllabusReady ? '#DCFCE7' : '#FEF9C3',
                    color: syllabusReady ? '#166534' : '#854D0E',
                    fontWeight: 600
                  }}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ ...cardStyles, minHeight: 200 }}>
              <CardHeader title="Next Step" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent>
                <Typography sx={{ color: '#64748B', mb: 3 }}>
                  Start with course onboarding, create your syllabus, then continue with modules and assessment generation.
                </Typography>
                <Button variant="contained" disabled={!course.courseName} onClick={() => setPromptOpen(true)} sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2, textTransform: 'none' }}>
                  Choose Action
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Dialog open={onboardingOpen} onClose={() => setOnboardingOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Welcome to ATLAS</DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 2, color: '#64748B' }}>
              What would you like us to call you, and what course are you teaching?
            </Typography>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField label="Your name" value={formState.instructorName} onChange={(e) => setFormState({ ...formState, instructorName: e.target.value })} fullWidth size="small" />
              <TextField label="Course Name" value={formState.courseName} onChange={(e) => setFormState({ ...formState, courseName: e.target.value })} fullWidth size="small" />
              <TextField label="Course Code" value={formState.courseCode} onChange={(e) => setFormState({ ...formState, courseCode: e.target.value })} fullWidth size="small" />
              <TextField label="Year Level" value={formState.yearLevel} onChange={(e) => setFormState({ ...formState, yearLevel: e.target.value })} fullWidth size="small" />
              <TextField label="Semester" value={formState.semester} onChange={(e) => setFormState({ ...formState, semester: e.target.value })} fullWidth size="small" />
              <TextField label="Section" value={formState.section} onChange={(e) => setFormState({ ...formState, section: e.target.value })} fullWidth size="small" />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3 }}>
            <Button onClick={() => setOnboardingOpen(false)} sx={{ color: '#64748B' }}>Cancel</Button>
            <Button variant="contained" sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2 }} onClick={handleOnboardingSubmit}>
              Save Course
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={promptOpen} onClose={() => setPromptOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Choose your next action</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Button variant="contained" sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2, py: 1.5 }} onClick={() => { handleAction('syllabus'); setPromptOpen(false) }}>
                Create Syllabus
              </Button>
              <Button variant="outlined" sx={{ borderRadius: 2, py: 1.5, borderColor: '#A52028', color: '#A52028' }} disabled={!syllabusReady} onClick={() => { handleAction('module'); setPromptOpen(false) }}>
                Build Module
              </Button>
              <Button variant="outlined" sx={{ borderRadius: 2, py: 1.5, borderColor: '#A52028', color: '#A52028' }} disabled={!syllabusReady} onClick={() => { handleAction('assessment'); setPromptOpen(false) }}>
                Generate Assessment
              </Button>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPromptOpen(false)} sx={{ color: '#64748B' }}>Close</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </FacultyLayout>
  )
}