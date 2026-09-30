// src/features/roles/Admin/AdminSetupWizard.jsx
// First-time setup modal for the institutional admin. Runs on first login and
// blocks every other admin module until it is finished.
//
// Step 1  Colleges
// Step 2  Programs (per college)
// Step 3  Year levels & sections (per program)
// Step 4  Courses (per program, with recommended GEd subjects)
// Step 5  Knowledge base (optional — can be skipped for later)

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, CircularProgress, Dialog, DialogContent, Divider, IconButton,
  LinearProgress, MenuItem, Stack, Step, StepLabel, Stepper, TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { useNavigate } from 'react-router-dom'

import {
  COURSE_CATEGORIES, RECOMMENDED_GE_COURSES, WIZARD_STEPS,
  completeSetup, createCollege, createCourse, createProgram, createSection,
  createYearLevel, deleteCollege, deleteCourse, deleteProgram, deleteSection,
  deleteYearLevel, fetchAcademicStructure,
} from './academicApi'
import { PrimaryBtn, OutlineBtn } from '../../../components/ui'
import { ROUTES } from '../../../config/route'

const EMPTY_STRUCTURE = { colleges: [], programs: [], yearLevels: [], sections: [], courses: [] }

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

const labelSx = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 6, display: 'block' }

// Turns a DRF error body into one readable sentence.
function toMessage(err, fallback) {
  const data = err?.response?.data
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (typeof data.detail === 'string') return data.detail
  const parts = Object.entries(data).map(([key, value]) => {
    const text = Array.isArray(value) ? value.join(', ') : String(value)
    return key === 'non_field_errors' || key === 'detail' ? text : `${key}: ${text}`
  })
  return parts.length ? parts.join(' · ') : fallback
}

function RowList({ items, onDelete, emptyText }) {
  if (items.length === 0) {
    return (
      <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
        {emptyText}
      </Typography>
    )
  }
  return (
    <Stack spacing={1}>
      {items.map(item => (
        <div
          key={item.id}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '10px 12px', borderRadius: 12,
            border: '1px solid var(--border-color)', background: 'var(--bg-header)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {item.title}
            </div>
            {item.subtitle && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{item.subtitle}</div>
            )}
          </div>
          <IconButton size="small" onClick={() => onDelete(item.id)} sx={{ color: '#FF6B6B' }}>
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </div>
      ))}
    </Stack>
  )
}

