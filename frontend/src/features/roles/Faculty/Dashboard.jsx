// ═══════════════════════════════════════════════════════════════════
// src/features/Faculty/Dashboard.jsx
// ═══════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Divider from '@mui/material/Divider'
import AddIcon from '@mui/icons-material/Add'
import SchoolIcon from '@mui/icons-material/School'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import LayersIcon from '@mui/icons-material/Layers'
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects'
import ScienceIcon from '@mui/icons-material/Science'
import { useNavigate } from 'react-router-dom'
import api from '../../../config/api'
import useApi from '../../../hooks/useApi'
import { ROUTES } from '../../../config/route'
import FacultyLayout from './FacultyLayout'
import { PageHeader, PrimaryBtn, OutlineBtn } from '../../../components/ui'

const CARD_ICONS  = [SchoolIcon, AutoStoriesIcon, LayersIcon, EmojiObjectsIcon, ScienceIcon]
const CARD_COLORS = ['#C0392B','#A52A2A','#B71C1C','#C62828','#D32F2F']

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const { data, loading, error } = useApi('/curriculum/faculty-courses/')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [createError, setCreateError] = useState('')
  const [form, setForm] = useState({ course_title: '', course_code: '', description: '', year_level: '', semester: '', section: '' })

  useEffect(() => { setErrorDismissed(false) }, [error])

  const courses = data?.courses || []

  function openDialog() { setForm({ course_title:'', course_code:'', description:'', year_level:'', semester:'', section:'' }); setCreateError(''); setDialogOpen(true) }
  function closeDialog() { if (!creating) setDialogOpen(false) }
  function handleFormChange(e) { setForm(p => ({ ...p, [e.target.name]: e.target.value })) }

  async function handleCreate() {
    if (!form.course_code.trim() || !form.course_title.trim()) { setCreateError('Course code and title are required.'); return }
    setCreating(true); setCreateError('')
    try {
      const { data: json } = await api.post('/curriculum/courses/', form)
      setDialogOpen(false)
      navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', json.course.course_id))
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create course.')
    } finally { setCreating(false) }
  }

  return (
    <FacultyLayout>
      <Box sx={{ maxWidth: 1400, mx: 'auto', width: '100%' }}>
        <PageHeader
          title="My Courses"
          subtitle="Select a course to open your workspace — syllabus, modules, assessments, grading, and analytics."
          action={<PrimaryBtn onClick={openDialog}><AddIcon fontSize="small" /> New Course</PrimaryBtn>}
        />

        {error && !errorDismissed && (
          <Alert severity="error" onClose={() => setErrorDismissed(true)} sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>
        )}

        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress sx={{ color: 'var(--active-color)' }} />
          </Box>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>

            {/* Add new course card */}
            <div
              onClick={openDialog}
              style={{
                background: 'transparent',
                border: '2px dashed rgba(192,57,43,0.3)',
                borderRadius: 20, cursor: 'pointer', minHeight: 180,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'all 250ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#C0392B'; e.currentTarget.style.background = 'rgba(139,0,0,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(192,57,43,0.3)'; e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(139,0,0,0.12)', border: '1px solid rgba(192,57,43,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AddIcon sx={{ fontSize: 28, color: '#C0392B' }} />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--active-color)' }}>Create new course</span>
            </div>

            {/* Course cards */}
            {courses.map((course, idx) => {
              const CourseIcon  = CARD_ICONS[idx % CARD_ICONS.length]
              const accentColor = CARD_COLORS[idx % CARD_COLORS.length]
              return (
                <div
                  key={course.course_id}
                  onClick={() => navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', course.course_id))}
                  style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                    borderRadius: 20, padding: '22px', cursor: 'pointer',
                    backdropFilter: 'blur(16px)', transition: 'all 250ms', position: 'relative', overflow: 'hidden',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = 'var(--active-color)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border-color)' }}
                >
                  {/* Accent glow */}
                  <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: accentColor, opacity: 0.1, filter: 'blur(20px)', pointerEvents: 'none' }} />

                  <div style={{ width: 44, height: 44, borderRadius: 12, background: accentColor + '25', border: `1px solid ${accentColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                    <CourseIcon sx={{ fontSize: 24, color: accentColor }} />
                  </div>

                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {course.course_code}
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35, marginBottom: 14 }}>
                    {course.course_title}
                  </div>
                  <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      {course.syllabus_count ?? 0} syllabi
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>·</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                      {course.assessment_count ?? 0} assessments
                    </span>
                  </div>
                </div>
              )
            })}

            {courses.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '5rem 2rem' }}>
                <SchoolIcon sx={{ fontSize: 64, color: 'var(--border-color)', mb: 2 }} />
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.95rem' }}>No courses yet.</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', marginTop: 4 }}>Click "Create new course" to get started.</div>
              </div>
            )}
          </div>
        )}
      </Box>

      {/* Create course dialog */}
      <Dialog open={dialogOpen} onClose={closeDialog} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 4, background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ fontWeight: 800, color: 'var(--active-color)' }}>New Course</DialogTitle>
        <Divider />
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.2, pt: '16px !important' }}>
          {createError && <Alert severity="error" sx={{ borderRadius: 2 }}>{createError}</Alert>}
          <TextField label="Course Title"   name="course_title"  value={form.course_title}  onChange={handleFormChange} size="small" autoFocus  disabled={creating} inputProps={{ maxLength: 255 }} sx={inputSx} />
          <TextField label="Course Code"    name="course_code"   value={form.course_code}   onChange={handleFormChange} size="small"           disabled={creating} inputProps={{ maxLength: 100 }} sx={inputSx} />
          <TextField label="Description"    name="description"   value={form.description}   onChange={handleFormChange} size="small" multiline rows={3} disabled={creating} placeholder="Optional" sx={inputSx} />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField select label="Year Level" name="year_level" value={form.year_level} onChange={handleFormChange} size="small" disabled={creating} sx={inputSx}>
              {['1st Year','2nd Year','3rd Year','4th Year','5th Year','Others'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
            <TextField select label="Semester" name="semester" value={form.semester} onChange={handleFormChange} size="small" disabled={creating} sx={inputSx}>
              {['1st Semester','2nd Semester','3rd Semester','Others'].map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
          </Box>
          <TextField label="Section / Block" name="section" value={form.section} onChange={handleFormChange} size="small" disabled={creating} placeholder="e.g. A, Block 1" sx={inputSx} />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <OutlineBtn onClick={closeDialog} disabled={creating}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : 'Create Course'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    </FacultyLayout>
  )
}