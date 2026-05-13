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

const CARD_ICONS = [SchoolIcon, AutoStoriesIcon, LayersIcon, EmojiObjectsIcon, ScienceIcon]
const CARD_COLORS = ['#8B0000', '#1565C0', '#2E7D32', '#6A1B9A', '#E65100']

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const { data, loading, error } = useApi('/curriculum/faculty-courses/')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState({ course_code: '', course_title: '', description: '' })

  useEffect(() => { setErrorDismissed(false) }, [error])

  const courses = data?.courses || []

  const openDialog = () => {
    setForm({ course_code: '', course_title: '', description: '' })
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
    <Box sx={{ minHeight: '100vh', bgcolor: '#F7F9FC', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: { xs: 2, md: 5 }, py: 4, maxWidth: 1400, mx: 'auto', width: '100%' }}>
        {error && !errorDismissed && (
          <Alert severity="error" onClose={() => setErrorDismissed(true)} sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1A1A', mb: 0.5 }}>
          My Courses
        </Typography>
        <Typography variant="body2" sx={{ color: '#666', mb: 3 }}>
          Select a course to open your workspace — syllabus, modules, assessments, grading, and knowledge uploads.
        </Typography>

        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress sx={{ color: '#8B0000' }} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid', gap: 2.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
            }}
          >
            <Card
              elevation={0}
              onClick={openDialog}
              sx={{
                bgcolor: '#fff', borderRadius: 3,
                border: '2px dashed rgba(139,0,0,0.25)',
                cursor: 'pointer',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                '&:hover': { borderColor: '#8B0000', boxShadow: '0 4px 16px rgba(139,0,0,0.10)' },
              }}
            >
              <CardActionArea sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 1, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#FFF5F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AddIcon sx={{ fontSize: 28, color: '#8B0000' }} />
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#8B0000', mt: 0.5 }}>
                    Create new course
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>

            {courses.map((course, idx) => {
              const CourseIcon = CARD_ICONS[idx % CARD_ICONS.length]
              const accentColor = CARD_COLORS[idx % CARD_COLORS.length]
              return (
                <Card
                  key={course.course_id}
                  elevation={0}
                  sx={{
                    bgcolor: '#fff', borderRadius: 3,
                    border: '1px solid rgba(0,0,0,0.08)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' },
                  }}
                >
                  <CardActionArea onClick={() => navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', course.course_id))} sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', height: '100%', '&:last-child': { pb: 2.5 } }}>
                      <Box sx={{ mb: 2, width: 44, height: 44, borderRadius: 2, bgcolor: accentColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CourseIcon sx={{ fontSize: 26, color: accentColor }} />
                      </Box>
                      <Typography variant="caption" sx={{ color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.65rem' }}>
                        {course.course_code}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, color: '#1A1A1A', lineHeight: 1.3, mt: 0.5, mb: 'auto', pb: 2 }}>
                        {course.course_title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#888' }}>
                        {course.syllabus_count ?? 0} syllabi · {course.assessment_count ?? 0} assessments
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              )
            })}

            {courses.length === 0 && (
              <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 12 }}>
                <SchoolIcon sx={{ fontSize: 72, color: '#ddd', mb: 2 }} />
                <Typography variant="body1" sx={{ color: '#999' }}>No assigned courses yet.</Typography>
                <Typography variant="body2" sx={{ color: '#bbb', mt: 0.5 }}>Click "Create new course" to add your first course.</Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#8B0000' }}>New Course</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {createError && (
            <Alert severity="error" sx={{ mb: 0 }}>{createError}</Alert>
          )}
          <TextField
            label="Course Code"
            name="course_code"
            value={form.course_code}
            onChange={handleFormChange}
            placeholder="e.g. BA401"
            size="small"
            autoFocus
            disabled={creating}
            inputProps={{ maxLength: 100 }}
          />
          <TextField
            label="Course Title"
            name="course_title"
            value={form.course_title}
            onChange={handleFormChange}
            placeholder="e.g. Business Analytics"
            size="small"
            disabled={creating}
            inputProps={{ maxLength: 255 }}
          />
          <TextField
            label="Course Description"
            name="description"
            value={form.description}
            onChange={handleFormChange}
            placeholder="Optional description"
            size="small"
            multiline
            rows={3}
            disabled={creating}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={closeDialog} disabled={creating} sx={{ color: '#64748B', textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creating}
            onClick={handleCreate}
            sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, borderRadius: 2, textTransform: 'none' }}
          >
            {creating ? 'Creating…' : 'Create Course'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
