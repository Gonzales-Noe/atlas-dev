// src/components/FacultyWorkspacePage.jsx
import { useEffect, useRef, useState } from 'react'
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
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import SettingsIcon from '@mui/icons-material/Settings'
import HelpIcon from '@mui/icons-material/Help'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AssignmentIcon from '@mui/icons-material/Assignment'
import DeleteIcon from '@mui/icons-material/Delete'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MenuIcon from '@mui/icons-material/Menu'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Checkbox from '@mui/material/Checkbox'
import Switch from '@mui/material/Switch'
import EditIcon from '@mui/icons-material/Edit'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import useApi from '../hooks/useApi'
import api from '../config/api'
import { useAuth } from '../store/authStore'
import { toInitials, extractApiError } from '../utils'
import atlasLogo from '../assets/atlas-logo.png'
import AutoAlert from './AutoAlert'

const MAROON = '#8B0000'
const MAROON_LIGHT = '#FDECEC'
const BG = '#FAFAFA'

const WORKSPACE_TABS = [
  { key: 'syllabus',   label: 'Syllabus',    Icon: MenuBookIcon },
  { key: 'module',     label: 'Modules',     Icon: ViewModuleIcon },
  { key: 'assessment', label: 'Assessments', Icon: AssignmentIcon },
]

const SYLLABUS_SECTIONS = [
  { key: 'overview',             label: 'Course Overview' },
  { key: 'basic_info',           label: 'Basic Info' },
  { key: 'course_details',       label: 'Course Details' },
  { key: 'ilos_assessments',     label: 'ILOs & Assessments' },
  { key: 'ilo_at_matrix',        label: 'ILO-AT Matrix' },
  { key: 'framework_mapping',    label: 'Framework Mapping' },
  { key: 'ilo_framework_matrix', label: 'ILO-Framework Matrix' },
  { key: 'weekly_schedule',      label: 'Weekly Schedule' },
  { key: 'table_spec',           label: 'Table of Specifications' },
  { key: 'grading',              label: 'Grading' },
  { key: 'policies',             label: 'Policies' },
]

const PROVIDERS = ['ollama', 'gemini', 'gpt', 'groq', 'anthropic', 'openrouter']
const AI_PROVIDERS = ['gemini', 'anthropic', 'groq', 'gpt']
const AI_EXCLUDED_SECTIONS = new Set(['header', 'specs', 'schedules'])

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

const EMPTY_TASK    = { code: '', task: '', ird: '', weight: '', ilo_values: [], c: '', p: '', a: '' }
const EMPTY_ATTR    = { code: '', title: '', description: '' }
const EMPTY_POLICY  = { title: '', content: '' }
const EMPTY_CHAPTER = { chapter: '', topics: '', weeks: '', outcomes: '', ilo: '', so: '', delivery: '' }

const TABLE_TH = {
  padding: '8px 12px', borderBottom: '1px solid #E0E0E0', borderRight: '1px solid #E0E0E0',
  backgroundColor: '#FAFAFA', color: '#666', fontWeight: 700, fontSize: '0.75rem', textAlign: 'left', whiteSpace: 'nowrap',
}
const TABLE_TD = {
  padding: '4px 6px', borderBottom: '1px solid #E0E0E0', borderRight: '1px solid #E0E0E0', verticalAlign: 'top', color: '#333', background: '#fff',
}

const EMPTY_SYLLABUS = {
  university_name: 'Republic of the Philippines\nBatangas State University (The National Engineering University)\nBatStateU-Lipa Campus',
  college: 'College of Informatics and Computing Sciences',
  program: 'Bachelor of Science in Information Technology',
  document_title: 'Course Information Syllabus (CIS)',
  vision: '', mission: '',
  course_title: '', course_code: '', course_category: '', prerequisites: '',
  semester_year: '', credit_hours: '', instructor_name: '',
  contact_info: '', education: '',
  reference_cmo: '', date_prepared: '', revision_no: '', revision_date: '', period_of_study: '',
  description: '', lecture_hours: '', lab_hours: '',
  assessment_criteria: '', tlas: '',
  ilos: [''], assessment_tasks: [{ ...EMPTY_TASK, ilo_values: [''] }],
  references: [''], igas: [{ ...EMPTY_ATTR }], student_outcomes: [{ ...EMPTY_ATTR }], cdio_skills: [{ ...EMPTY_ATTR }], sdg_skills: [{ ...EMPTY_ATTR }],
  grading_rows: DEFAULT_GRADING_ROWS.map(r => ({ ...r })), policies: [{ title: 'Class Policies', content: '' }], other_policies: '',
  tla_chapters: [{ ...EMPTY_CHAPTER }], schedule_methods: [{ name: 'Major Examinations', values: Array(16).fill('') }],
  so_headers: [''], so_cpa_rows: [{ so_vals: [''], c: '', p: '', a: '' }], iga_headers: [''], iga_rows: [{ vals: [''] }], cdio_headers: [''], sdg_headers: [''], cdio_sdg_rows: [{ cdio_vals: [''], sdg_vals: [''] }],
}

function SectionCard({ title, children, action }) {
  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</Typography>
        {action}
      </Box>
      <Box sx={{ bgcolor: '#fff', borderRadius: 2, p: 2, border: '1px solid #E0E0E0' }}>{children}</Box>
    </Box>
  )
}

function LField({ label, ...props }) {
  return (
    <TextField 
      size="small" fullWidth label={label} {...props}
      InputLabelProps={{ sx: { color: 'text.secondary' }, shrink: true }}
      sx={{
        '& .MuiOutlinedInput-root': { borderRadius: 1, bgcolor: '#fff', '& fieldset': { borderColor: '#E0E0E0' }, '&:hover fieldset': { borderColor: '#BDBDBD' }, '&.Mui-focused fieldset': { borderColor: MAROON, borderWidth: '1px' } },
        '& .MuiInputLabel-root.Mui-focused': { color: MAROON },
        ...props.sx,
      }}
    />
  )
}

function GenButton({ children, ...props }) {
  return (
    <Button variant="contained" fullWidth {...props} sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6B0000' }, textTransform: 'none', fontWeight: 700, borderRadius: 1.5, boxShadow: 'none', ...props.sx }}>
      {children}
    </Button>
  )
}

function AddRowBtn({ onClick, label }) {
  return <Button size="small" startIcon={<AddIcon sx={{ fontSize: '0.9rem !important' }} />} onClick={onClick} sx={{ textTransform: 'none', color: MAROON, fontSize: '0.75rem', py: 0, minWidth: 0 }}>{label}</Button>
}

