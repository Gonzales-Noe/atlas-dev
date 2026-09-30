// src/features/roles/Admin/AcademicStructure.jsx
// Post-setup management of colleges → programs → year levels → sections →
// courses. This is the same data the first-time wizard creates, kept editable
// so the admin never has to re-run setup to make changes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Divider, IconButton, MenuItem, Stack, Tab, Tabs, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditIcon from '@mui/icons-material/Edit'
import RefreshIcon from '@mui/icons-material/Refresh'

import AdminLayout from './AdminLayout'
import {
  COURSE_CATEGORIES, createCollege, createCourse, createProgram, createSection,
  createYearLevel, deleteCollege, deleteCourse, deleteProgram, deleteSection,
  deleteYearLevel, fetchAcademicStructure, updateCollege, updateCourse,
  updateProgram,
} from './academicApi'
import { GlassCard, OutlineBtn, PageHeader, PrimaryBtn, StatCard, StatusChip } from '../../../components/ui'

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

function toMessage(err, fallback) {
  const data = err?.response?.data
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string') return data.detail
  const parts = Object.entries(data).map(([key, value]) => {
    const text = Array.isArray(value) ? value.join(', ') : String(value)
    return `${key}: ${text}`
  })
  return parts.length ? parts.join(' · ') : fallback
}

