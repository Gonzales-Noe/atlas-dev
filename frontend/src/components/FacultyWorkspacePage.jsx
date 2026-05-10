// src/components/FacultyWorkspacePage.jsx
// 3-panel workspace — light theme matching sign-in page (white/#F7F9FC/#8B0000).
// Left: nav tabs | Middle: content + syllabus section tabs | Right: upload

import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AutoAlert from './AutoAlert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Drawer from '@mui/material/Drawer'
import IconButton from '@mui/material/IconButton'
import useMediaQuery from '@mui/material/useMediaQuery'
import LinearProgress from '@mui/material/LinearProgress'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AssignmentIcon from '@mui/icons-material/Assignment'
import DeleteIcon from '@mui/icons-material/Delete'
import GradeIcon from '@mui/icons-material/Grade'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MenuIcon from '@mui/icons-material/Menu'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import useApi from '../hooks/useApi'
import api from '../config/api'
import { useAuth } from '../store/authStore'
import { toInitials, extractApiError } from '../utils'
import AtlasLogo from './AtlasLogo'

// ── Constants ─────────────────────────────────────────────────────────────
const MAROON = '#8B0000'
const MAROON_LIGHT = '#FFF5F5'
const BG = '#F7F9FC'

const WORKSPACE_TABS = [
  { key: 'syllabus',   label: 'Syllabus',    Icon: MenuBookIcon },
  { key: 'module',     label: 'Modules',     Icon: ViewModuleIcon },
  { key: 'assessment', label: 'Assessments', Icon: AssignmentIcon },
  { key: 'grading',    label: 'Grading',     Icon: GradeIcon },
]

const SYLLABUS_SECTIONS = [
  { key: 'overview',        label: 'Overview' },
  { key: 'description',     label: 'Description & Rationale' },
  { key: 'contact',         label: 'Contact Hours & Assessment' },
  { key: 'tlas',            label: 'TLAs' },
  { key: 'ilo',             label: 'Learning Outcomes' },
  { key: 'assessment_map',  label: 'Assessment Map' },
  { key: 'references',      label: 'References' },
  { key: 'attributes',      label: 'Graduate Attributes' },
  { key: 'policies',        label: 'Course Policies' },
  { key: 'generate',        label: '+ Generate' },
]

const PROVIDERS = ['ollama', 'gemini', 'gpt', 'groq', 'anthropic', 'openrouter']
const ASSESSMENT_TYPES = [
  'quiz', 'long quiz', 'midterm exam', 'final exam',
  'assignment', 'project', 'activity', 'performance task',
]

const DEFAULT_GRADING_ROWS = [
  { rating: 'Excellent',           grade: '1.00', range: '98 – 100' },
  { rating: 'Superior',            grade: '1.25', range: '94 – 97' },
  { rating: 'Very Good',           grade: '1.50', range: '90 – 93' },
  { rating: 'Good',                grade: '1.75', range: '88 – 89' },
  { rating: 'Meritorious',         grade: '2.00', range: '85 – 87' },
  { rating: 'Very Satisfactory',   grade: '2.25', range: '83 – 84' },
  { rating: 'Satisfactory',        grade: '2.50', range: '80 – 82' },
  { rating: 'Fairly Satisfactory', grade: '2.75', range: '78 – 79' },
  { rating: 'Passing',             grade: '3.00', range: '75 – 77' },
  { rating: 'Failure',             grade: '5.00', range: 'Below 70' },
  { rating: 'Incomplete',          grade: 'INC',  range: '\u2014' },
]

const EMPTY_TASK = { code: '', task: '', ird: '', weight: '', ilo1: '', ilo2: '', ilo3: '', domain: '' }
const EMPTY_ATTR = { code: '', title: '', description: '' }
const EMPTY_POLICY = { title: '', content: '' }

const EMPTY_SYLLABUS = {
  course_title: '', course_code: '', course_category: '', prerequisites: '',
  semester_year: '', credit_hours: '', instructor_name: '', reference_cmo: '',
  date_prepared: '', revision_no: '', period_of_study: '',
  vision: '', mission: '', description: '',
  lecture_hours: '', lab_hours: '', assessment_criteria: '',
  tlas: '',
  ilos: [''],
  assessment_tasks: [{ ...EMPTY_TASK }],
  references: [''],
  igas:            [{ ...EMPTY_ATTR }],
  student_outcomes:[{ ...EMPTY_ATTR }],
  cdio_skills:     [{ ...EMPTY_ATTR }],
  sdg_skills:      [{ ...EMPTY_ATTR }],
  grading_rows: DEFAULT_GRADING_ROWS.map(r => ({ ...r })),
  policies: [{ title: 'Class Policies', content: '' }],
}

