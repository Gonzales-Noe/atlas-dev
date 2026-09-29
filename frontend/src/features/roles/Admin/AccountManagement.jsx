// src/features/roles/Admin/AccountManagement.jsx
// Tenant Admin account management — combines the polished dashboard UI with
// the real backend processes (faculty assignments, account updates, institution
// syllabus customization). Each action button carries its own process/dialog.

import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Stack, IconButton, Menu, MenuItem, Alert,
  InputLabel, Select, FormControl,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import AddLinkIcon from '@mui/icons-material/AddLink'
import SettingsIcon from '@mui/icons-material/Settings'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import { fetchAcademicStructure } from './academicApi'
import { ROUTES } from '../../../config/route'
import { PageHeader, GlassCard, StatCard, StatusChip, PrimaryBtn, OutlineBtn } from '../../../components/ui'

// Sections an institution admin can require in generated syllabi.
const DEFAULT_SYLLABUS_SECTIONS = [
  { key: 'overview', label: 'Course Overview', enabled: true },
  { key: 'basic', label: 'Basic Info', enabled: true },
  { key: 'details', label: 'Course Details', enabled: true },
  { key: 'iloat', label: 'ILOs & Assessments', enabled: true },
  { key: 'iloatmatrix', label: 'ILO-AT Matrix', enabled: true },
  { key: 'fwmap', label: 'Framework Mapping', enabled: true },
  { key: 'ilofwmatrix', label: 'ILO-Framework Matrix', enabled: true },
  { key: 'schedule', label: 'Weekly Schedule', enabled: true },
  { key: 'tos', label: 'Table of Specifications', enabled: true },
  { key: 'grading', label: 'Grading', enabled: true },
  { key: 'policies', label: 'Policies', enabled: true },
]

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

