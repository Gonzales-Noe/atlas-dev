// src/components/FacultyCoursesBoard.jsx
// Course landing page — light theme matching sign-in page.

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
import api from '../config/api'
import useApi from '../hooks/useApi'
import AutoAlert from './AutoAlert'
import FacultyLayout from '../features/roles/Faculty/FacultyLayout'

const CARD_ICONS = [SchoolIcon, AutoStoriesIcon, LayersIcon, EmojiObjectsIcon, ScienceIcon]
const CARD_COLORS = ['#8E1C1B', '#7C1616', '#6E1212', '#AA2423', '#E24B4A']

export default function FacultyCoursesBoard() {
  const navigate = useNavigate()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const [notice, setNotice] = useState('')
  const { data, loading, error, refetch } = useApi('/curriculum/faculty-courses/')
  const [requests, setRequests] = useState([])
  useEffect(() => { setErrorDismissed(false) }, [error])

  // --- Request new course dialog (admin approval required) ---
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [form, setForm] = useState({ course_code: '', course_title: '', description: '', justification: '' })

  const openDialog = () => {
    setForm({ course_code: '', course_title: '', description: '', justification: '' })
    setSendError('')
    setDialogOpen(true)
  }
  const closeDialog = () => { if (!sending) setDialogOpen(false) }

  const handleFormChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: name === 'course_code' ? value.toUpperCase() : value }))
  }

  const loadRequests = async () => {
    try {
      const { data: json } = await api.get('/curriculum/course-requests/mine/')
      setRequests(json?.requests || [])
    } catch {
      setRequests([])
    }
  }
  useEffect(() => { loadRequests() }, [])

  const handleSend = async () => {
    if (!form.course_code.trim() || !form.course_title.trim()) {
      setSendError('Course code and title are required.')
      return
    }
    setSending(true)
    setSendError('')
    try {
      await api.post('/curriculum/courses/', {
        course_code: form.course_code.trim().toUpperCase(),
        course_title: form.course_title.trim(),
        description: form.description.trim(),
        justification: form.justification.trim(),
      })
      setDialogOpen(false)
      setNotice('Request sent. Your admin will review it before the course appears below.')
      loadRequests()
      refetch?.()
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to send course request.'
      setSendError(detail)
    } finally {
      setSending(false)
    }
  }

  const courses = data?.courses || []
  const pending = requests.filter((r) => r.status === 'pending')


  return (
    <FacultyLayout>
      <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto' }}>
        {error && !errorDismissed && (
          <AutoAlert message={error} onClose={() => setErrorDismissed(true)} sx={{ mb: 3 }} />
        )}

        {notice && (
          <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 3 }}>{notice}</Alert>
        )}

        <Typography variant="h5" sx={{ fontWeight: 800, color: 'var(--text-primary)', mb: 0.5 }}>
          My Courses
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 3 }}>
          Approved courses live here. New courses need admin approval first — use “Request new course”.
        </Typography>

        {pending.length > 0 && (
          <Alert severity="info" sx={{ mb: 3 }}>
            {pending.length} request(s) waiting for admin approval: {pending.map((r) => r.course_code).join(', ')}.
          </Alert>
        )}

        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress sx={{ color: 'var(--brand-red-mid)' }} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid', gap: 2.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
            }}
          >
            {/* -- Request new course card -- */}
            <Card
              elevation={0}
              onClick={openDialog}
              sx={{
                bgcolor: 'var(--bg-card)', borderRadius: 3,
                border: '2px dashed var(--border-active)',
                cursor: 'pointer',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                '&:hover': { borderColor: 'var(--brand-red-mid)', boxShadow: 'var(--shadow-lg)' },
              }}
            >
              <CardActionArea sx={{ height: '100%' }}>
                <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 1, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: 'var(--active-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AddIcon sx={{ fontSize: 28, color: 'var(--brand-red-mid)' }} />
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--brand-red-mid)', mt: 0.5 }}>
                    Request new course
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Needs admin approval
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
                    bgcolor: 'var(--bg-card)', borderRadius: 3,
                    border: '1px solid var(--border-color)',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    '&:hover': { transform: 'translateY(-3px)', boxShadow: 'var(--shadow-lg)' },
                  }}
                >
                  <CardActionArea
                    onClick={() => navigate(`/faculty/workspace/${course.course_id}`)}
                    sx={{ height: '100%' }}
                  >
                    <CardContent sx={{ p: 2.5, display: 'flex', flexDirection: 'column', height: '100%', '&:last-child': { pb: 2.5 } }}>
                      <Box sx={{ mb: 2, width: 44, height: 44, borderRadius: 2, bgcolor: accentColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CourseIcon sx={{ fontSize: 26, color: accentColor }} />
                      </Box>
                      <Typography variant="caption" sx={{ color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.65rem' }}>
                        {course.course_code}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, mt: 0.5, mb: 'auto', pb: 2 }}>
                        {course.course_title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--text-tertiary)' }}>
                        {course.syllabus_count ?? 0} syllabi · {course.assessment_count ?? 0} assessments
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              )
            })}

            {courses.length === 0 && (
              <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 12 }}>
                <SchoolIcon sx={{ fontSize: 72, color: 'var(--border-color)', mb: 2 }} />
                <Typography variant="body1" sx={{ color: 'var(--text-tertiary)' }}>No approved courses yet.</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-tertiary)', mt: 0.5 }}>Click “Request new course” — it appears here after admin approval.</Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* -- Request new course dialog -- */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: 'var(--brand-red-mid)' }}>Request new course</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Alert severity="info" sx={{ mb: 0 }}>Your admin reviews every request before the course appears in your workspace.</Alert>
          {sendError && (
            <Alert severity="error" sx={{ mb: 0 }}>{sendError}</Alert>
          )}
          <TextField
            label="Course Title"
            name="course_title"
            value={form.course_title}
            onChange={handleFormChange}
            placeholder="e.g. Business Analytics"
            size="small"
            autoFocus
            disabled={sending}
            inputProps={{ maxLength: 255 }}
          />
          <TextField
            label="Course Code"
            name="course_code"
            value={form.course_code}
            onChange={handleFormChange}
            placeholder="e.g. BA401"
            size="small"
            disabled={sending}
            inputProps={{ maxLength: 100 }}
          />
          <TextField
            label="Course information (Description)"
            name="description"
            value={form.description}
            onChange={handleFormChange}
            placeholder="Optional description"
            size="small"
            multiline
            minRows={2}
            disabled={sending}
          />
          <TextField
            label="Why do you need this course? (helps approval)"
            name="justification"
            value={form.justification}
            onChange={handleFormChange}
            placeholder="e.g. Required for 2nd-year BSBA next term"
            size="small"
            multiline
            minRows={2}
            disabled={sending}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeDialog} disabled={sending} sx={{ color: 'var(--text-secondary)' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={sending}
            startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
            sx={{ bgcolor: 'var(--brand-red-mid)', '&:hover': { bgcolor: 'var(--brand-red-core)' }, fontWeight: 700, borderRadius: 2 }}
          >
            {sending ? 'Sending…' : 'Send for approval'}
          </Button>
        </DialogActions>
      </Dialog>
    </FacultyLayout>
  )
}
