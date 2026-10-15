// src/features/Faculty/Dashboard.jsx
import { useState, useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects'
import LayersIcon from '@mui/icons-material/Layers'
import SchoolIcon from '@mui/icons-material/School'
import ScienceIcon from '@mui/icons-material/Science'
import { useNavigate } from 'react-router-dom'
import api from '../../../config/api'
import useApi from '../../../hooks/useApi'
import { ROUTES } from '../../../config/route'
import { PageHeader, PrimaryBtn } from '../../../components/ui'
import FacultyLayout from './FacultyLayout'

const CARD_ICONS = [SchoolIcon, AutoStoriesIcon, LayersIcon, EmojiObjectsIcon, ScienceIcon]
const CARD_COLORS = ['#15803D', '#166534', '#15803D', '#16A34A', '#22C55E']
const COURSE_FIELD_SX = {
  '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#86EFAC' },
  '& .MuiOutlinedInput-root': {
    color: 'var(--text-primary)',
    '& fieldset': { borderColor: 'var(--border-color)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.24)' },
    '&.Mui-focused fieldset': { borderColor: '#16A34A' },
  },
  '& .MuiInputBase-input::placeholder': { color: 'var(--text-tertiary)', opacity: 1 },
}

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const { data, loading, error } = useApi('/curriculum/faculty-courses/')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState({ course_title: '', course_code: '', description: '' })

  useEffect(() => { setErrorDismissed(false) }, [error])

  const courses = data?.courses || []

  const openDialog = () => {
    setForm({ course_title: '', course_code: '', description: '' })
    setCreateError('')
    setDialogOpen(true)
  }

  const closeDialog = () => { if (!creating) setDialogOpen(false) }

  const handleFormChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleCreate = async () => {
    if (!form.course_code.trim() || !form.course_title.trim()) {
      setCreateError('Course code and title are required.')
      return
    }

    setCreating(true)
    setCreateError('')

    try {
      const { data: json } = await api.post('/curriculum/courses/', form)
      setDialogOpen(false)
      navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', json.course.course_id))
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to create course.'
      setCreateError(detail)
    } finally {
      setCreating(false)
    }
  }

  return (
    <FacultyLayout>
      <Box sx={{ maxWidth: 1400, mx: 'auto', width: '100%' }}>
        {error && !errorDismissed && (
          <Alert severity="error" onClose={() => setErrorDismissed(true)} sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <PageHeader
          title="My Courses"
          subtitle="Open a course workspace for syllabi, modules, assessments, grading, and knowledge uploads."
          action={(
            <PrimaryBtn onClick={openDialog}>
              <AddIcon sx={{ fontSize: 18 }} />
              Create course
            </PrimaryBtn>
          )}
        />

        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress sx={{ color: '#15803D' }} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid', gap: 2.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
            }}
          >
            {courses.map((course, idx) => {
              const CourseIcon = CARD_ICONS[idx % CARD_ICONS.length]
              const accentColor = CARD_COLORS[idx % CARD_COLORS.length]
              return (
                <Card
                  key={course.course_id}
                  elevation={0}
                  sx={{
                    height: '100%',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 3,
                    backdropFilter: 'blur(16px)',
                    boxShadow: 'var(--shadow-card)',
                    transition: 'transform 250ms, box-shadow 250ms, border-color 250ms',
                    '&:hover': {
                      transform: 'translateY(-3px)',
                      borderColor: 'rgba(134,239,172,0.4)',
                      boxShadow: 'var(--shadow-lg)',
                    },
                  }}
                >
                  <CardActionArea onClick={() => navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', course.course_id))} sx={{ height: '100%', borderRadius: 3, color: 'inherit' }}>
                    <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%', '&:last-child': { pb: 3 } }}>
                      <Box sx={{ mb: 2, width: 48, height: 48, borderRadius: 3, bgcolor: accentColor + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CourseIcon sx={{ fontSize: 28, color: accentColor }} />
                      </Box>
                      <Typography variant="caption" sx={{ color: '#86EFAC', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
                        {course.course_code}
                      </Typography>
                      <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.3, mt: 0.5, mb: 'auto', pb: 2 }}>
                        {course.course_title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {course.syllabus_count ?? 0} syllabi · {course.assessment_count ?? 0} assessments
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              )
            })}

            {courses.length === 0 && !loading && !error && (
              <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 12 }}>
                <SchoolIcon sx={{ fontSize: 56, color: 'var(--text-tertiary)', mb: 2 }} />
                <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>No assigned courses yet.</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-tertiary)', mt: 0.5 }}>Create a course to get started.</Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="xs" fullWidth
        PaperProps={{
          sx: {
            backgroundColor: 'var(--bg-card)',
            backgroundImage: 'none',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 3,
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: 'var(--text-primary)' }}>New Course</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '8px !important' }}>
          {createError && (
            <Alert severity="error" sx={{ mb: 0 }}>{createError}</Alert>
          )}
          <TextField
            label="Course Title"
            name="course_title"
            value={form.course_title}
            onChange={handleFormChange}
            placeholder="Enter course title"
            size="small"
            autoFocus
            disabled={creating}
            inputProps={{ maxLength: 255 }}
            sx={COURSE_FIELD_SX}
          />
          <TextField
            label="Course Code"
            name="course_code"
            value={form.course_code}
            onChange={handleFormChange}
            placeholder="Enter course code"
            size="small"
            disabled={creating}
            inputProps={{ maxLength: 100 }}
            sx={COURSE_FIELD_SX}
          />
          <TextField
            label="Course information (Description)"
            name="description"
            value={form.description}
            onChange={handleFormChange}
            placeholder="Optional description"
            size="small"
            multiline
            rows={3}
            disabled={creating}
            sx={COURSE_FIELD_SX}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid var(--border-color)' }}>
          <Button onClick={closeDialog} disabled={creating} sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creating}
            onClick={handleCreate}
            sx={{ background: '#15803D', '&:hover': { background: '#14532D' }, borderRadius: 1.5, textTransform: 'none', fontWeight: 700 }}
          >
            {creating ? 'Creating…' : 'Create Course'}
          </Button>
        </DialogActions>
      </Dialog>
    </FacultyLayout>
  )
}