// ── Shared sub-components ─────────────────────────────────────────────────
function SectionCard({ title, children, action }) {
  return (
    <Paper elevation={0}
      sx={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 2.5, mb: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, py: 1.25, bgcolor: BG, borderBottom: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center' }}>
        <Typography variant="subtitle2"
          sx={{ fontWeight: 700, color: '#444', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      <Box sx={{ p: 2.5 }}>{children}</Box>
    </Paper>
  )
}

function LField({ label, ...props }) {
  return (
    <TextField size="small" fullWidth label={label} {...props}
      sx={{
        '& .MuiOutlinedInput-root': {
          '&:hover fieldset': { borderColor: MAROON },
          '&.Mui-focused fieldset': { borderColor: MAROON },
        },
        '& .MuiInputLabel-root.Mui-focused': { color: MAROON },
        ...props.sx,
      }}
      SelectProps={{ MenuProps: { PaperProps: { elevation: 2 } }, ...props.SelectProps }}
    />
  )
}

function GenButton({ children, ...props }) {
  return (
    <Button variant="contained" fullWidth {...props}
      sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#a00' }, textTransform: 'none', fontWeight: 600, borderRadius: 1.5, ...props.sx }}>
      {children}
    </Button>
  )
}

function AddRowBtn({ onClick, label }) {
  return (
    <Button size="small" startIcon={<AddIcon sx={{ fontSize: '0.9rem !important' }} />} onClick={onClick}
      sx={{ textTransform: 'none', color: MAROON, fontSize: '0.75rem', py: 0, minWidth: 0 }}>
      {label}
    </Button>
  )
}

function RemoveBtn({ onClick, disabled }) {
  return (
    <Tooltip title="Remove">
      <span>
        <IconButton size="small" onClick={onClick} disabled={disabled}
          sx={{ color: '#ccc', '&:hover': { color: MAROON }, '&.Mui-disabled': { opacity: 0.3 } }}>
          <DeleteIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      </span>
    </Tooltip>
  )
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

function detectFileType(file) {
  const n = (file?.name || '').toLowerCase()
  if (n.endsWith('.pdf'))  return 'pdf'
  if (n.endsWith('.docx')) return 'docx'
  return ''
}

function inlineInput(value, onChange, minWidth = 80) {
  return (
    <TextField size="small" value={value} onChange={onChange}
      sx={{
        minWidth,
        '& .MuiOutlinedInput-root': {
          fontSize: '0.8rem',
          '&:hover fieldset': { borderColor: MAROON },
          '&.Mui-focused fieldset': { borderColor: MAROON },
        },
      }}
      inputProps={{ style: { padding: '5px 8px' } }}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function FacultyWorkspacePage({ activeTab: initialTab = 'syllabus' }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState(null)

  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const courseId = courseIdParam || searchParams.get('course') || ''

  const [activeTab, setActiveTab]     = useState(initialTab)
  const [syllabusSub, setSyllabusSub] = useState('overview')

  const [leftWidth, setLeftWidth]   = useState(200)
  const [rightWidth, setRightWidth] = useState(320)
  const [dragging, setDragging]     = useState(null)
  const containerRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [mobileNavOpen, setMobileNavOpen]       = useState(false)
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false)

  const [resultText, setResultText]       = useState('')
  const [actionError, setActionError]     = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [syllabusParams, setSyllabusParams] = useState({ num_weeks: 18, provider: 'ollama', top_k: 5, extra_instructions: '' })
  const [moduleParams,   setModuleParams]   = useState({ module_title: '', week_number: 1, provider: 'ollama', top_k: 5, extra_instructions: '' })
  const [assessmentParams, setAssessmentParams] = useState({ assessment_type: 'quiz', num_items: 20, clos: '', provider: 'ollama', top_k: 5, extra_instructions: '' })

  const [uploadForm, setUploadForm]         = useState({ module_tag: '', term_tag: '' })
  const [uploadFile, setUploadFile]         = useState(null)
  const [uploadError, setUploadError]       = useState('')
  const [uploadSuccess, setUploadSuccess]   = useState('')
  const [uploadStatus, setUploadStatus]     = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading]           = useState(false)

  // ── Editable syllabus state ─────────────────────────────────────────────
  const [syllabusData, setSyllabusData] = useState(EMPTY_SYLLABUS)
  const [syllabusId, setSyllabusId]     = useState(null)
  const [isDirty, setIsDirty]           = useState(false)
  const [saveLoading, setSaveLoading]   = useState(false)
  const [saveError, setSaveError]       = useState('')
  const [saveSuccess, setSaveSuccess]   = useState(false)

  function setSyl(field, value) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(s => ({ ...s, [field]: value }))
  }
  function setSylArr(field, i, value) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(s => { const a = [...s[field]]; a[i] = value; return { ...s, [field]: a } })
  }
  function setSylArrObj(field, i, key, value) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(s => ({ ...s, [field]: s[field].map((item, j) => j === i ? { ...item, [key]: value } : item) }))
  }
  function addSylItem(field, empty) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(s => ({ ...s, [field]: [...s[field], typeof empty === 'object' ? { ...empty } : empty] }))
  }
  function removeSylItem(field, i) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(s => ({ ...s, [field]: s[field].filter((_, j) => j !== i) }))
  }

  // ── API ─────────────────────────────────────────────────────────────────
  const workspaceApi = useApi(
    courseId ? `/curriculum/faculty-course-workspace/${courseId}/` : null,
    { immediate: Boolean(courseId), deps: [courseId] },
  )
  const docsApi = useApi(
    courseId ? `/integrations/course-rag-documents/?course_id=${courseId}` : null,
    { immediate: Boolean(courseId), deps: [courseId] },
  )
  const course = workspaceApi.data?.course

  // Pre-populate syllabus form: saved JSON first, then fall back to course fields
  useEffect(() => {
    const apiData = workspaceApi.data
    if (!apiData) return
    const course = apiData.course
    setSyllabusId(apiData.syllabus?.syllabus_id || null)

    const saved = apiData.syllabus?.syllabus_content
    if (saved && typeof saved === 'object') {
      // Merge saved content with EMPTY_SYLLABUS defaults so new keys are always present
      setSyllabusData({ ...EMPTY_SYLLABUS, ...saved })
      setIsDirty(false)
      return
    }

    // No saved content yet — seed from course fields
    if (!course) return
    const toStr = v => v != null ? String(v) : ''
    const mapAttr = arr => (arr || []).length
      ? arr.map(g => ({ code: g.code || '', title: g.title || '', description: g.description || '' }))
      : [{ ...EMPTY_ATTR }]
    setSyllabusData({
      course_title:       course.course_title       || '',
      course_code:        course.course_code        || '',
      course_category:    course.course_category    || '',
      prerequisites:      course.prerequisites      || '',
      semester_year:      course.semester_year      || '',
      credit_hours:       toStr(course.credit_hours),
      instructor_name:    course.instructor_name    || '',
      reference_cmo:      course.reference_cmo      || '',
      date_prepared:      course.date_prepared      || '',
      revision_no:        toStr(course.revision_no),
      period_of_study:    course.period_of_study    || '',
      vision:             course.vision             || '',
      mission:            course.mission            || '',
      description:        course.description        || '',
      lecture_hours:      toStr(course.lecture_hours),
      lab_hours:          toStr(course.lab_hours),
      assessment_criteria: course.assessment_criteria || '',
      tlas:               course.tlas               || '',
      ilos:               (course.ilos || []).length ? course.ilos.map(String) : [''],
      assessment_tasks:   (course.assessment_tasks || []).length
        ? course.assessment_tasks.map(t => ({
            code: t.code || '', task: t.task || '', ird: t.ird || '',
            weight: toStr(t.weight), ilo1: toStr(t.ilo1), ilo2: toStr(t.ilo2), ilo3: toStr(t.ilo3),
            domain: t.domain || '',
          }))
        : [{ ...EMPTY_TASK }],
      references:       (course.references || []).length ? course.references.map(String) : [''],
      igas:             mapAttr(course.igas),
      student_outcomes: mapAttr(course.student_outcomes),
      cdio_skills:      mapAttr(course.cdio_skills),
      sdg_skills:       mapAttr(course.sdg_skills),
      grading_rows:     DEFAULT_GRADING_ROWS.map(r => ({ ...r })),
      policies:         (course.policies || []).length
        ? course.policies.map(p => ({ title: p.title || '', content: p.content || '' }))
        : [{ title: 'Class Policies', content: '' }],
    })
    setIsDirty(false)
  }, [workspaceApi.data])

  // Auto-clear transient notifications
  useEffect(() => { if (!saveError) return; const t = setTimeout(() => setSaveError(''), 3000); return () => clearTimeout(t) }, [saveError])
  useEffect(() => { if (!actionError) return; const t = setTimeout(() => setActionError(''), 3000); return () => clearTimeout(t) }, [actionError])

  // ── Save syllabus content ──────────────────────────────────────────────
  async function handleSaveSyllabus() {
    setSaveError('')
    setSaveLoading(true)
    try {
      const { data } = await api.put(`/curriculum/syllabus-content/${courseId}/`, {
        syllabus_content: syllabusData,
      })
      setSyllabusId(data.syllabus_id)
      setIsDirty(false)
      setSaveSuccess(true)
      // Refresh workspace so the returned syllabus_id is current
      workspaceApi.execute()
    } catch (err) {
      setSaveError(extractApiError(err))
    } finally {
      setSaveLoading(false)
    }
  }

  // ── Drag resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!dragging) return undefined
    const onMove = (e) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (dragging === 'left')  setLeftWidth(Math.max(160, Math.min(300, e.clientX - rect.left)))
      if (dragging === 'right') setRightWidth(Math.max(250, Math.min(480, rect.right - e.clientX)))
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  // ── Upload progress ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!uploading) return undefined
    const timer = setInterval(() => {
      setUploadProgress(p => {
        if (p < 80) return Math.min(80, p + 4)
        if (p < 95) return Math.min(95, p + 0.35)
        return p
      })
    }, 120)
    const stages = [
      setTimeout(() => setUploadStatus('Upload received. Preparing your course file.'), 500),
      setTimeout(() => setUploadStatus('Organizing your file into teaching-ready sections.'), 2200),
      setTimeout(() => setUploadStatus('Making this file searchable for your course tools.'), 5200),
      setTimeout(() => setUploadStatus('Finalizing and saving into your course knowledge base...'), 9000),
    ]
    return () => { clearInterval(timer); stages.forEach(clearTimeout) }
  }, [uploading])

  // ── Generate handlers ────────────────────────────────────────────────────
  async function handleGenerateSyllabus() {
    if (!course) return
    setActionError(''); setActionLoading(true); setResultText('')
    try {
      const { data } = await api.post('/curriculum/generate-syllabus/', {
        course_name: course.course_title, course_code: course.course_code,
        num_weeks: Number(syllabusParams.num_weeks), provider: syllabusParams.provider,
        top_k: Number(syllabusParams.top_k), extra_instructions: syllabusParams.extra_instructions,
      })
      setResultText(data.generated_syllabus || '')
      workspaceApi.execute()
    } catch (err) { setActionError(extractApiError(err)) }
    finally { setActionLoading(false) }
  }

  async function handleGenerateModule() {
    if (!course) return
    setActionError(''); setActionLoading(true); setResultText('')
    try {
      const { data } = await api.post('/curriculum/generate-module/', {
        course_name: course.course_title, module_title: moduleParams.module_title,
        week_number: Number(moduleParams.week_number), provider: moduleParams.provider,
        top_k: Number(moduleParams.top_k), extra_instructions: moduleParams.extra_instructions,
      })
      setResultText(data.generated_module || '')
      workspaceApi.execute()
    } catch (err) { setActionError(extractApiError(err)) }
    finally { setActionLoading(false) }
  }

  async function handleGenerateAssessment() {
    if (!course) return
    setActionError(''); setActionLoading(true); setResultText('')
    try {
      const clos = assessmentParams.clos.split('\n').map(l => l.trim()).filter(Boolean)
      const { data } = await api.post('/assessment/generate-assessment/', {
        course_name: course.course_title, assessment_type: assessmentParams.assessment_type,
        num_items: Number(assessmentParams.num_items), clos,
        provider: assessmentParams.provider, top_k: Number(assessmentParams.top_k),
        extra_instructions: assessmentParams.extra_instructions,
      })
      setResultText(data.generated_assessment || '')
      workspaceApi.execute()
    } catch (err) { setActionError(extractApiError(err)) }
    finally { setActionLoading(false) }
  }

  async function handleUpload(e) {
    e.preventDefault()
    setUploadError(''); setUploadSuccess(''); setUploadStatus(''); setUploadProgress(0)
    if (!courseId)   { setUploadError('Please choose a course first.'); return }
    if (!uploadFile) { setUploadError('Please choose a PDF or DOCX file.'); return }
    const fileType = detectFileType(uploadFile)
    if (!fileType) { setUploadError('Unsupported file type. Please upload PDF or DOCX only.'); return }
    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('file_type', fileType)
    formData.append('course_id', courseId)
    formData.append('module_tag', uploadForm.module_tag.trim())
    formData.append('term_tag', uploadForm.term_tag.trim())
    setUploading(true); setUploadStatus('Uploading your file...')
    try {
      const { data } = await api.post('/integrations/upload-course-rag-document/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 1200000,
      })
      setUploadProgress(100)
      setUploadStatus('Done. This file is now ready for your course generation tools.')
      setUploadSuccess(data?.message || 'File uploaded successfully.')
      setUploadFile(null)
      docsApi.execute()
    } catch (err) {
      setUploadProgress(0); setUploadStatus(''); setUploadError(extractApiError(err))
    } finally { setUploading(false) }
  }

  // ── Syllabus section renderer (all editable) ─────────────────────────────
  function renderSyllabusSection() {
    if (!courseId) return null
    if (workspaceApi.loading && !workspaceApi.data) {
      return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: MAROON }} /></Box>
    }
    if (workspaceApi.error) return <AutoAlert message={workspaceApi.error} onClose={() => {}} />

    // ── Overview ────────────────────────────────────────────────────────────
    if (syllabusSub === 'overview') {
      return (
        <SectionCard title="Course Information">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
            <LField label="Course Title"       value={syllabusData.course_title}    onChange={e => setSyl('course_title', e.target.value)} />
            <LField label="Course Code"        value={syllabusData.course_code}     onChange={e => setSyl('course_code', e.target.value)} />
            <LField label="Course Category"    value={syllabusData.course_category} onChange={e => setSyl('course_category', e.target.value)} />
            <LField label="Pre-requisite(s)"   value={syllabusData.prerequisites}   onChange={e => setSyl('prerequisites', e.target.value)} />
            <LField label="Semester / Year"    value={syllabusData.semester_year}   onChange={e => setSyl('semester_year', e.target.value)} />
            <LField label="Credit Hours"       value={syllabusData.credit_hours}    onChange={e => setSyl('credit_hours', e.target.value)} />
            <LField label="Course Instructor"  value={syllabusData.instructor_name} onChange={e => setSyl('instructor_name', e.target.value)} />
            <LField label="Reference CMO"      value={syllabusData.reference_cmo}   onChange={e => setSyl('reference_cmo', e.target.value)} />
            <LField label="Date Prepared"      value={syllabusData.date_prepared}   onChange={e => setSyl('date_prepared', e.target.value)} />
            <LField label="Revision No."       value={syllabusData.revision_no}     onChange={e => setSyl('revision_no', e.target.value)} />
            <LField label="Period of Study"    value={syllabusData.period_of_study} onChange={e => setSyl('period_of_study', e.target.value)}
              sx={{ gridColumn: 'span 2' }} />
          </Box>
        </SectionCard>
      )
    }

    // ── Description & Rationale ─────────────────────────────────────────────
    if (syllabusSub === 'description') {
      return (
        <>
          <SectionCard title="Vision">
            <LField label="Vision Statement" multiline minRows={3}
              value={syllabusData.vision} onChange={e => setSyl('vision', e.target.value)} />
          </SectionCard>
          <SectionCard title="Mission">
            <LField label="Mission Statement" multiline minRows={3}
              value={syllabusData.mission} onChange={e => setSyl('mission', e.target.value)} />
          </SectionCard>
          <SectionCard title="Course Rationale and Description">
            <LField label="Description" multiline minRows={6}
              value={syllabusData.description} onChange={e => setSyl('description', e.target.value)} />
          </SectionCard>
        </>
      )
    }

    // ── Contact Hours & Assessment ───────────────────────────────────────────
    if (syllabusSub === 'contact') {
      return (
        <>
          <SectionCard title="Contact Hours">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <LField label="Lecture Hours" type="number"
                value={syllabusData.lecture_hours} onChange={e => setSyl('lecture_hours', e.target.value)} />
              <LField label="Laboratory Hours" type="number"
                value={syllabusData.lab_hours} onChange={e => setSyl('lab_hours', e.target.value)} />
            </Box>
          </SectionCard>
          <SectionCard title="Criteria for Assessment">
            <LField label="Assessment Criteria" multiline minRows={6}
              value={syllabusData.assessment_criteria} onChange={e => setSyl('assessment_criteria', e.target.value)} />
          </SectionCard>
        </>
      )
    }

    // ── TLAs ────────────────────────────────────────────────────────────────
    if (syllabusSub === 'tlas') {
      return (
        <SectionCard title="Teaching, Learning, and Assessment Strategies">
          <LField label="TLA Strategies" multiline minRows={10}
            value={syllabusData.tlas} onChange={e => setSyl('tlas', e.target.value)} />
        </SectionCard>
      )
    }

    // ── Learning Outcomes (ILOs) ─────────────────────────────────────────────
    if (syllabusSub === 'ilo') {
      return (
        <SectionCard title="Intended Learning Outcomes (ILO)"
          action={<AddRowBtn label="Add ILO" onClick={() => addSylItem('ilos', '')} />}>
          <Stack spacing={1.5}>
            {syllabusData.ilos.map((ilo, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <Chip label={'ILO' + (i + 1)} size="small"
                  sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, flexShrink: 0, height: 22, fontSize: '0.7rem', mt: 0.8 }} />
                <LField label={`ILO ${i + 1}`} multiline minRows={2}
                  value={ilo} onChange={e => setSylArr('ilos', i, e.target.value)} />
                <RemoveBtn onClick={() => removeSylItem('ilos', i)} disabled={syllabusData.ilos.length <= 1} />
              </Box>
            ))}
          </Stack>
        </SectionCard>
      )
    }

    // ── Assessment Map ───────────────────────────────────────────────────────
    if (syllabusSub === 'assessment_map') {
      const cols = [
        { key: 'code',   label: 'Code',            width: 70 },
        { key: 'task',   label: 'Assessment Task',  width: 160 },
        { key: 'ird',    label: 'I/R/D',            width: 60 },
        { key: 'weight', label: 'Weight (%)',        width: 72 },
        { key: 'ilo1',   label: 'ILO1',             width: 55 },
        { key: 'ilo2',   label: 'ILO2',             width: 55 },
        { key: 'ilo3',   label: 'ILO3',             width: 55 },
        { key: 'domain', label: 'Domain',            width: 80 },
      ]
      return (
        <SectionCard title="Assessment Method and Distribution Map"
          action={<AddRowBtn label="Add Row" onClick={() => addSylItem('assessment_tasks', EMPTY_TASK)} />}>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: BG }}>
                  {cols.map(c => (
                    <th key={c.key} style={{ padding: '6px 8px', borderBottom: '2px solid #e0e0e0', textAlign: 'left', color: '#555', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</th>
                  ))}
                  <th style={{ padding: '6px 4px', borderBottom: '2px solid #e0e0e0' }} />
                </tr>
              </thead>
              <tbody>
                {syllabusData.assessment_tasks.map((t, i) => (
                  <tr key={i}>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding: '4px 5px', borderBottom: '1px solid #f0f0f0' }}>
                        {inlineInput(t[c.key], e => setSylArrObj('assessment_tasks', i, c.key, e.target.value), c.width)}
                      </td>
                    ))}
                    <td style={{ padding: '4px 4px', borderBottom: '1px solid #f0f0f0' }}>
                      <RemoveBtn onClick={() => removeSylItem('assessment_tasks', i)} disabled={syllabusData.assessment_tasks.length <= 1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </SectionCard>
      )
    }

    // ── References ───────────────────────────────────────────────────────────
    if (syllabusSub === 'references') {
      return (
        <SectionCard title="Books and Other References"
          action={<AddRowBtn label="Add Reference" onClick={() => addSylItem('references', '')} />}>
          <Stack spacing={1.25}>
            {syllabusData.references.map((ref, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: MAROON, fontWeight: 700, minWidth: 22, flexShrink: 0 }}>{i + 1}.</Typography>
                <LField label={`Reference ${i + 1}`} value={ref}
                  onChange={e => setSylArr('references', i, e.target.value)} />
                <RemoveBtn onClick={() => removeSylItem('references', i)} disabled={syllabusData.references.length <= 1} />
              </Box>
            ))}
          </Stack>
        </SectionCard>
      )
    }

    // ── Graduate Attributes ──────────────────────────────────────────────────
    if (syllabusSub === 'attributes') {
      const attrGroups = [
        { label: 'Institutional Graduate Attributes (IGA)', field: 'igas' },
        { label: 'Student Outcomes (SO)',                   field: 'student_outcomes' },
        { label: 'CDIO Framework Skills',                   field: 'cdio_skills' },
        { label: 'Sustainable Development Goals Skills',    field: 'sdg_skills' },
      ]
      return (
        <>
          {attrGroups.map(({ label, field }) => (
            <SectionCard key={field} title={label}
              action={<AddRowBtn label="Add" onClick={() => addSylItem(field, EMPTY_ATTR)} />}>
              <Stack spacing={1.5}>
                {syllabusData[field].map((item, i) => (
                  <Box key={i} sx={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 1.5, p: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1.25, mb: 1, alignItems: 'center' }}>
                      <LField label="Code" value={item.code}
                        onChange={e => setSylArrObj(field, i, 'code', e.target.value)} sx={{ maxWidth: 110 }} />
                      <LField label="Title" value={item.title}
                        onChange={e => setSylArrObj(field, i, 'title', e.target.value)} />
                      <RemoveBtn onClick={() => removeSylItem(field, i)} disabled={syllabusData[field].length <= 1} />
                    </Box>
                    <LField label="Description" multiline minRows={2} value={item.description}
                      onChange={e => setSylArrObj(field, i, 'description', e.target.value)} />
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          ))}
        </>
      )
    }

    // ── Course Policies ──────────────────────────────────────────────────────
    if (syllabusSub === 'policies') {
      return (
        <>
          <SectionCard title="Grading System">
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {['Rating', 'Grade', 'Range'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', borderBottom: '2px solid #e0e0e0', textAlign: 'left', color: '#555', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {syllabusData.grading_rows.map((row, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : BG }}>
                      {['rating', 'grade', 'range'].map(k => (
                        <td key={k} style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                          {inlineInput(row[k], e => setSylArrObj('grading_rows', i, k, e.target.value), k === 'rating' ? 160 : 70)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </SectionCard>

          <SectionCard title="Class Policies"
            action={<AddRowBtn label="Add Policy" onClick={() => addSylItem('policies', EMPTY_POLICY)} />}>
            <Stack spacing={2}>
              {syllabusData.policies.map((p, i) => (
                <Box key={i} sx={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 1.5, p: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <LField label="Policy Title" value={p.title}
                      onChange={e => setSylArrObj('policies', i, 'title', e.target.value)} />
                    <RemoveBtn onClick={() => removeSylItem('policies', i)} disabled={syllabusData.policies.length <= 1} />
                  </Box>
                  <LField label="Policy Content" multiline minRows={4} value={p.content}
                    onChange={e => setSylArrObj('policies', i, 'content', e.target.value)} />
                </Box>
              ))}
            </Stack>
          </SectionCard>
        </>
      )
    }

    // ── Generate ─────────────────────────────────────────────────────────────
    return (
      <SectionCard title="Generate Syllabus">
        <Stack spacing={1.75}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
          <LField type="number" label="Number of Weeks" value={syllabusParams.num_weeks}
            onChange={e => setSyllabusParams(p => ({ ...p, num_weeks: e.target.value }))} />
          <LField type="number" label="Knowledge References (top-k)" value={syllabusParams.top_k}
            onChange={e => setSyllabusParams(p => ({ ...p, top_k: e.target.value }))} />
          <LField select label="Model Provider" value={syllabusParams.provider}
            onChange={e => setSyllabusParams(p => ({ ...p, provider: e.target.value }))}>
            {PROVIDERS.map(p => <MenuItem key={p} value={p}>{cap(p)}</MenuItem>)}
          </LField>
          <LField label="Extra Instructions" multiline minRows={3} value={syllabusParams.extra_instructions}
            onChange={e => setSyllabusParams(p => ({ ...p, extra_instructions: e.target.value }))} />
          <GenButton onClick={handleGenerateSyllabus} disabled={actionLoading}>
            {actionLoading ? 'Generating...' : 'Generate Syllabus'}
          </GenButton>
          {resultText && (
            <>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>Generated Output</Typography>
              <TextField multiline minRows={12} fullWidth value={resultText}
                onChange={e => setResultText(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem', fontFamily: 'monospace' } }} />
            </>
          )}
        </Stack>
      </SectionCard>
    )
  }

  // ── Middle panel ─────────────────────────────────────────────────────────
  function renderCenterPanel() {
    if (!courseId) {
      return (
        <Paper elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 2.5, p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>No Course Selected</Typography>
          <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>Go back and select a course.</Typography>
          <Button variant="outlined" onClick={() => navigate('/faculty/dashboard')}
            sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none' }}>
            Back to Courses
          </Button>
        </Paper>
      )
    }

    if (activeTab === 'syllabus') {
      const showFooter = isDirty && syllabusSub !== 'generate'
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* scrollable content area */}
          <Box sx={{ flex: 1, overflow: 'auto', pb: showFooter ? '72px' : 0 }}>
            {course && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption"
                  sx={{ color: MAROON, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {syllabusData.course_code || course.course_code}
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: '#1A1A1A', lineHeight: 1.2 }}>
                  {syllabusData.course_title || course.course_title}
                </Typography>
              </Box>
            )}
            <Box sx={{ borderBottom: '2px solid rgba(0,0,0,0.08)', mb: 2.5 }}>
              <Tabs
                value={syllabusSub}
                onChange={(_, v) => setSyllabusSub(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  minHeight: 38,
                  '& .MuiTab-root': { minHeight: 38, py: 0, fontSize: '0.78rem', textTransform: 'none', fontWeight: 500, color: '#666' },
                  '& .Mui-selected': { color: MAROON + ' !important', fontWeight: 700 },
                  '& .MuiTabs-indicator': { bgcolor: MAROON, height: 2.5 },
                  '& .MuiTabs-scrollButtons': { color: MAROON },
                }}
              >
                {SYLLABUS_SECTIONS.map(s => <Tab key={s.key} value={s.key} label={s.label} />)}
              </Tabs>
            </Box>
            {renderSyllabusSection()}
          </Box>

          {/* Sticky save footer — appears when any field has been edited */}
          {showFooter && (
            <Box sx={{
              position: 'sticky', bottom: 0,
              bgcolor: '#fff', borderTop: '1.5px solid rgba(139,0,0,0.18)',
              boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
              px: 2.5, py: 1.25,
              display: 'flex', alignItems: 'center', gap: 2,
              zIndex: 10,
            }}>
              {saveError
                ? <>
                    <Typography variant="caption" sx={{ color: '#c62828', flex: 1 }}>{saveError}</Typography>
                    <IconButton size="small" onClick={() => setSaveError('')} sx={{ color: '#c62828', p: 0.25 }}>
                      <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>✕</span>
                    </IconButton>
                  </>
                : <Typography variant="caption" sx={{ color: '#666', flex: 1 }}>
                    You have unsaved changes in this syllabus.
                  </Typography>
              }
              <Button variant="outlined" size="small" disabled={saveLoading}
                onClick={() => { setIsDirty(false); setSaveSuccess(false); workspaceApi.execute() }}
                sx={{ textTransform: 'none', borderColor: '#ccc', color: '#666', borderRadius: 1.5 }}>
                Discard
              </Button>
              <Button variant="contained" size="small" disabled={saveLoading} onClick={handleSaveSyllabus}
                sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#a00' }, textTransform: 'none', fontWeight: 700, borderRadius: 1.5, minWidth: 100 }}>
                {saveLoading ? 'Saving...' : 'Save Syllabus'}
              </Button>
            </Box>
          )}

          {/* Saved confirmation — auto-dismissed after 3 s */}
          {saveSuccess && !isDirty && (
            <Box sx={{ position: 'sticky', bottom: 0 }}>
              <AutoAlert
                message="Syllabus saved successfully."
                severity="success"
                onClose={() => setSaveSuccess(false)}
                sx={{ borderRadius: 0, borderTop: '1px solid #A5D6A7' }}
              />
            </Box>
          )}
        </Box>
      )
    }

    if (workspaceApi.loading && !workspaceApi.data) {
      return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: MAROON }} /></Box>
    }
    if (workspaceApi.error) return <AutoAlert message={workspaceApi.error} onClose={() => {}} />

    if (activeTab === 'module') {
      return (
        <Stack spacing={2}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
          <SectionCard title="Module Builder">
            <Stack spacing={1.75}>
              <LField label="Module Topic" value={moduleParams.module_title}
                onChange={e => setModuleParams(p => ({ ...p, module_title: e.target.value }))} />
              <LField type="number" label="Week Number" value={moduleParams.week_number}
                onChange={e => setModuleParams(p => ({ ...p, week_number: e.target.value }))} />
              <LField type="number" label="Knowledge References (top-k)" value={moduleParams.top_k}
                onChange={e => setModuleParams(p => ({ ...p, top_k: e.target.value }))} />
              <LField select label="Model Provider" value={moduleParams.provider}
                onChange={e => setModuleParams(p => ({ ...p, provider: e.target.value }))}>
                {PROVIDERS.map(p => <MenuItem key={p} value={p}>{cap(p)}</MenuItem>)}
              </LField>
              <LField label="Extra Instructions" multiline minRows={3} value={moduleParams.extra_instructions}
                onChange={e => setModuleParams(p => ({ ...p, extra_instructions: e.target.value }))} />
              <GenButton onClick={handleGenerateModule} disabled={actionLoading || !moduleParams.module_title.trim()}>
                {actionLoading ? 'Generating...' : 'Generate Module'}
              </GenButton>
            </Stack>
          </SectionCard>
          {resultText && (
            <SectionCard title="Generated Output">
              <TextField multiline minRows={12} fullWidth value={resultText} onChange={e => setResultText(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem', fontFamily: 'monospace' } }} />
            </SectionCard>
          )}
          {(workspaceApi.data?.modules || []).length > 0 && (
            <SectionCard title="Existing Modules">
              <Stack spacing={0.75}>
                {workspaceApi.data.modules.map(m => (
                  <Box key={m.module_id} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Chip label={'Wk ' + m.week_number} size="small"
                      sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem' }} />
                    <Typography variant="body2" sx={{ color: '#333', flex: 1 }}>{m.module_title}</Typography>
                    <Chip label={m.status} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          )}
        </Stack>
      )
    }

    if (activeTab === 'assessment') {
      return (
        <Stack spacing={2}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
          <SectionCard title="Assessment Builder">
            <Stack spacing={1.75}>
              <LField select label="Assessment Type" value={assessmentParams.assessment_type}
                onChange={e => setAssessmentParams(p => ({ ...p, assessment_type: e.target.value }))}>
                {ASSESSMENT_TYPES.map(t => <MenuItem key={t} value={t}>{cap(t)}</MenuItem>)}
              </LField>
              <LField type="number" label="Number of Items" value={assessmentParams.num_items}
                onChange={e => setAssessmentParams(p => ({ ...p, num_items: e.target.value }))} />
              <LField type="number" label="Knowledge References (top-k)" value={assessmentParams.top_k}
                onChange={e => setAssessmentParams(p => ({ ...p, top_k: e.target.value }))} />
              <LField select label="Model Provider" value={assessmentParams.provider}
                onChange={e => setAssessmentParams(p => ({ ...p, provider: e.target.value }))}>
                {PROVIDERS.map(p => <MenuItem key={p} value={p}>{cap(p)}</MenuItem>)}
              </LField>
              <LField label="Course Learning Outcomes (one per line)" multiline minRows={3} value={assessmentParams.clos}
                onChange={e => setAssessmentParams(p => ({ ...p, clos: e.target.value }))} />
              <LField label="Extra Instructions" multiline minRows={2} value={assessmentParams.extra_instructions}
                onChange={e => setAssessmentParams(p => ({ ...p, extra_instructions: e.target.value }))} />
              <GenButton onClick={handleGenerateAssessment} disabled={actionLoading}>
                {actionLoading ? 'Generating...' : 'Generate Assessment'}
              </GenButton>
            </Stack>
          </SectionCard>
          {resultText && (
            <SectionCard title="Generated Output">
              <TextField multiline minRows={12} fullWidth value={resultText} onChange={e => setResultText(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem', fontFamily: 'monospace' } }} />
            </SectionCard>
          )}
          {(workspaceApi.data?.assessments || []).length > 0 && (
            <SectionCard title="Existing Assessments">
              <Stack spacing={0.75}>
                {workspaceApi.data.assessments.map(a => (
                  <Box key={a.assessment_id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip label={a.assessment_type} size="small"
                      sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem' }} />
                    <Typography variant="body2" sx={{ color: '#333', flex: 1 }}>{a.title}</Typography>
                    <Chip label={a.status} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          )}
        </Stack>
      )
    }

    return (
      <SectionCard title="Vision-Based Grading">
        <Typography variant="body2" sx={{ color: '#666' }}>
          This panel is reserved for the upcoming vision-based grading workflow.
        </Typography>
      </SectionCard>
    )
  }

  // ── Right panel ───────────────────────────────────────────────────────────
  function renderUploadPanel() {
    const docs = docsApi.data?.documents || []
    return (
      <Stack spacing={2}>
        <Typography variant="caption"
          sx={{ fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.62rem', display: 'block' }}>
          Course Knowledge Base
        </Typography>

        <AutoAlert message={uploadError}   onClose={() => setUploadError('')}   sx={{ fontSize: '0.8rem' }} />
        <AutoAlert message={uploadSuccess} severity="success" onClose={() => setUploadSuccess('')} sx={{ fontSize: '0.8rem' }} />
        {uploadStatus  && (
          <Box>
            <Typography variant="caption"
              sx={{ color: uploading ? '#1565C0' : '#2E7D32', display: 'block', mb: 0.75 }}>
              {uploadStatus}
            </Typography>
            {uploading && (
              <LinearProgress variant="determinate" value={uploadProgress}
                sx={{ bgcolor: '#f5f5f5', '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />
            )}
          </Box>
        )}

        <Box component="form" onSubmit={handleUpload}>
          <Stack spacing={1.5}>
            <Button variant="outlined" component="label" disabled={uploading} fullWidth
              sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none', borderRadius: 1.5,
                   '&:hover': { bgcolor: MAROON_LIGHT, borderColor: MAROON } }}>
              Choose File
              <input hidden type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => setUploadFile(e.target.files?.[0] || null)} />
            </Button>
            <Typography variant="caption" sx={{ color: uploadFile ? '#1A1A1A' : '#aaa', px: 0.5 }}>
              {uploadFile ? uploadFile.name : 'PDF or DOCX only'}
            </Typography>
            <TextField size="small" label="Module Tag (optional)" value={uploadForm.module_tag}
              onChange={e => setUploadForm(p => ({ ...p, module_tag: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: MAROON },
                   '& .MuiInputLabel-root.Mui-focused': { color: MAROON } }} />
            <TextField size="small" label="Term Tag (optional)" value={uploadForm.term_tag}
              onChange={e => setUploadForm(p => ({ ...p, term_tag: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: MAROON },
                   '& .MuiInputLabel-root.Mui-focused': { color: MAROON } }} />
            <GenButton type="submit" disabled={uploading || !uploadFile}>
              {uploading ? 'Uploading...' : 'Upload to Knowledge Base'}
            </GenButton>
          </Stack>
        </Box>

        {docs.length > 0 && (
          <Box>
            <Typography variant="caption"
              sx={{ color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.62rem', display: 'block', mb: 1 }}>
              Uploaded ({docs.length})
            </Typography>
            <Stack spacing={0.5}>
              {docs.map((doc, i) => (
                <Box key={doc.id || doc.records_id || i}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                        bgcolor: BG, borderRadius: 1.5, border: '1px solid rgba(0,0,0,0.07)' }}>
                  <InsertDriveFileIcon sx={{ fontSize: 15, color: MAROON, flexShrink: 0 }} />
                  <Typography variant="caption"
                    sx={{ color: '#444', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.storage_path || doc.file_name || 'Unnamed file'}
                  </Typography>
                  <Chip label={doc.rag_status || 'OK'} size="small"
                    sx={{ height: 16, fontSize: '0.6rem',
                         bgcolor: doc.rag_status === 'COMPLETED' ? '#E8F5E9' : '#FFF3E0',
                         color:   doc.rag_status === 'COMPLETED' ? '#2E7D32' : '#E65100' }} />
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    )
  }

  // ── Root ──────────────────────────────────────────────────────────────────
  return (
    <Box ref={containerRef}
      sx={{ height: '100vh', bgcolor: BG, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Top bar */}
      <Box component="header"
        sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: 2, py: 0.75, bgcolor: '#fff',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          flexShrink: 0, minHeight: 48,
        }}>
        {isMobile && (
          <Tooltip title="Navigation">
            <IconButton onClick={() => setMobileNavOpen(true)} size="small" sx={{ color: '#666' }}>
              <MenuIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Back to courses">
          <IconButton onClick={() => navigate('/faculty/dashboard')} size="small" sx={{ color: '#666' }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Box sx={{ width: 1, height: 18, bgcolor: 'rgba(0,0,0,0.1)', flexShrink: 0 }} />
        <AtlasLogo size={24} />
        {course ? (
          <>
            <Typography variant="caption"
              sx={{ color: MAROON, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
              {syllabusData.course_code || course.course_code}
            </Typography>
            <Typography variant="body2" sx={{ color: '#444', fontWeight: 500 }} noWrap>
              {syllabusData.course_title || course.course_title}
            </Typography>
          </>
        ) : courseId ? (
          <CircularProgress size={14} sx={{ color: MAROON }} />
        ) : null}
        <Box sx={{ flex: 1 }} />
        {isMobile && (
          <Tooltip title="Knowledge Base">
            <IconButton onClick={() => setMobileUploadOpen(true)} size="small" sx={{ color: MAROON, mr: 0.5 }}>
              <CloudUploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Chip label="FACULTY" size="small"
          sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.07em', mr: 1 }} />
        <Tooltip title={user?.email || ''}>
          <IconButton onClick={e => setAnchorEl(e.currentTarget)} size="small">
            <Avatar sx={{ width: 30, height: 30, bgcolor: MAROON, fontSize: 11, fontWeight: 700 }}>
              {toInitials(user?.name || user?.email || 'U')}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          <MenuItem disabled>
            <Typography variant="caption" sx={{ color: '#888' }}>{user?.email}</Typography>
          </MenuItem>
          <MenuItem onClick={() => { logout(); navigate('/signin') }}>
            <LogoutIcon fontSize="small" sx={{ mr: 1, color: MAROON }} /> Sign Out
          </MenuItem>
        </Menu>
      </Box>

      {/* Mobile nav Drawer */}
      <Drawer anchor="left" open={isMobile && mobileNavOpen} onClose={() => setMobileNavOpen(false)}
        PaperProps={{ sx: { width: 220 } }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <Typography variant="caption"
            sx={{ color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.6rem', fontWeight: 700 }}>
            Workspace
          </Typography>
        </Box>
        <Stack sx={{ p: 1, gap: 0.25 }}>
          {WORKSPACE_TABS.map(({ key, label, Icon }) => {
            const on = activeTab === key
            return (
              <Button key={key} onClick={() => { setActiveTab(key); setMobileNavOpen(false) }}
                startIcon={<Icon sx={{ fontSize: '1.05rem !important' }} />}
                sx={{
                  justifyContent: 'flex-start', px: 1.5, py: 0.9,
                  borderRadius: 1.5, textTransform: 'none', fontSize: '0.85rem',
                  fontWeight: on ? 700 : 400, color: on ? MAROON : '#555',
                  bgcolor: on ? MAROON_LIGHT : 'transparent',
                  borderLeft: on ? '3px solid ' + MAROON : '3px solid transparent',
                  minWidth: 0,
                  '&:hover': { bgcolor: on ? MAROON_LIGHT : BG, color: on ? MAROON : '#1A1A1A' },
                }}>
                {label}
              </Button>
            )
          })}
        </Stack>
      </Drawer>

      {/* Mobile upload Drawer */}
      <Drawer anchor="right" open={isMobile && mobileUploadOpen} onClose={() => setMobileUploadOpen(false)}
        PaperProps={{ sx: { width: 300 } }}>
        <Box sx={{ p: 2 }}>{renderUploadPanel()}</Box>
      </Drawer>

      {/* Three-panel area */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: dragging ? 'none' : 'auto' }}>

        {/* LEFT — nav (hidden on mobile, accessible via Drawer) */}
        <Box sx={{ width: isMobile ? 0 : leftWidth, flexShrink: 0, display: isMobile ? 'none' : 'flex', flexDirection: 'column',
                   bgcolor: '#fff', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <Typography variant="caption"
              sx={{ color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.6rem', fontWeight: 700 }}>
              Workspace
            </Typography>
          </Box>
          <Stack sx={{ p: 1, gap: 0.25 }}>
            {WORKSPACE_TABS.map(({ key, label, Icon }) => {
              const on = activeTab === key
              return (
                <Button key={key} onClick={() => setActiveTab(key)}
                  startIcon={<Icon sx={{ fontSize: '1.05rem !important' }} />}
                  sx={{
                    justifyContent: 'flex-start', px: 1.5, py: 0.9,
                    borderRadius: 1.5, textTransform: 'none', fontSize: '0.85rem',
                    fontWeight: on ? 700 : 400,
                    color: on ? MAROON : '#555',
                    bgcolor: on ? MAROON_LIGHT : 'transparent',
                    borderLeft: on ? '3px solid ' + MAROON : '3px solid transparent',
                    minWidth: 0,
                    '&:hover': { bgcolor: on ? MAROON_LIGHT : BG, color: on ? MAROON : '#1A1A1A' },
                  }}>
                  {label}
                </Button>
              )
            })}
          </Stack>
        </Box>

        {/* Drag — left (desktop only) */}
        {!isMobile && (
          <Box onMouseDown={() => setDragging('left')}
            sx={{ width: 4, flexShrink: 0, cursor: 'col-resize',
                  bgcolor: dragging === 'left' ? MAROON + '44' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(139,0,0,0.1)' }, transition: 'background-color 0.15s' }} />
        )}

        {/* MIDDLE */}
        <Box sx={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(activeTab === 'syllabus' ? {} : { overflow: 'auto', p: 2.5 }),
        }}>
          {activeTab === 'syllabus'
            ? <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 2.5, pb: 0 }}>{renderCenterPanel()}</Box>
            : renderCenterPanel()
          }
        </Box>

        {/* Drag — right (desktop only) */}
        {!isMobile && (
          <Box onMouseDown={() => setDragging('right')}
            sx={{ width: 4, flexShrink: 0, cursor: 'col-resize',
                  bgcolor: dragging === 'right' ? MAROON + '44' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(139,0,0,0.1)' }, transition: 'background-color 0.15s' }} />
        )}

        {/* RIGHT (hidden on mobile, accessible via Drawer) */}
        <Box sx={{ width: isMobile ? 0 : rightWidth, display: isMobile ? 'none' : 'block', flexShrink: 0, bgcolor: '#fff',
                   borderLeft: '1px solid rgba(0,0,0,0.08)', overflow: 'auto', p: isMobile ? 0 : 2 }}>
          {renderUploadPanel()}
        </Box>
      </Box>
    </Box>
  )
}
