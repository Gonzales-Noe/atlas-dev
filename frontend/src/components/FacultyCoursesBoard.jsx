// src/components/FacultyCoursesBoard.jsx
// Course landing page — light theme matching sign-in page.

import { useState, useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects'
import LayersIcon from '@mui/icons-material/Layers'
import LogoutIcon from '@mui/icons-material/Logout'
import SchoolIcon from '@mui/icons-material/School'
import ScienceIcon from '@mui/icons-material/Science'
import { useNavigate } from 'react-router-dom'
import api from '../config/api'
import useApi from '../hooks/useApi'
import { useAuth } from '../store/authStore'
import { toInitials } from '../utils'
import AtlasLogo from './AtlasLogo'
import AutoAlert from './AutoAlert'

const CARD_ICONS = [SchoolIcon, AutoStoriesIcon, LayersIcon, EmojiObjectsIcon, ScienceIcon]
const CARD_COLORS = ['#8B0000', '#1565C0', '#2E7D32', '#6A1B9A', '#E65100']

export default function FacultyCoursesBoard() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState(null)
  const [errorDismissed, setErrorDismissed] = useState(false)
  const { data, loading, error, refetch } = useApi('/curriculum/faculty-courses/')
  // reset dismissed state whenever error changes
  useEffect(() => { setErrorDismissed(false) }, [error])

  // --- Create new course dialog ---
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState({ course_code: '', course_title: '', description: '' })

  const openDialog = () => {
    setForm({ course_code: '', course_title: '', description: '' })
    setCreateError('')
    setDialogOpen(true)
  }
  const closeDialog = () => { if (!creating) setDialogOpen(false) }

  const handleFormChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

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
      navigate(`/faculty/workspace/${json.course.course_id}`)
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to create course.'
      setCreateError(detail)
    } finally {
      setCreating(false)
    }
  }

  const courses = data?.courses || []

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F7F9FC', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <Box
        component="header"
        sx={{
          display: 'flex', alignItems: 'center',
          px: { xs: 2, md: 4 }, py: 1.25,
          bgcolor: '#fff',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          position: 'sticky', top: 0, zIndex: 10,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <AtlasLogo size={30} />
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#8B0000', letterSpacing: '-0.4px', lineHeight: 1 }}>
            ATLAS
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Chip
          label="FACULTY"
          size="small"
          sx={{ bgcolor: '#FFF5F5', color: '#8B0000', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.07em', mr: 1.5 }}
        />
        <Tooltip title={user?.email || ''}>
          <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small">
            <Avatar sx={{ width: 34, height: 34, bgcolor: '#8B0000', fontSize: 13, fontWeight: 700 }}>
              {toInitials(user?.name || user?.email || 'U')}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          <MenuItem disabled>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{user?.name || user?.email}</Typography>
              <Typography variant="caption" sx={{ color: '#888' }}>{user?.email}</Typography>
            </Box>
          </MenuItem>
          <MenuItem onClick={() => { logout(); navigate('/signin') }}>
            <LogoutIcon fontSize="small" sx={{ mr: 1.5, color: '#8B0000' }} />
            Sign Out
          </MenuItem>
        </Menu>
      </Box>

      {/* Main */}
      <Box sx={{ flex: 1, px: { xs: 2, md: 5 }, py: 4, maxWidth: 1400, mx: 'auto', width: '100%' }}>
        {error && !errorDismissed && (
          <AutoAlert message={error} onClose={() => setErrorDismissed(true)} sx={{ mb: 3 }} />
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
            {/* ── Create new course card ── */}
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

      {/* ── Create new course dialog ── */}
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
            label="Description (optional)"
            name="description"
            value={form.description}
            onChange={handleFormChange}
            multiline
            minRows={2}
            size="small"
            disabled={creating}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeDialog} disabled={creating} sx={{ color: '#666' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating}
            startIcon={creating ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
            sx={{ bgcolor: '#8B0000', '&:hover': { bgcolor: '#6B0000' }, fontWeight: 700, borderRadius: 2 }}
          >
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
