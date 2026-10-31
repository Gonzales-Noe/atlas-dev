import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  IconButton, MenuItem, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import RefreshIcon from '@mui/icons-material/Refresh'

import { StatusNotice } from '../../../components/StatusNotice'
import AdminLayout from './AdminLayout'
import {
  COURSE_CATEGORIES, SECTION_YEARS, createCourse, createSection, deleteCourse, deleteSection,
  fetchAcademicStructure, fetchCourseRequests, reviewCourseRequest, updateCourse, updateSection,
} from './academicApi'
import { BookOpen, Mail, Puzzle } from 'lucide-react'
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
const groupHeaderSx = {
  ...bodyCellSx, py: 1, fontWeight: 800, fontSize: '0.75rem',
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', backgroundColor: 'var(--bg-header)',
}
const groupCountSx = { marginLeft: 8, fontWeight: 500, letterSpacing: 0, textTransform: 'none' }
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
  const [sectionForm, setSectionForm] = useState({ code: '', year_number: '' })
  const [courseForm, setCourseForm] = useState(emptyCourse)
  const [editingCourse, setEditingCourse] = useState(null)
  const [courseFilter, setCourseFilter] = useState('')
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [reviewingId, setReviewingId] = useState(null)
  const [reviewNote, setReviewNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [academic, pending] = await Promise.all([
        fetchAcademicStructure(),
        fetchCourseRequests('').catch(() => []),
      ])
      setStructure(academic)
      setRequests(pending)
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

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const historyRequests = requests.filter((r) => r.status !== 'pending')

  async function reviewRequest(requestId, action) {
    if (action === 'reject' && !reviewNote.trim()) {
      setError('Add a short note so the faculty member knows what to fix.')
      return
    }
    setRequestsLoading(true)
    setError('')
    setNotice('')
    try {
      const result = await reviewCourseRequest(requestId, { action, admin_note: reviewNote.trim() })
      setRequests((prev) => prev.map((r) => (r.request_id === requestId ? { ...r, ...result } : r)))
      setReviewNote('')
      setReviewingId(null)
      await load()
      setNotice(action === 'approve' ? 'Course request approved — the course is now live.' : 'Course request sent back to faculty with your note.')
    } catch (err) {
      setError(toMessage(err, 'Could not review that request.'))
    } finally {
      setRequestsLoading(false)
    }
  }

  async function saveSection() {
    if (!sectionForm.code.trim()) return
    await run(async () => {
      await createSection({
        code: sectionForm.code.trim(),
        year_number: sectionForm.year_number === '' ? null : Number(sectionForm.year_number),
      })
      setSectionForm({ code: '', year_number: '' })
    }, 'Section added.')
  }

  async function changeSectionYear(section, rawValue) {
    const yearNumber = rawValue === '' ? null : Number(rawValue)
    if ((section.year_number ?? null) === yearNumber) return
    const yearLabel = SECTION_YEARS.find(year => year.value === yearNumber)?.label
    await run(
      () => updateSection(section.section_id, { year_number: yearNumber }),
      yearLabel ? `${section.code} moved to ${yearLabel}.` : `${section.code} moved to “Year not set”.`,
    )
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

  const courseGroups = COURSE_CATEGORIES
    .map(category => ({
      key: category.value,
      label: category.label,
      courses: filteredCourses.filter(course => course.category === category.value),
    }))
    .filter(group => group.courses.length)

  const knownCategories = new Set(COURSE_CATEGORIES.map(category => category.value))
  const uncategorizedCourses = filteredCourses.filter(course => !knownCategories.has(course.category))
  if (uncategorizedCourses.length) {
    courseGroups.push({ key: 'uncategorized', label: 'Uncategorized', courses: uncategorizedCourses })
  }

  const sectionGroups = SECTION_YEARS
    .map(year => ({
      key: String(year.value),
      label: year.label,
      sections: structure.sections.filter(section => Number(section.year_number) === year.value),
    }))
    .filter(group => group.sections.length)

  const sectionsWithoutYear = structure.sections.filter(section => !Number(section.year_number))
  if (sectionsWithoutYear.length) {
    sectionGroups.push({ key: 'none', label: 'Year not set', sections: sectionsWithoutYear })
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Academic Structure"
        subtitle="Manage the courses and sections used for faculty assignments"
        action={<OutlineBtn onClick={load} disabled={loading}><RefreshIcon fontSize="small" /> Refresh</OutlineBtn>}
      />

      <StatusNotice message={error} severity="error" />
      <StatusNotice message={notice} severity="success" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard title="Sections" value={loading ? '—' : structure.sections.length} icon={<Puzzle size={18} color="#C4A000" />} accent="#FFD60A" />
        <StatCard title="Courses" value={loading ? '—' : structure.courses.length} icon={<BookOpen size={18} color="#E24B4A" />} accent="#E24B4A" />
        <StatCard title="Pending requests" value={loading ? '—' : pendingRequests.length} icon={<Mail size={18} color="#60AAFF" />} accent="#60AAFF" />
      </div>

      {pendingRequests.length > 0 && (
        <GlassCard style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1rem' }}>Course requests waiting for review</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Faculty proposed these — approve to publish them, or send back with a note.</div>
            </div>
          </div>
          {pendingRequests.map((req) => (
            <div key={req.request_id} style={{ border: '1px solid var(--border-color)', borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{req.course_code} — {req.course_title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    From {req.requested_by_name || req.requested_by_email} · {req.category}{req.units ? ` · ${req.units} units` : ''}
                  </div>
                  {req.description && <div style={{ fontSize: '0.85rem', marginTop: 6 }}>{req.description}</div>}
                  {req.justification && <div style={{ fontSize: '0.82rem', marginTop: 6, color: 'var(--text-secondary)' }}>Why: {req.justification}</div>}
                </div>
                <StatusChip label="Pending review" type="warning" />
              </div>
              {reviewingId === req.request_id ? (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <TextField label="Note for faculty (required to reject, optional to approve)" size="small" multiline rows={2}
                    value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} sx={inputSx} />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <PrimaryBtn small disabled={requestsLoading} onClick={() => reviewRequest(req.request_id, 'approve')}>Approve & publish</PrimaryBtn>
                    <OutlineBtn small disabled={requestsLoading || !reviewNote.trim()} onClick={() => reviewRequest(req.request_id, 'reject')}>Send back with note</OutlineBtn>
                    <OutlineBtn small disabled={requestsLoading} onClick={() => { setReviewingId(null); setReviewNote('') }}>Cancel</OutlineBtn>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <PrimaryBtn small disabled={requestsLoading} onClick={() => { setReviewingId(req.request_id); setReviewNote('') }}>Review request</PrimaryBtn>
                </div>
              )}
            </div>
          ))}
          {historyRequests.length > 0 && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              {historyRequests.length} reviewed request(s) — newest decisions stay visible in faculty workspaces.
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard style={{ padding: 0 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}
          sx={{ px: 2, borderBottom: '1px solid var(--border-color)', '& .MuiTab-root': { color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 700, fontSize: '0.85rem' }, '& .Mui-selected': { color: 'var(--text-primary) !important' } }}>
          <Tab label="Sections" />
          <Tab label="Courses" />
        </Tabs>

        <div style={{ padding: 22 }}>
          {tab === 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(160px, 1fr) auto', gap: 12, marginBottom: 20 }}>
                <TextField label="Section code" size="small" value={sectionForm.code}
                  onChange={event => setSectionForm(current => ({ ...current, code: event.target.value }))}
                  sx={inputSx} inputProps={{ maxLength: 50 }} />
                <TextField select label="Year level" size="small" value={sectionForm.year_number}
                  onChange={event => setSectionForm(current => ({ ...current, year_number: event.target.value }))}
                  sx={inputSx}>
                  <MenuItem value="">Year not set</MenuItem>
                  {SECTION_YEARS.map(year => (
                    <MenuItem key={year.value} value={year.value}>{year.label}</MenuItem>
                  ))}
                </TextField>
                <PrimaryBtn small disabled={saving || !sectionForm.code.trim()} onClick={saveSection}>
                  <AddIcon fontSize="small" /> Add section
                </PrimaryBtn>
              </div>
              {loading ? <LoadingState label="Loading sections..." /> : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow>
                      {['Section', 'Year', ''].map(label => <TableCell key={label} sx={headCellSx}>{label}</TableCell>)}
                    </TableRow></TableHead>
                    <TableBody>
                      {sectionGroups.map(group => (
                        <Fragment key={group.key}>
                          <TableRow>
                            <TableCell colSpan={3} sx={groupHeaderSx}>
                              {group.label}
                              <span style={groupCountSx}>
                                {group.sections.length} section{group.sections.length === 1 ? '' : 's'}
                              </span>
                            </TableCell>
                          </TableRow>
                          {group.sections.map(section => (
                            <TableRow key={section.section_id}>
                              <TableCell sx={bodyCellSx}>{section.code}</TableCell>
                              <TableCell sx={bodyCellSx}>
                                <TextField select size="small" value={section.year_number ?? ''}
                                  disabled={saving}
                                  onChange={event => changeSectionYear(section, event.target.value)}
                                  sx={{ ...inputSx, minWidth: 140 }}
                                  slotProps={{ select: { inputProps: { 'aria-label': `Year level for section ${section.code}` } } }}>
                                  <MenuItem value="">Year not set</MenuItem>
                                  {SECTION_YEARS.map(year => (
                                    <MenuItem key={year.value} value={year.value}>{year.label}</MenuItem>
                                  ))}
                                </TextField>
                              </TableCell>
                              <TableCell sx={bodyCellSx} align="right">
                                <IconButton aria-label={`Delete section ${section.code}`} size="small"
                                  disabled={saving}
                                  onClick={() => run(() => deleteSection(section.section_id), 'Section removed.')}
                                  sx={{ color: '#E24B4A' }}>
                                  <DeleteOutlinedIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
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
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(200px, 2.2fr) minmax(90px, 0.6fr)', gap: 12, marginBottom: 12 }}>
                <TextField label="Course code" size="small" value={courseForm.course_code}
                  onChange={event => setCourseForm(current => ({ ...current, course_code: event.target.value }))}
                  sx={inputSx} inputProps={{ maxLength: 100 }} />
                <TextField label="Course title" size="small" value={courseForm.course_title}
                  onChange={event => setCourseForm(current => ({ ...current, course_title: event.target.value }))}
                  sx={inputSx} inputProps={{ maxLength: 255 }} />
                <TextField label="Units" type="number" size="small" value={courseForm.units}
                  onChange={event => setCourseForm(current => ({ ...current, units: event.target.value }))}
                  sx={inputSx} inputProps={{ min: 0, step: 0.5 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                <TextField select label="Section (optional)" size="small" value={courseForm.section}
                  onChange={event => setCourseForm(current => ({ ...current, section: event.target.value }))}
                  sx={inputSx}>
                  <MenuItem value="">No section</MenuItem>
                  {structure.sections.map(section => (
                    <MenuItem key={section.section_id} value={section.section_id}>
                      {section.display_name || section.code}{section.year_label ? ` · ${section.year_label}` : ''}
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
                <TextField label="Description (optional)" size="small" value={courseForm.description}
                  onChange={event => setCourseForm(current => ({ ...current, description: event.target.value }))}
                  sx={inputSx} />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10 }}>
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
                  sx={{ ...inputSx, width: 280, maxWidth: '100%' }}
                  onChange={event => setCourseFilter(event.target.value)} value={courseFilter} />
              </div>
              {loading ? <LoadingState label="Loading courses..." /> : (
                <TableContainer>
                  <Table size="small">
                    <TableHead><TableRow>
                      {['Code', 'Title', 'Section', 'Units', 'Actions'].map(label => (
                        <TableCell key={label} sx={headCellSx}>{label}</TableCell>
                      ))}
                    </TableRow></TableHead>
                    <TableBody>
                      {courseGroups.map(group => (
                        <Fragment key={group.key}>
                          <TableRow>
                            <TableCell colSpan={5} sx={groupHeaderSx}>
                              {group.label}
                              <span style={groupCountSx}>
                                {group.courses.length} course{group.courses.length === 1 ? '' : 's'}
                              </span>
                            </TableCell>
                          </TableRow>
                          {group.courses.map(course => (
                            <TableRow key={course.course_id}>
                              <TableCell sx={bodyCellSx}>{course.course_code}</TableCell>
                              <TableCell sx={bodyCellSx}>{course.course_title}</TableCell>
                              <TableCell sx={bodyCellSx}>{course.section_label || course.section_code || '—'}</TableCell>
                              <TableCell sx={bodyCellSx}>{course.units ?? '—'}</TableCell>
                              <TableCell sx={bodyCellSx} align="right">
                                <IconButton aria-label={`Edit course ${course.course_code}`} size="small" onClick={() => startEditCourse(course)}
                                  sx={{ color: 'var(--text-secondary)' }}><EditIcon fontSize="small" /></IconButton>
                                <IconButton aria-label={`Delete course ${course.course_code}`} size="small" disabled={saving}
                                  onClick={() => run(() => deleteCourse(course.course_id), 'Course removed.')}
                                  sx={{ color: '#E24B4A' }}><DeleteOutlinedIcon fontSize="small" /></IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      ))}
                      {!filteredCourses.length && (
                        <TableRow><TableCell colSpan={5} align="center" sx={bodyCellSx}>
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