export default function AdminAcademicStructure() {
  const [structure, setStructure] = useState({ colleges: [], programs: [], yearLevels: [], sections: [], courses: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState(0)

  const [collegeForm, setCollegeForm] = useState({ code: '', name: '', description: '' })
  const [editingCollege, setEditingCollege] = useState(null)
  const [programForm, setProgramForm] = useState({ college: '', code: '', name: '', description: '' })
  const [editingProgram, setEditingProgram] = useState(null)
  const [yearForm, setYearForm] = useState({ program: '', year_number: '', label: '' })
  const [sectionForm, setSectionForm] = useState({ program: '', year_level: '', code: '', name: '' })
  const [courseForm, setCourseForm] = useState({
    course_code: '', course_title: '', category: 'professional', units: '',
    program: '', year_level: '', section: '',
  })
  const [editingCourse, setEditingCourse] = useState(null)
  const [courseFilter, setCourseFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStructure(await fetchAcademicStructure())
      setError('')
    } catch (err) {
      setError(toMessage(err, 'Failed to load the academic structure.'))
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

  const yearsForProgram = useCallback(
    (programId) => structure.yearLevels.filter(y => y.program === programId).sort((a, b) => a.year_number - b.year_number),
    [structure.yearLevels],
  )
  const sectionsForProgram = useCallback(
    (programId) => structure.sections.filter(s => s.program === programId),
    [structure.sections],
  )
  const coursesForProgram = useCallback(
    (programId) => structure.courses.filter(c => c.program === programId),
    [structure.courses],
  )
  const programLabel = useCallback(
    (programId) => {
      const program = structure.programs.find(p => p.program_id === programId)
      return program ? `${program.code} — ${program.name}` : '—'
    },
    [structure.programs],
  )

  const programOptions = useMemo(
    () => structure.programs.map(p => ({ value: p.program_id, label: `${p.code} — ${p.name}` })),
    [structure.programs],
  )

  async function saveCollege() {
    if (!collegeForm.code.trim() || !collegeForm.name.trim()) return
    await run(async () => {
      if (editingCollege) {
        await updateCollege(editingCollege.college_id, collegeForm)
        setEditingCollege(null)
      } else {
        await createCollege(collegeForm)
      }
      setCollegeForm({ code: '', name: '', description: '' })
    }, editingCollege ? 'College updated.' : 'College added.')
  }

  async function saveProgram() {
    if (!programForm.college || !programForm.code.trim() || !programForm.name.trim()) return
    await run(async () => {
      if (editingProgram) {
        await updateProgram(editingProgram.program_id, programForm)
        setEditingProgram(null)
      } else {
        await createProgram(programForm)
      }
      setProgramForm({ college: '', code: '', name: '', description: '' })
    }, editingProgram ? 'Program updated.' : 'Program added.')
  }

  async function saveYear() {
    if (!yearForm.program || !yearForm.year_number) return
    await run(async () => {
      await createYearLevel({
        program: yearForm.program,
        year_number: Number(yearForm.year_number),
        label: yearForm.label.trim(),
      })
      setYearForm({ program: yearForm.program, year_number: '', label: '' })
    }, 'Year level added.')
  }

  async function saveSection() {
    if (!sectionForm.year_level || !sectionForm.code.trim()) return
    await run(async () => {
      await createSection({
        year_level: sectionForm.year_level,
        code: sectionForm.code,
        name: sectionForm.name.trim(),
      })
      setSectionForm({ ...sectionForm, code: '', name: '' })
    }, 'Section added.')
  }

  async function saveCourse() {
    if (!courseForm.program || !courseForm.course_code.trim() || !courseForm.course_title.trim()) return
    const payload = {
      program: courseForm.program,
      year_level: courseForm.year_level || null,
      section: courseForm.section || null,
      course_code: courseForm.course_code,
      course_title: courseForm.course_title,
      category: courseForm.category,
      units: courseForm.units === '' ? null : Number(courseForm.units),
    }
    await run(async () => {
      if (editingCourse) {
        await updateCourse(editingCourse.course_id, payload)
        setEditingCourse(null)
      } else {
        await createCourse(payload)
      }
      setCourseForm(prev => ({ ...prev, course_code: '', course_title: '', units: '' }))
    }, editingCourse ? 'Course updated.' : 'Course added.')
  }

  function startEditCollege(college) {
    setEditingCollege(college)
    setCollegeForm({ code: college.code, name: college.name, description: college.description || '' })
    setTab(0)
  }

  function startEditProgram(program) {
    setEditingProgram(program)
    setProgramForm({ college: program.college, code: program.code, name: program.name, description: program.description || '' })
    setTab(1)
  }

  function startEditCourse(course) {
    setEditingCourse(course)
    setCourseForm({
      program: course.program,
      year_level: course.year_level || '',
      section: course.section || '',
      course_code: course.course_code,
      course_title: course.course_title,
      category: course.category,
      units: course.units ?? '',
    })
    setTab(2)
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Academic Structure"
        subtitle="Colleges, programs, year levels, sections and the courses that feed faculty course assignment"
        action={<OutlineBtn onClick={load}><RefreshIcon fontSize="small" /> Refresh</OutlineBtn>}
      />

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard title="Colleges"    value={structure.colleges.length} icon="🏛️" accent="#FF9F0A" />
        <StatCard title="Programs"    value={structure.programs.length} icon="🎓" accent="#60AAFF" />
        <StatCard title="Year Levels" value={structure.yearLevels.length} icon="📅" accent="#5EDA7E" />
        <StatCard title="Sections"    value={structure.sections.length}  icon="🧩" accent="#FFD60A" />
        <StatCard title="Courses"     value={structure.courses.length}   icon="📚" accent="#FF6B6B" />
      </div>

      <GlassCard style={{ padding: 0 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}
          sx={{ px: 2, borderBottom: '1px solid var(--border-color)', '& .MuiTab-root': { color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 700, fontSize: '0.85rem' }, '& .Mui-selected': { color: 'var(--text-primary) !important' } }}>
          <Tab label="Colleges" />
          <Tab label="Programs" />
          <Tab label="Courses" />
          <Tab label="Years & Sections" />
        </Tabs>

        <div style={{ padding: 22 }}>
          {/* ── Colleges ─────────────────────────────────────────────────── */}
          {tab === 0 && (
            <Stack spacing={2.5}>
              <Box>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, marginBottom: 12 }}>
                  <TextField label="Code" size="small" value={collegeForm.code}
                    onChange={e => setCollegeForm({ ...collegeForm, code: e.target.value.toUpperCase() })} sx={inputSx} />
                  <TextField label="College name" size="small" value={collegeForm.name}
                    onChange={e => setCollegeForm({ ...collegeForm, name: e.target.value })} sx={inputSx} />
                </div>
                <TextField label="Description (optional)" size="small" value={collegeForm.description} fullWidth
                  onChange={e => setCollegeForm({ ...collegeForm, description: e.target.value })} sx={{ ...inputSx, mb: 1.5 }} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <PrimaryBtn small disabled={saving || !collegeForm.code.trim() || !collegeForm.name.trim()} onClick={saveCollege}>
                    <AddIcon fontSize="small" /> {editingCollege ? 'Update college' : 'Add college'}
                  </PrimaryBtn>
                  {editingCollege && (
                    <OutlineBtn small onClick={() => { setEditingCollege(null); setCollegeForm({ code: '', name: '', description: '' }) }}>
                      Cancel
                    </OutlineBtn>
                  )}
                </div>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Code', 'Name', 'Programs', 'Actions'].map(h => <TableCell key={h} sx={headCellSx}>{h}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {structure.colleges.map(college => (
                      <TableRow key={college.college_id}>
                        <TableCell sx={bodyCellSx}>{college.code}</TableCell>
                        <TableCell sx={bodyCellSx}>{college.name}</TableCell>
                        <TableCell sx={bodyCellSx}>{college.program_count ?? 0}</TableCell>
                        <TableCell sx={bodyCellSx}>
                          <IconButton size="small" onClick={() => startEditCollege(college)} sx={{ color: 'var(--text-secondary)' }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => run(() => deleteCollege(college.college_id), 'College removed.')} sx={{ color: '#FF6B6B' }}>
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {!loading && structure.colleges.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No colleges yet.</div>
              )}
            </Stack>
          )}

          {/* ── Programs ─────────────────────────────────────────────────── */}
          {tab === 1 && (
            <Stack spacing={2.5}>
              <Box>
                <Stack spacing={1.5} sx={{ mb: 1.5 }}>
                  <TextField select label="College" size="small" value={programForm.college}
                    onChange={e => setProgramForm({ ...programForm, college: e.target.value })} sx={inputSx}>
                    <MenuItem value="">— select college —</MenuItem>
                    {structure.colleges.map(c => <MenuItem key={c.college_id} value={c.college_id}>{c.code} — {c.name}</MenuItem>)}
                  </TextField>
                  <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
                    <TextField label="Code" size="small" value={programForm.code}
                      onChange={e => setProgramForm({ ...programForm, code: e.target.value.toUpperCase() })} sx={inputSx} />
                    <TextField label="Program name" size="small" value={programForm.name}
                      onChange={e => setProgramForm({ ...programForm, name: e.target.value })} sx={inputSx} />
                  </div>
                  <TextField label="Description (optional)" size="small" value={programForm.description} fullWidth
                    onChange={e => setProgramForm({ ...programForm, description: e.target.value })} sx={inputSx} />
                </Stack>
                <div style={{ display: 'flex', gap: 10 }}>
                  <PrimaryBtn small disabled={saving || !programForm.college || !programForm.code.trim() || !programForm.name.trim()} onClick={saveProgram}>
                    <AddIcon fontSize="small" /> {editingProgram ? 'Update program' : 'Add program'}
                  </PrimaryBtn>
                  {editingProgram && (
                    <OutlineBtn small onClick={() => { setEditingProgram(null); setProgramForm({ college: '', code: '', name: '', description: '' }) }}>
                      Cancel
                    </OutlineBtn>
                  )}
                </div>
              </Box>

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Code', 'Program', 'College', 'Years', 'Sections', 'Courses', 'Actions'].map(h => <TableCell key={h} sx={headCellSx}>{h}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {structure.programs.map(program => (
                      <TableRow key={program.program_id}>
                        <TableCell sx={bodyCellSx}>{program.code}</TableCell>
                        <TableCell sx={bodyCellSx}>{program.name}</TableCell>
                        <TableCell sx={bodyCellSx}>{program.college_name}</TableCell>
                        <TableCell sx={bodyCellSx}>{yearsForProgram(program.program_id).length}</TableCell>
                        <TableCell sx={bodyCellSx}>{sectionsForProgram(program.program_id).length}</TableCell>
                        <TableCell sx={bodyCellSx}>{coursesForProgram(program.program_id).length}</TableCell>
                        <TableCell sx={bodyCellSx}>
                          <IconButton size="small" onClick={() => startEditProgram(program)} sx={{ color: 'var(--text-secondary)' }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => run(() => deleteProgram(program.program_id), 'Program removed.')} sx={{ color: '#FF6B6B' }}>
                            <DeleteOutlinedIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          )}

          {/* ── Courses ──────────────────────────────────────────────────── */}
          {tab === 2 && (
            <Stack spacing={2.5}>
              <Box>
                <Stack spacing={1.5} sx={{ mb: 1.5 }}>
                  <TextField select label="Program" size="small" value={courseForm.program}
                    onChange={e => setCourseForm({ ...courseForm, program: e.target.value, year_level: '', section: '' })} sx={inputSx}>
                    <MenuItem value="">— select program —</MenuItem>
                    {programOptions.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                  </TextField>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12 }}>
                    <TextField label="Course code" size="small" value={courseForm.course_code}
                      onChange={e => setCourseForm({ ...courseForm, course_code: e.target.value.toUpperCase() })} sx={inputSx} />
                    <TextField label="Course title" size="small" value={courseForm.course_title}
                      onChange={e => setCourseForm({ ...courseForm, course_title: e.target.value })} sx={inputSx} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                    <TextField select label="Category" size="small" value={courseForm.category}
                      onChange={e => setCourseForm({ ...courseForm, category: e.target.value })} sx={inputSx}>
                      {COURSE_CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
                    </TextField>
                    <TextField select label="Year level" size="small" value={courseForm.year_level}
                      onChange={e => setCourseForm({ ...courseForm, year_level: e.target.value, section: '' })} sx={inputSx}>
                      <MenuItem value="">Any year</MenuItem>
                      {yearsForProgram(courseForm.program).map(y => (
                        <MenuItem key={y.year_id} value={y.year_id}>{y.label || `Year ${y.year_number}`}</MenuItem>
                      ))}
                    </TextField>
                    <TextField select label="Section" size="small" value={courseForm.section}
                      onChange={e => setCourseForm({ ...courseForm, section: e.target.value })} sx={inputSx}>
                      <MenuItem value="">Any section</MenuItem>
                      {structure.sections
                        .filter(s => s.program === courseForm.program && (!courseForm.year_level || s.year_level === courseForm.year_level))
                        .map(s => <MenuItem key={s.section_id} value={s.section_id}>{s.code} — {s.display_name}</MenuItem>)}
                    </TextField>
                    <TextField label="Units" type="number" size="small" value={courseForm.units}
                      onChange={e => setCourseForm({ ...courseForm, units: e.target.value })} sx={inputSx} />
                  </div>
                </Stack>
                <div style={{ display: 'flex', gap: 10 }}>
                  <PrimaryBtn small disabled={saving || !courseForm.program || !courseForm.course_code.trim() || !courseForm.course_title.trim()} onClick={saveCourse}>
                    <AddIcon fontSize="small" /> {editingCourse ? 'Update course' : 'Add course'}
                  </PrimaryBtn>
                  {editingCourse && (
                    <OutlineBtn small onClick={() => {
                      setEditingCourse(null)
                      setCourseForm({ course_code: '', course_title: '', category: 'professional', units: '', program: '', year_level: '', section: '' })
                    }}>
                      Cancel
                    </OutlineBtn>
                  )}
                </div>
              </Box>

              <TextField
                placeholder="Filter courses by code or title…"
                size="small"
                sx={{ ...inputSx, maxWidth: 320 }}
                onChange={e => setCourseFilter(e.target.value)}
                value={courseFilter}
              />

              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {['Code', 'Title', 'Program', 'Year', 'Section', 'Category', 'Actions'].map(h => <TableCell key={h} sx={headCellSx}>{h}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {structure.courses
                      .filter(c => {
                        const q = courseFilter.toLowerCase()
                        return !q || (c.course_code || '').toLowerCase().includes(q) || (c.course_title || '').toLowerCase().includes(q)
                      })
                      .map(course => (
                        <TableRow key={course.course_id}>
                          <TableCell sx={bodyCellSx}>{course.course_code}</TableCell>
                          <TableCell sx={bodyCellSx}>{course.course_title}</TableCell>
                          <TableCell sx={bodyCellSx}>{course.program_name || '—'}</TableCell>
                          <TableCell sx={bodyCellSx}>{course.year_label || '—'}</TableCell>
                          <TableCell sx={bodyCellSx}>{course.section_code || '—'}</TableCell>
                          <TableCell sx={bodyCellSx}>
                            <StatusChip label={course.category} type={course.category === 'ged' ? 'info' : 'default'} />
                          </TableCell>
                          <TableCell sx={bodyCellSx}>
                            <IconButton size="small" onClick={() => startEditCourse(course)} sx={{ color: 'var(--text-secondary)' }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" onClick={() => run(() => deleteCourse(course.course_id), 'Course removed.')} sx={{ color: '#FF6B6B' }}>
                              <DeleteOutlinedIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Stack>
          )}

          {/* ── Years & Sections ─────────────────────────────────────────── */}
          {tab === 3 && (
            <Stack spacing={3}>
              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', mb: 1 }}>Add year level</Typography>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                  <TextField select label="Program" size="small" value={yearForm.program}
                    onChange={e => setYearForm({ ...yearForm, program: e.target.value })} sx={inputSx}>
                    <MenuItem value="">— select program —</MenuItem>
                    {programOptions.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                  </TextField>
                  <TextField label="Year #" type="number" size="small" value={yearForm.year_number}
                    onChange={e => setYearForm({ ...yearForm, year_number: e.target.value })} sx={inputSx} />
                  <TextField label="Label (optional)" size="small" value={yearForm.label}
                    onChange={e => setYearForm({ ...yearForm, label: e.target.value })} sx={inputSx} />
                </div>
                <PrimaryBtn small disabled={saving || !yearForm.program || !yearForm.year_number} onClick={saveYear}>
                  <AddIcon fontSize="small" /> Add year level
                </PrimaryBtn>
              </Box>

              <Divider sx={{ borderColor: 'var(--border-color)' }} />

              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', mb: 1 }}>Add section</Typography>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
                  <TextField select label="Program" size="small" value={sectionForm.program}
                    onChange={e => setSectionForm({ ...sectionForm, program: e.target.value, year_level: '' })} sx={inputSx}>
                    <MenuItem value="">— select program —</MenuItem>
                    {programOptions.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                  </TextField>
                  <TextField select label="Year level" size="small" value={sectionForm.year_level}
                    onChange={e => setSectionForm({ ...sectionForm, year_level: e.target.value })} sx={inputSx}>
                    <MenuItem value="">— select year —</MenuItem>
                    {yearsForProgram(sectionForm.program).map(y => (
                      <MenuItem key={y.year_id} value={y.year_id}>{y.label || `Year ${y.year_number}`}</MenuItem>
                    ))}
                  </TextField>
                  <TextField label="Section code" size="small" value={sectionForm.code}
                    onChange={e => setSectionForm({ ...sectionForm, code: e.target.value.toUpperCase() })} sx={inputSx} />
                  <TextField label="Section name (optional)" size="small" value={sectionForm.name}
                    onChange={e => setSectionForm({ ...sectionForm, name: e.target.value })} sx={inputSx} />
                </div>
                <PrimaryBtn small disabled={saving || !sectionForm.year_level || !sectionForm.code.trim()} onClick={saveSection}>
                  <AddIcon fontSize="small" /> Add section
                </PrimaryBtn>
              </Box>

              <Divider sx={{ borderColor: 'var(--border-color)' }} />

              <Box>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', mb: 1 }}>
                  Structure overview
                </Typography>
                <Stack spacing={1.5}>
                  {structure.programs.map(program => {
                    const years = yearsForProgram(program.program_id)
                    const sections = sectionsForProgram(program.program_id)
                    return (
                      <div key={program.program_id} style={{ border: '1px solid var(--border-color)', borderRadius: 14, padding: 14 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>{programLabel(program.program_id)}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {program.college_name} · {years.length} year level(s) · {sections.length} section(s)
                        </div>
                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                          {years.map(year => (
                            <div key={year.year_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: 110 }}>
                                {year.label || `Year ${year.year_number}`}
                              </span>
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
                                {sections.filter(s => s.year_level === year.year_id).map(s => s.code).join(', ') || '—'}
                              </span>
                              <IconButton size="small" onClick={() => run(() => deleteYearLevel(year.year_id), 'Year level removed.')} sx={{ color: '#FF6B6B' }}>
                                <DeleteOutlinedIcon fontSize="small" />
                              </IconButton>
                            </div>
                          ))}
                        </Stack>
                        {sections.length > 0 && (
                          <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                            {sections.map(section => (
                              <span key={section.section_id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                border: '1px solid var(--border-color)', borderRadius: 8,
                                padding: '2px 8px', fontSize: '0.72rem', color: 'var(--text-secondary)',
                              }}>
                                {section.code}
                                <IconButton size="small" onClick={() => run(() => deleteSection(section.section_id), 'Section removed.')} sx={{ color: '#FF6B6B', p: 0 }}>
                                  <DeleteOutlinedIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                              </span>
                            ))}
                          </Stack>
                        )}
                      </div>
                    )
                  })}
                </Stack>
              </Box>
            </Stack>
          )}
        </div>
      </GlassCard>
    </AdminLayout>
  )
}