function RemoveBtn({ onClick, disabled }) {
  return <Tooltip title="Remove"><span><IconButton size="small" onClick={onClick} disabled={disabled} sx={{ color: '#ccc', '&:hover': { color: MAROON }, '&.Mui-disabled': { opacity: 0.3 } }}><DeleteIcon sx={{ fontSize: '1rem' }} /></IconButton></span></Tooltip>
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

function detectFileType(file) {
  const n = (file?.name || '').toLowerCase()
  if (n.endsWith('.pdf'))  return 'pdf'
  if (n.endsWith('.docx')) return 'docx'
  return ''
}

function inlineInput(value, onChange, minWidth = 80, onFocus) {
  return (
    <TextField size="small" value={value} onChange={onChange} onFocus={onFocus}
      sx={{ minWidth, '& .MuiOutlinedInput-root': { fontSize: '0.8rem', borderRadius: 1, bgcolor: '#fff', '& fieldset': { borderColor: 'transparent' }, '&:hover fieldset': { borderColor: '#E0E0E0' }, '&.Mui-focused fieldset': { borderColor: MAROON } } }}
      inputProps={{ style: { padding: '5px 8px' } }}
    />
  )
}

function getSectionStatus(data, sectionKey) {
  if (!data) return false
  const check = (fields) => fields.every(f => {
    const val = data[f]
    if (!val) return false
    if (typeof val === 'string') return val.trim().length > 0
    if (Array.isArray(val)) {
      if (val.length === 0) return false
      const first = val[0]
      if (typeof first === 'string') return first.trim().length > 0
      if (first && typeof first === 'object') {
        if ('title' in first && 'content' in first) return (first.content || '').trim().length > 0
        if ('chapter' in first && 'topics' in first) return (first.topics || '').trim().length > 0
        if ('code' in first && 'task' in first) return (first.task || '').trim().length > 0
        if ('name' in first && 'values' in first) return (first.name || '').trim().length > 0
      }
      return true
    }
    return true
  })

  switch (sectionKey) {
    case 'overview':             return check(['description'])
    case 'basic_info':           return check(['university_name', 'college', 'program'])
    case 'course_details':       return check(['course_title', 'course_code'])
    case 'ilos_assessments':     return check(['ilos', 'assessment_tasks'])
    case 'ilo_at_matrix':        return check(['so_cpa_rows'])
    case 'framework_mapping':    return check(['iga_rows'])
    case 'ilo_framework_matrix': return check(['cdio_sdg_rows'])
    case 'weekly_schedule':      return check(['tla_chapters'])
    case 'table_spec':           return check(['assessment_tasks'])
    case 'grading':              return check(['grading_rows'])
    case 'policies':             return check(['policies'])
    default:                     return false
  }
}

export default function FacultyWorkspacePage({ activeTab: initialTab = 'syllabus' }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState(null)

  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const courseId = courseIdParam || searchParams.get('course') || ''

  const [activeTab, setActiveTab]     = useState(initialTab)
  const [syllabusSub, setSyllabusSub] = useState('overview')

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [leftWidth, setLeftWidth]   = useState(240)
  const [rightWidth, setRightWidth] = useState(360)
  const [rightOpen, setRightOpen] = useState(true)
  const [dragging, setDragging]     = useState(null)
  const containerRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [mobileNavOpen, setMobileNavOpen]       = useState(false)
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false)

  const [resultText, setResultText]       = useState('')
  const [actionError, setActionError]     = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [moduleParams,   setModuleParams]   = useState({ module_title: '', week_number: 1, provider: 'ollama', top_k: 5, extra_instructions: '' })

  const [uploadForm, setUploadForm]         = useState({ module_tag: '', term_tag: '' })
  const [uploadFile, setUploadFile]         = useState(null)
  const [uploadError, setUploadError]       = useState('')
  const [uploadSuccess, setUploadSuccess]   = useState('')
  const [uploadStatus, setUploadStatus]     = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading]           = useState(false)

  const [syllabusData, setSyllabusData] = useState(EMPTY_SYLLABUS)
  const [syllabusId, setSyllabusId]     = useState(null)
  const [isDirty, setIsDirty]           = useState(false)
  const [saveLoading, setSaveLoading]   = useState(false)
  const [saveError, setSaveError]       = useState('')
  const [saveSuccess, setSaveSuccess]   = useState(false)

  const [aiField, setAiField]         = useState(null)
  const [aiProvider, setAiProvider]   = useState('gemini')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError]         = useState('')

  const syllabusUploadRef                   = useRef(null)
  const [syllabusUploading, setSyllabusUploading]     = useState(false)
  const [syllabusUploadError, setSyllabusUploadError] = useState('')
  const [syllabusUploadSuccess, setSyllabusUploadSuccess] = useState(false)

  function setSyl(field, value) { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, [field]: value })) }
  function setSylArr(field, i, value) { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => { const a = [...s[field]]; a[i] = value; return { ...s, [field]: a } }) }
  function setSylArrObj(field, i, key, value) { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, [field]: s[field].map((item, j) => j === i ? { ...item, [key]: value } : item) })) }
  function addSylItem(field, empty) { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, [field]: [...s[field], typeof empty === 'object' ? { ...empty } : empty] })) }
  function removeSylItem(field, i) { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, [field]: s[field].filter((_, j) => j !== i) })) }

  function normalizeSyllabusData(raw) {
    if (!raw) return { ...EMPTY_SYLLABUS }
    const iloCount = Math.max(1, (raw.ilos || ['']).length)
    const normTasks = (tasks) => (tasks || []).map(t => {
      if (Array.isArray(t.ilo_values)) return t
      const iloVals = Array.from({ length: iloCount }, (_, i) => t[`ilo${i + 1}`] || '')
      return { code: t.code || '', task: t.task || '', ird: t.ird || '', weight: t.weight || '', ilo_values: iloVals, c: '', p: '', a: t.domain || '' }
    })
    const normChapters = (chapters) => (chapters || []).map(ch => {
      if ('topics' in ch) return ch
      return { chapter: ch.chapter || '', topics: ch.description || '', weeks: '', outcomes: '', ilo: '', so: '', delivery: '' }
    })
    const soHeaders = raw.so_headers || ['']
    const normSoCpa = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.so_cpa_rows || [])[i] || {}
      return { so_vals: Array.from({ length: soHeaders.length }, (_, j) => (ex.so_vals || [])[j] || ''), c: ex.c || '', p: ex.p || '', a: ex.a || '' }
    })
    const igaHeaders = raw.iga_headers || ['']
    const normIga = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.iga_rows || [])[i] || {}
      return { vals: Array.from({ length: igaHeaders.length }, (_, j) => (ex.vals || [])[j] || '') }
    })
    const cdioHeaders = raw.cdio_headers || ['']
    const sdgHeaders  = raw.sdg_headers  || ['']
    const normCdioSdg = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.cdio_sdg_rows || [])[i] || {}
      return { cdio_vals: Array.from({ length: cdioHeaders.length }, (_, j) => (ex.cdio_vals || [])[j] || ''), sdg_vals:  Array.from({ length: sdgHeaders.length  }, (_, j) => (ex.sdg_vals  || [])[j] || '') }
    })
    const normSchedule = (raw.schedule_methods || []).length ? raw.schedule_methods.map(m => ({ name: m.name || '', values: Array.from({ length: 16 }, (_, j) => (m.values || [])[j] || '') })) : [{ name: 'Major Examinations', values: Array(16).fill('') }]
    const normTasksResult = normTasks(raw.assessment_tasks || [])
    const normChaptersResult = normChapters(raw.tla_chapters || [])

    return {
      ...EMPTY_SYLLABUS, ...raw,
      assessment_tasks: normTasksResult.length ? normTasksResult : [{ ...EMPTY_TASK, ilo_values: Array(iloCount).fill('') }],
      tla_chapters: normChaptersResult.length ? normChaptersResult : [{ ...EMPTY_CHAPTER }],
      schedule_methods: normSchedule, so_headers: soHeaders, so_cpa_rows: normSoCpa, iga_headers: igaHeaders, iga_rows: normIga, cdio_headers: cdioHeaders, sdg_headers: sdgHeaders, cdio_sdg_rows: normCdioSdg,
    }
  }

  function addIlo() {
    setIsDirty(true); setSaveSuccess(false)
    setSyllabusData(s => {
      const soLen   = (s.so_headers   || ['']).length
      const igaLen  = (s.iga_headers  || ['']).length
      const cdioLen = (s.cdio_headers || ['']).length
      const sdgLen  = (s.sdg_headers  || ['']).length
      return {
        ...s, ilos: [...s.ilos, ''],
        assessment_tasks: s.assessment_tasks.map(t => ({ ...t, ilo_values: [...(t.ilo_values || []), ''] })),
        so_cpa_rows:   [...(s.so_cpa_rows   || []), { so_vals: Array(soLen).fill(''),   c: '', p: '', a: '' }],
        iga_rows:      [...(s.iga_rows      || []), { vals: Array(igaLen).fill('') }],
        cdio_sdg_rows: [...(s.cdio_sdg_rows || []), { cdio_vals: Array(cdioLen).fill(''), sdg_vals: Array(sdgLen).fill('') }],
      }
    })
  }

  function removeIlo(i) {
    if (syllabusData.ilos.length <= 1) return
    setIsDirty(true); setSaveSuccess(false)
    setSyllabusData(s => ({
      ...s, ilos: s.ilos.filter((_, j) => j !== i),
      assessment_tasks: s.assessment_tasks.map(t => ({ ...t, ilo_values: (t.ilo_values || []).filter((_, j) => j !== i) })),
      so_cpa_rows: (s.so_cpa_rows || []).filter((_, j) => j !== i), iga_rows: (s.iga_rows || []).filter((_, j) => j !== i), cdio_sdg_rows: (s.cdio_sdg_rows || []).filter((_, j) => j !== i),
    }))
  }

  function getAiCurrentValue() {
    if (!aiField) return ''
    const { fieldType, field, arrField, arrIndex, arrObjKey } = aiField
    if (fieldType === 'simple')   return syllabusData[field] || ''
    if (fieldType === 'array')    return syllabusData[arrField]?.[arrIndex] || ''
    if (fieldType === 'arrayObj') return syllabusData[arrField]?.[arrIndex]?.[arrObjKey] || ''
    return ''
  }

  function applyAiText(text) {
    if (!aiField) return
    const { fieldType, field, arrField, arrIndex, arrObjKey } = aiField
    if (fieldType === 'simple')   setSyl(field, text)
    if (fieldType === 'array')    setSylArr(arrField, arrIndex, text)
    if (fieldType === 'arrayObj') setSylArrObj(arrField, arrIndex, arrObjKey, text)
  }

  async function handleAiGenerate(mode) {
    if (!aiField || !course) return
    setAiGenerating(true); setAiError('')
    try {
      const currentValue = getAiCurrentValue()
      const { data } = await api.post('/curriculum/generate-syllabus-field/', { course_id: courseId, section: aiField.section, field_label: aiField.label, existing_content: mode === 'continue' ? currentValue : '', mode, provider: aiProvider, top_k: 5 }, { timeout: 120000 })
      const generated = data.generated_text || ''
      if (mode === 'continue' && currentValue) { applyAiText(currentValue + '\n' + generated) } else { applyAiText(generated) }
    } catch (err) { setAiError(extractApiError(err)) } finally { setAiGenerating(false) }
  }

  async function handleSyllabusUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSyllabusUploading(true); setSyllabusUploadError(''); setSyllabusUploadSuccess(false)
    const formData = new FormData()
    formData.append('file', file); formData.append('course_id', courseId)
    try {
      const { data } = await api.post('/curriculum/parse-syllabus-upload/', formData, { headers: { 'Content-Type': undefined }, timeout: 120000 })
      if (data.syllabus_data && typeof data.syllabus_data === 'object') { setSyllabusData(prev => normalizeSyllabusData({ ...EMPTY_SYLLABUS, ...prev, ...data.syllabus_data })); setIsDirty(true); setSyllabusUploadSuccess(true) } else { setSyllabusUploadError('Syllabus was uploaded but no data could be extracted.') }
    } catch (err) { setSyllabusUploadError(extractApiError(err)) } finally { setSyllabusUploading(false); if (syllabusUploadRef.current) syllabusUploadRef.current.value = '' }
  }

  const workspaceApi = useApi(courseId ? `/curriculum/faculty-course-workspace/${courseId}/` : null, { immediate: Boolean(courseId), deps: [courseId] })
  const docsApi = useApi(courseId ? `/integrations/course-rag-documents/?course_id=${courseId}` : null, { immediate: Boolean(courseId), deps: [courseId] })
  const course = workspaceApi.data?.course

  useEffect(() => {
    const apiData = workspaceApi.data
    if (!apiData) return
    const course = apiData.course
    setSyllabusId(apiData.syllabus?.syllabus_id || null)
    const saved = apiData.syllabus?.syllabus_content
    if (saved && typeof saved === 'object') { setSyllabusData(normalizeSyllabusData({ ...EMPTY_SYLLABUS, ...saved })); setIsDirty(false); return }
    if (!course) return
    const toStr = v => v != null ? String(v) : ''
    const mapAttr = arr => (arr || []).length ? arr.map(g => ({ code: g.code || '', title: g.title || '', description: g.description || '' })) : [{ ...EMPTY_ATTR }]
    const courseIlos = (course.ilos || []).length ? course.ilos.map(String) : ['']
    const iloCount   = courseIlos.length
    
    setSyllabusData(normalizeSyllabusData({
      university_name: EMPTY_SYLLABUS.university_name, college: EMPTY_SYLLABUS.college, program: EMPTY_SYLLABUS.program, document_title: EMPTY_SYLLABUS.document_title,
      vision: course.vision || '', mission: course.mission || '',
      course_title: course.course_title || '', course_code: course.course_code || '', course_category: course.course_category || '', prerequisites: course.prerequisites || '',
      semester_year: course.semester_year || '', credit_hours: toStr(course.credit_hours), instructor_name: course.instructor_name || '', contact_info: course.contact_info || '', education: course.education || '',
      reference_cmo: course.reference_cmo || '', date_prepared: course.date_prepared || '', revision_no: toStr(course.revision_no), revision_date: course.revision_date || '', period_of_study: course.period_of_study || '',
      description: course.description || '', lecture_hours: toStr(course.lecture_hours), lab_hours: toStr(course.lab_hours), assessment_criteria: course.assessment_criteria || '', tlas: course.tlas || '',
      ilos: courseIlos, assessment_tasks: (course.assessment_tasks || []).length ? course.assessment_tasks : [{ ...EMPTY_TASK, ilo_values: Array(iloCount).fill('') }],
      references: (course.references || []).length ? course.references.map(String) : [''], igas: mapAttr(course.igas), student_outcomes: mapAttr(course.student_outcomes), cdio_skills: mapAttr(course.cdio_skills), sdg_skills: mapAttr(course.sdg_skills),
      grading_rows: DEFAULT_GRADING_ROWS.map(r => ({ ...r })), policies: (course.policies || []).length ? course.policies.map(p => ({ title: p.title || '', content: p.content || '' })) : [{ title: 'Class Policies', content: '' }], other_policies: course.other_policies || '',
      tla_chapters: (course.tla_chapters || []).length ? course.tla_chapters : [{ ...EMPTY_CHAPTER }], schedule_methods: course.schedule_methods || undefined, so_headers: course.so_headers || undefined, so_cpa_rows: course.so_cpa_rows || undefined, iga_headers: course.iga_headers || undefined, iga_rows: course.iga_rows || undefined, cdio_headers: course.cdio_headers || undefined, sdg_headers: course.sdg_headers || undefined, cdio_sdg_rows: course.cdio_sdg_rows || undefined,
    }))
    setIsDirty(false)
  }, [workspaceApi.data])

  useEffect(() => { if (!saveError) return; const t = setTimeout(() => setSaveError(''), 3000); return () => clearTimeout(t) }, [saveError])
  useEffect(() => { if (!actionError) return; const t = setTimeout(() => setActionError(''), 3000); return () => clearTimeout(t) }, [actionError])
  useEffect(() => { if (!aiError) return; const t = setTimeout(() => setAiError(''), 4000); return () => clearTimeout(t) }, [aiError])
  useEffect(() => { if (!syllabusUploadSuccess) return; const t = setTimeout(() => setSyllabusUploadSuccess(false), 5000); return () => clearTimeout(t) }, [syllabusUploadSuccess])
  useEffect(() => { setAiField(null) }, [syllabusSub])

  async function handleSaveSyllabus() {
    setSaveError(''); setSaveLoading(true)
    try { const { data } = await api.put(`/curriculum/syllabus-content/${courseId}/`, { syllabus_content: syllabusData }); setSyllabusId(data.syllabus_id); setIsDirty(false); setSaveSuccess(true); workspaceApi.execute() } catch (err) { setSaveError(extractApiError(err)) } finally { setSaveLoading(false) }
  }

  useEffect(() => {
    if (!dragging) return undefined
    const onMove = (e) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (dragging === 'left')  setLeftWidth(Math.max(160, Math.min(300, e.clientX - rect.left)))
      if (dragging === 'right') setRightWidth(Math.max(250, Math.min(480, rect.right - e.clientX)))
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  useEffect(() => {
    if (!uploading) return undefined
    const timer = setInterval(() => { setUploadProgress(p => p < 80 ? Math.min(80, p + 4) : p < 95 ? Math.min(95, p + 0.35) : p) }, 120)
    const stages = [ setTimeout(() => setUploadStatus('Upload received. Preparing your course file.'), 500), setTimeout(() => setUploadStatus('Organizing your file into teaching-ready sections.'), 2200), setTimeout(() => setUploadStatus('Making this file searchable for your course tools.'), 5200), setTimeout(() => setUploadStatus('Finalizing and saving into your course knowledge base...'), 9000) ]
    return () => { clearInterval(timer); stages.forEach(clearTimeout) }
  }, [uploading])

  async function handleGenerateModule() {
    if (!course) return
    setActionError(''); setActionLoading(true); setResultText('')
    try { const { data } = await api.post('/curriculum/generate-module/', { course_name: course.course_title, module_title: moduleParams.module_title, week_number: Number(moduleParams.week_number), provider: moduleParams.provider, top_k: Number(moduleParams.top_k), extra_instructions: moduleParams.extra_instructions }); setResultText(data.generated_module || ''); workspaceApi.execute() } catch (err) { setActionError(extractApiError(err)) } finally { setActionLoading(false) }
  }

  async function handleUpload(e) {
    e.preventDefault()
    setUploadError(''); setUploadSuccess(''); setUploadStatus(''); setUploadProgress(0)
    if (!courseId)   { setUploadError('Please choose a course first.'); return }
    if (!uploadFile) { setUploadError('Please choose a PDF or DOCX file.'); return }
    const fileType = detectFileType(uploadFile)
    if (!fileType) { setUploadError('Unsupported file type. Please upload PDF or DOCX only.'); return }
    const formData = new FormData()
    formData.append('file', uploadFile); formData.append('file_type', fileType); formData.append('course_id', courseId); formData.append('module_tag', uploadForm.module_tag.trim()); formData.append('term_tag', uploadForm.term_tag.trim())
    setUploading(true); setUploadStatus('Uploading your file...')
    try { const { data } = await api.post('/integrations/upload-course-rag-document/', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 1200000 }); setUploadProgress(100); setUploadStatus('Done. This file is now ready for your course generation tools.'); setUploadSuccess(data?.message || 'File uploaded successfully.'); setUploadFile(null); docsApi.execute() } catch (err) { setUploadProgress(0); setUploadStatus(''); setUploadError(extractApiError(err)) } finally { setUploading(false) }
  }

  // ── Syllabus section renderer (all 10 clean editable tabs) ─────────────
  function renderSyllabusSection() {
    if (!courseId) return null
    if (workspaceApi.loading && !workspaceApi.data) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: MAROON }} /></Box>
    if (workspaceApi.error) return <AutoAlert message={workspaceApi.error} onClose={() => {}} />

    if (syllabusSub === 'overview') {
      return (
        <Stack spacing={2}>
          <SectionCard title="Syllabus Summary">
            <Box sx={{ display: 'flex', gap: 2, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
              {[
                { val: 3, label: 'ILOs', bg: '#FDECEC', color: '#8B0000' },
                { val: 5, label: 'Assessment Tasks', bg: '#EAF2FB', color: '#1976D2' },
                { val: 6, label: 'References', bg: '#EBF4EC', color: '#388E3C' },
                { val: 4, label: 'Policies', bg: '#F4EBFA', color: '#7B1FA2' }
              ].map((stat, i) => (
                <Box key={i} sx={{ flex: 1, minWidth: { xs: 'calc(50% - 8px)', md: 0 }, borderRadius: 2, textAlign: 'center', bgcolor: stat.bg, border: `1px solid ${stat.color}40`, py: 3, px: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontWeight: 800, color: stat.color, fontSize: '2.5rem', lineHeight: 1 }}>{stat.val}</Typography>
                  <Typography sx={{ color: 'rgba(0,0,0,0.6)', fontWeight: 600, fontSize: '0.85rem', mt: 1, whiteSpace: 'nowrap' }}>{stat.label}</Typography>
                </Box>
              ))}
            </Box>
          </SectionCard>
          <SectionCard title="Framework Alignment">
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0', borderRadius: 2 }}>
              <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 600 }}>
                <TableHead sx={{ bgcolor: '#FAFAFA' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, color: '#666', width: '10%' }}>ILO</TableCell>
                    {['2', '3', '5', '3', '6', '3', '4', '2', '4', '5'].map((col, i) => (
                      <TableCell key={i} align="center" sx={{ fontWeight: 700, color: ['#1976D2', '#388E3C', '#7B1FA2', '#8B0000'][i % 4] }}>{col}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {['ILO1', 'ILO2', 'ILO3'].map((ilo, i) => (
                    <TableRow key={ilo}>
                      <TableCell sx={{ fontWeight: 700, color: '#8B0000', borderBottom: '1px solid #E0E0E0' }}>{ilo}</TableCell>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j} align="center" sx={{ bgcolor: i === 0 && j === 3 ? '#FDECEC' : 'inherit', borderBottom: '1px solid #E0E0E0' }}>
                          {i === 0 && j === 3 ? <Typography sx={{ fontWeight: 700, color: '#8B0000', fontSize: '0.85rem' }}>T1</Typography> : <Typography sx={{ color: '#ccc' }}>–</Typography>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" sx={{ color: '#999', display: 'block', mt: 1 }}>Read-only overview. Edit framework mappings in the Framework Mapping section.</Typography>
          </SectionCard>
        </Stack>
      )
    }

    if (syllabusSub === 'basic_info') {
      return (
        <Stack spacing={2}>
          <SectionCard title="Institution">
            <Stack spacing={1.75}>
              <LField label="Institution Name" value="BATANGAS STATE UNIVERSITY The National Engineering University" InputProps={{ readOnly: true }} />
              <LField label="Campus / Branch" value="BatStateU-Lipa Campus" InputProps={{ readOnly: true }} />
              <LField label="College / Department" value="College of Informatics and Computing Sciences" InputProps={{ readOnly: true }} />
              <LField label="Address" value="A. Tanco Drive, Brgy. Marawoy, Lipa, Batangas 4217" InputProps={{ readOnly: true }} />
              <LField label="Contact" value="(+63 43) 980-0385 | cics.lipa@g.batstate-u.edu.ph" InputProps={{ readOnly: true }} />
            </Stack>
          </SectionCard>
          <SectionCard title="University Direction">
            <Stack spacing={1.75}>
              <LField label="Vision" multiline minRows={2} value={syllabusData.vision} onChange={e => setSyl('vision', e.target.value)} />
              <LField label="Mission" multiline minRows={3} value={syllabusData.mission} onChange={e => setSyl('mission', e.target.value)} />
            </Stack>
          </SectionCard>
          <SectionCard title="Course Identification">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <LField label="Course Title" value={syllabusData.course_title} onChange={e => setSyl('course_title', e.target.value)} />
              <LField label="Course Code" value={syllabusData.course_code} onChange={e => setSyl('course_code', e.target.value)} />
              <LField label="Category" value={syllabusData.course_category} onChange={e => setSyl('course_category', e.target.value)} />
              <LField label="Pre-requisite" value={syllabusData.prerequisites} onChange={e => setSyl('prerequisites', e.target.value)} />
              <LField label="Year Level" value="3rd Year" />
              <LField label="Credit Hours" value={syllabusData.credit_hours} onChange={e => setSyl('credit_hours', e.target.value)} />
              <LField label="Semester / Year" value={syllabusData.semester_year} onChange={e => setSyl('semester_year', e.target.value)} />
              <LField label="Reference CMO" value={syllabusData.reference_cmo} onChange={e => setSyl('reference_cmo', e.target.value)} />
              <LField label="Date Prepared" value={syllabusData.date_prepared} onChange={e => setSyl('date_prepared', e.target.value)} />
              <LField label="Revision No." value={syllabusData.revision_no} onChange={e => setSyl('revision_no', e.target.value)} />
              <LField label="Revision Date" value={syllabusData.revision_date} onChange={e => setSyl('revision_date', e.target.value)} />
              <LField label="Period of Study" value={syllabusData.period_of_study} onChange={e => setSyl('period_of_study', e.target.value)} sx={{ gridColumn: 'span 2' }} />
            </Box>
          </SectionCard>
          <SectionCard title="Instructor">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <LField label="Name" value={syllabusData.instructor_name} onChange={e => setSyl('instructor_name', e.target.value)} />
              <LField label="Employee ID" value="" />
              <LField label="Email" value={syllabusData.contact_info} onChange={e => setSyl('contact_info', e.target.value)} />
              <LField label="Contact" value="0908-877-8671" />
              <LField label="Qualifications" value={syllabusData.education} onChange={e => setSyl('education', e.target.value)} sx={{ gridColumn: 'span 2' }} />
            </Box>
          </SectionCard>
        </Stack>
      )
    }

    if (syllabusSub === 'course_details') {
      return (
        <Stack spacing={2}>
          <SectionCard title="Rationale & Description">
            <Stack spacing={1.75}>
              <LField label="Course Rationale" multiline minRows={4} value="This course equips students with essential skills to implement advanced analytics techniques that support data-driven decision-making across industries. In addition to developing technical competence, analytical thinking, and problem-solving abilities, the course promotes inclusive and ethical data practices by emphasizing fairness, accessibility, and gender sensitivity in the design and interpretation of analytics solutions..." />
              <LField label="Course Description" multiline minRows={6} value={syllabusData.description} onChange={e => setSyl('description', e.target.value)} />
            </Stack>
          </SectionCard>
          <SectionCard title="Contact Hours & Strategies">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.75, mb: 1.75 }}>
              <LField label="Lecture Hours" value={syllabusData.lecture_hours} onChange={e => setSyl('lecture_hours', e.target.value)} />
              <LField label="Laboratory Hours" value={syllabusData.lab_hours} onChange={e => setSyl('lab_hours', e.target.value)} />
              <LField label="Total Hours" value="5" InputProps={{ readOnly: true }} />
            </Box>
            <Stack spacing={1.75}>
              <LField label="Teaching & learning strategies" multiline minRows={8} value={syllabusData.tlas} onChange={e => setSyl('tlas', e.target.value)} />
              <LField label="Technology integration" multiline minRows={6} value="Python (Jupyter Notebook, pandas, scikit-learn): Used in laboratory activities and project work.\nR (RStudio, dplyr, caret): Core technology for statistical and predictive modeling.\nKNIME Analytics Platform: Employed in hands-on sessions to design workflows for predictive analytics.\nMicrosoft Excel: Used for financial forecasting and data exploration." />
            </Stack>
          </SectionCard>
          <SectionCard title="References" action={<AddRowBtn label="Add Reference" onClick={() => addSylItem('references', '')} />}>
            <Stack spacing={1.25}>
              {syllabusData.references.map((ref, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ color: MAROON, fontWeight: 700, minWidth: 22, flexShrink: 0 }}>{i + 1}.</Typography>
                  <LField label={`Reference ${i + 1}`} value={ref} onChange={e => setSylArr('references', i, e.target.value)} />
                  <RemoveBtn onClick={() => removeSylItem('references', i)} disabled={syllabusData.references.length <= 1} />
                </Box>
              ))}
            </Stack>
          </SectionCard>
        </Stack>
      )
    }

    if (syllabusSub === 'ilos_assessments') {
      return (
        <Stack spacing={2}>
          <SectionCard title="Intended Learning Outcomes (ILO)" action={<AddRowBtn label="Add ILO" onClick={addIlo} />}>
            <Stack spacing={1.5}>
              {syllabusData.ilos.map((ilo, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Chip label={'ILO' + (i + 1)} size="small" sx={{ bgcolor: '#fff', color: MAROON, fontWeight: 700, flexShrink: 0, height: 22, fontSize: '0.7rem', mt: 0.8, border: 'none' }} />
                  <LField label={`ILO ${i + 1}`} multiline minRows={2} value={ilo} onChange={e => setSylArr('ilos', i, e.target.value)} />
                  <RemoveBtn onClick={() => removeIlo(i)} disabled={syllabusData.ilos.length <= 1} />
                </Box>
              ))}
            </Stack>
          </SectionCard>
          <SectionCard title="Assessment Tasks & Score Distribution">
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#666', fontWeight: 600 }}>Activities (Component wt: 50%)</Typography>
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0', borderRadius: 2, mb: 3 }}>
              <Table size="small">
                <TableBody>
                  <TableRow><TableCell sx={TABLE_TD}>T1</TableCell><TableCell sx={TABLE_TD}>Technical Task 1</TableCell><TableCell sx={TABLE_TD}>ILOs: ILO1 (50/60), ILO3 (10/10)</TableCell><TableCell sx={TABLE_TD} align="right">20%</TableCell></TableRow>
                  <TableRow><TableCell sx={TABLE_TD}>T2</TableCell><TableCell sx={TABLE_TD}>Technical Task 2</TableCell><TableCell sx={TABLE_TD}>ILOs: ILO2 (20/20)</TableCell><TableCell sx={TABLE_TD} align="right">20%</TableCell></TableRow>
                  <TableRow><TableCell sx={TABLE_TD}>T3</TableCell><TableCell sx={TABLE_TD}>Technical Task 3</TableCell><TableCell sx={TABLE_TD}>ILOs: ILO2 (10/10)</TableCell><TableCell sx={TABLE_TD} align="right">10%</TableCell></TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#666', fontWeight: 600 }}>Major Examinations (Component wt: 50%)</Typography>
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0', borderRadius: 2 }}>
              <Table size="small">
                <TableBody>
                  <TableRow><TableCell sx={TABLE_TD}>PE</TableCell><TableCell sx={TABLE_TD}>Prelim Examination</TableCell><TableCell sx={TABLE_TD}>ILOs: ILO2 (30/30), ILO3 (30/30)</TableCell><TableCell sx={TABLE_TD} align="right">15%</TableCell></TableRow>
                  <TableRow><TableCell sx={TABLE_TD}>ME</TableCell><TableCell sx={TABLE_TD}>Midterm Examination</TableCell><TableCell sx={TABLE_TD}>ILOs: ILO1 (40/40), ILO3 (20/20)</TableCell><TableCell sx={TABLE_TD} align="right">15%</TableCell></TableRow>
                  <TableRow><TableCell sx={TABLE_TD}>FE</TableCell><TableCell sx={TABLE_TD}>Final Examination</TableCell><TableCell sx={TABLE_TD}>ILOs: ILO2 (60/60)</TableCell><TableCell sx={TABLE_TD} align="right">20%</TableCell></TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Stack>
      )
    }

    if (syllabusSub === 'ilo_at_matrix') {
      return (
        <SectionCard title="ILO-AT Matrix">
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#FAFAFA' }}>
                <TableRow>
                  <TableCell sx={TABLE_TH}>Component</TableCell>
                  <TableCell sx={TABLE_TH}>Code</TableCell>
                  <TableCell sx={TABLE_TH}>Task</TableCell>
                  <TableCell sx={TABLE_TH}>Wt %</TableCell>
                  <TableCell align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>ILO1</TableCell>
                  <TableCell align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>ILO2</TableCell>
                  <TableCell align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>ILO3</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  { comp: 'Activities', code: 'T1', task: 'Technical Task 1', wt: '20%', i1: true, i2: false, i3: true },
                  { comp: 'Activities', code: 'T2', task: 'Technical Task 2', wt: '20%', i1: false, i2: true, i3: false },
                  { comp: 'Activities', code: 'T3', task: 'Technical Task 3', wt: '10%', i1: false, i2: true, i3: false },
                  { comp: 'Major Examinations', code: 'PE', task: 'Prelim Examination', wt: '15%', i1: false, i2: true, i3: true },
                  { comp: 'Major Examinations', code: 'ME', task: 'Midterm Examination', wt: '15%', i1: true, i2: false, i3: true },
                  { comp: 'Major Examinations', code: 'FE', task: 'Final Examination', wt: '20%', i1: false, i2: true, i3: false },
                ].map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell sx={{ ...TABLE_TD, color: '#8B0000', fontWeight: 600 }}>{row.comp}</TableCell>
                    <TableCell sx={TABLE_TD}>{row.code}</TableCell>
                    <TableCell sx={TABLE_TD}>{row.task}</TableCell>
                    <TableCell sx={TABLE_TD}>{row.wt}</TableCell>
                    <TableCell align="center" sx={{ ...TABLE_TD, bgcolor: row.i1 ? '#FDECEC' : 'inherit' }}>{row.i1 ? '✓' : '–'}</TableCell>
                    <TableCell align="center" sx={{ ...TABLE_TD, bgcolor: row.i2 ? '#FDECEC' : 'inherit' }}>{row.i2 ? '✓' : '–'}</TableCell>
                    <TableCell align="center" sx={{ ...TABLE_TD, bgcolor: row.i3 ? '#FDECEC' : 'inherit' }}>{row.i3 ? '✓' : '–'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      )
    }

    if (syllabusSub === 'framework_mapping') {
      return (
        <Stack spacing={2}>
          <SectionCard title="Student Outcomes — Framework Reference">
            <Stack spacing={2}>
              {[
                { code: 'SO1', title: 'Discipline Knowledge', desc: 'Ability to analyze complex computing problems and to apply principles of computing and other relevant disciplines to identify solutions.' },
                { code: 'SO2', title: 'Design/Development of Solutions', desc: 'Ability to design, implement, and evaluate computing-based solutions to meet a given set of computing requirements in the context of the program’s discipline.' },
                { code: 'SO3', title: 'Communication', desc: 'Ability to communicate effectively in a variety of professional contexts.' },
                { code: 'SO4', title: 'Ethics and Professionalism', desc: 'Ability to recognize professional responsibilities and make informed judgments in computing practice based on legal and ethical principles.' },
                { code: 'SO5', title: 'Individual and Teamwork', desc: 'Ability to function effectively as a member or leader of a team engaged in activities appropriate to the program’s discipline.' },
                { code: 'SO6', title: 'Systemic Thinking', desc: 'Use systemic approaches to select, develop, apply, integrate, and administer secure computing technologies to accomplish user goals.' }
              ].map((so) => (
                <Box key={so.code} sx={{ border: '1px solid #E0E0E0', borderRadius: 2, p: 2 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={2}><LField label="Code" value={so.code} /></Grid>
                    <Grid item xs={12} sm={10}><LField label="Title / Outcome" value={so.title} /></Grid>
                    <Grid item xs={12}><LField label="Description" value={so.desc} /></Grid>
                  </Grid>
                </Box>
              ))}
            </Stack>
          </SectionCard>
          <SectionCard title="ILO → SO Mapping">
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#FAFAFA' }}>
                  <TableRow>
                    <TableCell rowSpan={2} sx={TABLE_TH}>ILOs</TableCell>
                    <TableCell colSpan={3} align="center" sx={TABLE_TH}>Student Outcomes: Mapping of Assessment Tasks (AT)</TableCell>
                    <TableCell colSpan={3} align="center" sx={TABLE_TH}>Domain</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell align="center" sx={TABLE_TH}>2</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>3</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>5</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>C</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>P</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>A</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {['ILO1', 'ILO2', 'ILO3'].map((ilo) => (
                    <TableRow key={ilo}>
                      <TableCell sx={{ ...TABLE_TD, color: '#8B0000', fontWeight: 700 }}>{ilo}</TableCell>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <TableCell key={i} align="center" sx={TABLE_TD}><TextField size="small" value="–" sx={{ width: '40px', input: { textAlign: 'center', p: 0.5 } }} /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Stack>
      )
    }

    if (syllabusSub === 'ilo_framework_matrix') {
      return (
        <SectionCard title="ILO-Framework Matrix">
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#FAFAFA' }}>
                <TableRow>
                  <TableCell sx={TABLE_TH}>Code</TableCell>
                  <TableCell sx={TABLE_TH}>Outcome / Attribute</TableCell>
                  <TableCell align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>ILO1</TableCell>
                  <TableCell align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>ILO2</TableCell>
                  <TableCell align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>ILO3</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  { c: '2', o: 'Student Outcome 1', i1: false, color: '#1976D2' },
                  { c: '3', o: 'Student Outcome 2', i1: false, color: '#1976D2' },
                  { c: '5', o: 'Student Outcome 3', i1: false, color: '#1976D2' },
                  { c: '3', o: 'Institutional Graduate Attribute 1', i1: true, color: '#8B0000' },
                  { c: '6', o: 'Institutional Graduate Attribute 2', i1: false, color: '#8B0000' },
                  { c: '3', o: 'CDIO Skill 1', i1: false, color: '#388E3C' },
                  { c: '4', o: 'CDIO Skill 2', i1: false, color: '#388E3C' },
                  { c: '2', o: 'SDG Skill 1', i1: false, color: '#7B1FA2' },
                  { c: '4', o: 'SDG Skill 2', i1: false, color: '#7B1FA2' },
                  { c: '5', o: 'SDG Skill 3', i1: false, color: '#7B1FA2' },
                ].map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell sx={{ ...TABLE_TD, color: row.color, fontWeight: 700 }}>{row.c}</TableCell>
                    <TableCell sx={TABLE_TD}>{row.o}</TableCell>
                    <TableCell align="center" sx={{ ...TABLE_TD, bgcolor: row.i1 ? '#FDECEC' : 'inherit' }}>{row.i1 ? <Typography sx={{ color: '#8B0000', fontWeight: 600, fontSize: '0.85rem' }}>T1</Typography> : '–'}</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>–</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>–</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      )
    }

    if (syllabusSub === 'weekly_schedule') {
      return (
        <SectionCard title="Weekly Schedule">
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#FAFAFA' }}>
                <TableRow>
                  <TableCell sx={TABLE_TH}>Week</TableCell>
                  <TableCell sx={TABLE_TH}>Topic / activity</TableCell>
                  <TableCell sx={TABLE_TH}>Task</TableCell>
                  <TableCell sx={TABLE_TH}>Delivery</TableCell>
                  <TableCell sx={TABLE_TH}>ILOs & pts</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell sx={TABLE_TD}>1</TableCell>
                  <TableCell sx={TABLE_TD}>Class Orientation<br />Introduction to Analytical Tools...</TableCell>
                  <TableCell sx={TABLE_TD}>Lecture/Discussion</TableCell>
                  <TableCell sx={TABLE_TD}>F2F</TableCell>
                  <TableCell sx={TABLE_TD}>–</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={TABLE_TD}></TableCell>
                  <TableCell sx={TABLE_TD}>Customer Analytics Classification Models</TableCell>
                  <TableCell sx={TABLE_TD}>Lecture/Discussion</TableCell>
                  <TableCell sx={TABLE_TD}>F2F</TableCell>
                  <TableCell sx={TABLE_TD}>–</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={TABLE_TD}></TableCell>
                  <TableCell sx={TABLE_TD}>LA 1: Decision Trees</TableCell>
                  <TableCell sx={TABLE_TD}>T1 - Technical Task 1</TableCell>
                  <TableCell sx={TABLE_TD}>F2F</TableCell>
                  <TableCell sx={{ ...TABLE_TD, color: '#8B0000', fontSize: '0.75rem', fontWeight: 700 }}>ILO1 ILO3<br/>ILO1:50 ILO3:10 pts</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={TABLE_TD}>2</TableCell>
                  <TableCell sx={TABLE_TD}>Market Segmentation Analytics...</TableCell>
                  <TableCell sx={TABLE_TD}>Lecture/Discussion</TableCell>
                  <TableCell sx={TABLE_TD}>–</TableCell>
                  <TableCell sx={TABLE_TD}>–</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={TABLE_TD}></TableCell>
                  <TableCell sx={TABLE_TD}>Preliminary Examination</TableCell>
                  <TableCell sx={TABLE_TD}>PE - Prelim Examination</TableCell>
                  <TableCell sx={TABLE_TD}>–</TableCell>
                  <TableCell sx={{ ...TABLE_TD, color: '#8B0000', fontSize: '0.75rem', fontWeight: 700 }}>ILO2 ILO3<br/>ILO2:30 ILO3:30 pts</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      )
    }

    if (syllabusSub === 'table_spec') {
      return (
        <Stack spacing={2}>
          <SectionCard title="TOS — PRELIM EXAMINATION">
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={4}><LField label="Exam label" value="Prelim Examination" /></Grid>
              <Grid item xs={12} sm={4}><LField label="Semester / year" value="" /></Grid>
              <Grid item xs={12} sm={4}><LField label="Prepared by" value="" /></Grid>
              <Grid item xs={12} sm={4}><LField label="Checked and verified by" value="" /></Grid>
              <Grid item xs={12} sm={4}><LField label="Approved by" value="" /></Grid>
              <Grid item xs={12} sm={4}><LField label="Total test items" value="60" /></Grid>
            </Grid>
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0' }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: '#FAFAFA' }}>
                  <TableRow>
                    <TableCell rowSpan={2} sx={TABLE_TH}>Topic</TableCell>
                    <TableCell rowSpan={2} sx={TABLE_TH}>ILOs</TableCell>
                    <TableCell colSpan={2} align="center" sx={TABLE_TH}>No. of hrs</TableCell>
                    <TableCell rowSpan={2} align="center" sx={TABLE_TH}>Weight (%)</TableCell>
                    <TableCell colSpan={2} align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>Remember</TableCell>
                    <TableCell colSpan={2} align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>Understand</TableCell>
                    <TableCell colSpan={2} align="center" sx={{ ...TABLE_TH, color: '#8B0000' }}>Apply</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell align="center" sx={TABLE_TH}>Class</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>Min</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>Items</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>%</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>Items</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>%</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>Items</TableCell>
                    <TableCell align="center" sx={TABLE_TH}>%</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell sx={TABLE_TD}>Introduction to Analytical Tools...</TableCell>
                    <TableCell sx={{ ...TABLE_TD, whiteSpace: 'nowrap' }}><Checkbox size="small" /> ILO1 <Checkbox size="small" checked /> ILO2</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>4</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>50</TableCell>
                    <TableCell align="center" sx={{ ...TABLE_TD, color: '#8B0000', fontWeight: 700 }}>40.0%</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>–</TableCell><TableCell sx={TABLE_TD}></TableCell>
                    <TableCell align="center" sx={TABLE_TD}>–</TableCell><TableCell sx={TABLE_TD}></TableCell>
                    <TableCell align="center" sx={TABLE_TD}>10</TableCell><TableCell align="center" sx={TABLE_TD}>40</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={TABLE_TD}>Customer Analytics Classification...</TableCell>
                    <TableCell sx={{ ...TABLE_TD, whiteSpace: 'nowrap' }}><Checkbox size="small" checked /> ILO1 <Checkbox size="small" checked /> ILO2</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>6</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>60</TableCell>
                    <TableCell align="center" sx={{ ...TABLE_TD, color: '#8B0000', fontWeight: 700 }}>60.0%</TableCell>
                    <TableCell align="center" sx={TABLE_TD}>–</TableCell><TableCell sx={TABLE_TD}></TableCell>
                    <TableCell align="center" sx={TABLE_TD}>–</TableCell><TableCell sx={TABLE_TD}></TableCell>
                    <TableCell align="center" sx={TABLE_TD}>22</TableCell><TableCell align="center" sx={TABLE_TD}>60</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Stack>
      )
    }

    if (syllabusSub === 'grading') {
      return (
        <SectionCard title="Grade Equivalence Scale">
          <Grid container spacing={4}>
            <Grid item xs={12} md={8}>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E0E0E0' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#FAFAFA' }}>
                    <TableRow>
                      <TableCell sx={TABLE_TH}>Grade</TableCell>
                      <TableCell sx={TABLE_TH}>Description</TableCell>
                      <TableCell sx={TABLE_TH}>Range</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[
                      ['1.00', 'Excellent', '98 - 100'],
                      ['1.25', 'Superior', '94 - 97'],
                      ['1.5', 'Very Good', '90 - 93'],
                      ['1.75', 'Good', '88 - 89'],
                      ['2.00', 'Meritorious', '85 - 87'],
                      ['2.25', 'Very Satisfactory', '83 - 84'],
                      ['2.50', 'Satisfactory', '80 - 82'],
                      ['2.75', 'Fairly Satisfactory', '78 - 79'],
                      ['3.00', 'Passing', '75 - 77'],
                      ['5.00', 'Failure', 'Below 70'],
                      ['INC', 'Incomplete', 'INC']
                    ].map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell sx={TABLE_TD}><TextField size="small" value={row[0]} InputProps={{ readOnly: true }} sx={{ width: '80px', '& fieldset': { border: 'none'} }} /></TableCell>
                        <TableCell sx={TABLE_TD}><TextField size="small" value={row[1]} InputProps={{ readOnly: true }} fullWidth sx={{ '& fieldset': { border: 'none'} }} /></TableCell>
                        <TableCell sx={TABLE_TD}><TextField size="small" value={row[2]} InputProps={{ readOnly: true }} sx={{ width: '100px', '& fieldset': { border: 'none'} }} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ bgcolor: '#FDECEC', p: 3, borderRadius: 2, borderLeft: '4px solid #8B0000', mb: 3 }}>
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                  <Typography sx={{ fontWeight: 700, color: '#8B0000' }}>Passing grade:</Typography>
                  <TextField size="small" value="75" sx={{ width: '80px', bgcolor: 'white', borderRadius: 1 }} />
                </Stack>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Students scoring 70–74 receive a remedial activity. Final grade shall be 3.0 or 5.0. No rounding off allowed.
                </Typography>
              </Box>
              <Stack spacing={1}>
                <Stack direction="row" alignItems="center"><Checkbox size="small" /> <Typography variant="body2">Use plus/minus grades</Typography></Stack>
                <Stack direction="row" alignItems="center"><Checkbox size="small" /> <Typography variant="body2">Enable remedial activities (70–74)</Typography></Stack>
                <Stack direction="row" alignItems="center"><Checkbox size="small" /> <Typography variant="body2">Round final grades</Typography></Stack>
              </Stack>
            </Grid>
          </Grid>
        </SectionCard>
      )
    }

    if (syllabusSub === 'policies') {
      return (
        <SectionCard title="Class Policies" action={<AddRowBtn label="Add Policy" onClick={() => addSylItem('policies', EMPTY_POLICY)} />}>
          <Stack spacing={2}>
            {syllabusData.policies.map((p, i) => (
              <Box key={i} sx={{ border: '1px solid #E0E0E0', borderRadius: 2, p: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
                  <LField label="Policy Title" value={p.title} onChange={e => setSylArrObj('policies', i, 'title', e.target.value)} />
                  <RemoveBtn onClick={() => removeSylItem('policies', i)} disabled={syllabusData.policies.length <= 1} />
                </Box>
                <LField label="Policy Content" multiline minRows={4} value={p.content} onChange={e => setSylArrObj('policies', i, 'content', e.target.value)} />
              </Box>
            ))}
          </Stack>
        </SectionCard>
      )
    }

    return null;
  }

  function renderCenterPanel() {
    if (!courseId) {
      return (
        <Paper elevation={0} sx={{ border: '1px solid #E0E0E0', borderRadius: 4, p: 4, background: '#fff', boxShadow: 'none' }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>No Course Selected</Typography>
          <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>Go back and select a course.</Typography>
          <Button variant="outlined" onClick={() => navigate('/faculty/dashboard')} sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none' }}>Back to Courses</Button>
        </Paper>
      )
    }

    if (activeTab === 'syllabus') {
      const showSaveFooter = isDirty
      const showAiFooter   = Boolean(aiField) && !AI_EXCLUDED_SECTIONS.has(syllabusSub)
      const totalFooterPb  = (showSaveFooter ? 72 : 0) + (showAiFooter ? 60 : 0)
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#fff' }}>
          <Box sx={{ flex: 1, overflow: 'auto', p: 3, pb: totalFooterPb > 0 ? `${totalFooterPb}px` : 3 }}>
            
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
              <Tabs
                value={syllabusSub}
                onChange={(e, val) => setSyllabusSub(val)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  '& .MuiTabs-indicator': { backgroundColor: MAROON, height: 3 },
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    color: 'text.secondary',
                    minWidth: 'auto',
                    px: 2,
                    '&.Mui-selected': { color: MAROON }
                  }
                }}
              >
                {SYLLABUS_SECTIONS.map(s => <Tab key={s.key} value={s.key} label={s.label} />)}
              </Tabs>
            </Box>

            {renderSyllabusSection()}
          </Box>

          {showSaveFooter && (
            <Box sx={{ position: 'sticky', bottom: showAiFooter ? 76 : 16, background: '#fff', border: '1px solid #E0E0E0', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, zIndex: 10, borderRadius: 2, mx: 3, mb: 3 }}>
              {saveError ? <> <Typography variant="caption" sx={{ color: '#c62828', flex: 1 }}>{saveError}</Typography> <IconButton size="small" onClick={() => setSaveError('')} sx={{ color: '#c62828', p: 0.25 }}><span style={{ fontSize: '0.9rem', lineHeight: 1 }}>✕</span></IconButton> </> : <Typography variant="caption" sx={{ color: '#666', flex: 1 }}>You have unsaved changes in this syllabus.</Typography>}
              <Button variant="outlined" size="small" disabled={saveLoading} onClick={() => { setIsDirty(false); setSaveSuccess(false); workspaceApi.execute() }} sx={{ textTransform: 'none', borderColor: '#ccc', color: '#666', borderRadius: 1.5 }}>Discard</Button>
              <Button variant="contained" size="small" disabled={saveLoading} onClick={handleSaveSyllabus} sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6B0000' }, textTransform: 'none', fontWeight: 700, borderRadius: 1.5, minWidth: 100, boxShadow: 'none' }}>{saveLoading ? 'Saving...' : 'Save Syllabus'}</Button>
            </Box>
          )}

          {showAiFooter && (
            <Box sx={{ position: 'sticky', bottom: 16, background: '#111', border: '1px solid #333', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 20, minHeight: 60, borderRadius: 2, mx: 3, mb: 3 }}>
              <AutoAwesomeIcon sx={{ color: '#fff', fontSize: '1.1rem', flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: '#999', display: 'block', lineHeight: 1, mb: 0.15 }}>AI Assist</Typography>
                <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{aiField.label}</Typography>
              </Box>
              {aiError && <Typography variant="caption" sx={{ color: '#ef9a9a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aiError}</Typography>}
              <Select size="small" value={aiProvider} onChange={e => setAiProvider(e.target.value)} sx={{ bgcolor: '#333', color: '#fff', fontSize: '0.75rem', height: 30, borderRadius: 1, minWidth: 110, flexShrink: 0, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' }, '& .MuiSvgIcon-root': { color: '#fff' } }}>{AI_PROVIDERS.map(p => <MenuItem key={p} value={p} sx={{ fontSize: '0.75rem' }}>{cap(p)}</MenuItem>)}</Select>
              {getAiCurrentValue() && <Button size="small" variant="outlined" disabled={aiGenerating} onClick={() => handleAiGenerate('continue')} sx={{ textTransform: 'none', color: '#fff', borderColor: '#666', borderRadius: 1, fontSize: '0.75rem', py: 0.25, px: 1.25, flexShrink: 0 }}>Continue</Button>}
              <Button size="small" variant="contained" disabled={aiGenerating} onClick={() => handleAiGenerate('generate')} sx={{ bgcolor: '#fff', color: '#111', textTransform: 'none', borderRadius: 1, fontSize: '0.75rem', py: 0.3, px: 1.5, fontWeight: 700, flexShrink: 0, boxShadow: 'none' }}>{aiGenerating ? 'Generating...' : 'Generate'}</Button>
              <IconButton size="small" onClick={() => setAiField(null)} sx={{ color: '#999', p: 0.5, flexShrink: 0 }}><span style={{ fontSize: '0.85rem', lineHeight: 1 }}>✕</span></IconButton>
            </Box>
          )}
        </Box>
      )
    }

    if (activeTab === 'module') {
      return (
        <Stack spacing={3} sx={{ p: 3, bgcolor: '#fff', height: '100%', overflow: 'auto' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#111', fontSize: '0.9rem' }}>MODULE BUILDER</Typography>
          <Box sx={{ border: '1px solid #E0E0E0', borderRadius: 2, p: 3, bgcolor: '#FAFAFA' }}>
            <Stack spacing={2}>
              <LField label="Module Topic" value={moduleParams.module_title} onChange={e => setModuleParams(p => ({ ...p, module_title: e.target.value }))} />
              <LField type="number" label="Week Number" value={moduleParams.week_number} onChange={e => setModuleParams(p => ({ ...p, week_number: e.target.value }))} />
              <LField type="number" label="Knowledge References (top-k)" value={moduleParams.top_k} onChange={e => setModuleParams(p => ({ ...p, top_k: e.target.value }))} />
              <LField select label="Model Provider" value={moduleParams.provider} onChange={e => setModuleParams(p => ({ ...p, provider: e.target.value }))}>
                {PROVIDERS.map(p => <MenuItem key={p} value={p}>{cap(p)}</MenuItem>)}
              </LField>
              <LField label="Extra Instructions" multiline minRows={3} value={moduleParams.extra_instructions} onChange={e => setModuleParams(p => ({ ...p, extra_instructions: e.target.value }))} />
              <GenButton onClick={handleGenerateModule} disabled={actionLoading || !moduleParams.module_title.trim()}>{actionLoading ? 'Generating...' : 'Generate Module'}</GenButton>
            </Stack>
          </Box>
        </Stack>
      )
    }

    if (activeTab === 'assessment') {
      // Show the Exam Editor exactly as requested
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#fff' }}>
          {/* Editor Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', p: { xs: 2, md: 3 }, py: 2, borderBottom: '1px solid #E0E0E0' }}>
            <IconButton sx={{ mr: 2, color: '#333', border: '1px solid #E0E0E0', borderRadius: 2, bgcolor: '#fff' }}><ArrowBackIcon /></IconButton>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" sx={{ color: '#666', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>prelim examination · 1 items</Typography>
              <Typography variant="h5" sx={{ color: MAROON, fontWeight: 800, lineHeight: 1.2 }}>BAT 404 Prelim Examination</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 800, color: MAROON }}>1/60</Typography>
              <Typography variant="body2" sx={{ color: '#666', fontWeight: 600, fontSize: '0.8rem' }}>59 left</Typography>
              <Button variant="outlined" startIcon={<AddIcon />} size="small" sx={{ borderColor: '#E0E0E0', color: MAROON, textTransform: 'none', borderRadius: 2, fontWeight: 700 }}>Add Item</Button>
              <Button variant="outlined" startIcon={<InsertDriveFileIcon />} size="small" sx={{ borderColor: '#E0E0E0', color: MAROON, textTransform: 'none', borderRadius: 2, fontWeight: 700 }}>Export DOCX</Button>
            </Box>
          </Box>
          
          {/* Scrollable Editor Canvas */}
          <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 4 }, bgcolor: '#F7F9FC' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#666', mb: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>INTRODUCTION TO ANALYTICAL TOOLS AND TECHNIQUES (1 ITEMS)</Typography>
              <Chip label="Remember: 1" size="small" sx={{ color: MAROON, bgcolor: MAROON_LIGHT, fontWeight: 800, mb: 2, borderRadius: 2, border: 'none', px: 0.5 }} />
              
              {/* Question Card */}
              <Paper elevation={0} sx={{ p: 3, borderRadius: 2, border: '1px solid #E0E0E0', bgcolor: '#fff' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="caption" sx={{ color: '#999', fontWeight: 600 }}>Item 1</Typography>
                  <Button size="small" startIcon={<EditIcon sx={{ fontSize: '1rem' }} />} sx={{ color: MAROON, textTransform: 'none', fontWeight: 700, minWidth: 0 }}>Edit</Button>
                </Box>
                <Typography variant="body1" sx={{ fontWeight: 800, mb: 1, color: '#111' }}>1. In the context of customer analytics classification models, which of the following best describes the primary purpose of a classification model?</Typography>
                <Typography variant="caption" sx={{ color: '#888', mb: 3, display: 'block' }}>Bloom: Remember (define) Grounded on module: <span style={{ color: '#A95C00' }}>Customer Analytics Classification Models (Week 1)</span></Typography>
                <Stack spacing={1} sx={{ mb: 4 }}>
                  {['A. To identify groups of similar customers based on unsupervised learning without predefined categories', 'B. To predict whether a customer belongs to a specific predefined category or class based on their features and historical data', 'C. To discover hidden patterns in transactional data through association rule mining', 'D. To reduce the dimensionality of customer data for visualization purposes only', 'E. To calculate the average spending behavior of all customers in a dataset'].map((choice, i) => (
                    <Typography key={i} variant="body2" sx={{ color: '#333', lineHeight: 1.5 }}>{choice}</Typography>
                  ))}
                </Stack>
                <Typography variant="body2" sx={{ color: '#2E7D32', fontWeight: 800, mb: 1 }}>Correct Answer: B</Typography>
                <Typography variant="body2" sx={{ color: '#666', lineHeight: 1.6 }}>Explanation: B. To predict whether a customer belongs to a specific predefined category or class based on their features and historical data. This definition aligns with the fundamental concept of classification models in customer analytics, where the model learns from labeled historical data to assign new customers to predetermined classes (such as high-value or low-value customers), directly supporting ILO2 (developing and implementing predictive models) and ILO3 (explaining analytical model insights).</Typography>
              </Paper>
          </Box>
        </Box>
      )
    }

    return null
  }

  // ── Right panel ───────────────────────────────────────────────────────────
  function renderUploadPanel() {
    if (activeTab === 'assessment') {
       // Return the Assessment Tools sidebar
       return (
         <Box sx={{ p: 2, pt: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#111' }}>Assessment Tools</Typography>
              <Switch size="small" defaultChecked />
            </Box>
            <Tabs value={0} variant="fullWidth" sx={{ borderBottom: '1px solid #E0E0E0', mb: 3, minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.8rem', fontWeight: 700, textTransform: 'none', color: '#666' }, '& .Mui-selected': { color: '#1976D2' }, '& .MuiTabs-indicator': { bgcolor: '#1976D2' } }}>
              <Tab label="Builder" />
              <Tab label="Manual" />
              <Tab label="Sources" />
            </Tabs>
            
            <Box sx={{ flex: 1, overflow: 'auto', px: 0.5, pb: 4 }}>
              {/* Progress Box */}
              <Paper elevation={0} sx={{ p: 2, bgcolor: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 2, mb: 3 }}>
                <Typography variant="caption" sx={{ color: '#666', fontWeight: 600 }}>Progress</Typography>
                <Typography variant="h5" sx={{ color: MAROON, fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>1/60</Typography>
                <Typography variant="caption" sx={{ color: '#888' }}>59 items left</Typography>
              </Paper>

              <Stack spacing={2.5}>
                <LField select label="Major Examination" value="prelim" InputLabelProps={{ sx: { background: '#fff', px: 0.5 } }}>
                  <MenuItem value="prelim">Prelim Examination (60 items)</MenuItem>
                </LField>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5 }}>
                  <LField label="Target Item" value="2" />
                  <LField label="Current" value="1" />
                  <LField label="Remaining" value="59" />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 1.5 }}>
                  <LField label="Target Item Number" value="2" />
                  <LField select label="Related to Item (opt...)" value="" />
                </Box>
                <LField label="Relation Instruction" multiline minRows={2} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Checkbox size="small" defaultChecked sx={{ p: 0, color: MAROON, '&.Mui-checked': { color: MAROON } }} />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#333' }}>Overwrite existing item</Typography>
                </Box>
                <LField label="Extra Instructions" multiline minRows={3} />
                <LField select label="Model Provider" value="Anthropic">
                  <MenuItem value="Anthropic">Anthropic</MenuItem>
                  <MenuItem value="OpenAI">OpenAI</MenuItem>
                </LField>
                <GenButton sx={{ py: 1.5 }}>Generate Item</GenButton>
              </Stack>
            </Box>
         </Box>
       )
    }

    const docs = docsApi.data?.documents || []
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.62rem', display: 'block' }}>Course Knowledge Base</Typography>
        <AutoAlert message={uploadError} onClose={() => setUploadError('')} sx={{ fontSize: '0.8rem' }} />
        <AutoAlert message={uploadSuccess} severity="success" onClose={() => setUploadSuccess('')} sx={{ fontSize: '0.8rem' }} />
        {uploadStatus  && (
          <Box>
            <Typography variant="caption" sx={{ color: uploading ? '#1565C0' : '#2E7D32', display: 'block', mb: 0.75 }}>{uploadStatus}</Typography>
            {uploading && <LinearProgress variant="determinate" value={uploadProgress} sx={{ bgcolor: '#f5f5f5', '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />}
          </Box>
        )}

        <Box component="form" onSubmit={handleUpload}>
          <Stack spacing={1.5}>
            <Button variant="outlined" component="label" disabled={uploading} fullWidth sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none', borderRadius: 1.5, '&:hover': { bgcolor: MAROON_LIGHT, borderColor: MAROON } }}>
              Choose File
              <input hidden type="file" accept=".pdf,.docx" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
            </Button>
            <Typography variant="caption" sx={{ color: uploadFile ? '#333' : 'rgba(0,0,0,0.5)', px: 0.5 }}>{uploadFile ? uploadFile.name : 'PDF or DOCX only'}</Typography>
            <LField label="Module Tag (optional)" value={uploadForm.module_tag} onChange={e => setUploadForm(p => ({ ...p, module_tag: e.target.value }))} />
            <LField label="Term Tag (optional)" value={uploadForm.term_tag} onChange={e => setUploadForm(p => ({ ...p, term_tag: e.target.value }))} />
            <Button type="submit" variant="contained" disabled={uploading || !uploadFile} sx={{ bgcolor: '#E0E0E0', color: '#999', boxShadow: 'none', textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
              {uploading ? 'Uploading...' : 'Upload to Knowledge Base'}
            </Button>
          </Stack>
        </Box>

        {docs.length > 0 && (
          <Box>
            <Typography variant="caption" sx={{ color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.62rem', display: 'block', mb: 1 }}>Uploaded ({docs.length})</Typography>
            <Stack spacing={0.5}>
              {docs.map((doc, i) => (
                <Box key={doc.id || doc.records_id || i} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: '#fff', border: '1px solid #E0E0E0', borderRadius: 1.5 }}>
                  <InsertDriveFileIcon sx={{ fontSize: 15, color: MAROON, flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.storage_path || doc.file_name || 'Unnamed file'}</Typography>
                  <Chip label={doc.rag_status || 'OK'} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: doc.rag_status === 'COMPLETED' ? '#F5F5F5' : '#FFF3E0', color: doc.rag_status === 'COMPLETED' ? '#666' : '#E65100' }} />
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Stack>
    )
  }

  const actualLeftWidth = isCollapsed ? 80 : leftWidth

  const sidebarContent = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', padding: isCollapsed ? '0' : '0 8px 0 20px', borderBottom: '1px solid rgba(0,0,0,0.08)', minHeight: 57, boxSizing: 'border-box' }}>
        {!isCollapsed && <Typography sx={{ fontWeight: 800, color: '#888', letterSpacing: '0.05em', fontSize: '0.85rem' }}>WORKSPACE</Typography>}
        <IconButton onClick={() => setIsCollapsed(!isCollapsed)} size="small" sx={{ color: '#444' }}><MenuIcon /></IconButton>
      </div>

      <List sx={{ flex: 1, px: 1, py: 1, overflowX: 'hidden' }}>
        {WORKSPACE_TABS.map(({ key, label, Icon }) => {
          const isActive = activeTab === key
          return (
            <ListItem key={key} disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={isCollapsed ? label : ''} placement="right" disableHoverListener={!isCollapsed}>
              <ListItemButton
                onClick={() => { setActiveTab(key); setMobileNavOpen(false) }}
                sx={{ borderRadius: 1.5, py: 1, px: isCollapsed ? 0 : 2, justifyContent: isCollapsed ? 'center' : 'flex-start', background: isActive ? MAROON_LIGHT : 'transparent', color: isActive ? MAROON : 'rgba(0,0,0,0.7)', '&:hover': { background: MAROON_LIGHT, color: MAROON } }}
              >
                <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, mr: isCollapsed ? 0 : 1, justifyContent: 'center', color: isActive ? MAROON : 'rgba(0,0,0,0.7)' }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                {!isCollapsed && <ListItemText primary={label} primaryTypographyProps={{ fontSize: '0.88rem', fontWeight: isActive ? 800 : 600 }} />}
                {isActive && <div style={{ position: 'absolute', left: 0, width: 3, height: 20, background: MAROON, borderRadius: '0 2px 2px 0' }} />}
              </ListItemButton>
              </Tooltip>
            </ListItem>
          )
        })}
      </List>
    </div>
  )

  return (
    <Box ref={containerRef} sx={{ height: '100vh', background: BG, display: 'flex', overflow: 'hidden' }}>
      <style>{`
        .MuiTypography-root { color: #111 !important; }
        .MuiTypography-colorTextSecondary { color: rgba(0,0,0,0.6) !important; }
        .MuiInputBase-root { color: #111 !important; }
      `}</style>

      {/* Left Sidebar */}
      <Box sx={{ width: isMobile ? 0 : actualLeftWidth, transition: 'width 0.2s', overflowX: 'hidden', flexShrink: 0, display: isMobile ? 'none' : 'block', background: '#fff', borderRight: '1px solid #E0E0E0', position: 'relative' }}>
        {sidebarContent}
      </Box>

      {/* Middle Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* We hide the App Bar entirely for the Assessment Tab to match your screenshot perfectly */}
        {activeTab !== 'assessment' && (
          <AppBar position="sticky" elevation={0} sx={{ background: '#fff', borderBottom: '1px solid #E0E0E0', zIndex: (theme) => theme.zIndex.drawer - 1 }}>
            <Toolbar sx={{ gap: 2, minHeight: '56px !important' }}>
              {isMobile && <IconButton edge="start" onClick={() => setMobileNavOpen(true)} sx={{ display: { md: 'none' }, color: '#333' }}><MenuIcon /></IconButton>}
              
              <Tooltip title="Back to courses">
                <IconButton onClick={() => navigate('/faculty/dashboard')} size="small" sx={{ color: '#333' }}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              {course ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="caption" sx={{ color: '#333', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{syllabusData.course_code || course.course_code}</Typography>
                  <Typography variant="body2" sx={{ color: '#666', fontWeight: 500 }} noWrap>{syllabusData.course_title || course.course_title}</Typography>
                </Box>
              ) : courseId ? <CircularProgress size={14} sx={{ color: MAROON }} /> : null}
              <Box sx={{ flex: 1 }} />
              {isMobile && <Tooltip title="Knowledge Base"><IconButton onClick={() => setMobileUploadOpen(true)} size="small" sx={{ color: MAROON, mr: 0.5 }}><CloudUploadIcon fontSize="small" /></IconButton></Tooltip>}
              <Tooltip title="Account">
                <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0.5 }}>
                  <Avatar sx={{ width: 32, height: 32, background: MAROON, fontSize: '0.78rem', fontWeight: 700 }}>{toInitials(user?.name || user?.email || 'U')}</Avatar>
                </IconButton>
              </Tooltip>
              <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }} PaperProps={{ sx: { mt: 1, borderRadius: 2, minWidth: 180, background: '#fff', border: '1px solid #E0E0E0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', color: '#111' } }}>
                <MenuItem disabled sx={{ opacity: 1, pb: 0 }}><div><Typography variant="body2" fontWeight={700} sx={{ color: '#111' }}>{user?.name}</Typography><Typography variant="caption" sx={{ color: 'rgba(0,0,0,0.6)' }}>{user?.email}</Typography></div></MenuItem>
                <Divider sx={{ my: 1 }} />
                <MenuItem onClick={() => setAnchorEl(null)}><AccountCircleIcon fontSize="small" sx={{ mr: 1.5, color: 'rgba(0,0,0,0.6)' }} /> Profile</MenuItem>
                <MenuItem onClick={() => { logout(); navigate('/signin') }} sx={{ color: MAROON }}><LogoutIcon fontSize="small" sx={{ mr: 1.5 }} /> Sign Out</MenuItem>
              </Menu>
            </Toolbar>
          </AppBar>
        )}

        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: dragging ? 'none' : 'auto' }}>
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderCenterPanel()}
          </Box>

          {!isMobile && (
            <Box onMouseDown={() => setDragging('right')} sx={{ width: 4, flexShrink: 0, cursor: 'col-resize', bgcolor: dragging === 'right' ? '#E0E0E0' : 'transparent', '&:hover': { bgcolor: '#E0E0E0' }, transition: 'background-color 0.15s' }} />
          )}

          <Box sx={{ width: isMobile ? 0 : (rightOpen ? rightWidth : 40), display: isMobile ? 'none' : 'block', flexShrink: 0, background: '#fff', borderLeft: '1px solid #E0E0E0', overflow: 'hidden', transition: 'width 0.18s ease' }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: activeTab === 'assessment' ? 0 : 36, borderBottom: rightOpen && activeTab !== 'assessment' ? '1px solid transparent' : 'none' }}>
              {activeTab !== 'assessment' && (
                <Tooltip title={rightOpen ? 'Close sidebar' : 'Open sidebar'}>
                  <IconButton onClick={() => setRightOpen(r => !r)} size="small" sx={{ color: '#666' }}><MenuIcon fontSize="small" /></IconButton>
                </Tooltip>
              )}
            </Box>
            {rightOpen && <Box sx={{ height: activeTab === 'assessment' ? '100%' : 'calc(100% - 36px)', overflow: 'auto' }}>{renderUploadPanel()}</Box>}
          </Box>
        </Box>
      </Box>

      <Drawer anchor="left" open={isMobile && mobileNavOpen} onClose={() => setMobileNavOpen(false)} PaperProps={{ sx: { width: 240 } }}>{sidebarContent}</Drawer>
      <Drawer anchor="right" open={isMobile && mobileUploadOpen} onClose={() => setMobileUploadOpen(false)} PaperProps={{ sx: { width: 300 } }}><Box sx={{ p: 2 }}>{renderUploadPanel()}</Box></Drawer>
    </Box>
  )
}