// Derive a friendly display name from the account email (no name field on the API).
function displayName(fac) {
  if (!fac) return '—'
  const local = (fac.email || '').split('@')[0]
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function initials(fac) {
  return displayName(fac).split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '–'
}

export default function AdminAccountManagement() {
  const [faculty, setFaculty] = useState([])
  const [courses, setCourses] = useState([])
  const [colleges, setColleges] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [detailDialog, setDetailDialog] = useState(false)
  const [assignmentDialog, setAssignmentDialog] = useState(false)
  const [customizationDialog, setCustomizationDialog] = useState(false)

  const [selectedFaculty, setSelectedFaculty] = useState(null)
  const [editForm, setEditForm] = useState({ email: '', status: 'active' })
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', college_id: '' })
  const [assignmentForm, setAssignmentForm] = useState({ course_id: '', course_code: '', course_title: '', description: '', section: '' })
  const [assignmentFilters, setAssignmentFilters] = useState({ college_id: '' })
  const [customization, setCustomization] = useState({
    header_image_url: '', footer_image_url: '', header_text: '',
    footer_text: '', syllabus_sections: DEFAULT_SYLLABUS_SECTIONS,
  })

  const [anchorEl, setAnchorEl] = useState(null)
  const [menuItem, setMenuItem] = useState(null)
  const [sections, setSections] = useState([])

  useEffect(() => {
    loadAssignments()
    loadCustomization()
    fetchAcademicStructure()
      .then(data => setSections(data.sections || []))
      .catch(() => setSections([]))
  }, [])

  async function loadAssignments() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/users/faculty-assignments/')
      setFaculty(data.faculty || [])
      setCourses(data.courses || [])
      setColleges(data.colleges || [])
      setAssignments(data.assignments || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load faculty assignments.')
    } finally {
      setLoading(false)
    }
  }

  async function loadCustomization() {
    try {
      const { data } = await api.get('/users/institution-customization/')
      setCustomization(prev => ({
        ...prev,
        ...data,
        syllabus_sections: (data.syllabus_sections && data.syllabus_sections.length)
          ? data.syllabus_sections
          : DEFAULT_SYLLABUS_SECTIONS,
      }))
    } catch (err) {
      // Non-fatal: customization may not be configured yet.
      setError(err.response?.data?.detail || 'Failed to load institution customization.')
    }
  }

  const readImageFile = (file, field) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCustomization(prev => ({ ...prev, [field]: reader.result }))
    reader.readAsDataURL(file)
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = faculty.filter(fac => {
    const q = searchTerm.toLowerCase()
    const matchSearch = !q
      || fac.email?.toLowerCase().includes(q)
      || displayName(fac).toLowerCase().includes(q)
      || (fac.institution_name || '').toLowerCase().includes(q)
    const matchRole = !roleFilter || fac.role === roleFilter
    const matchStatus = !statusFilter || (statusFilter === 'active' ? fac.is_active : !fac.is_active)
    return matchSearch && matchRole && matchStatus
  })

  const assignmentsFor = userId => assignments.filter(item => item.faculty_id === userId)
  const activeFaculty = faculty.filter(f => f.is_active).length
  const inactiveFaculty = faculty.filter(f => !f.is_active).length
  const totalCourses = assignments.length

  // ── Menu helpers ───────────────────────────────────────────────────────────
  function handleMenuOpen(e, fac) { setAnchorEl(e.currentTarget); setMenuItem(fac) }
  function handleMenuClose() { setAnchorEl(null); setMenuItem(null) }

  // ── Edit account (PATCH /users/accounts/<user_id>/) ────────────────────────
  function handleEdit(fac) {
    setSelectedFaculty(fac)
    setEditForm({ email: fac.email, status: fac.is_active ? 'active' : 'inactive', college_id: fac.college_id || '' })
    setEditDialog(true)
    handleMenuClose()
  }

  async function handleSaveEdit() {
    try {
      await api.patch(`/users/accounts/${selectedFaculty.user_id}/`, {
        email: editForm.email,
        is_active: editForm.status === 'active',
        college_id: editForm.college_id || undefined,
      })
      setEditDialog(false)
      setNotice('Account updated.')
      loadAssignments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update faculty account.')
    }
  }

  // ── Add faculty (POST /users/faculty/) ────────────────────────────────────
  function handleCreate() {
    setCreateForm({ full_name: '', email: '', password: '', college_id: '' })
    setCreateDialog(true)
    handleMenuClose()
  }

  async function handleSaveCreate() {
    try {
      await api.post('/users/faculty/', {
        full_name: createForm.full_name,
        email: createForm.email,
        password: createForm.password,
        college_id: createForm.college_id || undefined,
      })
      setCreateDialog(false)
      setNotice('Faculty account created.')
      loadAssignments()
    } catch (err) {
      const detail = err.response?.data?.detail
      const errors = err.response?.data
      let msg = detail
      if (errors && typeof errors === 'object' && !detail) {
        msg = Object.entries(errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
      }
      setError(msg || 'Failed to create faculty account.')
      console.error('Create faculty error:', err.response?.data)
    }
  }

  // ── Activate / deactivate (PATCH is_active) ────────────────────────────────
  async function handleToggleActive(fac) {
    handleMenuClose()
    try {
      await api.patch(`/users/accounts/${fac.user_id}/`, { is_active: !fac.is_active })
      setNotice(fac.is_active ? 'Account deactivated.' : 'Account reactivated.')
      loadAssignments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update account status.')
    }
  }

  // ── Assign course + section (POST /users/faculty-assignments/) ─────────────
  function openAssignmentDialog(fac) {
    const current = assignmentsFor(fac.user_id)[0]
    setSelectedFaculty(fac)
    setAssignmentForm({
      course_id: current?.course_id || '',
      course_code: '', course_title: '', description: '', section: current?.section || '',
    })
    // Reset college filter and pre-select faculty's college if assigned
    setAssignmentFilters({ college_id: fac.college_id || '' })
    // Reload courses filtered by faculty's college
    if (fac.college_id) {
      api.get('/users/faculty-assignments/', { params: { college_id: fac.college_id } })
        .then(({ data }) => setCourses(data.courses || []))
        .catch(err => console.error('Failed to load filtered courses:', err))
    }
    setAssignmentDialog(true)
    handleMenuClose()
  }

  // Pre-fill the handled section from the course's registered section block.
  function applyCourseSection(courseId) {
    const course = courses.find(item => item.course_id === courseId)
    const courseSection = course?.section
    if (courseSection) {
      setAssignmentForm(prev => ({ ...prev, section: courseSection }))
    }
  }

  async function handleAssignCourse() {
    const hasCourseId = assignmentForm.course_id
    const hasNewCourse = assignmentForm.course_code && assignmentForm.course_title
    if (!hasCourseId && !hasNewCourse) return
    if (!assignmentForm.section) return
    try {
      await api.post('/users/faculty-assignments/', {
        faculty_id: selectedFaculty.user_id,
        ...assignmentForm,
      })
      setAssignmentDialog(false)
      setNotice('Course assigned.')
      loadAssignments()
    } catch (err) {
      const detail = err.response?.data?.detail
      const errors = err.response?.data
      let msg = detail
      if (errors && typeof errors === 'object' && !detail) {
        msg = Object.entries(errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
      }
      setError(msg || 'Failed to assign course.')
      console.error('Assign course error:', err.response?.data)
    }
  }

  function handleViewDetail(fac) {
    setSelectedFaculty(fac)
    setDetailDialog(true)
    handleMenuClose()
  }

  // ── Syllabus format (PATCH /users/institution-customization/) ──────────────
  async function saveCustomization() {
    try {
      await api.patch('/users/institution-customization/', customization)
      setCustomizationDialog(false)
      setNotice('Syllabus format saved.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save institution customization.')
    }
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Accounts"
        subtitle="Manage faculty accounts, course assignments, and access within your institution"
        action={<PrimaryBtn onClick={handleCreate}><AddIcon fontSize="small" /> Add Faculty</PrimaryBtn>}
      />

      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard title="Total Faculty"    value={faculty.length}    icon="👨‍🏫" accent="#FF6B6B" />
        <StatCard title="Active Faculty"   value={activeFaculty}     icon="✅" accent="#5EDA7E" />
        <StatCard title="Inactive"         value={inactiveFaculty}   icon="⏸️" accent="#FFB74D" />
        <StatCard title="Courses Assigned" value={totalCourses}       icon="📚" accent="#60AAFF" />
      </div>

      {/* Filter bar */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search by name, email, or institution…"
            size="small" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            sx={{ flex: 1, minWidth: 220, ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }}
          />
          <TextField
            select size="small" label="Role" value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            SelectProps={{ native: true }}
            sx={{ minWidth: 130, ...inputSx }}
          >
            <option value="">All Roles</option>
            <option value="faculty">Faculty</option>
            <option value="admin">Admin</option>
          </TextField>
          <TextField
            select size="small" label="Status" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            SelectProps={{ native: true }}
            sx={{ minWidth: 130, ...inputSx }}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </TextField>
          <OutlineBtn onClick={() => setCustomizationDialog(true)}>
            <SettingsIcon fontSize="small" /> Syllabus Format
          </OutlineBtn>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard style={{ padding: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Name & Email', 'Role', 'Status', 'College', 'Assigned Courses / Sections', 'Actions'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', color: 'var(--text-secondary) !important', textTransform: 'uppercase', py: 1.5, borderBottom: '1px solid var(--border-color)' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && filtered.map(fac => (
                <TableRow key={fac.user_id} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #8B0000, #C0392B)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.78rem', fontWeight: 800, color: '#fff', flexShrink: 0,
                      }}>
                        {initials(fac)}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{displayName(fac)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{fac.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <StatusChip label={fac.role} type={fac.role === 'admin' ? 'warning' : 'info'} />
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <StatusChip label={fac.is_active ? 'active' : 'inactive'} type={fac.is_active ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {fac.college_code ? `${fac.college_code} - ${fac.college_name}` : '—'}
                    </span>
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    {assignmentsFor(fac.user_id).length === 0 ? (
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>None assigned</span>
                    ) : (
                      assignmentsFor(fac.user_id).map(item => (
                        <div key={item.assignment_id} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {item.course_code}{item.section ? ` · ${item.section}` : ''}
                        </div>
                      ))
                    )}
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <IconButton size="small" onClick={() => handleEdit(fac)}
                      sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--text-primary)', background: 'var(--active-bg)' } }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => openAssignmentDialog(fac)}
                      sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--text-primary)', background: 'var(--active-bg)' } }}>
                      <AddLinkIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={e => handleMenuOpen(e, fac)}
                      sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--text-primary)', background: 'var(--active-bg)' } }}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu
                      anchorEl={anchorEl}
                      open={Boolean(anchorEl) && menuItem?.user_id === fac.user_id}
                      onClose={handleMenuClose}
                      PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none !important', border: '1px solid var(--border-color) !important', borderRadius: '14px !important', minWidth: 170 } }}
                    >
                      <MenuItem onClick={() => handleViewDetail(fac)}>View Profile</MenuItem>
                      <MenuItem onClick={() => handleEdit(fac)}>Edit Account</MenuItem>
                      <MenuItem onClick={() => openAssignmentDialog(fac)}>Assign Course</MenuItem>
                      <Divider sx={{ borderColor: 'var(--border-color) !important', my: '4px !important' }} />
                      <MenuItem onClick={() => handleToggleActive(fac)} sx={{ color: fac.is_active ? '#FFB74D !important' : '#5EDA7E !important' }}>
                        {fac.is_active ? 'Deactivate' : 'Reactivate'}
                      </MenuItem>
                    </Menu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            No accounts match your search.
          </div>
        )}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            Loading faculty accounts…
          </div>
        )}
      </GlassCard>

      {/* Detail Dialog */}
      <Dialog open={detailDialog} onClose={() => setDetailDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Faculty Profile</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          {selectedFaculty && (
            <Stack spacing={2.5}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#8B0000,#C0392B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {initials(selectedFaculty)}
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{displayName(selectedFaculty)}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{selectedFaculty.email}</div>
                </div>
              </div>
              {[
                { label: 'INSTITUTION', value: selectedFaculty.institution_name || '—' },
                { label: 'COLLEGE', value: selectedFaculty.college_code ? `${selectedFaculty.college_code} - ${selectedFaculty.college_name}` : '—' },
                { label: 'ROLE', value: <StatusChip label={selectedFaculty.role} type={selectedFaculty.role === 'admin' ? 'warning' : 'info'} /> },
                { label: 'STATUS', value: <StatusChip label={selectedFaculty.is_active ? 'active' : 'inactive'} type={selectedFaculty.is_active ? 'active' : 'inactive'} /> },
                { label: 'ASSIGNED COURSES', value: assignmentsFor(selectedFaculty.user_id).length },
                { label: 'CREATED', value: selectedFaculty.created_at ? new Date(selectedFaculty.created_at).toLocaleString() : '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setDetailDialog(false)}>Close</OutlineBtn>
          <PrimaryBtn onClick={() => { setDetailDialog(false); handleEdit(selectedFaculty) }}>
            <EditIcon fontSize="small" /> Edit
          </PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Edit Faculty Account</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            <TextField label="Email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} fullWidth size="small" type="email" sx={inputSx} />
            <TextField select label="Status" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              SelectProps={{ native: true }} fullWidth size="small" sx={inputSx}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </TextField>
            {colleges.length > 0 && (
              <TextField
                select label="College (Optional)"
                value={editForm.college_id}
                onChange={e => setEditForm({ ...editForm, college_id: e.target.value })}
                fullWidth size="small" sx={inputSx}
                SelectProps={{ native: false }}
                helperText="Reassign faculty to a different college"
              >
                <MenuItem value="">-- No college assigned --</MenuItem>
                {colleges.map(college => (
                  <MenuItem key={college.college_id} value={college.college_id}>
                    {college.code} - {college.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setEditDialog(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleSaveEdit}>Save Changes</PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Add New Faculty</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            <TextField label="Full Name" value={createForm.full_name} onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })} fullWidth size="small" sx={inputSx} />
            <TextField label="Email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} fullWidth size="small" type="email" sx={inputSx} />
            <TextField label="Temporary Password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} fullWidth size="small" type="password" sx={inputSx} />
            {colleges.length > 0 && (
              <TextField
                select label="College (Optional)"
                value={createForm.college_id}
                onChange={e => setCreateForm({ ...createForm, college_id: e.target.value })}
                fullWidth size="small" sx={inputSx}
                SelectProps={{ native: false }}
                helperText="Assign faculty to a specific college within the institution"
              >
                <MenuItem value="">-- No college assigned --</MenuItem>
                {colleges.map(college => (
                  <MenuItem key={college.college_id} value={college.college_id}>
                    {college.code} - {college.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setCreateDialog(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleSaveCreate} disabled={!createForm.email || createForm.password.length < 8}>Create Account</PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Assign Course Dialog */}
      <Dialog open={assignmentDialog} onClose={() => setAssignmentDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Assign Course and Section</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Assigning access for <strong style={{ color: 'var(--text-primary)' }}>{selectedFaculty?.email}</strong>
            </div>

            {/* College Filter for Courses */}
            {colleges.length > 0 && (
              <div>
                <FormControl fullWidth size="small" sx={{ ...inputSx, minWidth: 0 }}>
                  <InputLabel id="college-filter-label">Filter by College (Optional)</InputLabel>
                  <Select
                    labelId="college-filter-label"
                    value={assignmentFilters.college_id}
                    label="Filter by College"
                    onChange={async e => {
                      const collegeId = e.target.value
                      setAssignmentFilters(prev => ({ ...prev, college_id: collegeId }))
                      // Reload courses filtered by college
                      try {
                        const { data } = await api.get('/users/faculty-assignments/', { params: { college_id: collegeId || undefined } })
                        setCourses(data.courses || [])
                      } catch (err) {
                        console.error('Failed to load filtered courses:', err)
                      }
                    }}
                  >
                    <MenuItem value="">-- All Colleges --</MenuItem>
                    {colleges.map(college => (
                      <MenuItem key={college.college_id} value={college.college_id}>
                        {college.code} - {college.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>
            )}

            <div>
              <FormControl fullWidth size="small" sx={{ ...inputSx, minWidth: 0 }}>
                <InputLabel id="course-select-label">Select Course</InputLabel>
                <Select
                  labelId="course-select-label"
                  value={assignmentForm.course_id}
                  label="Select Course"
                  onChange={e => {
                    const val = e.target.value
                    setAssignmentForm({ ...assignmentForm, course_id: val, course_code: '', course_title: '', description: '' })
                    applyCourseSection(val)
                  }}
                >
                  <MenuItem value="">-- Select a course --</MenuItem>
                  {courses.map(course => (
                    <MenuItem key={course.course_id} value={course.course_id}>
                      {course.course_code} - {course.course_title}
                      {course.program_name ? ` (${course.program_name})` : ''}
                      {course.college_name ? ` [${course.college_name}]` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {courses.length === 0 && (
                <div style={{ fontSize: '0.76rem', color: '#FFB74D', marginTop: 6 }}>
                  No courses in the catalog yet. Add them under{' '}
                  <a href={ROUTES.ADMIN.ACADEMIC_STRUCTURE} style={{ color: '#60AAFF' }}>Academic Structure</a>.
                </div>
              )}
            </div>

            <Divider sx={{ my: 1 }} />

            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', mb: 1 }}>Or create a new course</div>
            <TextField
              label="Course Code" placeholder="e.g. CS101"
              value={assignmentForm.course_code}
              onChange={e => setAssignmentForm({ ...assignmentForm, course_code: e.target.value, course_id: '' })}
              fullWidth size="small" sx={inputSx}
            />
            <TextField
              label="Course Title" placeholder="e.g. Introduction to Computer Science"
              value={assignmentForm.course_title}
              onChange={e => setAssignmentForm({ ...assignmentForm, course_title: e.target.value, course_id: '' })}
              fullWidth size="small" sx={inputSx}
            />
            <TextField
              label="Description (optional)"
              value={assignmentForm.description}
              onChange={e => setAssignmentForm({ ...assignmentForm, description: e.target.value, course_id: '' })}
              fullWidth size="small" multiline minRows={2} sx={inputSx}
            />

            <TextField
              select label="Handled Section"
              value={assignmentForm.section}
              onChange={e => setAssignmentForm({ ...assignmentForm, section: e.target.value })}
              fullWidth size="small" sx={inputSx}
              SelectProps={{ native: false }}
              helperText={sections.length ? undefined : 'No sections registered yet — you can type a section code.'}
            >
              <MenuItem value="">-- select section --</MenuItem>
              {sections.map(section => (
                <MenuItem key={section.section_id} value={section.display_name || section.code}>
                  {section.display_name || section.code}
                </MenuItem>
              ))}
              {assignmentForm.section && !sections.some(s => (s.display_name || s.code) === assignmentForm.section) && (
                <MenuItem value={assignmentForm.section}>{assignmentForm.section} (custom)</MenuItem>
              )}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setAssignmentDialog(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleAssignCourse} disabled={(!assignmentForm.course_id && (!assignmentForm.course_code || !assignmentForm.course_title)) || !assignmentForm.section}>Assign Course</PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Syllabus Format / Customization Dialog */}
      <Dialog open={customizationDialog} onClose={() => setCustomizationDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>University Syllabus Format</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2}>
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6 }}>HEADER IMAGE (OPTIONAL)</div>
              <OutlineBtn small onClick={() => document.getElementById('custom-header-input')?.click()}>
                {customization.header_image_url ? 'Replace header image' : 'Choose header image'}
              </OutlineBtn>
              <input id="custom-header-input" hidden type="file" accept="image/png,image/jpeg,image/webp"
                onChange={e => readImageFile(e.target.files?.[0], 'header_image_url')} />
              {customization.header_image_url && (
                <img src={customization.header_image_url} alt="Header preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 90, margin: '8px auto 0', objectFit: 'contain' }} />
              )}
            </div>
            <TextField label="Header text fallback (optional)" value={customization.header_text || ''}
              onChange={e => setCustomization({ ...customization, header_text: e.target.value })}
              fullWidth multiline minRows={2} size="small" sx={inputSx} />

            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', marginBottom: 6 }}>FOOTER IMAGE (OPTIONAL)</div>
              <OutlineBtn small onClick={() => document.getElementById('custom-footer-input')?.click()}>
                {customization.footer_image_url ? 'Replace footer image' : 'Choose footer image'}
              </OutlineBtn>
              <input id="custom-footer-input" hidden type="file" accept="image/png,image/jpeg,image/webp"
                onChange={e => readImageFile(e.target.files?.[0], 'footer_image_url')} />
              {customization.footer_image_url && (
                <img src={customization.footer_image_url} alt="Footer preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 90, margin: '8px auto 0', objectFit: 'contain' }} />
              )}
            </div>
            <TextField label="Footer text fallback (optional)" value={customization.footer_text || ''}
              onChange={e => setCustomization({ ...customization, footer_text: e.target.value })}
              fullWidth multiline minRows={2} size="small" sx={inputSx} />

            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Syllabus sections</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Add the sections your university requires. Use the key for the faculty workspace renderer.
            </div>
            {(customization.syllabus_sections || []).map((section, index) => (
              <div key={`${section.key}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 8 }}>
                <TextField size="small" label="Key" value={section.key || ''}
                  onChange={e => setCustomization({ ...customization, syllabus_sections: customization.syllabus_sections.map((item, i) => i === index ? { ...item, key: e.target.value } : item) })} sx={inputSx} />
                <TextField size="small" label="Section title" value={section.label || ''}
                  onChange={e => setCustomization({ ...customization, syllabus_sections: customization.syllabus_sections.map((item, i) => i === index ? { ...item, label: e.target.value } : item) })} sx={inputSx} />
                <OutlineBtn small onClick={() => setCustomization({ ...customization, syllabus_sections: customization.syllabus_sections.filter((_, i) => i !== index) })}>Remove</OutlineBtn>
              </div>
            ))}
            <OutlineBtn small onClick={() => setCustomization({ ...customization, syllabus_sections: [...(customization.syllabus_sections || []), { key: '', label: '', enabled: true }] })}>
              Add Section
            </OutlineBtn>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setCustomizationDialog(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={saveCustomization}>Save Format</PrimaryBtn>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  )
}