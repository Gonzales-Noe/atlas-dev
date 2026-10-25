// src/features/roles/Admin/AccountManagement.jsx
// Tenant Admin account management — combines the polished dashboard UI with
// the real backend processes (faculty assignments, account updates, institution
// syllabus customization). Each action button carries its own process/dialog.

import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Typography,
  TextField, Divider, Stack, IconButton, Menu, MenuItem, Alert, FormControlLabel, Switch,
  InputLabel, Select, FormControl, CircularProgress,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import AddLinkIcon from '@mui/icons-material/AddLink'
import SettingsIcon from '@mui/icons-material/Settings'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import {
  analyzeSyllabusTemplate,
  BUILTIN_SYLLABUS_EDITORS,
  describeDetectedStructure,
  fetchAcademicStructure,
} from './academicApi'
import { ROUTES } from '../../../config/route'
import { PageHeader, GlassCard, StatCard, StatusChip, PrimaryBtn, OutlineBtn } from '../../../components/ui'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

// Internal id for a section; never shown in the Syllabus Format UI.
function sectionKey(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Fall back to the email for older accounts without a stored display name.
function displayName(fac) {
  if (!fac) return '—'
  if (fac.full_name?.trim()) return fac.full_name.trim()
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
  const [assignments, setAssignments] = useState([])
  const [assignmentSections, setAssignmentSections] = useState([])
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
  const [confirmUnassign, setConfirmUnassign] = useState(null)
  const [removingId, setRemovingId] = useState(null)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [modalError, setModalError] = useState('')
  const [modalSuccess, setModalSuccess] = useState('')

  const [selectedFaculty, setSelectedFaculty] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuItem, setMenuItem] = useState(null)
  const [sections, setSections] = useState([])
  const [editForm, setEditForm] = useState({ full_name: '', email: '', status: 'active' })
  const [createForm, setCreateForm] = useState({
    full_name: '', email: '', password: '',
    assignments: [{ section: '', courses: [{ course_code: '', course_title: '' }] }],
  })
  const [assignmentForm, setAssignmentForm] = useState({ course_id: '', course_code: '', course_title: '', description: '', section: '' })
  const [customization, setCustomization] = useState({
    header_image_url: '', footer_image_url: '', header_text: '',
    footer_text: '', syllabus_sections: [], syllabus_style_profile: {},
  })
  const [templateImport, setTemplateImport] = useState({ busy: false, message: '', severity: 'info' })
  const [formatTab, setFormatTab] = useState('structure')

  useEffect(() => {
    loadAssignments()
    loadCustomization()
    fetchAcademicStructure()
      .then(data => setSections(data.sections || []))
      .catch(() => setSections([]))
  }, [])

  async function refreshAssignmentLists() {
    // Silent refresh used while a modal is open: never touches `loading`,
    // otherwise GlassCard swaps to the loading placeholder, the Edit modal
    // loses its backdrop context, and the screen goes black.
    try {
      const { data } = await api.get('/users/faculty-assignments/')
      setFaculty(data.faculty || [])
      setCourses(data.courses || [])
      setAssignments(data.assignments || [])
      setAssignmentSections(data.sections || [])
      setError('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load faculty assignments.')
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
      setAssignmentSections(data.sections || [])
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
        syllabus_sections: Array.isArray(data.syllabus_sections) ? data.syllabus_sections : [],
        syllabus_style_profile: data.syllabus_style_profile && typeof data.syllabus_style_profile === 'object'
          ? data.syllabus_style_profile
          : {},
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
  // Courses currently assigned to the faculty member open in the Edit dialog.
  const facultyAssignments = selectedFaculty ? assignmentsFor(selectedFaculty.user_id) : []
  // jasmin-rev merged sections from faculty-assignments with the academic
  // structure so the Assign dialog never shows an empty dropdown.
  const mergedSections = (() => {
    const seen = new Set()
    const merged = []
    const push = raw => {
      const value = (raw?.display_name || raw?.code || '').trim()
      if (!value || seen.has(value.toLowerCase())) return
      seen.add(value.toLowerCase())
      merged.push(raw)
    }
    assignmentSections.forEach(push)
    sections.forEach(push)
    assignments.forEach(a => a.section && push({ section_id: a.section_id, code: a.section, display_name: a.section }))
    return merged
  })()
  const activeFaculty = faculty.filter(f => f.is_active).length
  const inactiveFaculty = faculty.filter(f => !f.is_active).length
  const totalCourses = assignments.length

  // ── Menu helpers ───────────────────────────────────────────────────────────
  function handleMenuOpen(e, fac) { setAnchorEl(e.currentTarget); setMenuItem(fac) }
  function handleMenuClose() { setAnchorEl(null); setMenuItem(null) }

  // ── Edit account (PATCH /users/accounts/<user_id>/) ────────────────────────
  function handleEdit(fac) {
    setSelectedFaculty(fac)
    setEditForm({ full_name: fac.full_name || '', email: fac.email, status: fac.is_active ? 'active' : 'inactive' })
    setModalError('')
    setModalSuccess('')
    setConfirmUnassign(null)
    setEditDialog(true)
    handleMenuClose()
  }

  async function handleSaveEdit() {
    if (!selectedFaculty) return
    setModalError('')
    try {
      const { data } = await api.patch(`/users/accounts/${selectedFaculty.user_id}/`, {
        full_name: editForm.full_name,
        email: editForm.email,
        is_active: editForm.status === 'active',
      })
      setEditDialog(false)
      setSelectedFaculty(data || selectedFaculty)
      setNotice('Account updated.')
      refreshAssignmentLists().catch(() => {})
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to update faculty account.')
    }
  }

  // ── Add faculty (POST /users/faculty/) ────────────────────────────────────
  function handleCreate() {
    setCreateForm({
      full_name: '', email: '', password: '',
      assignments: [{ section: '', courses: [{ course_code: '', course_title: '' }] }],
    })
    setModalError('')
    setCreateDialog(true)
    handleMenuClose()
  }

  async function handleSaveCreate() {
    setModalError('')
    try {
      await api.post('/users/faculty/', {
        full_name: createForm.full_name,
        email: createForm.email,
        password: createForm.password,
        assignments: createForm.assignments,
      })
      setCreateDialog(false)
      setNotice('Faculty account created.')
      refreshAssignmentLists().catch(() => {})
    } catch (err) {
      const detail = err.response?.data?.detail
      const errors = err.response?.data
      let msg = detail
      if (errors && typeof errors === 'object' && !detail) {
        msg = Object.entries(errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
      }
      setModalError(msg || 'Failed to create faculty account.')
      console.error('Create faculty error:', err.response?.data)
    }
  }

  // ── Activate / deactivate (PATCH is_active) ────────────────────────────────
  async function handleToggleActive(fac) {
    handleMenuClose()
    try {
      await api.patch(`/users/accounts/${fac.user_id}/`, { is_active: !fac.is_active })
      setNotice(fac.is_active ? 'Account deactivated.' : 'Account reactivated.')
      refreshAssignmentLists().catch(() => {})
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update account status.')
    }
  }

  // ── Assign course + section (POST /users/faculty-assignments/) ─────────────
  // jasmin-rev behavior: always open blank so the admin picks a fresh
  // course + section; merge sections from faculty-assignments + academic structure.
  function openAssignmentDialog(fac) {
    setSelectedFaculty(fac)
    setAssignmentForm({
      course_id: '', course_code: '', course_title: '', description: '', section: '',
    })
    setModalError('')
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
    setModalError('')
    try {
      await api.post('/users/faculty-assignments/', {
        faculty_id: selectedFaculty.user_id,
        ...assignmentForm,
      })
      setAssignmentDialog(false)
      setAssignmentForm({ course_id: '', course_code: '', course_title: '', description: '', section: '' })
      setNotice('Course assigned.')
      await refreshAssignmentLists()
      // Keep the detail/edit context fresh when assigning from the dialogs.
      if (selectedFaculty?.user_id) {
        try {
          const { data } = await api.get('/users/faculty-assignments/')
          const refreshed = (data.faculty || []).find(f => f.user_id === selectedFaculty.user_id)
          if (refreshed) setSelectedFaculty(refreshed)
        } catch {
          // Non-fatal: list already reloaded above.
        }
      }
    } catch (err) {
      const detail = err.response?.data?.detail
      const errors = err.response?.data
      let msg = detail
      if (errors && typeof errors === 'object' && !detail) {
        msg = Object.entries(errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ')
      }
      setModalError(msg || 'Failed to assign course.')
      console.error('Assign course error:', err.response?.data)
    }
  }

  function handleViewDetail(fac) {
    setSelectedFaculty(fac)
    setDetailDialog(true)
    handleMenuClose()
  }

  // ── Delete account (DELETE /users/accounts/<user_id>/) ───────────────────
  // Deleting a non-admin removes just that user; deleting the last admin of
  // this institution removes the whole institution and all of its data, so a
  // re-used email starts from a clean first-time setup.
  async function handleConfirmDeleteAccount() {
    if (!confirmDeleteAccount) return
    setDeletingAccount(true)
    try {
      const { data } = await api.delete(`/users/accounts/${confirmDeleteAccount.user_id}/`)
      setNotice(
        data?.institution_deleted
          ? 'Account deleted. It was the last admin, so the institution and all of its data were removed — the email can be registered fresh.'
          : `Account for ${confirmDeleteAccount.email} deleted.`,
      )
      setConfirmDeleteAccount(null)
      setDetailDialog(false)
      setEditDialog(false)
      setSelectedFaculty(null)
      await refreshAssignmentLists()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete the account.')
    } finally {
      setDeletingAccount(false)
    }
  }

  // ── Remove course assignment (DELETE /users/faculty-assignments/) ──────────
  // Flow: click trash in Edit modal → inline confirm row inside that same modal
  // → confirm → success message stays visible in the modal (no black screen,
  // no stacked MUI Dialogs fighting over the backdrop).
  async function handleConfirmUnassign() {
    if (!confirmUnassign) return
    const removed = confirmUnassign
    setRemovingId(removed.assignment_id)
    setModalError('')
    setConfirmUnassign(null)
    try {
      await api.delete('/users/faculty-assignments/', {
        data: { assignment_id: removed.assignment_id },
      })
      const successMsg = removed.section
        ? `Course ${removed.course_code} (${removed.section}) has been deleted from this faculty.`
        : `Course ${removed.course_code} has been deleted from this faculty.`
      setModalSuccess(successMsg)
      setNotice(successMsg)
      // Refresh the list behind the open modal without unmounting it.
      // Uses the silent refresh so `loading` never flips and the Edit modal
      // keeps its backdrop (that flip is what turned the screen black).
      refreshAssignmentLists().catch(() => {})
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to remove the course assignment.')
    } finally {
      setRemovingId(null)
    }
  }

  // ── Syllabus format (PATCH /users/institution-customization/) ──────────────
  async function saveCustomization() {
    const hasUnnamedSubsection = (customization.syllabus_sections || []).some(section =>
      section.enabled !== false
      && !section.is_static
      && (Array.isArray(section.subsections) ? section.subsections : [])
        .some(subsection => !subsection.label?.trim()),
    )
    if (hasUnnamedSubsection) {
      setError('Add a name to each syllabus subsection before saving.')
      return
    }
    const syllabus_sections = (customization.syllabus_sections || [])
      .filter(section => section.label?.trim())
      .map((section, index) => {
        const label = section.label.trim()
        const key = BUILTIN_SYLLABUS_EDITORS[section.key]
          ? section.key
          : (section.key?.trim() || sectionKey(label) || `section-${index + 1}`)
        return {
          ...section,
          key,
          label,
          subsections: (Array.isArray(section.subsections) ? section.subsections : [])
            .filter(subsection => subsection.label?.trim())
            .map((subsection, subsectionIndex) => ({
              ...subsection,
              key: subsection.key?.trim() || sectionKey(subsection.label) || `subsection-${subsectionIndex + 1}`,
              label: subsection.label.trim(),
            })),
        }
      })
    try {
      await api.patch('/users/institution-customization/', { ...customization, syllabus_sections })
      setCustomization({ ...customization, syllabus_sections })
      setCustomizationDialog(false)
      setNotice('Syllabus format saved.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save institution customization.')
    }
  }

  // Replaces the sections/style in the dialog; persisted only by "Save Format".
  async function importSyllabusTemplate(file) {
    if (!file) return
    setTemplateImport({
      busy: true,
      message: 'Parsing syllabus (fast extract first; Docling may take up to ~35s then falls back)…',
      severity: 'info',
    })
    try {
      const result = await analyzeSyllabusTemplate(file)
      const branding = result.branding_suggestions || {}
      const styleProfile = result.style_profile && typeof result.style_profile === 'object'
        ? result.style_profile
        : {}
      if (Array.isArray(result.sections) && result.sections.length) {
        setCustomization(current => ({
          ...current,
          syllabus_template_name: result.template_name || file.name,
          syllabus_sections: result.sections,
          syllabus_style_profile: styleProfile,
          header_text: current.header_text || branding.header_text || '',
          footer_text: current.footer_text || branding.footer_text || '',
          header_image_url: current.header_image_url || branding.header_image_url || '',
          footer_image_url: current.footer_image_url || branding.footer_image_url || '',
        }))
        setFormatTab('structure')
        setTemplateImport({ busy: false, message: describeDetectedStructure(result), severity: 'success' })
      } else {
        setCustomization(current => ({
          ...current,
          syllabus_template_name: result.template_name || file.name,
          syllabus_style_profile: styleProfile,
          header_text: current.header_text || branding.header_text || '',
          footer_text: current.footer_text || branding.footer_text || '',
          header_image_url: current.header_image_url || branding.header_image_url || '',
          footer_image_url: current.footer_image_url || branding.footer_image_url || '',
        }))
        setTemplateImport({
          busy: false,
          message: result.detail || 'No sections were detected. Add them manually below.',
          severity: 'warning',
        })
      }
    } catch (err) {
      setTemplateImport({
        busy: false,
        message: err.response?.data?.detail || 'Could not analyze the syllabus template.',
        severity: 'error',
      })
    }
  }

  function updateStyleProfile(path, value) {
    setCustomization(current => {
      const profile = { ...(current.syllabus_style_profile || {}) }
      if (path === 'typography.body.family') {
        profile.typography = {
          ...(profile.typography || {}),
          body: { ...(profile.typography?.body || {}), family: value },
        }
      } else if (path === 'typography.body.size_pt') {
        profile.typography = {
          ...(profile.typography || {}),
          body: { ...(profile.typography?.body || {}), size_pt: Number(value) || 11 },
        }
      } else if (path === 'colors.accent') {
        profile.colors = { ...(profile.colors || {}), accent: value }
      } else if (path === 'page.size') {
        profile.page = { ...(profile.page || {}), size: value }
      }
      return { ...current, syllabus_style_profile: profile }
    })
  }

  function updateSyllabusSection(index, changes) {
    setCustomization(current => ({
      ...current,
      syllabus_sections: current.syllabus_sections.map((section, i) => (
        i === index ? { ...section, ...changes } : section
      )),
    }))
  }

  function addSyllabusSubsection(sectionIndex) {
    setCustomization(current => ({
      ...current,
      syllabus_sections: current.syllabus_sections.map((section, i) => (
        i === sectionIndex
          ? {
              ...section,
              subsections: [
                ...(Array.isArray(section.subsections) ? section.subsections : []),
                {
                  key: `subsection-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  label: '',
                  required: false,
                },
              ],
            }
          : section
      )),
    }))
  }

  function updateSyllabusSubsection(sectionIndex, subsectionIndex, changes) {
    setCustomization(current => ({
      ...current,
      syllabus_sections: current.syllabus_sections.map((section, i) => (
        i === sectionIndex
          ? {
              ...section,
              subsections: (section.subsections || []).map((subsection, j) => (
                j === subsectionIndex ? { ...subsection, ...changes } : subsection
              )),
            }
          : section
      )),
    }))
  }

  function removeSyllabusSubsection(sectionIndex, subsectionIndex) {
    setCustomization(current => ({
      ...current,
      syllabus_sections: current.syllabus_sections.map((section, i) => (
        i === sectionIndex
          ? { ...section, subsections: (section.subsections || []).filter((_, j) => j !== subsectionIndex) }
          : section
      )),
    }))
  }

  function updateTableColumn(sectionIndex, subsectionIndex, columnIndex, value) {
    const changeColumns = columns => columns.map((column, index) => (
      index === columnIndex ? value : column
    ))
    if (subsectionIndex == null) {
      updateSyllabusSection(sectionIndex, {
        table_columns: changeColumns(customization.syllabus_sections[sectionIndex].table_columns || []),
      })
      return
    }
    updateSyllabusSubsection(sectionIndex, subsectionIndex, {
      table_columns: changeColumns(customization.syllabus_sections[sectionIndex].subsections[subsectionIndex].table_columns || []),
    })
  }

  function updateTableColumnGroup(sectionIndex, subsectionIndex, columnIndex, value) {
    const field = subsectionIndex == null
      ? customization.syllabus_sections[sectionIndex]
      : customization.syllabus_sections[sectionIndex].subsections[subsectionIndex]
    const groups = Array.isArray(field?.table_column_groups) ? field.table_column_groups : []
    const nextGroups = Array.from(
      { length: (field?.table_columns || []).length },
      (_, index) => index === columnIndex ? value : (groups[index] || ''),
    )
    if (subsectionIndex == null) {
      updateSyllabusSection(sectionIndex, { table_column_groups: nextGroups })
      return
    }
    updateSyllabusSubsection(sectionIndex, subsectionIndex, { table_column_groups: nextGroups })
  }

  function addTableColumn(sectionIndex, subsectionIndex) {
    if (subsectionIndex == null) {
      updateSyllabusSection(sectionIndex, {
        table_columns: [...(customization.syllabus_sections[sectionIndex].table_columns || []), ''],
        table_column_groups: [...(customization.syllabus_sections[sectionIndex].table_column_groups || []), ''],
      })
      return
    }
    updateSyllabusSubsection(sectionIndex, subsectionIndex, {
      table_columns: [
        ...(customization.syllabus_sections[sectionIndex].subsections[subsectionIndex].table_columns || []),
        '',
      ],
      table_column_groups: [
        ...(customization.syllabus_sections[sectionIndex].subsections[subsectionIndex].table_column_groups || []),
        '',
      ],
    })
  }

  function removeTableColumn(sectionIndex, subsectionIndex, columnIndex) {
    const columns = subsectionIndex == null
      ? customization.syllabus_sections[sectionIndex].table_columns || []
      : customization.syllabus_sections[sectionIndex].subsections[subsectionIndex].table_columns || []
    const nextColumns = columns.filter((_, index) => index !== columnIndex)
    const groups = subsectionIndex == null
      ? customization.syllabus_sections[sectionIndex].table_column_groups || []
      : customization.syllabus_sections[sectionIndex].subsections[subsectionIndex].table_column_groups || []
    const table_column_groups = groups.filter((_, index) => index !== columnIndex)
    if (subsectionIndex == null) {
      updateSyllabusSection(sectionIndex, { table_columns: nextColumns, table_column_groups })
      return
    }
    updateSyllabusSubsection(sectionIndex, subsectionIndex, { table_columns: nextColumns, table_column_groups })
  }

  function renderTableColumns(section, sectionIndex, subsectionIndex = null) {
    const field = subsectionIndex == null
      ? section
      : (section.subsections || [])[subsectionIndex]
    const columns = Array.isArray(field?.table_columns) ? field.table_columns : []
    return (
      <Stack spacing={1} sx={{ pl: 2 }}>
        {columns.map((column, columnIndex) => (
          <Stack key={columnIndex} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
            <TextField
              size="small"
              label={`Column ${columnIndex + 1} heading`}
              value={column}
              onChange={event => updateTableColumn(sectionIndex, subsectionIndex, columnIndex, event.target.value)}
              sx={inputSx}
              fullWidth
            />
            <TextField
              size="small"
              label={`Group heading ${columnIndex + 1} (optional)`}
              helperText="Repeat the same heading on adjacent columns to merge them."
              value={field.table_column_groups?.[columnIndex] || ''}
              onChange={event => updateTableColumnGroup(sectionIndex, subsectionIndex, columnIndex, event.target.value)}
              sx={inputSx}
              fullWidth
            />
            <OutlineBtn small onClick={() => removeTableColumn(sectionIndex, subsectionIndex, columnIndex)}>Remove</OutlineBtn>
          </Stack>
        ))}
        <OutlineBtn small onClick={() => addTableColumn(sectionIndex, subsectionIndex)}>Add Column</OutlineBtn>
      </Stack>
    )
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
        <StatCard title="Total Faculty"    value={faculty.length}    icon="👨‍🏫" accent="#86EFAC" />
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
          <OutlineBtn onClick={() => { setTemplateImport({ busy: false, message: '', severity: 'info' }); setCustomizationDialog(true) }}>
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
                {['Name & Email', 'Role', 'Status', 'Assigned Courses / Sections', 'Actions'].map(h => (
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
                        background: 'linear-gradient(135deg, #15803D, #16A34A)',
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
                      <MenuItem
                        onClick={() => { setConfirmDeleteAccount(fac); handleMenuClose() }}
                        sx={{ color: '#86EFAC !important' }}
                      >
                        Delete Account
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
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#15803D,#16A34A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {initials(selectedFaculty)}
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{displayName(selectedFaculty)}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{selectedFaculty.email}</div>
                </div>
              </div>
              {[
                { label: 'INSTITUTION', value: selectedFaculty.institution_name || '—' },
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
            {modalError && editDialog && <Alert severity="error" onClose={() => setModalError('')}>{modalError}</Alert>}
            <TextField label="Full Name" value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} fullWidth size="small" sx={inputSx} />
            <TextField label="Email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} fullWidth size="small" type="email" sx={inputSx} />
            <TextField select label="Status" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              SelectProps={{ native: true }} fullWidth size="small" sx={inputSx}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </TextField>
            <Divider sx={{ my: 0.5 }} />

            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 10 }}>
                ASSIGNED COURSES ({facultyAssignments.length})
              </div>
              {modalSuccess && <Alert severity="success" onClose={() => setModalSuccess('')} sx={{ mb: 1.5 }}>{modalSuccess}</Alert>}
              {facultyAssignments.length === 0 ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                  No courses assigned yet. Use “Assign Course” from the account menu to add one.
                </div>
              ) : (
                <Stack spacing={1}>
                  {facultyAssignments.map(item => (
                    <div key={item.assignment_id}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '8px 8px 8px 12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: 2,
                          background: 'var(--input-bg)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {item.course_code} — {item.course_title}
                          </div>
                          {item.section && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              Section: {item.section}
                            </div>
                          )}
                        </div>
                        <IconButton
                          aria-label={`Remove ${item.course_code}`}
                          title="Remove course assignment"
                          size="small"
                          disabled={removingId === item.assignment_id}
                          onClick={() => { setModalSuccess(''); setModalError(''); setConfirmUnassign(item) }}
                          sx={{
                            color: 'var(--brand-green-bright, #4ADE80)',
                            '&:hover': { background: 'rgba(231,76,60,0.12)' },
                            '&.Mui-disabled': { color: 'var(--text-tertiary)' },
                          }}
                        >
                          {removingId === item.assignment_id
                            ? <CircularProgress size={16} sx={{ color: 'var(--brand-green-bright, #4ADE80)' }} />
                            : <DeleteOutlinedIcon fontSize="small" />}
                        </IconButton>
                      </div>
                      {/* Inline confirmation — stays inside the same Edit modal so the
                          backdrop never goes black from stacked MUI Dialogs. */}
                      {confirmUnassign?.assignment_id === item.assignment_id && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: '10px 12px',
                            border: '1px solid rgba(231,76,60,0.45)',
                            borderRadius: 8,
                            background: 'rgba(231,76,60,0.08)',
                          }}
                        >
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 8 }}>
                            Delete <strong>{item.course_code}</strong>
                            {item.section ? ` (Section: ${item.section})` : ''} from{' '}
                            <strong>{selectedFaculty?.email}</strong>? They will immediately lose
                            access to that course workspace. The course itself stays in the catalog.
                          </div>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <OutlineBtn small onClick={() => setConfirmUnassign(null)} disabled={Boolean(removingId)}>
                              Cancel
                            </OutlineBtn>
                            <PrimaryBtn small onClick={handleConfirmUnassign} disabled={Boolean(removingId)}>
                              {removingId ? 'Deleting…' : 'Delete Course'}
                            </PrimaryBtn>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </Stack>
              )}
            </div>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setEditDialog(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleSaveEdit}>Save Changes</PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Delete Account Confirmation */}
      <Dialog
        open={Boolean(confirmDeleteAccount)}
        onClose={() => { if (!deletingAccount) setConfirmDeleteAccount(null) }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Delete account?</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            This permanently deletes{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{confirmDeleteAccount?.email}</strong>
            {confirmDeleteAccount?.role === 'admin' && (
              <>
                {' '}— an <strong style={{ color: 'var(--text-primary)' }}>admin</strong>. If this is the
                last admin, the whole institution and all of its data (courses, syllabi, assessments,
                files, other accounts) are deleted too, and the email can be registered fresh.
              </>
            )}
            {confirmDeleteAccount?.role !== 'admin' && (
              <> along with their course loads, quick exams, and other personal data.</>
            )}
            {' '}This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setConfirmDeleteAccount(null)} disabled={deletingAccount}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleConfirmDeleteAccount} disabled={deletingAccount}>
            {deletingAccount ? 'Deleting…' : 'Delete Account'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="md" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Add New Faculty</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            {modalError && <Alert severity="error" onClose={() => setModalError('')}>{modalError}</Alert>}
            <TextField label="Full Name" value={createForm.full_name} onChange={e => setCreateForm({ ...createForm, full_name: e.target.value })} fullWidth size="small" sx={inputSx} />
            <TextField label="Email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} fullWidth size="small" type="email" sx={inputSx} />
            <TextField label="Temporary Password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} fullWidth size="small" type="password" sx={inputSx} />
            <Divider sx={{ borderColor: 'var(--border-color)' }} />
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Sections and courses</div>
            {createForm.assignments.map((group, groupIndex) => (
              <div key={groupIndex} style={{ padding: 12, border: '1px solid var(--border-color)', borderRadius: 12 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      label="Section"
                      value={group.section}
                      onChange={event => setCreateForm(current => ({
                        ...current,
                        assignments: current.assignments.map((item, index) => index === groupIndex ? { ...item, section: event.target.value } : item),
                      }))}
                      fullWidth size="small" sx={inputSx}
                    />
                    <OutlineBtn
                      small
                      disabled={createForm.assignments.length === 1}
                      onClick={() => setCreateForm(current => ({ ...current, assignments: current.assignments.filter((_, index) => index !== groupIndex) }))}
                    >Remove section</OutlineBtn>
                  </Stack>
                  {group.courses.map((course, courseIndex) => (
                    <div key={courseIndex} style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: 8 }}>
                      <TextField label="Course code" value={course.course_code}
                        onChange={event => setCreateForm(current => ({
                          ...current,
                          assignments: current.assignments.map((item, index) => index === groupIndex ? {
                            ...item,
                            courses: item.courses.map((entry, courseNo) => courseNo === courseIndex ? { ...entry, course_code: event.target.value } : entry),
                          } : item),
                        }))}
                        size="small" sx={inputSx} />
                      <TextField label="Course name" value={course.course_title}
                        onChange={event => setCreateForm(current => ({
                          ...current,
                          assignments: current.assignments.map((item, index) => index === groupIndex ? {
                            ...item,
                            courses: item.courses.map((entry, courseNo) => courseNo === courseIndex ? { ...entry, course_title: event.target.value } : entry),
                          } : item),
                        }))}
                        size="small" sx={inputSx} />
                      <OutlineBtn
                        small
                        disabled={group.courses.length === 1}
                        onClick={() => setCreateForm(current => ({
                          ...current,
                          assignments: current.assignments.map((item, index) => index === groupIndex ? { ...item, courses: item.courses.filter((_, courseNo) => courseNo !== courseIndex) } : item),
                        }))}
                      >Remove</OutlineBtn>
                    </div>
                  ))}
                  <OutlineBtn small onClick={() => setCreateForm(current => ({
                    ...current,
                    assignments: current.assignments.map((item, index) => index === groupIndex ? { ...item, courses: [...item.courses, { course_code: '', course_title: '' }] } : item),
                  }))}>
                    <AddIcon fontSize="small" /> Add course to section
                  </OutlineBtn>
                </Stack>
              </div>
            ))}
            <OutlineBtn onClick={() => setCreateForm(current => ({
              ...current,
              assignments: [...current.assignments, { section: '', courses: [{ course_code: '', course_title: '' }] }],
            }))}>
              <AddIcon fontSize="small" /> Add another section
            </OutlineBtn>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setCreateDialog(false)}>Cancel</OutlineBtn>
          <PrimaryBtn
            onClick={handleSaveCreate}
            disabled={!createForm.full_name.trim() || !createForm.email || createForm.password.length < 8
              || createForm.assignments.some(group => !group.section.trim() || group.courses.some(course => !course.course_code.trim() || !course.course_title.trim()))}
          >Create Account and Assign Courses</PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Assign Course Dialog */}
      <Dialog open={assignmentDialog} onClose={() => setAssignmentDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Assign Course and Section</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            {modalError && assignmentDialog && <Alert severity="error" onClose={() => setModalError('')}>{modalError}</Alert>}
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Assigning access for <strong style={{ color: 'var(--text-primary)' }}>{selectedFaculty?.email}</strong>
            </div>

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
              helperText={mergedSections.length ? undefined : 'No sections registered yet — you can type a section code.'}
            >
              <MenuItem value="">-- select section --</MenuItem>
              {mergedSections.map(section => (
                <MenuItem key={section.section_id || section.display_name || section.code} value={section.display_name || section.code}>
                  {section.display_name || section.code}
                </MenuItem>
              ))}
              {assignmentForm.section && !mergedSections.some(s => (s.display_name || s.code) === assignmentForm.section) && (
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
      <Dialog open={customizationDialog} onClose={() => setCustomizationDialog(false)} maxWidth="md" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>University Syllabus Format</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Upload a syllabus example to detect structure and style automatically (parser-first). Review, then Save Format.
            </div>
            <div>
              <OutlineBtn small disabled={templateImport.busy} onClick={() => document.getElementById('syllabus-template-import')?.click()}>
                {templateImport.busy ? 'Analyzing template…' : 'Import from syllabus file (PDF/DOCX)'}
              </OutlineBtn>
              <input id="syllabus-template-import" hidden type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => { importSyllabusTemplate(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            {templateImport.message && (
              <Alert severity={templateImport.severity} onClose={templateImport.busy ? undefined : () => setTemplateImport(current => ({ ...current, message: '' }))}>
                {templateImport.message}
              </Alert>
            )}

            <Stack direction="row" spacing={1}>
              <OutlineBtn small onClick={() => setFormatTab('structure')}
                style={formatTab === 'structure' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                Structure
              </OutlineBtn>
              <OutlineBtn small onClick={() => setFormatTab('style')}
                style={formatTab === 'style' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                Style & branding
              </OutlineBtn>
            </Stack>

            {formatTab === 'style' && (
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
                <TextField label="Header text (optional)" value={customization.header_text || ''}
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
                <TextField label="Footer text (optional)" value={customization.footer_text || ''}
                  onChange={e => setCustomization({ ...customization, footer_text: e.target.value })}
                  fullWidth multiline minRows={2} size="small" sx={inputSx} />

                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Detected style profile</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <TextField size="small" label="Body font" sx={inputSx}
                    value={customization.syllabus_style_profile?.typography?.body?.family || ''}
                    onChange={e => updateStyleProfile('typography.body.family', e.target.value)} />
                  <TextField size="small" label="Body size (pt)" type="number" sx={inputSx}
                    value={customization.syllabus_style_profile?.typography?.body?.size_pt ?? ''}
                    onChange={e => updateStyleProfile('typography.body.size_pt', e.target.value)} />
                  <TextField size="small" label="Accent color" sx={inputSx}
                    value={customization.syllabus_style_profile?.colors?.accent || ''}
                    onChange={e => updateStyleProfile('colors.accent', e.target.value)} />
                  <TextField size="small" label="Page size" sx={inputSx}
                    value={customization.syllabus_style_profile?.page?.size || ''}
                    onChange={e => updateStyleProfile('page.size', e.target.value)} />
                </div>
                <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                  Style confidence:{' '}
                  {customization.syllabus_style_profile?.source?.confidence != null
                    ? `${Math.round(Number(customization.syllabus_style_profile.source.confidence) * 100)}%`
                    : '—'}
                  {' · '}Parser: {customization.syllabus_style_profile?.source?.parser || '—'}
                </Typography>
              </Stack>
            )}

            {formatTab === 'structure' && (
              <>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Syllabus sections</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Sections, subsections and tables detected from the template, or add them yourself.
            </div>
            {(customization.syllabus_sections || []).map((section, index) => (
              <Stack key={`${section.key || section.label || 'section'}-${index}`} spacing={1}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'start' }}>
                  <TextField size="small" label="Section title" value={section.label || ''} fullWidth
                    onChange={e => updateSyllabusSection(index, {
                      label: e.target.value,
                      // Keep built-in editor keys; otherwise derive the key from the title.
                      key: BUILTIN_SYLLABUS_EDITORS[section.key] ? section.key : sectionKey(e.target.value),
                    })} sx={inputSx}
                    helperText={!section.is_static && BUILTIN_SYLLABUS_EDITORS[section.key]
                      ? `Uses the built-in ${BUILTIN_SYLLABUS_EDITORS[section.key]} editor.`
                      : undefined} />
                  {section.confidence != null && (
                    <Typography
                      component="span"
                      title="Detection confidence for this section"
                      sx={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        alignSelf: 'center',
                        px: 1,
                        py: 0.4,
                        borderRadius: 1,
                        whiteSpace: 'nowrap',
                        color: Number(section.confidence) >= 0.75 ? '#166534' : Number(section.confidence) >= 0.5 ? '#854d0e' : '#991b1b',
                        bgcolor: Number(section.confidence) >= 0.75 ? 'rgba(22,101,52,0.12)' : Number(section.confidence) >= 0.5 ? 'rgba(133,77,14,0.12)' : 'rgba(153,27,27,0.12)',
                      }}
                    >
                      {Math.round(Number(section.confidence) * 100)}%
                    </Typography>
                  )}
                  <OutlineBtn small onClick={() => setCustomization(current => ({ ...current, syllabus_sections: current.syllabus_sections.filter((_, i) => i !== index) }))}>Remove</OutlineBtn>
                </div>
                <Stack direction="row" spacing={2}>
                  <FormControlLabel
                    control={<Switch checked={section.enabled !== false} onChange={e => updateSyllabusSection(index, { enabled: e.target.checked })} />}
                    label="Show to faculty"
                  />
                  <FormControlLabel
                    control={<Switch checked={Boolean(section.is_static)} onChange={e => updateSyllabusSection(index, { is_static: e.target.checked })} />}
                    label="Fixed for all"
                  />
                </Stack>
                {section.is_static && (
                  <TextField size="small" label="Shared fixed content" value={section.static_content || ''} multiline minRows={2}
                    onChange={e => updateSyllabusSection(index, { static_content: e.target.value })} sx={inputSx} />
                )}
                {!section.is_static && (
                  <Stack spacing={1}>
                    <FormControlLabel
                      control={<Switch checked={Boolean(section.table_enabled)} onChange={e => updateSyllabusSection(index, { table_enabled: e.target.checked })} />}
                      label="Include a table in this section"
                    />
                    {section.table_enabled && renderTableColumns(section, index)}
                  </Stack>
                )}
                {!section.is_static && (
                  <Stack spacing={1} sx={{ pl: 1.5, borderLeft: '2px solid var(--border-color)' }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Subsections / answer fields</Typography>
                    {(Array.isArray(section.subsections) ? section.subsections : []).map((subsection, subsectionIndex) => (
                      <Stack key={subsection.key || subsectionIndex} spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField
                            size="small"
                            label="Subsection name"
                            value={subsection.label || ''}
                            onChange={e => updateSyllabusSubsection(index, subsectionIndex, { label: e.target.value })}
                            sx={inputSx}
                            fullWidth
                          />
                          <FormControlLabel
                            control={<Switch checked={Boolean(subsection.required)} onChange={e => updateSyllabusSubsection(index, subsectionIndex, { required: e.target.checked })} />}
                            label="Required"
                            sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                          />
                          <OutlineBtn small onClick={() => removeSyllabusSubsection(index, subsectionIndex)}>Remove</OutlineBtn>
                        </Stack>
                        <FormControlLabel
                          control={<Switch checked={Boolean(subsection.table_enabled)} onChange={e => updateSyllabusSubsection(index, subsectionIndex, { table_enabled: e.target.checked })} />}
                          label="Use a table for this subsection"
                        />
                        {subsection.table_enabled && renderTableColumns(section, index, subsectionIndex)}
                      </Stack>
                    ))}
                    <OutlineBtn small onClick={() => addSyllabusSubsection(index)}>Add Subsection</OutlineBtn>
                  </Stack>
                )}
              </Stack>
            ))}
            <OutlineBtn small onClick={() => setCustomization(current => ({
              ...current,
              syllabus_sections: [
                ...(current.syllabus_sections || []),
                {
                  key: `section-${(current.syllabus_sections || []).length + 1}`,
                  label: '',
                  enabled: true,
                  is_static: false,
                  static_content: '',
                  table_enabled: false,
                  table_columns: [],
                  subsections: [],
                },
              ],
            }))}>
              Add Section
            </OutlineBtn>
              </>
            )}
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