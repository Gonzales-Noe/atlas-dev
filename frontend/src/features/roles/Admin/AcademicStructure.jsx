import { useCallback, useEffect, useState } from 'react'
import {
  Alert, IconButton, MenuItem, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import RefreshIcon from '@mui/icons-material/Refresh'

import AdminLayout from './AdminLayout'
import {
  COURSE_CATEGORIES, createCourse, createSection, deleteCourse, deleteSection,
  fetchAcademicStructure, updateCourse,
} from './academicApi'
import { GlassCard, OutlineBtn, PageHeader, PrimaryBtn, StatCard, StatusChip } from '../../../components/ui'
import LoadingState from '../../../components/LoadingState'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

const headCellSx = {
  fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em',
  color: 'var(--text-secondary) !important', textTransform: 'uppercase',
  py: 1.5, borderBottom: '1px solid var(--border-color)',
}

const bodyCellSx = { borderBottom: '1px solid var(--border-color)' }
const emptyStructure = { sections: [], courses: [] }
const emptyCourse = () => ({
  course_code: '', course_title: '', description: '', category: 'professional', units: '', section: '',
})

function toMessage(err, fallback) {
  const data = err?.response?.data
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string') return data.detail
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ') || fallback
}

export default function AdminAcademicStructure() {
  const [structure, setStructure] = useState(emptyStructure)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState(0)
  const [sectionForm, setSectionForm] = useState({ code: '', name: '' })
  const [courseForm, setCourseForm] = useState(emptyCourse)
  const [editingCourse, setEditingCourse] = useState(null)
  const [courseFilter, setCourseFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setStructure(await fetchAcademicStructure())
    } catch (err) {
      setError(toMessage(err, 'Failed to load courses and sections.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function run(action, successMessage) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      await load()
      setNotice(successMessage)
    } catch (err) {
      setError(toMessage(err, 'The change could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  async function saveSection() {
    if (!sectionForm.code.trim()) return
    await run(async () => {
      await createSection({ code: sectionForm.code.trim(), name: sectionForm.name.trim() })
      setSectionForm({ code: '', name: '' })
    }, 'Section added.')
  }

  async function saveCourse() {
    if (!courseForm.course_code.trim() || !courseForm.course_title.trim()) return
    const payload = {
      ...courseForm,
      course_code: courseForm.course_code.trim(),
      course_title: courseForm.course_title.trim(),
      description: courseForm.description.trim(),
      units: courseForm.units === '' ? null : Number(courseForm.units),
      section: courseForm.section || null,
    }
    await run(async () => {
      if (editingCourse) {
        await updateCourse(editingCourse.course_id, payload)
      } else {
        await createCourse(payload)
      }
      setEditingCourse(null)
      setCourseForm(emptyCourse())
    }, editingCourse ? 'Course updated.' : 'Course added.')
  }

  function startEditCourse(course) {
    setEditingCourse(course)
    setCourseForm({
      ...emptyCourse(),
      course_code: course.course_code,
      course_title: course.course_title,
      description: course.description || '',
      category: course.category || 'professional',
      units: course.units ?? '',
      section: course.section || '',
    })
    setTab(1)
  }

  const filteredCourses = structure.courses.filter(course => {
    const query = courseFilter.trim().toLowerCase()
    return !query
      || (course.course_code || '').toLowerCase().includes(query)
      || (course.course_title || '').toLowerCase().includes(query)
  })

  return (
    <AdminLayout>
      <PageHeader
        title="Academic Structure"
        subtitle="Manage the courses and sections used for faculty assignments"
        action={<OutlineBtn onClick={load} disabled={loading}><RefreshIcon fontSize="small" /> Refresh</OutlineBtn>}
      />

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard title="Sections" value={loading ? '—' : structure.sections.length} icon="🧩" accent="#FFD60A" />
        <StatCard title="Courses" value={loading ? '—' : structure.courses.length} icon="📚" accent="#86EFAC" />
      </div>

      <GlassCard style={{ padding: 0 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}
          sx={{ px: 2, borderBottom: '1px solid var(--border-color)', '& .MuiTab-root': { color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 700, fontSize: '0.85rem' }, '& .Mui-selected': { color: 'var(--text-primary) !important' } }}>
          <Tab label="Sections" />
          <Tab label="Courses" />
        </Tabs>

        <div style={{ padding: 22 }}>
          {tab === 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(180px, 2fr) auto', gap: 12, marginBottom: 20 }}>
                <TextField label="Section code" size="small" value={sectionForm.code}
                  onChange={event => setSectionForm(current => ({ ...current, code: event.target.value }))}
                  sx={inputSx} inputProps={{ maxLength: 50 }} />
                <TextField label="Section name (optional)" size="small" value={sectionForm.name}
                  onChange={event => setSectionForm(current => ({ ...current, name: event.target.value }))}
                  sx={inputSx} inputProps={{ maxLength: 100 }} />
                <PrimaryBtn small disabled={saving || !sectionForm.code.trim()} onClick={saveSection}>
                  <AddIcon fontSize="small" /> Add section
                </PrimaryBtn>
              </div>
              {loading ? <LoadingState label="Loading sections..." /> : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow>
                      {['Section', 'Name', ''].map(label => <TableCell key={label} sx={headCellSx}>{label}</TableCell>)}
                    </TableRow></TableHead>
                    <TableBody>
                      {structure.sections.map(section => (
                        <TableRow key={section.section_id}>
                          <TableCell sx={bodyCellSx}>{section.code}</TableCell>
                          <TableCell sx={bodyCellSx}>{section.name || '—'}</TableCell>
                          <TableCell sx={bodyCellSx} align="right">
                            <IconButton aria-label={`Delete section ${section.code}`} size="small"
                              disabled={saving}
                              onClick={() => run(() => deleteSection(section.section_id), 'Section removed.')}
                              sx={{ color: '#86EFAC' }}>
                              <DeleteOutlinedIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!structure.sections.length && (
                        <TableRow><TableCell colSpan={3} align="center" sx={bodyCellSx}>No sections have been added.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}

          {tab === 1 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
                <TextField label="Course code" size="small" value={courseForm.course_code}
                  onChange={event => setCourseForm(current => ({ ...current, course_code: event.target.value }))}
                  sx={inputSx} inputProps={{ maxLength: 100 }} />
                <TextField label="Course title" size="small" value={courseForm.course_title}
                  onChange={event => setCourseForm(current => ({ ...current, course_title: event.target.value }))}
                  sx={inputSx} inputProps={{ maxLength: 255 }} />
                <TextField select label="Section (optional)" size="small" value={courseForm.section}
                  onChange={event => setCourseForm(current => ({ ...current, section: event.target.value }))}
                  sx={inputSx}>
                  <MenuItem value="">No section</MenuItem>
                  {structure.sections.map(section => (
                    <MenuItem key={section.section_id} value={section.section_id}>
                      {section.display_name || section.code}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select label="Category" size="small" value={courseForm.category}
                  onChange={event => setCourseForm(current => ({ ...current, category: event.target.value }))}
                  sx={inputSx}>
                  {COURSE_CATEGORIES.map(category => (
                    <MenuItem key={category.value} value={category.value}>{category.label}</MenuItem>
                  ))}
                </TextField>
                <TextField label="Units (optional)" type="number" size="small" value={courseForm.units}
                  onChange={event => setCourseForm(current => ({ ...current, units: event.target.value }))}
                  sx={inputSx} inputProps={{ min: 0, step: 0.5 }} />
                <TextField label="Description (optional)" size="small" value={courseForm.description}
                  onChange={event => setCourseForm(current => ({ ...current, description: event.target.value }))}
                  sx={inputSx} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <PrimaryBtn small disabled={saving || !courseForm.course_code.trim() || !courseForm.course_title.trim()} onClick={saveCourse}>
                  <AddIcon fontSize="small" /> {editingCourse ? 'Update course' : 'Add course'}
                </PrimaryBtn>
                {editingCourse && (
                  <OutlineBtn small disabled={saving} onClick={() => { setEditingCourse(null); setCourseForm(emptyCourse()) }}>
                    Cancel
                  </OutlineBtn>
                )}
              </div>
              <TextField placeholder="Filter courses by code or title…" size="small"
                sx={{ ...inputSx, maxWidth: 320, mb: 1.5 }}
                onChange={event => setCourseFilter(event.target.value)} value={courseFilter} />
              {loading ? <LoadingState label="Loading courses..." /> : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow>
                      {['Code', 'Title', 'Section', 'Category', 'Units', 'Actions'].map(label => (
                        <TableCell key={label} sx={headCellSx}>{label}</TableCell>
                      ))}
                    </TableRow></TableHead>
                    <TableBody>
                      {filteredCourses.map(course => (
                        <TableRow key={course.course_id}>
                          <TableCell sx={bodyCellSx}>{course.course_code}</TableCell>
                          <TableCell sx={bodyCellSx}>{course.course_title}</TableCell>
                          <TableCell sx={bodyCellSx}>{course.section_code || '—'}</TableCell>
                          <TableCell sx={bodyCellSx}>
                            <StatusChip label={course.category || '—'} type={course.category === 'ged' ? 'info' : 'default'} />
                          </TableCell>
                          <TableCell sx={bodyCellSx}>{course.units ?? '—'}</TableCell>
                          <TableCell sx={bodyCellSx} align="right">
                            <IconButton aria-label={`Edit course ${course.course_code}`} size="small" onClick={() => startEditCourse(course)}
                              sx={{ color: 'var(--text-secondary)' }}><EditIcon fontSize="small" /></IconButton>
                            <IconButton aria-label={`Delete course ${course.course_code}`} size="small" disabled={saving}
                              onClick={() => run(() => deleteCourse(course.course_id), 'Course removed.')}
                              sx={{ color: '#86EFAC' }}><DeleteOutlinedIcon fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!filteredCourses.length && (
                        <TableRow><TableCell colSpan={6} align="center" sx={bodyCellSx}>
                          {structure.courses.length ? 'No courses match your search.' : 'No courses have been added.'}
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </div>
      </GlassCard>
    </AdminLayout>
  )
}
