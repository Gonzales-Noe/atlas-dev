import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, Divider,
  IconButton, LinearProgress, Stack, Step,
  StepLabel, Stepper, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import {
  completeSetup,
  createFacultyWithAssignments,
  fetchFacultyAssignments,
  fetchInstitutionCustomization,
  previewSyllabusTemplate,
  saveInstitutionCustomization,
  uploadInstitutionKnowledgeDocument,
  WIZARD_STEPS,
} from './academicApi'
import SyllabusFormatEditor from './SyllabusFormatEditor'
import { PrimaryBtn, OutlineBtn } from '../../../components/ui'
import LoadingState from '../../../components/LoadingState'

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

export default function AdminSetupWizard({ open, onFinished }) {
  const [activeStep, setActiveStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateFileUrl, setTemplateFileUrl] = useState('')
  const [templateFileType, setTemplateFileType] = useState('')
  const [templateLocalFile, setTemplateLocalFile] = useState(null)
  const [previewBlocks, setPreviewBlocks] = useState([])
  const [fieldMap, setFieldMap] = useState({ sections: [], click_log: [], version: 1 })
  const [templateUploadMsg, setTemplateUploadMsg] = useState({ message: '', severity: 'info' })
  const [styleProfile, setStyleProfile] = useState({})
  const [brandingDraft, setBrandingDraft] = useState({
    header_text: '', footer_text: '', header_image_url: '', footer_image_url: '',
  })
  const [facultyForm, setFacultyForm] = useState({ full_name: '', email: '', password: '' })
  const [assignmentGroups, setAssignmentGroups] = useState([EMPTY_ASSIGNMENT()])
  const [hasAssignedFaculty, setHasAssignedFaculty] = useState(false)
  const [facultyCount, setFacultyCount] = useState(0)
  const [assignedLoads, setAssignedLoads] = useState([])
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
      setTemplateName(customization.syllabus_template_name || '')
      setTemplateFileUrl(customization.syllabus_template_url || '')
      setTemplateFileType(customization.syllabus_template_kind || '')
      setTemplateLocalFile(null)
      setPreviewBlocks(Array.isArray(customization.syllabus_preview_blocks) ? customization.syllabus_preview_blocks : [])
      setFieldMap(customization.syllabus_field_map && typeof customization.syllabus_field_map === 'object'
        ? customization.syllabus_field_map
        : { sections: [], click_log: [], version: 1 })
      setStyleProfile(customization.syllabus_style_profile && typeof customization.syllabus_style_profile === 'object'
        ? customization.syllabus_style_profile
        : {})
      setBrandingDraft({
        header_text: customization.header_text || '',
        footer_text: customization.footer_text || '',
        header_image_url: customization.header_image_url || '',
        footer_image_url: customization.footer_image_url || '',
      })
      const assignedFacultyIds = new Set((assignmentsData.assignments || []).map(item => item.faculty_id))
      const existingCount = (assignmentsData.faculty || []).filter(faculty => assignedFacultyIds.has(faculty.user_id)).length
      setHasAssignedFaculty(existingCount > 0)
      setFacultyCount(existingCount)
      const facultyById = new Map((assignmentsData.faculty || []).map(faculty => [
        faculty.user_id,
        faculty.full_name || faculty.email,
      ]))
      setAssignedLoads((assignmentsData.assignments || []).map(assignment => ({
        ...assignment,
        faculty_name: facultyById.get(assignment.faculty_id) || 'Faculty',
      })))
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

  useEffect(() => {
    if (!notice) return undefined
    const timeout = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    setNotice('')
  }, [activeStep])

  async function handleTemplateUpload(file) {
    if (!file) return
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    setSaving(true)
    setError('')
    setNotice('')
    setTemplateLocalFile(file)
    setTemplateUploadMsg({ message: `Loading your ${ext.toUpperCase() || 'file'}…`, severity: 'info' })
    try {
      const result = await previewSyllabusTemplate(file)
      setTemplateName(result.template_name || file.name)
      setTemplateFileType(result.file_type || ext)
      setTemplateFileUrl(result.template_file_url || '/api/users/institution-syllabus-template/file/')
      setPreviewBlocks(Array.isArray(result.blocks) ? result.blocks : [])
      setFieldMap(result.field_map || { sections: [], click_log: [], version: 1 })
      setTemplateUploadMsg({
        message: result.detail || `Exact file loaded (${result.block_count || 0} clickable regions).`,
        severity: 'success',
      })
      setNotice('Exact file loaded. Click text on the left to record sections.')
    } catch (err) {
      setTemplateLocalFile(null)
      setError(toMessage(err, 'Could not load the syllabus template.'))
      setTemplateUploadMsg({ message: '', severity: 'info' })
    } finally {
      setSaving(false)
    }
  }

  async function saveTemplateAndContinue() {
    const mapSections = fieldMap?.sections || []
    if (!previewBlocks.length) {
      setError('Upload a syllabus template (.docx, .pdf, or .xlsx) first.')
      return
    }
    if (!mapSections.length) {
      setError('Click at least one section on the preview before continuing.')
      return
    }
    const missingContent = mapSections.filter(section => section.enabled !== false && !section.content_region_id)
    if (missingContent.length) {
      setError(`Place content for: ${missingContent.map(s => s.label).join(', ')}`)
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveInstitutionCustomization({
        syllabus_template_name: templateName,
        syllabus_field_map: fieldMap,
        syllabus_preview_blocks: previewBlocks,
        syllabus_style_profile: styleProfile || {},
        ...brandingDraft,
      })
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
      const facultyName = facultyForm.full_name.trim()
      setAssignedLoads(current => [
        ...current,
        ...assignments.flatMap(group => group.courses.map(course => ({
          faculty_name: facultyName,
          course_code: course.course_code,
          course_title: course.course_title,
          section: group.section,
        }))),
      ])
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
      maxWidth={activeStep === 0 ? 'lg' : 'md'}
      disableEscapeKeyDown
      transitionDuration={0}
      BackdropProps={{ sx: { backgroundColor: 'transparent' } }}
      PaperProps={{ sx: dialogPaper }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.12em', color: '#86EFAC', textTransform: 'uppercase' }}>
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
          '& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed': { color: '#86EFAC' },
        }}>
          {WIZARD_STEPS.map(step => <Step key={step.key}><StepLabel>{step.label}</StepLabel></Step>)}
        </Stepper>
      </Box>
      <LinearProgress
        variant="determinate"
        value={((activeStep + 1) / WIZARD_STEPS.length) * 100}
        sx={{ height: 3, background: 'transparent', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#16A34A,#86EFAC)' } }}
      />

      <DialogContent dividers sx={{ px: 3, py: 2.5, bgcolor: 'var(--bg-card)', borderColor: 'var(--border-color) !important' }}>
        {loading ? (
          <LoadingState label="Loading your institution setup..." />
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

            {activeStep === 0 && (
              <>
                <Typography sx={{ fontWeight: 700, color: 'var(--text-primary)' }}>1. Set the institution syllabus template</Typography>
                <Typography sx={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Upload a DOCX, PDF, or Excel syllabus. Click headings on the left to build sections, then click again to place where faculty content goes.
                </Typography>
                <SyllabusFormatEditor
                  blocks={previewBlocks}
                  fieldMap={fieldMap}
                  onFieldMapChange={setFieldMap}
                  templateName={templateName}
                  templateFileUrl={templateFileUrl}
                  fileType={templateFileType}
                  localFile={templateLocalFile}
                  onUpload={handleTemplateUpload}
                  uploading={saving}
                  uploadMessage={templateUploadMsg.message}
                  uploadSeverity={templateUploadMsg.severity}
                />
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
                      <IconButton aria-label="Remove section" disabled={assignmentGroups.length === 1} onClick={() => setAssignmentGroups(current => current.filter((_, i) => i !== groupIndex))} sx={{ color: '#86EFAC' }}>
                        <DeleteOutlinedIcon />
                      </IconButton>
                    </Stack>
                    <Stack spacing={1} sx={{ mt: 1.5 }}>
                      {group.courses.map((course, courseIndex) => (
                        <Box key={courseIndex} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '150px 1fr auto' }, gap: 1 }}>
                          <TextField label="Course code" value={course.course_code} onChange={event => updateCourse(groupIndex, courseIndex, 'course_code', event.target.value)} size="small" sx={inputSx} />
                          <TextField label="Course name" value={course.course_title} onChange={event => updateCourse(groupIndex, courseIndex, 'course_title', event.target.value)} size="small" sx={inputSx} />
                          <IconButton aria-label="Remove course" disabled={group.courses.length === 1} onClick={() => setAssignmentGroups(current => current.map((item, i) => i === groupIndex ? { ...item, courses: item.courses.filter((_, j) => j !== courseIndex) } : item))} sx={{ color: '#86EFAC' }}>
                            <DeleteOutlinedIcon />
                          </IconButton>
                        </Box>
                      ))}
                      <Button size="small" startIcon={<AddIcon />} onClick={() => setAssignmentGroups(current => current.map((item, i) => i === groupIndex ? { ...item, courses: [...item.courses, { course_code: '', course_title: '' }] } : item))} sx={{ alignSelf: 'flex-start', textTransform: 'none', color: 'var(--brand-accent)' }}>
                        Add course
                      </Button>
                    </Stack>
                  </Box>
                ))}
                <OutlineBtn small onClick={() => setAssignmentGroups(current => [...current, EMPTY_ASSIGNMENT()])}><AddIcon fontSize="small" /> Add another section</OutlineBtn>
                <Button variant="contained" size="small" onClick={addFaculty} disabled={saving} sx={{ alignSelf: 'flex-start', textTransform: 'none', bgcolor: 'var(--brand-primary)', '&:hover': { bgcolor: 'var(--brand-primary-hover)' } }}>
                  {saving ? <CircularProgress size={18} /> : <><AddIcon fontSize="small" /> Add faculty and assignments</>}
                </Button>
                <Box sx={{ mt: 1, p: 1.5, border: '1px solid var(--border-color)', borderRadius: 2 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', mb: 1 }}>
                    Current faculty teaching loads ({assignedLoads.length})
                  </Typography>
                  {assignedLoads.length ? (
                    <Stack spacing={0.75} sx={{ maxHeight: 180, overflowY: 'auto' }}>
                      {assignedLoads.map((load, index) => (
                        <Box key={load.assignment_id || `${load.faculty_name}-${load.course_code}-${load.section}-${index}`} sx={{ px: 1.25, py: 0.75, bgcolor: 'var(--bg-elevated)', borderRadius: 1 }}>
                          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {load.faculty_name}
                          </Typography>
                          <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {load.course_code} — {load.course_title} · Section {load.section}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  ) : (
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Faculty accounts and course assignments will appear here after they are added.
                    </Typography>
                  )}
                </Box>
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
                  <Button onClick={uploadKnowledgeBase} disabled={saving || knowledgeUploaded} startIcon={<AutoAwesomeIcon />} sx={{ alignSelf: 'flex-start', textTransform: 'none', color: '#86EFAC' }}>
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
