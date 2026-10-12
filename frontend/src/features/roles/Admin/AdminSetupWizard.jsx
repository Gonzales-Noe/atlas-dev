import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, Divider,
  FormControlLabel, IconButton, LinearProgress, Stack, Step,
  StepLabel, Stepper, Switch, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import {
  analyzeSyllabusTemplate,
  completeSetup,
  createFacultyWithAssignments,
  fetchFacultyAssignments,
  fetchInstitutionCustomization,
  saveInstitutionCustomization,
  uploadInstitutionKnowledgeDocument,
  WIZARD_STEPS,
} from './academicApi'
import { PrimaryBtn, OutlineBtn } from '../../../components/ui'

const EMPTY_ASSIGNMENT = () => ({ section: '', courses: [{ course_code: '', course_title: '' }] })

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

function toMessage(err, fallback) {
  const data = err?.response?.data
  if (typeof data === 'string') return data
  if (typeof data?.detail === 'string') return data.detail
  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' · ')
  }
  return fallback
}

function sectionKey(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function AdminSetupWizard({ open, onFinished }) {
  const [activeStep, setActiveStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [sections, setSections] = useState([])
  const [manualSection, setManualSection] = useState('')
  const [facultyForm, setFacultyForm] = useState({ full_name: '', email: '', password: '' })
  const [assignmentGroups, setAssignmentGroups] = useState([EMPTY_ASSIGNMENT()])
  const [hasAssignedFaculty, setHasAssignedFaculty] = useState(false)
  const [facultyCount, setFacultyCount] = useState(0)
  const [knowledgeFile, setKnowledgeFile] = useState(null)
  const [knowledgeUploaded, setKnowledgeUploaded] = useState(false)

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [customization, assignmentsData] = await Promise.all([
        fetchInstitutionCustomization(),
        fetchFacultyAssignments(),
      ])
      const savedSections = Array.isArray(customization.syllabus_sections)
        ? customization.syllabus_sections
        : []
      setTemplateName(customization.syllabus_template_name || '')
      setSections(savedSections)
      const assignedFacultyIds = new Set((assignmentsData.assignments || []).map(item => item.faculty_id))
      const existingCount = (assignmentsData.faculty || []).filter(faculty => assignedFacultyIds.has(faculty.user_id)).length
      setHasAssignedFaculty(existingCount > 0)
      setFacultyCount(existingCount)
    } catch (err) {
      setError(toMessage(err, 'Could not load your institution setup. Retry to continue.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setActiveStep(0)
      setError('')
      setNotice('')
      loadInitialData()
    }
  }, [open, loadInitialData])

  function updateSection(index, changes) {
    setSections(current => current.map((section, i) => i === index ? { ...section, ...changes } : section))
  }

  async function handleTemplateUpload(file) {
    if (!file) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await analyzeSyllabusTemplate(file)
      setTemplateName(result.template_name || file.name)
      if (Array.isArray(result.sections) && result.sections.length) {
        setSections(result.sections)
        setNotice(`Detected ${result.sections.length} possible section${result.sections.length === 1 ? '' : 's'}. Review them and choose what faculty can edit.`)
      } else {
        setNotice(result.detail || 'No headings were detected. Add your sections manually below.')
      }
    } catch (err) {
      setError(toMessage(err, 'Could not analyze the syllabus template.'))
    } finally {
      setSaving(false)
    }
  }

  function addManualSection() {
    const label = manualSection.trim()
    if (!label) return
    const key = sectionKey(label)
    if (sections.some(section => section.label?.trim().toLowerCase() === label.toLowerCase())) {
      setError('That section is already in the template.')
      return
    }
    setSections(current => [...current, {
      key: key || `section-${current.length + 1}`,
      label,
      enabled: true,
      is_static: false,
      static_content: '',
    }])
    setManualSection('')
    setError('')
  }

  async function saveTemplateAndContinue() {
    const enabledSections = sections
      .filter(section => section.enabled && section.label?.trim())
      .map(section => ({
        ...section,
        key: section.key?.trim() || sectionKey(section.label),
        label: section.label.trim(),
        static_content: section.is_static ? (section.static_content || '').trim() : '',
      }))
    if (!enabledSections.length) {
      setError('Add and enable at least one syllabus section to continue.')
      return
    }
    if (enabledSections.some(section => section.is_static && !section.static_content)) {
      setError('Add the fixed content for each section marked as static.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveInstitutionCustomization({
        syllabus_template_name: templateName,
        syllabus_sections: enabledSections,
      })
      setSections(enabledSections)
      setActiveStep(1)
    } catch (err) {
      setError(toMessage(err, 'Could not save the syllabus template.'))
    } finally {
      setSaving(false)
    }
  }

  function updateCourse(groupIndex, courseIndex, field, value) {
    setAssignmentGroups(current => current.map((group, i) => i !== groupIndex ? group : {
      ...group,
      courses: group.courses.map((course, j) => j === courseIndex ? { ...course, [field]: value } : course),
    }))
  }

  async function addFaculty() {
    const assignments = assignmentGroups.map(group => ({
      section: group.section.trim(),
      courses: group.courses.map(course => ({
        course_code: course.course_code.trim(),
        course_title: course.course_title.trim(),
      })),
    }))
    if (!facultyForm.full_name.trim() || !facultyForm.email.trim() || facultyForm.password.length < 8) {
      setError('Enter the faculty name, a valid email, and a password with at least 8 characters.')
      return
    }
    if (assignments.some(group => !group.section || !group.courses.length
      || group.courses.some(course => !course.course_code || !course.course_title))) {
      setError('For each section, enter the section name and at least one course code and title.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await createFacultyWithAssignments({ ...facultyForm, assignments })
      setHasAssignedFaculty(true)
      setFacultyCount(count => count + 1)
      setFacultyForm({ full_name: '', email: '', password: '' })
      setAssignmentGroups([EMPTY_ASSIGNMENT()])
      setNotice('Faculty account and all section/course assignments were added together.')
    } catch (err) {
      setError(toMessage(err, 'Could not add the faculty account and teaching loads.'))
    } finally {
      setSaving(false)
    }
  }

  async function uploadKnowledgeBase() {
    if (!knowledgeFile) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await uploadInstitutionKnowledgeDocument(knowledgeFile)
      setKnowledgeUploaded(true)
      setNotice('Knowledge base document uploaded.')
    } catch (err) {
      setError(toMessage(err, 'Could not upload the knowledge base document. You can skip this optional step.'))
    } finally {
      setSaving(false)
    }
  }

  async function finishSetup() {
    if (!hasAssignedFaculty) {
      setError('Add at least one faculty account with a course and section assignment before finishing.')
      setActiveStep(1)
      return
    }
    setSaving(true)
    setError('')
    try {
      await completeSetup(!knowledgeUploaded)
      onFinished?.()
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

  return (
    <Dialog
      open={open}
      onClose={() => {}}
      fullWidth
      maxWidth="md"
      disableEscapeKeyDown
      PaperProps={{ sx: dialogPaper }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', color: '#FF9F0A', textTransform: 'uppercase' }}>
          First-time setup
        </Typography>
        <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', mt: 0.5 }}>
          Set up your institution
        </Typography>
        <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-secondary)', mt: 0.5 }}>
          Complete the syllabus template and faculty assignments to unlock the admin workspace.
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'var(--border-color)' }} />
      <Box sx={{ px: 3, pt: 2 }}>
        <Stepper activeStep={activeStep} alternativeLabel sx={{
          '& .MuiStepLabel-label': { color: 'var(--text-tertiary)', fontSize: '0.72rem' },
          '& .MuiStepLabel-label.Mui-active, & .MuiStepLabel-label.Mui-completed': { color: 'var(--text-primary)', fontWeight: 700 },
          '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.12)' },
          '& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed': { color: '#FF9F0A' },
        }}>
          {WIZARD_STEPS.map(step => <Step key={step.key}><StepLabel>{step.label}</StepLabel></Step>)}
        </Stepper>
      </Box>
      <LinearProgress
        variant="determinate"
        value={((activeStep + 1) / WIZARD_STEPS.length) * 100}
        sx={{ height: 3, background: 'transparent', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#FF9F0A,#FF453A)' } }}
      />

      <DialogContent dividers sx={{ px: 3, py: 2.5, bgcolor: 'var(--bg-card)', borderColor: 'var(--border-color) !important' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={28} sx={{ color: '#FF9F0A' }} /></Box>
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

            {activeStep === 0 && (
              <>
                <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)' }}>1. Set the institution syllabus template</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Upload a PDF/DOCX to detect section headings, or add sections manually. Enabled sections appear in every faculty syllabus; mark shared institutional information as fixed.
                </Typography>
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  disabled={saving}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none', borderColor: '#FF9F0A', color: '#FF9F0A' }}
                >
                  {templateName || 'Upload syllabus template (PDF or DOCX)'}
                  <input hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={event => { handleTemplateUpload(event.target.files?.[0]); event.target.value = '' }} />
                </Button>
                {templateName && <Typography sx={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Template: {templateName}</Typography>}
                {sections.map((section, index) => (
                  <Box key={`${section.key || section.label}-${index}`} sx={{ p: 1.5, border: '1px solid var(--border-color)', borderRadius: 2 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                      <TextField
                        label="Section name"
                        size="small"
                        fullWidth
                        value={section.label || ''}
                        onChange={event => updateSection(index, { label: event.target.value, key: sectionKey(event.target.value) })}
                        sx={inputSx}
                      />
                      <FormControlLabel
                        control={<Switch checked={section.enabled !== false} onChange={event => updateSection(index, { enabled: event.target.checked })} />}
                        label="Show to faculty"
                        sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                      />
                      <FormControlLabel
                        control={<Switch checked={Boolean(section.is_static)} onChange={event => updateSection(index, { is_static: event.target.checked })} />}
                        label="Fixed for all"
                        sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                      />
                      <IconButton aria-label={`Remove ${section.label || 'section'}`} onClick={() => setSections(current => current.filter((_, i) => i !== index))} sx={{ color: '#FF6B6B' }}>
                        <DeleteOutlinedIcon />
                      </IconButton>
                    </Stack>
                    {section.is_static && (
                      <TextField
                        label="Shared fixed content"
                        value={section.static_content || ''}
                        onChange={event => updateSection(index, { static_content: event.target.value })}
                        fullWidth
                        multiline
                        minRows={2}
                        size="small"
                        sx={{ ...inputSx, mt: 1.5 }}
                        placeholder="For example, the institution's mission and vision."
                      />
                    )}
                  </Box>
                ))}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    label="Add a section manually"
                    value={manualSection}
                    onChange={event => setManualSection(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addManualSection() } }}
                    fullWidth
                    size="small"
                    sx={inputSx}
                  />
                  <OutlineBtn onClick={addManualSection} disabled={!manualSection.trim()}><AddIcon fontSize="small" /> Add section</OutlineBtn>
                </Stack>
              </>
            )}

            {activeStep === 1 && (
              <>
                <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)' }}>2. Add a faculty account and teaching load</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Add the faculty member and all their sections and courses in one submission. You can add more than one course to a section.
                </Typography>
                {hasAssignedFaculty && (
                  <Alert severity="success">{facultyCount} faculty account(s) already have a course and section assignment.</Alert>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField label="Faculty name" value={facultyForm.full_name} onChange={event => setFacultyForm({ ...facultyForm, full_name: event.target.value })} size="small" sx={inputSx} />
                  <TextField label="Email" type="email" value={facultyForm.email} onChange={event => setFacultyForm({ ...facultyForm, email: event.target.value })} size="small" sx={inputSx} />
                  <TextField label="Temporary password (8+ characters)" type="password" value={facultyForm.password} onChange={event => setFacultyForm({ ...facultyForm, password: event.target.value })} size="small" sx={inputSx} />
                </Box>
                {assignmentGroups.map((group, groupIndex) => (
                  <Box key={groupIndex} sx={{ p: 1.5, border: '1px solid var(--border-color)', borderRadius: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        label="Section"
                        placeholder="e.g. BSCS 1A"
                        value={group.section}
                        onChange={event => setAssignmentGroups(current => current.map((item, i) => i === groupIndex ? { ...item, section: event.target.value } : item))}
                        fullWidth
                        size="small"
                        sx={inputSx}
                      />
                      <IconButton aria-label="Remove section" disabled={assignmentGroups.length === 1} onClick={() => setAssignmentGroups(current => current.filter((_, i) => i !== groupIndex))} sx={{ color: '#FF6B6B' }}>
                        <DeleteOutlinedIcon />
                      </IconButton>
                    </Stack>
                    <Stack spacing={1} sx={{ mt: 1.5 }}>
                      {group.courses.map((course, courseIndex) => (
                        <Box key={courseIndex} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr auto' }, gap: 1 }}>
                          <TextField label="Course code" value={course.course_code} onChange={event => updateCourse(groupIndex, courseIndex, 'course_code', event.target.value)} size="small" sx={inputSx} />
                          <TextField label="Course name" value={course.course_title} onChange={event => updateCourse(groupIndex, courseIndex, 'course_title', event.target.value)} size="small" sx={inputSx} />
                          <IconButton aria-label="Remove course" disabled={group.courses.length === 1} onClick={() => setAssignmentGroups(current => current.map((item, i) => i === groupIndex ? { ...item, courses: item.courses.filter((_, j) => j !== courseIndex) } : item))} sx={{ color: '#FF6B6B' }}>
                            <DeleteOutlinedIcon />
                          </IconButton>
                        </Box>
                      ))}
                      <Button startIcon={<AddIcon />} onClick={() => setAssignmentGroups(current => current.map((item, i) => i === groupIndex ? { ...item, courses: [...item.courses, { course_code: '', course_title: '' }] } : item))} sx={{ alignSelf: 'flex-start', textTransform: 'none', color: '#FF9F0A' }}>
                        Add course to this section
                      </Button>
                    </Stack>
                  </Box>
                ))}
                <OutlineBtn onClick={() => setAssignmentGroups(current => [...current, EMPTY_ASSIGNMENT()])}><AddIcon fontSize="small" /> Add another section</OutlineBtn>
                <PrimaryBtn onClick={addFaculty} disabled={saving}>
                  {saving ? <CircularProgress size={18} /> : <><AddIcon fontSize="small" /> Add faculty and assignments</>}
                </PrimaryBtn>
              </>
            )}

            {activeStep === 2 && (
              <>
                <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)' }}>3. Upload a knowledge base (optional)</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Add institutional reference documents now, or skip and upload them later from Knowledge Base.
                </Typography>
                <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />} disabled={saving}
                  sx={{ alignSelf: 'flex-start', textTransform: 'none', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
                  {knowledgeFile?.name || 'Choose PDF or DOCX'}
                  <input hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={event => setKnowledgeFile(event.target.files?.[0] || null)} />
                </Button>
                {knowledgeFile && (
                  <Button onClick={uploadKnowledgeBase} disabled={saving || knowledgeUploaded} startIcon={<AutoAwesomeIcon />} sx={{ alignSelf: 'flex-start', textTransform: 'none', color: '#FF9F0A' }}>
                    {knowledgeUploaded ? 'Uploaded' : 'Upload knowledge base'}
                  </Button>
                )}
                {knowledgeUploaded && <Alert severity="success">Knowledge base uploaded successfully.</Alert>}
              </>
            )}
          </Stack>
        )}
      </DialogContent>

      {!loading && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, px: 3, py: 2 }}>
          <OutlineBtn onClick={() => setActiveStep(step => Math.max(0, step - 1))} disabled={saving || activeStep === 0}>Back</OutlineBtn>
          {activeStep === 0 && <PrimaryBtn onClick={saveTemplateAndContinue} disabled={saving}>Save and continue</PrimaryBtn>}
          {activeStep === 1 && <PrimaryBtn onClick={() => hasAssignedFaculty && setActiveStep(2)} disabled={!hasAssignedFaculty || saving}>Continue</PrimaryBtn>}
          {activeStep === 2 && <PrimaryBtn onClick={finishSetup} disabled={saving}>{saving ? <CircularProgress size={18} /> : 'Finish setup'}</PrimaryBtn>}
        </Box>
      )}
    </Dialog>
  )
}
