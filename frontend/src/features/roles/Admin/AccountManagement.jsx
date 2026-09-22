import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Chip,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import AddLinkIcon from '@mui/icons-material/AddLink'
import SettingsIcon from '@mui/icons-material/Settings'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'

const DEFAULT_SYLLABUS_SECTIONS = [
  ['overview', 'Course Overview'], ['basic', 'Basic Info'], ['details', 'Course Details'],
  ['iloat', 'ILOs & Assessments'], ['iloatmatrix', 'ILO-AT Matrix'], ['fwmap', 'Framework Mapping'],
  ['ilofwmatrix', 'ILO-Framework Matrix'], ['schedule', 'Weekly Schedule'],
  ['tos', 'Table of Specifications'], ['grading', 'Grading'], ['policies', 'Policies'],
]

export default function AdminAccountManagement() {
  const [faculty, setFaculty] = useState([])
  const [courses, setCourses] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editDialog, setEditDialog] = useState(false)
  const [assignmentDialog, setAssignmentDialog] = useState(false)
  const [selectedFaculty, setSelectedFaculty] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', status: '' })
  const [assignmentForm, setAssignmentForm] = useState({ course_id: '', section: '' })
  const [customizationDialog, setCustomizationDialog] = useState(false)
  const [customization, setCustomization] = useState({ header_image_url: '', footer_image_url: '', header_text: '', footer_text: '', syllabus_sections: [] })

  const readImageFile = (file, field) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCustomization(prev => ({ ...prev, [field]: reader.result }))
    reader.readAsDataURL(file)
  }

  const formatFieldSx = {
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#FF6B6B' },
    '& .MuiInputBase-input': { color: '#F0F0F2' },
    '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.6)' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.14)' },
  }

  useEffect(() => {
    loadAssignments()
    loadCustomization()
  }, [])

  async function loadCustomization() {
    try {
      const { data } = await api.get('/users/institution-customization/')
      setCustomization(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load institution customization.')
    }
  }

  async function saveCustomization() {
    try {
      await api.patch('/users/institution-customization/', customization)
      setCustomizationDialog(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save institution customization.')
    }
  }

  async function loadAssignments() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/users/faculty-assignments/')
      setFaculty(data.faculty || [])
      setCourses(data.courses || [])
      setAssignments(data.assignments || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load faculty assignments.')
    } finally {
      setLoading(false)
    }
  }

  function handleEdit(fac) {
    setSelectedFaculty(fac)
    setEditForm({ name: fac.email, email: fac.email, status: fac.is_active ? 'Active' : 'Inactive' })
    setEditDialog(true)
  }

  async function handleSaveEdit() {
    try {
      await api.patch(`/users/accounts/${selectedFaculty.user_id}/`, { email: editForm.email, is_active: editForm.status === 'Active' })
      setEditDialog(false)
      loadAssignments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update faculty account.')
    }
  }

  function openAssignmentDialog(fac) {
    const current = assignments.find(item => item.faculty_id === fac.user_id)
    setSelectedFaculty(fac)
    setAssignmentForm({ course_id: current?.course_id || '', section: current?.section || '' })
    setAssignmentDialog(true)
  }

  async function handleAssignCourse() {
    if (!assignmentForm.course_id) return
    try {
      await api.post('/users/faculty-assignments/', { faculty_id: selectedFaculty.user_id, ...assignmentForm })
      setAssignmentDialog(false)
      loadAssignments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to assign course.')
    }
  }

  const assignmentsFor = userId => assignments.filter(item => item.faculty_id === userId)

  return (
    <AdminLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            Faculty Account Management
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Manage faculty accounts and assign their courses and handled sections.
          </Typography>
        </Box>

        {error && <Typography sx={{ color: '#FF6B6B', mb: 2 }}>{error}</Typography>}

        <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
          <CardHeader title="Faculty Members" titleTypographyProps={{ fontWeight: 700 }} action={<Button startIcon={<SettingsIcon />} onClick={() => setCustomizationDialog(true)}>Syllabus Format</Button>} />
          <CardContent>
            <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Assigned Courses / Sections</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!loading && faculty.map((fac) => (
                    <TableRow key={fac.user_id}>
                      <TableCell>{fac.email.split('@')[0]}</TableCell>
                      <TableCell>{fac.email}</TableCell>
                      <TableCell>
                        <Chip
                          label={fac.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          sx={{
                            color: fac.is_active ? '#5EDA7E' : '#FF8080',
                            bgcolor: fac.is_active ? 'rgba(52,199,89,0.14)' : 'rgba(255,69,58,0.14)',
                            border: `1px solid ${fac.is_active ? 'rgba(52,199,89,0.3)' : 'rgba(255,69,58,0.3)'}`,
                            fontWeight: 700,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {assignmentsFor(fac.user_id).map(item => (
                          <Typography key={item.assignment_id} variant="body2">
                            {item.course_code}{item.section ? ` · ${item.section}` : ''}
                          </Typography>
                        ))}
                        {assignmentsFor(fac.user_id).length === 0 && 'None assigned'}
                      </TableCell>
                      <TableCell>
                        <IconButton onClick={() => handleEdit(fac)} size="small">
                          <EditIcon />
                        </IconButton>
                        <IconButton onClick={() => openAssignmentDialog(fac)} size="small" color="primary">
                          <AddLinkIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        <Dialog open={customizationDialog} onClose={() => setCustomizationDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ color: '#F0F0F2' }}>University Syllabus Format</DialogTitle>
          <DialogContent sx={{ color: '#F0F0F2' }}>
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ color: '#F0F0F2', fontWeight: 700, mb: 1 }}>Header image (optional)</Typography>
              <Button component="label" variant="outlined" fullWidth sx={{ color: '#FF6B6B', borderColor: '#FF6B6B' }}>
                {customization.header_image_url ? 'Replace header image' : 'Choose header image'}
                <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImageFile(e.target.files?.[0], 'header_image_url')} />
              </Button>
              {customization.header_image_url && <Box component="img" src={customization.header_image_url} alt="Header preview" sx={{ display: 'block', maxWidth: '100%', maxHeight: 90, mx: 'auto', mt: 1, objectFit: 'contain' }} />}
            </Box>
            <TextField sx={formatFieldSx} label="Header text fallback (optional)" value={customization.header_text || ''} onChange={e => setCustomization({ ...customization, header_text: e.target.value })} fullWidth multiline minRows={2} margin="normal" />
            <Box sx={{ mt: 1 }}>
              <Typography sx={{ color: '#F0F0F2', fontWeight: 700, mb: 1 }}>Footer image (optional)</Typography>
              <Button component="label" variant="outlined" fullWidth sx={{ color: '#FF6B6B', borderColor: '#FF6B6B' }}>
                {customization.footer_image_url ? 'Replace footer image' : 'Choose footer image'}
                <input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => readImageFile(e.target.files?.[0], 'footer_image_url')} />
              </Button>
              {customization.footer_image_url && <Box component="img" src={customization.footer_image_url} alt="Footer preview" sx={{ display: 'block', maxWidth: '100%', maxHeight: 90, mx: 'auto', mt: 1, objectFit: 'contain' }} />}
            </Box>
            <TextField sx={formatFieldSx} label="Footer text fallback (optional)" value={customization.footer_text || ''} onChange={e => setCustomization({ ...customization, footer_text: e.target.value })} fullWidth multiline minRows={2} margin="normal" />
            <Typography sx={{ mt: 2, mb: 1, fontWeight: 700, color: '#FFFFFF' }}>Syllabus sections</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1, display: 'block' }}>Add the sections your university requires. Use the key for the faculty workspace renderer.</Typography>
            {(customization.syllabus_sections || []).map((section, index) => (
              <Box key={`${section.key}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 1, mb: 1 }}>
                <TextField sx={formatFieldSx} size="small" label="Key" value={section.key || ''} onChange={e => setCustomization({ ...customization, syllabus_sections: customization.syllabus_sections.map((item, i) => i === index ? { ...item, key: e.target.value } : item) })} />
                <TextField sx={formatFieldSx} size="small" label="Section title" value={section.label || ''} onChange={e => setCustomization({ ...customization, syllabus_sections: customization.syllabus_sections.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} />
                <Button sx={{ color: '#FF8080' }} onClick={() => setCustomization({ ...customization, syllabus_sections: customization.syllabus_sections.filter((_, i) => i !== index) })}>Remove</Button>
              </Box>
            ))}
            <Button onClick={() => setCustomization({ ...customization, syllabus_sections: [...(customization.syllabus_sections || []), { key: '', label: '', enabled: true }] })}>Add Section</Button>
          </DialogContent>
          <DialogActions><Button onClick={() => setCustomizationDialog(false)}>Cancel</Button><Button variant="contained" onClick={saveCustomization}>Save Format</Button></DialogActions>
        </Dialog>

        <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Edit Faculty Account</DialogTitle>
          <DialogContent>
            <TextField
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Status"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              fullWidth
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} variant="contained" sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}>
              Save
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={assignmentDialog} onClose={() => setAssignmentDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Assign Course and Section</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mt: 1, mb: 1, color: '#666' }}>
              Assigning access for {selectedFaculty?.email}
            </Typography>
            <TextField
              select
              label="Course"
              value={assignmentForm.course_id}
              onChange={e => setAssignmentForm({ ...assignmentForm, course_id: e.target.value })}
              fullWidth
              margin="normal"
              SelectProps={{ native: true }}
            >
              <option value="">Select a course</option>
              {courses.map(course => (
                <option key={course.course_id} value={course.course_id}>
                  {course.course_code} - {course.course_title}
                </option>
              ))}
            </TextField>
            <TextField
              label="Handled Section"
              placeholder="e.g. BSIT-3A"
              value={assignmentForm.section}
              onChange={e => setAssignmentForm({ ...assignmentForm, section: e.target.value })}
              fullWidth
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAssignmentDialog(false)}>Cancel</Button>
            <Button onClick={handleAssignCourse} variant="contained" disabled={!assignmentForm.course_id} sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}>
              Assign Course
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </AdminLayout>
  )
}