export default function AdminSetupWizard({ open, onFinished, onDismiss }) {
  const navigate = useNavigate()
  const [activeStep, setActiveStep] = useState(0)
  const [structure, setStructure] = useState(EMPTY_STRUCTURE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Step 1 form
  const [collegeForm, setCollegeForm] = useState({ code: '', name: '', description: '' })
  // Step 2 form
  const [programForm, setProgramForm] = useState({ college: '', code: '', name: '', description: '' })
  // Step 3 form
  const [programForStructure, setProgramForStructure] = useState('')
  const [yearForm, setYearForm] = useState({ year_number: '', label: '' })
  const [sectionForm, setSectionForm] = useState({ year_level: '', code: '', name: '' })
  // Step 4 form
  const [programForCourses, setProgramForCourses] = useState('')
  const [courseForm, setCourseForm] = useState({
    course_code: '', course_title: '', category: 'professional', units: '',
    year_level: '', section: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setStructure(await fetchAcademicStructure())
    } catch (err) {
      setError(toMessage(err, 'Could not load your academic structure.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setActiveStep(0)
      setNotice('')
      setError('')
      load()
    }
  }, [open, load])

  const programsForCollege = useCallback(
    (collegeId) => structure.programs.filter(p => p.college === collegeId),
    [structure.programs],
  )
  const yearsForProgram = useCallback(
    (programId) => structure.yearLevels.filter(y => y.program === programId),
    [structure.yearLevels],
  )
  const sectionsForYear = useCallback(
    (yearId) => structure.sections.filter(s => s.year_level === yearId),
    [structure.sections],
  )
  const coursesForProgram = useCallback(
    (programId) => structure.courses.filter(c => c.program === programId),
    [structure.courses],
  )

  const programName = useCallback(
    (programId) => {
      const program = structure.programs.find(p => p.program_id === programId)
      return program ? `${program.code} — ${program.name}` : ''
    },
    [structure.programs],
  )

  async function run(label, action, successMessage) {
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      await load()
      if (successMessage) setNotice(successMessage)
    } catch (err) {
      setError(toMessage(err, `${label} failed.`))
    } finally {
      setSaving(false)
    }
  }

  // ── Step 1: colleges ────────────────────────────────────────────────────────
  async function addCollege() {
    if (!collegeForm.code.trim() || !collegeForm.name.trim()) return
    await run('Adding college', async () => {
      await createCollege(collegeForm)
      setCollegeForm({ code: '', name: '', description: '' })
    }, 'College added.')
  }

  // ── Step 2: programs ────────────────────────────────────────────────────────
  async function addProgram() {
    if (!programForm.college || !programForm.code.trim() || !programForm.name.trim()) return
    await run('Adding program', async () => {
      await createProgram(programForm)
      setProgramForm(prev => ({ ...prev, code: '', name: '', description: '' }))
    }, 'Program added.')
  }

  // ── Step 3: years & sections ────────────────────────────────────────────────
  async function addYear() {
    if (!programForStructure || !yearForm.year_number) return
    await run('Adding year level', async () => {
      await createYearLevel({
        program: programForStructure,
        year_number: Number(yearForm.year_number),
        label: yearForm.label.trim(),
      })
      setYearForm({ year_number: '', label: '' })
    }, 'Year level added.')
  }

  async function addSection() {
    if (!sectionForm.year_level || !sectionForm.code.trim()) return
    await run('Adding section', async () => {
      await createSection({
        year_level: sectionForm.year_level,
        code: sectionForm.code,
        name: sectionForm.name.trim(),
      })
      setSectionForm({ year_level: '', code: '', name: '' })
    }, 'Section added.')
  }

  // ── Step 4: courses ─────────────────────────────────────────────────────────
  async function addCourse(payloadOverride) {
    const payload = payloadOverride || courseForm
    if (!programForCourses || !payload.course_code.trim() || !payload.course_title.trim()) return
    await run('Adding course', async () => {
      await createCourse({
        program: programForCourses,
        year_level: payload.year_level || null,
        section: payload.section || null,
        course_code: payload.course_code,
        course_title: payload.course_title,
        category: payload.category || 'professional',
        units: payload.units === '' || payload.units == null ? null : Number(payload.units),
      })
      setCourseForm(prev => ({ ...prev, course_code: '', course_title: '', units: '' }))
    }, 'Course added.')
  }

  async function addRecommendedGed() {
    if (!programForCourses) return
    const existing = new Set(
      coursesForProgram(programForCourses).map(c => (c.course_code || '').toUpperCase()),
    )
    const pending = RECOMMENDED_GE_COURSES.filter(c => !existing.has(c.course_code))
    if (pending.length === 0) {
      setNotice('All recommended GEd subjects are already added for this program.')
      return
    }
    await run('Adding recommended GEd subjects', async () => {
      for (const item of pending) {
        await createCourse({
          program: programForCourses,
          year_level: null,
          section: null,
          ...item,
        })
      }
    }, `Added ${pending.length} recommended GEd subject${pending.length === 1 ? '' : 's'}.`)
  }

  // ── Step 5: finish ──────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    colleges: structure.colleges.length,
    programs: structure.programs.length,
    years: structure.yearLevels.length,
    sections: structure.sections.length,
    courses: structure.courses.length,
  }), [structure])

  const missing = useMemo(() => {
    const list = []
    if (counts.colleges < 1) list.push('1 college')
    if (counts.programs < 1) list.push('1 program')
    if (counts.years < 1) list.push('1 year level')
    if (counts.sections < 1) list.push('1 section')
    if (counts.courses < 1) list.push('1 course')
    return list
  }, [counts])

  async function finish(skipKnowledgeBase = true) {
    setSaving(true)
    setError('')
    try {
      await completeSetup(skipKnowledgeBase)
      onFinished?.()
      if (!skipKnowledgeBase) navigate(ROUTES.ADMIN.KNOWLEDGE_BASE)
    } catch (err) {
      setError(toMessage(err, 'Could not finish setup.'))
    } finally {
      setSaving(false)
    }
  }

  const dialogPaper = {
    background: 'var(--bg-card) !important',
    backgroundImage: 'none !important',
    border: '1px solid var(--border-color)',
    borderRadius: '20px !important',
  }

  const yearsOfSelectedStructureProgram = yearsForProgram(programForStructure)
  const yearsOfSelectedCourseProgram = yearsForProgram(programForCourses)

  return (
    <Dialog
      open={open}
      // A non-dismissable dialog is intentional: setup must finish before other modules.
      onClose={() => { if (onDismiss) onDismiss() }}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown
      PaperProps={{ sx: dialogPaper }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 1.5, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', color: '#FF9F0A', textTransform: 'uppercase' }}>
            First-time setup
          </Typography>
          <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', mt: 0.5 }}>
            Set up your institution
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-secondary)', mt: 0.5 }}>
            These steps are required once. You can refine everything later from Academic Structure.
          </Typography>
        </Box>
        {onDismiss && (
          <IconButton size="small" onClick={onDismiss} sx={{ color: 'var(--text-secondary)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Divider sx={{ borderColor: 'var(--border-color)' }} />

      <Box sx={{ px: 3, pt: 2 }}>
        <Stepper activeStep={activeStep} alternativeLabel
          sx={{
            '& .MuiStepLabel-label': { color: 'var(--text-tertiary)', fontSize: '0.72rem' },
            '& .MuiStepLabel-label.Mui-active, & .MuiStepLabel-label.Mui-completed': { color: 'var(--text-primary)', fontWeight: 700 },
            '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.12)' },
            '& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed': { color: '#FF9F0A' },
          }}
        >
          {WIZARD_STEPS.map(step => (
            <Step key={step.key}><StepLabel>{step.label}</StepLabel></Step>
          ))}
        </Stepper>
      </Box>

      <LinearProgress
        variant="determinate"
        value={((activeStep + 1) / WIZARD_STEPS.length) * 100}
        sx={{ height: 3, background: 'transparent', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#FF9F0A,#FF453A)' } }}
      />

      <DialogContent dividers sx={{ px: 3, py: 2.5, bgcolor: 'var(--bg-card)', borderColor: 'var(--border-color) !important' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={28} sx={{ color: '#FF9F0A' }} />
          </Box>
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

            {/* ── Step 1 · Colleges ─────────────────────────────────────────── */}
            {activeStep === 0 && (
              <>
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Add your colleges
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  e.g. College of Engineering, College of Business, College of Arts and Sciences.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1.5 }}>
                  <TextField label="Code" placeholder="CE" size="small" value={collegeForm.code}
                    onChange={e => setCollegeForm({ ...collegeForm, code: e.target.value.toUpperCase() })}
                    sx={inputSx} />
                  <TextField label="College name" placeholder="College of Engineering" size="small" value={collegeForm.name}
                    onChange={e => setCollegeForm({ ...collegeForm, name: e.target.value })} sx={inputSx} />
                </Box>
                <TextField label="Description (optional)" size="small" value={collegeForm.description}
                  onChange={e => setCollegeForm({ ...collegeForm, description: e.target.value })} sx={inputSx} />
                <PrimaryBtn small disabled={saving || !collegeForm.code.trim() || !collegeForm.name.trim()} onClick={addCollege}>
                  <AddIcon fontSize="small" /> Add college
                </PrimaryBtn>
                <RowList
                  emptyText="No colleges yet."
                  onDelete={id => run('Removing college', () => deleteCollege(id), 'College removed.')}
                  items={structure.colleges.map(c => ({
                    id: c.college_id,
                    title: `${c.code} — ${c.name}`,
                    subtitle: `${programsForCollege(c.college_id).length} program(s)`,
                  }))}
                />
              </>
            )}

            {/* ── Step 2 · Programs ─────────────────────────────────────────── */}
            {activeStep === 1 && (
              <>
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Add programs per college
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Every course you add later belongs to one of these programs.
                </Typography>
                {structure.colleges.length === 0 ? (
                  <Alert severity="info">Go back to step 1 and add at least one college first.</Alert>
                ) : (
                  <>
                    <TextField select label="College" size="small" value={programForm.college}
                      onChange={e => setProgramForm({ ...programForm, college: e.target.value })} sx={inputSx}>
                      <MenuItem value="">— select college —</MenuItem>
                      {structure.colleges.map(c => (
                        <MenuItem key={c.college_id} value={c.college_id}>{c.code} — {c.name}</MenuItem>
                      ))}
                    </TextField>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1.5 }}>
                      <TextField label="Code" placeholder="BSCS" size="small" value={programForm.code}
                        onChange={e => setProgramForm({ ...programForm, code: e.target.value.toUpperCase() })}
                        sx={inputSx} />
                      <TextField label="Program name" placeholder="BS Computer Science" size="small" value={programForm.name}
                        onChange={e => setProgramForm({ ...programForm, name: e.target.value })} sx={inputSx} />
                    </Box>
                    <TextField label="Description (optional)" size="small" value={programForm.description}
                      onChange={e => setProgramForm({ ...programForm, description: e.target.value })} sx={inputSx} />
                    <PrimaryBtn small disabled={saving || !programForm.college || !programForm.code.trim() || !programForm.name.trim()} onClick={addProgram}>
                      <AddIcon fontSize="small" /> Add program
                    </PrimaryBtn>
                  </>
                )}
                <RowList
                  emptyText="No programs yet."
                  onDelete={id => run('Removing program', () => deleteProgram(id), 'Program removed.')}
                  items={structure.programs.map(p => ({
                    id: p.program_id,
                    title: `${p.code} — ${p.name}`,
                    subtitle: `${p.college_name} · ${yearsForProgram(p.program_id).length} year level(s)`,
                  }))}
                />
              </>
            )}

            {/* ── Step 3 · Years & Sections ────────────────────────────────── */}
            {activeStep === 2 && (
              <>
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Add year levels and sections
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Sections are the blocks a faculty member handles, e.g. BSCS-1A.
                </Typography>
                {structure.programs.length === 0 ? (
                  <Alert severity="info">Go back to step 2 and add at least one program first.</Alert>
                ) : (
                  <>
                    <TextField select label="Program" size="small" value={programForStructure}
                      onChange={e => { setProgramForStructure(e.target.value); setSectionForm({ year_level: '', code: '', name: '' }) }}
                      sx={inputSx}>
                      <MenuItem value="">— select program —</MenuItem>
                      {structure.programs.map(p => (
                        <MenuItem key={p.program_id} value={p.program_id}>{p.code} — {p.name}</MenuItem>
                      ))}
                    </TextField>

                    <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 14, p: 2 }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Year levels
                      </Typography>
                      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '120px 1fr auto' }, gap: 1.5 }}>
                          <TextField label="Year #" type="number" size="small" value={yearForm.year_number}
                            onChange={e => setYearForm({ ...yearForm, year_number: e.target.value })} sx={inputSx} />
                          <TextField label="Label (optional)" placeholder="First Year" size="small" value={yearForm.label}
                            onChange={e => setYearForm({ ...yearForm, label: e.target.value })} sx={inputSx} />
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <PrimaryBtn small disabled={saving || !programForStructure || !yearForm.year_number} onClick={addYear}>
                              <AddIcon fontSize="small" /> Add year
                            </PrimaryBtn>
                          </Box>
                        </Box>

                        {yearsOfSelectedStructureProgram.length === 0 ? (
                          <Typography sx={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                            No year levels yet for this program.
                          </Typography>
                        ) : (
                          <Stack spacing={1}>
                            {yearsOfSelectedStructureProgram.map(year => (
                              <Box key={year.year_id} sx={{ border: '1px solid var(--border-color)', borderRadius: 12, p: 1.5 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {year.label || `Year ${year.year_number}`}
                                  </Typography>
                                  <IconButton size="small" onClick={() => run('Removing year level', () => deleteYearLevel(year.year_id), 'Year level removed.')}
                                    sx={{ color: '#FF6B6B' }}>
                                    <DeleteOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </div>
                                <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', mt: 0.5 }}>
                                  {sectionsForYear(year.year_id).length
                                    ? sectionsForYear(year.year_id).map(s => s.code).join(', ')
                                    : 'No sections yet'}
                                </Typography>
                              </Box>
                            ))}
                          </Stack>
                        )}
                      </Stack>
                    </Box>

                    <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 14, p: 2 }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Sections
                      </Typography>
                      <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 140px 1fr' }, gap: 1.5 }}>
                          <TextField select label="Year level" size="small" value={sectionForm.year_level}
                            onChange={e => setSectionForm({ ...sectionForm, year_level: e.target.value })} sx={inputSx}>
                            <MenuItem value="">— select year —</MenuItem>
                            {yearsOfSelectedStructureProgram.map(y => (
                              <MenuItem key={y.year_id} value={y.year_id}>{y.label || `Year ${y.year_number}`}</MenuItem>
                            ))}
                          </TextField>
                          <TextField label="Section code" placeholder="1A" size="small" value={sectionForm.code}
                            onChange={e => setSectionForm({ ...sectionForm, code: e.target.value.toUpperCase() })} sx={inputSx} />
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <PrimaryBtn small disabled={saving || !sectionForm.year_level || !sectionForm.code.trim()} onClick={addSection}>
                              <AddIcon fontSize="small" /> Add section
                            </PrimaryBtn>
                          </Box>
                        </Box>

                        <RowList
                          emptyText="No sections yet for this program."
                          onDelete={id => run('Removing section', () => deleteSection(id), 'Section removed.')}
                          items={structure.sections
                            .filter(s => s.program === programForStructure)
                            .map(s => ({ id: s.section_id, title: s.code, subtitle: s.display_name }))}
                        />
                      </Stack>
                    </Box>
                  </>
                )}
              </>
            )}

            {/* ── Step 4 · Courses ─────────────────────────────────────────── */}
            {activeStep === 3 && (
              <>
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Add courses per program
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Courses added here appear in the course dropdown when you assign teaching loads to faculty.
                </Typography>
                {structure.programs.length === 0 ? (
                  <Alert severity="info">Go back to step 2 and add at least one program first.</Alert>
                ) : (
                  <>
                    <TextField select label="Program" size="small" value={programForCourses}
                      onChange={e => { setProgramForCourses(e.target.value); setCourseForm(prev => ({ ...prev, year_level: '', section: '' })) }}
                      sx={inputSx}>
                      <MenuItem value="">— select program —</MenuItem>
                      {structure.programs.map(p => (
                        <MenuItem key={p.program_id} value={p.program_id}>{p.code} — {p.name}</MenuItem>
                      ))}
                    </TextField>

                    <OutlineBtn small disabled={saving || !programForCourses} onClick={addRecommendedGed}>
                      <AutoAwesomeIcon fontSize="small" /> Add recommended GEd subjects
                    </OutlineBtn>

                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 1.5 }}>
                      <TextField label="Course code" placeholder="BSCS101" size="small" value={courseForm.course_code}
                        onChange={e => setCourseForm({ ...courseForm, course_code: e.target.value.toUpperCase() })} sx={inputSx} />
                      <TextField label="Course title" placeholder="Introduction to Computing" size="small" value={courseForm.course_title}
                        onChange={e => setCourseForm({ ...courseForm, course_title: e.target.value })} sx={inputSx} />
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
                      <TextField select label="Category" size="small" value={courseForm.category}
                        onChange={e => setCourseForm({ ...courseForm, category: e.target.value })} sx={inputSx}>
                        {COURSE_CATEGORIES.map(c => (
                          <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                        ))}
                      </TextField>
                      <TextField select label="Year level" size="small" value={courseForm.year_level}
                        onChange={e => setCourseForm({ ...courseForm, year_level: e.target.value, section: '' })} sx={inputSx}>
                        <MenuItem value="">Any year</MenuItem>
                        {yearsOfSelectedCourseProgram.map(y => (
                          <MenuItem key={y.year_id} value={y.year_id}>{y.label || `Year ${y.year_number}`}</MenuItem>
                        ))}
                      </TextField>
                      <TextField label="Units" type="number" size="small" value={courseForm.units}
                        onChange={e => setCourseForm({ ...courseForm, units: e.target.value })} sx={inputSx} />
                    </Box>
                    <TextField select label="Section" size="small" value={courseForm.section}
                      onChange={e => setCourseForm({ ...courseForm, section: e.target.value })} sx={inputSx}>
                      <MenuItem value="">Any section</MenuItem>
                      {structure.sections
                        .filter(s => s.program === programForCourses && (!courseForm.year_level || s.year_level === courseForm.year_level))
                        .map(s => (
                          <MenuItem key={s.section_id} value={s.section_id}>{s.code} — {s.display_name}</MenuItem>
                        ))}
                    </TextField>
                    <PrimaryBtn small
                      disabled={saving || !programForCourses || !courseForm.course_code.trim() || !courseForm.course_title.trim()}
                      onClick={() => addCourse()}>
                      <AddIcon fontSize="small" /> Add course
                    </PrimaryBtn>

                    <RowList
                      emptyText="No courses yet for this program."
                      onDelete={id => run('Removing course', () => deleteCourse(id), 'Course removed.')}
                      items={coursesForProgram(programForCourses).map(c => ({
                        id: c.course_id,
                        title: `${c.course_code} — ${c.course_title}`,
                        subtitle: [
                          c.category === 'ged' ? 'GEd' : c.category,
                          c.year_label,
                          c.section_code,
                          c.units ? `${c.units} units` : null,
                        ].filter(Boolean).join(' · '),
                      }))}
                    />
                  </>
                )}
              </>
            )}

            {/* ── Step 5 · Knowledge base ──────────────────────────────────── */}
            {activeStep === 4 && (
              <>
                <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Knowledge base (optional)
                </Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Upload CHED handbooks, syllabi, policies and reference material so ATLAS can ground syllabus
                  and assessment generation in your institutional documents. You can skip this and add documents
                  any time later from the Knowledge Base module.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
                  {[
                    { title: 'CHED Handbooks', text: 'Memo circulars and program guidelines.' },
                    { title: 'Institutional Syllabi', text: 'Reference formats and existing course outlines.' },
                    { title: 'Policies', text: 'Academic, grading and conduct policies.' },
                    { title: 'Assessment Samples', text: 'Past TOS and test banks for alignment.' },
                  ].map(card => (
                    <div key={card.title} style={{
                      border: '1px solid var(--border-color)', borderRadius: 14, padding: 14,
                      background: 'var(--bg-header)',
                    }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{card.title}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginTop: 4 }}>{card.text}</div>
                    </div>
                  ))}
                </Box>
                <Alert severity="info">
                  Setup summary — {counts.colleges} college(s), {counts.programs} program(s), {counts.years} year level(s),
                  {' '}{counts.sections} section(s), {counts.courses} course(s).
                </Alert>
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      <Divider sx={{ borderColor: 'var(--border-color)' }} />

      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Box>
          {activeStep > 0 && (
            <OutlineBtn small disabled={saving} onClick={() => { setError(''); setNotice(''); setActiveStep(step => step - 1) }}>
              Back
            </OutlineBtn>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {activeStep < WIZARD_STEPS.length - 1 ? (
            <PrimaryBtn disabled={saving} onClick={() => { setError(''); setNotice(''); setActiveStep(step => step + 1) }}>
              Next
            </PrimaryBtn>
          ) : (
            <>
              <OutlineBtn disabled={saving || missing.length > 0} onClick={() => finish(true)}>
                Skip &amp; finish
              </OutlineBtn>
              <PrimaryBtn disabled={saving || missing.length > 0} onClick={() => finish(false)}>
                Finish setup
              </PrimaryBtn>
            </>
          )}
        </Box>
      </Box>

      {activeStep === WIZARD_STEPS.length - 1 && missing.length > 0 && (
        <Box sx={{ px: 3, pb: 2 }}>
          <Typography sx={{ fontSize: '0.75rem', color: '#FFB74D' }}>
            Still needed before you can finish: {missing.join(', ')}.
          </Typography>
        </Box>
      )}
      {saving && (
        <Box sx={{ px: 3, pb: 2 }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Saving…</Typography>
        </Box>
      )}
    </Dialog>
  )
}
