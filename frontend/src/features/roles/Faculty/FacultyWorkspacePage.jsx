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
import GradeIcon from '@mui/icons-material/Grade'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MenuIcon from '@mui/icons-material/Menu'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import BarChartIcon from '@mui/icons-material/BarChart'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import useApi from '../hooks/useApi'
import api from '../config/api'
import { useAuth } from '../store/authStore'
import { toInitials, extractApiError } from '../utils'
import atlasLogo from '../assets/atlas-logo.png'

// ── Constants ─────────────────────────────────────────────────────────────
const MAROON = '#ff2d55'
const MAROON_LIGHT = 'rgba(255, 45, 85, 0.15)'
const BG = 'transparent'

const WORKSPACE_TABS = [
  { key: 'syllabus',   label: 'Syllabus',    Icon: MenuBookIcon },
  { key: 'module',     label: 'Modules',     Icon: ViewModuleIcon },
  { key: 'assessment', label: 'Assessments', Icon: AssignmentIcon },
  { key: 'grading',    label: 'Grading',     Icon: GradeIcon },
  { key: 'analytics',  label: 'Analytics',   Icon: BarChartIcon },
]

const SYLLABUS_SECTIONS = [
  { key: 'header',          label: 'Header Info' },
  { key: 'direction',       label: 'University Direction' },
  { key: 'specs',           label: 'Course Specifications' },
  { key: 'overview',        label: 'Course Overview' },
  { key: 'strategies',      label: 'Assessment & Strategies' },
  { key: 'outcomes',        label: 'Expected Outcomes' },
  { key: 'references',      label: 'References & Frameworks' },
  { key: 'policies',        label: 'Course Policies' },
  { key: 'tla_activities',  label: 'TLA Activities' },
  { key: 'schedules',       label: 'Schedules & Mappings' },
]

const PROVIDERS = ['ollama', 'gemini', 'gpt', 'groq', 'anthropic', 'openrouter']
const AI_PROVIDERS = ['gemini', 'anthropic', 'groq', 'gpt']
const AI_EXCLUDED_SECTIONS = new Set(['header', 'specs', 'schedules'])
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

const EMPTY_TASK    = { code: '', task: '', ird: '', weight: '', ilo_values: [], c: '', p: '', a: '' }
const EMPTY_ATTR    = { code: '', title: '', description: '' }
const EMPTY_POLICY  = { title: '', content: '' }
const EMPTY_CHAPTER = { chapter: '', topics: '', weeks: '', outcomes: '', ilo: '', so: '', delivery: '' }

const SCHEDULE_WEEKS = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]

const TABLE_TH = {
  padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: 'rgba(255,255,255,0.05)', color: '#ffffff', fontWeight: 700, fontSize: '0.75rem', textAlign: 'left', whiteSpace: 'nowrap',
}
const TABLE_TD = {
  padding: '3px 5px', borderBottom: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top', color: 'rgba(255,255,255,0.8)'
}

const EMPTY_SYLLABUS = {
  // 1. Header & Institutional Info
  university_name: 'Republic of the Philippines\nBatangas State University (The National Engineering University)\nBatStateU-Lipa Campus',
  college: 'College of Informatics and Computing Sciences',
  program: 'Bachelor of Science in Information Technology',
  document_title: 'Course Information Syllabus (CIS)',
  // 2. University Direction
  vision: '', mission: '',
  // 3. Course Specifications
  course_title: '', course_code: '', course_category: '', prerequisites: '',
  semester_year: '', credit_hours: '', instructor_name: '',
  contact_info: '', education: '',
  reference_cmo: '', date_prepared: '', revision_no: '', revision_date: '', period_of_study: '',
  // 4. Course Overview
  description: '', lecture_hours: '', lab_hours: '',
  // 5. Assessment & Strategies
  assessment_criteria: '', tlas: '',
  // 6. Expected Outcomes
  ilos: [''],
  assessment_tasks: [{ ...EMPTY_TASK, ilo_values: [''] }],
  // 7. References & Frameworks
  references: [''],
  igas:             [{ ...EMPTY_ATTR }],
  student_outcomes: [{ ...EMPTY_ATTR }],
  cdio_skills:      [{ ...EMPTY_ATTR }],
  sdg_skills:       [{ ...EMPTY_ATTR }],
  // 8. Course Policies
  grading_rows:   DEFAULT_GRADING_ROWS.map(r => ({ ...r })),
  policies:       [{ title: 'Class Policies', content: '' }],
  other_policies: '',
  // 9. TLA Activities
  tla_chapters: [{ ...EMPTY_CHAPTER }],
  // 10. Schedules & Mappings
  schedule_methods:  [{ name: 'Major Examinations', values: Array(16).fill('') }],
  so_headers:        [''],
  so_cpa_rows:       [{ so_vals: [''], c: '', p: '', a: '' }],
  iga_headers:       [''],
  iga_rows:          [{ vals: [''] }],
  cdio_headers:      [''],
  sdg_headers:       [''],
  cdio_sdg_rows:     [{ cdio_vals: [''], sdg_vals: [''] }],
}

// ── Shared sub-components ─────────────────────────────────────────────────
function SectionCard({ title, children, action }) {
  return (
    <Paper elevation={0}
      sx={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, mb: 2, overflow: 'hidden', background: 'rgba(30, 30, 35, 0.4)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: '0 8px 32px 0 rgba(0,0,0,0.3)', color: '#fff' }}>
      <Box sx={{ px: 2.5, py: 1.25, bgcolor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center' }}>
        <Typography variant="subtitle2"
          sx={{ fontWeight: 700, color: '#fff', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
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
          color: '#fff',
          '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
          '&.Mui-focused fieldset': { borderColor: MAROON },
        },
        '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.6)' },
        '& .MuiInputLabel-root.Mui-focused': { color: MAROON },
        ...props.sx,
      }}
      SelectProps={{ MenuProps: { PaperProps: { sx: { bgcolor: 'rgba(30,30,35,0.9)', backdropFilter: 'blur(20px)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } } }, ...props.SelectProps }}
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

function inlineInput(value, onChange, minWidth = 80, onFocus) {
  return (
    <TextField size="small" value={value} onChange={onChange} onFocus={onFocus}
      sx={{
        minWidth,
        '& .MuiOutlinedInput-root': {
          fontSize: '0.8rem',
          color: '#fff',
          '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
          '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.4)' },
          '&.Mui-focused fieldset': { borderColor: MAROON },
        },
      }}
      inputProps={{ style: { padding: '5px 8px' } }}
    />
  )
}

// ── Progress Checker ──────────────────────────────────────────────────────
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
    case 'header':         return check(['university_name', 'college', 'program'])
    case 'direction':      return check(['vision', 'mission'])
    case 'specs':          return check(['course_title', 'course_code'])
    case 'overview':       return check(['description'])
    case 'strategies':     return check(['assessment_criteria', 'tlas'])
    case 'outcomes':       return check(['ilos'])
    case 'references':     return check(['references'])
    case 'policies':       return check(['policies'])
    case 'tla_activities': return check(['tla_chapters'])
    case 'schedules':      return check(['schedule_methods'])
    default:               return false
  }
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

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [leftWidth, setLeftWidth]   = useState(240)
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

  // ── AI footer state ─────────────────────────────────────────────────────
  // aiField: null | { section, label, fieldType, field, arrField, arrIndex, arrObjKey }
  const [aiField, setAiField]         = useState(null)
  const [aiProvider, setAiProvider]   = useState('gemini')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError]         = useState('')

  // ── Syllabus upload (parse) state ────────────────────────────────────────
  const syllabusUploadRef                   = useRef(null)
  const [syllabusUploading, setSyllabusUploading]     = useState(false)
  const [syllabusUploadError, setSyllabusUploadError] = useState('')
  const [syllabusUploadSuccess, setSyllabusUploadSuccess] = useState(false)

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

  // Normalize raw syllabus data — migrates old formats and initialises all structured fields
  function normalizeSyllabusData(raw) {
    if (!raw) return { ...EMPTY_SYLLABUS }
    const iloCount = Math.max(1, (raw.ilos || ['']).length)

    // 1. assessment_tasks: old ilo1/ilo2/domain → ilo_values / c / p / a
    const normTasks = (tasks) => (tasks || []).map(t => {
      if (Array.isArray(t.ilo_values)) return t
      const iloVals = Array.from({ length: iloCount }, (_, i) => t[`ilo${i + 1}`] || '')
      return { code: t.code || '', task: t.task || '', ird: t.ird || '', weight: t.weight || '',
               ilo_values: iloVals, c: '', p: '', a: t.domain || '' }
    })

    // 2. tla_chapters: old {chapter,description} → new column model
    const normChapters = (chapters) => (chapters || []).map(ch => {
      if ('topics' in ch) return ch
      return { chapter: ch.chapter || '', topics: ch.description || '', weeks: '', outcomes: '', ilo: '', so: '', delivery: '' }
    })

    // 3. SO/CPA mapping rows (one per ILO)
    const soHeaders = raw.so_headers || ['']
    const normSoCpa = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.so_cpa_rows || [])[i] || {}
      return {
        so_vals: Array.from({ length: soHeaders.length }, (_, j) => (ex.so_vals || [])[j] || ''),
        c: ex.c || '', p: ex.p || '', a: ex.a || '',
      }
    })

    // 4. IGA mapping rows
    const igaHeaders = raw.iga_headers || ['']
    const normIga = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.iga_rows || [])[i] || {}
      return { vals: Array.from({ length: igaHeaders.length }, (_, j) => (ex.vals || [])[j] || '') }
    })

    // 5. CDIO/SDG mapping rows
    const cdioHeaders = raw.cdio_headers || ['']
    const sdgHeaders  = raw.sdg_headers  || ['']
    const normCdioSdg = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.cdio_sdg_rows || [])[i] || {}
      return {
        cdio_vals: Array.from({ length: cdioHeaders.length }, (_, j) => (ex.cdio_vals || [])[j] || ''),
        sdg_vals:  Array.from({ length: sdgHeaders.length  }, (_, j) => (ex.sdg_vals  || [])[j] || ''),
      }
    })

    // 6. Assessment schedule methods
    const normSchedule = (raw.schedule_methods || []).length
      ? raw.schedule_methods.map(m => ({
          name: m.name || '',
          values: Array.from({ length: 16 }, (_, j) => (m.values || [])[j] || ''),
        }))
      : [{ name: 'Major Examinations', values: Array(16).fill('') }]

    const normTasksResult = normTasks(raw.assessment_tasks || [])
    const normChaptersResult = normChapters(raw.tla_chapters || [])

    return {
      ...EMPTY_SYLLABUS, ...raw,
      assessment_tasks: normTasksResult.length
        ? normTasksResult
        : [{ ...EMPTY_TASK, ilo_values: Array(iloCount).fill('') }],
      tla_chapters: normChaptersResult.length ? normChaptersResult : [{ ...EMPTY_CHAPTER }],
      schedule_methods: normSchedule,
      so_headers:    soHeaders,    so_cpa_rows:   normSoCpa,
      iga_headers:   igaHeaders,   iga_rows:      normIga,
      cdio_headers:  cdioHeaders,  sdg_headers:   sdgHeaders,
      cdio_sdg_rows: normCdioSdg,
    }
  }

  // Add an ILO and extend every assessment task and mapping row in sync
  function addIlo() {
    setIsDirty(true); setSaveSuccess(false)
    setSyllabusData(s => {
      const soLen   = (s.so_headers   || ['']).length
      const igaLen  = (s.iga_headers  || ['']).length
      const cdioLen = (s.cdio_headers || ['']).length
      const sdgLen  = (s.sdg_headers  || ['']).length
      return {
        ...s,
        ilos: [...s.ilos, ''],
        assessment_tasks: s.assessment_tasks.map(t => ({
          ...t, ilo_values: [...(t.ilo_values || []), ''],
        })),
        so_cpa_rows:   [...(s.so_cpa_rows   || []), { so_vals: Array(soLen).fill(''),   c: '', p: '', a: '' }],
        iga_rows:      [...(s.iga_rows      || []), { vals: Array(igaLen).fill('') }],
        cdio_sdg_rows: [...(s.cdio_sdg_rows || []), { cdio_vals: Array(cdioLen).fill(''), sdg_vals: Array(sdgLen).fill('') }],
      }
    })
  }

  // Remove an ILO and remove the matching row from all mapping tables
  function removeIlo(i) {
    if (syllabusData.ilos.length <= 1) return
    setIsDirty(true); setSaveSuccess(false)
    setSyllabusData(s => ({
      ...s,
      ilos: s.ilos.filter((_, j) => j !== i),
      assessment_tasks: s.assessment_tasks.map(t => ({
        ...t, ilo_values: (t.ilo_values || []).filter((_, j) => j !== i),
      })),
      so_cpa_rows:   (s.so_cpa_rows   || []).filter((_, j) => j !== i),
      iga_rows:      (s.iga_rows      || []).filter((_, j) => j !== i),
      cdio_sdg_rows: (s.cdio_sdg_rows || []).filter((_, j) => j !== i),
    }))
  }

  // Set a single ILO value cell inside an assessment task
  function setSylTaskIlo(taskIdx, iloIdx, value) {
    setIsDirty(true); setSaveSuccess(false)
    setSyllabusData(s => ({
      ...s,
      assessment_tasks: s.assessment_tasks.map((t, i) => {
        if (i !== taskIdx) return t
        const iloVals = [...(t.ilo_values || [])]
        iloVals[iloIdx] = value
        return { ...t, ilo_values: iloVals }
      }),
    }))
  }

  // Add a column to a mapping table (updates both headers array and every row's values array)
  function addMappingCol(headersField, rowsField, rowValKey) {
    setIsDirty(true); setSaveSuccess(false)
    setSyllabusData(s => ({
      ...s,
      [headersField]: [...(s[headersField] || ['']), ''],
      [rowsField]: (s[rowsField] || []).map(row => ({
        ...row,
        [rowValKey]: [...(row[rowValKey] || []), ''],
      })),
    }))
  }

  // Remove a column from a mapping table
  function removeMappingCol(headersField, rowsField, rowValKey, colIdx) {
    if ((syllabusData[headersField] || ['']).length <= 1) return
    setIsDirty(true); setSaveSuccess(false)
    setSyllabusData(s => ({
      ...s,
      [headersField]: (s[headersField] || []).filter((_, j) => j !== colIdx),
      [rowsField]: (s[rowsField] || []).map(row => ({
        ...row,
        [rowValKey]: (row[rowValKey] || []).filter((_, j) => j !== colIdx),
      })),
    }))
  }

  // ── AI helper: read / write the selected field ──────────────────────────
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
      const { data } = await api.post('/curriculum/generate-syllabus-field/', {
        course_id: courseId,
        section: aiField.section,
        field_label: aiField.label,
        existing_content: mode === 'continue' ? currentValue : '',
        mode,
        provider: aiProvider,
        top_k: 5,
      }, { timeout: 120000 })
      const generated = data.generated_text || ''
      // 'continue' appends to existing; 'generate' replaces
      if (mode === 'continue' && currentValue) {
        applyAiText(currentValue + '\n' + generated)
      } else {
        applyAiText(generated)
      }
    } catch (err) {
      setAiError(extractApiError(err))
    } finally {
      setAiGenerating(false)
    }
  }

  async function handleSyllabusUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSyllabusUploading(true); setSyllabusUploadError(''); setSyllabusUploadSuccess(false)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('course_id', courseId)
    try {
      // Do NOT set Content-Type manually — let the browser set it with the correct boundary
      const { data } = await api.post('/curriculum/parse-syllabus-upload/', formData, {
        headers: { 'Content-Type': undefined },
        timeout: 120000,
      })
      if (data.syllabus_data && typeof data.syllabus_data === 'object') {
        setSyllabusData(prev => normalizeSyllabusData({ ...EMPTY_SYLLABUS, ...prev, ...data.syllabus_data }))
        setIsDirty(true)
        setSyllabusUploadSuccess(true)
      } else {
        setSyllabusUploadError('Syllabus was uploaded but no data could be extracted. Try a different file.')
      }
    } catch (err) {
      setSyllabusUploadError(extractApiError(err))
    } finally {
      setSyllabusUploading(false)
      if (syllabusUploadRef.current) syllabusUploadRef.current.value = ''
    }
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
      // Merge saved content with EMPTY_SYLLABUS defaults so new keys are always present, then normalize
      setSyllabusData(normalizeSyllabusData({ ...EMPTY_SYLLABUS, ...saved }))
      setIsDirty(false)
      return
    }

    // No saved content yet — seed from course fields
    if (!course) return
    const toStr = v => v != null ? String(v) : ''
    const mapAttr = arr => (arr || []).length
      ? arr.map(g => ({ code: g.code || '', title: g.title || '', description: g.description || '' }))
      : [{ ...EMPTY_ATTR }]
    const courseIlos = (course.ilos || []).length ? course.ilos.map(String) : ['']
    const iloCount   = courseIlos.length
    setSyllabusData(normalizeSyllabusData({
      // Header defaults (kept from EMPTY_SYLLABUS)
      university_name:  EMPTY_SYLLABUS.university_name,
      college:          EMPTY_SYLLABUS.college,
      program:          EMPTY_SYLLABUS.program,
      document_title:   EMPTY_SYLLABUS.document_title,
      // University Direction
      vision:           course.vision             || '',
      mission:          course.mission            || '',
      // Course Specifications
      course_title:     course.course_title       || '',
      course_code:      course.course_code        || '',
      course_category:  course.course_category    || '',
      prerequisites:    course.prerequisites      || '',
      semester_year:    course.semester_year      || '',
      credit_hours:     toStr(course.credit_hours),
      instructor_name:  course.instructor_name    || '',
      contact_info:     course.contact_info       || '',
      education:        course.education          || '',
      reference_cmo:    course.reference_cmo      || '',
      date_prepared:    course.date_prepared      || '',
      revision_no:      toStr(course.revision_no),
      revision_date:    course.revision_date      || '',
      period_of_study:  course.period_of_study    || '',
      // Course Overview
      description:      course.description        || '',
      lecture_hours:    toStr(course.lecture_hours),
      lab_hours:        toStr(course.lab_hours),
      // Assessment & Strategies
      assessment_criteria: course.assessment_criteria || '',
      tlas:             course.tlas               || '',
      // Expected Outcomes
      ilos: courseIlos,
      assessment_tasks: (course.assessment_tasks || []).length
        ? course.assessment_tasks   // normalizeSyllabusData will convert old format
        : [{ ...EMPTY_TASK, ilo_values: Array(iloCount).fill('') }],
      // References & Frameworks
      references:       (course.references || []).length ? course.references.map(String) : [''],
      igas:             mapAttr(course.igas),
      student_outcomes: mapAttr(course.student_outcomes),
      cdio_skills:      mapAttr(course.cdio_skills),
      sdg_skills:       mapAttr(course.sdg_skills),
      // Course Policies
      grading_rows:     DEFAULT_GRADING_ROWS.map(r => ({ ...r })),
      policies:         (course.policies || []).length
        ? course.policies.map(p => ({ title: p.title || '', content: p.content || '' }))
        : [{ title: 'Class Policies', content: '' }],
      other_policies:   course.other_policies     || '',
      // TLA Activities (normalizeSyllabusData migrates old {chapter,description} → new column model)
      tla_chapters:    (course.tla_chapters || []).length ? course.tla_chapters : [{ ...EMPTY_CHAPTER }],
      // Schedules & Mappings — pass raw; normalizeSyllabusData will initialise all structured fields
      schedule_methods:  course.schedule_methods  || undefined,
      so_headers:        course.so_headers        || undefined,
      so_cpa_rows:       course.so_cpa_rows       || undefined,
      iga_headers:       course.iga_headers       || undefined,
      iga_rows:          course.iga_rows          || undefined,
      cdio_headers:      course.cdio_headers      || undefined,
      sdg_headers:       course.sdg_headers       || undefined,
      cdio_sdg_rows:     course.cdio_sdg_rows     || undefined,
    }))
    setIsDirty(false)
  }, [workspaceApi.data])

  // Auto-clear transient notifications
  useEffect(() => { if (!saveError) return; const t = setTimeout(() => setSaveError(''), 3000); return () => clearTimeout(t) }, [saveError])
  useEffect(() => { if (!actionError) return; const t = setTimeout(() => setActionError(''), 3000); return () => clearTimeout(t) }, [actionError])
  useEffect(() => { if (!aiError) return; const t = setTimeout(() => setAiError(''), 4000); return () => clearTimeout(t) }, [aiError])
  useEffect(() => { if (!syllabusUploadSuccess) return; const t = setTimeout(() => setSyllabusUploadSuccess(false), 5000); return () => clearTimeout(t) }, [syllabusUploadSuccess])

  // Clear AI field selection when the syllabus section tab changes
  useEffect(() => { setAiField(null) }, [syllabusSub])

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

    // ── 1. Header & Institutional Info ──────────────────────────────────────
    if (syllabusSub === 'header') {
      return (
        <>
          <SectionCard title="University / Campus Details">
            <LField label="University / Campus" multiline minRows={3}
              value={syllabusData.university_name || ''} onChange={e => setSyl('university_name', e.target.value)} />
          </SectionCard>
          <SectionCard title="College & Program">
            <Box sx={{ display: 'grid', gap: 1.75 }}>
              <LField label="College"        value={syllabusData.college        || ''} onChange={e => setSyl('college',       e.target.value)} />
              <LField label="Program"        value={syllabusData.program        || ''} onChange={e => setSyl('program',       e.target.value)} />
              <LField label="Document Title" value={syllabusData.document_title || ''} onChange={e => setSyl('document_title', e.target.value)} />
            </Box>
          </SectionCard>
        </>
      )
    }

    // ── 2. University Direction ──────────────────────────────────────────────
    if (syllabusSub === 'direction') {
      return (
        <>
          <SectionCard title="Vision">
            <LField label="Vision Statement" multiline minRows={3}
              value={syllabusData.vision} onChange={e => setSyl('vision', e.target.value)}
              onFocus={() => setAiField({ section: 'direction', label: 'Vision Statement', fieldType: 'simple', field: 'vision' })} />
          </SectionCard>
          <SectionCard title="Mission">
            <LField label="Mission Statement" multiline minRows={3}
              value={syllabusData.mission} onChange={e => setSyl('mission', e.target.value)}
              onFocus={() => setAiField({ section: 'direction', label: 'Mission Statement', fieldType: 'simple', field: 'mission' })} />
          </SectionCard>
        </>
      )
    }

    // ── 3. Course Specifications ─────────────────────────────────────────────
    if (syllabusSub === 'specs') {
      return (
        <SectionCard title="Course Information">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
            <LField label="Course Title"     value={syllabusData.course_title    || ''} onChange={e => setSyl('course_title',    e.target.value)} />
            <LField label="Course Code"      value={syllabusData.course_code     || ''} onChange={e => setSyl('course_code',     e.target.value)} />
            <LField label="Course Category"  value={syllabusData.course_category || ''} onChange={e => setSyl('course_category', e.target.value)} />
            <LField label="Pre-requisite(s)" value={syllabusData.prerequisites   || ''} onChange={e => setSyl('prerequisites',   e.target.value)} />
            <LField label="Semester / Year"  value={syllabusData.semester_year   || ''} onChange={e => setSyl('semester_year',   e.target.value)} />
            <LField label="Credit Hours"     value={syllabusData.credit_hours    || ''} onChange={e => setSyl('credit_hours',    e.target.value)} />
            <LField label="Reference CMO"    value={syllabusData.reference_cmo   || ''} onChange={e => setSyl('reference_cmo',   e.target.value)} />
            <LField label="Date Prepared"    value={syllabusData.date_prepared   || ''} onChange={e => setSyl('date_prepared',   e.target.value)} />
            <LField label="Revision No."     value={syllabusData.revision_no     || ''} onChange={e => setSyl('revision_no',     e.target.value)} />
            <LField label="Revision Date"    value={syllabusData.revision_date   || ''} onChange={e => setSyl('revision_date',   e.target.value)} />
            <LField label="Period of Study"  value={syllabusData.period_of_study || ''} onChange={e => setSyl('period_of_study', e.target.value)}
              sx={{ gridColumn: 'span 2' }} />
          </Box>
          <Box sx={{ mt: 1.75, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
            <LField label="Course Instructor"   value={syllabusData.instructor_name || ''} onChange={e => setSyl('instructor_name', e.target.value)} />
            <LField label="Contact Information" value={syllabusData.contact_info    || ''} onChange={e => setSyl('contact_info',    e.target.value)} />
            <LField label="Education / Degree"  value={syllabusData.education       || ''} onChange={e => setSyl('education',       e.target.value)}
              sx={{ gridColumn: 'span 2' }} />
          </Box>
        </SectionCard>
      )
    }

    // ── 4. Course Overview ───────────────────────────────────────────────────
    if (syllabusSub === 'overview') {
      return (
        <>
          <SectionCard title="Course Rationale and Description">
            <LField label="Description" multiline minRows={6}
              value={syllabusData.description} onChange={e => setSyl('description', e.target.value)}
              onFocus={() => setAiField({ section: 'overview', label: 'Course Description', fieldType: 'simple', field: 'description' })} />
          </SectionCard>
          <SectionCard title="Contact Hours">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <LField label="Lecture Hours" type="number"
                value={syllabusData.lecture_hours} onChange={e => setSyl('lecture_hours', e.target.value)} />
              <LField label="Laboratory Hours" type="number"
                value={syllabusData.lab_hours} onChange={e => setSyl('lab_hours', e.target.value)} />
            </Box>
          </SectionCard>
        </>
      )
    }

    // ── 5. Assessment & Strategies ───────────────────────────────────────────
    if (syllabusSub === 'strategies') {
      return (
        <>
          <SectionCard title="Criteria for Assessment">
            <LField label="Assessment Criteria" multiline minRows={6}
              value={syllabusData.assessment_criteria} onChange={e => setSyl('assessment_criteria', e.target.value)}
              onFocus={() => setAiField({ section: 'strategies', label: 'Assessment Criteria', fieldType: 'simple', field: 'assessment_criteria' })} />
          </SectionCard>
          <SectionCard title="Teaching, Learning, and Assessment Strategies">
            <LField label="TLA Strategies" multiline minRows={8}
              value={syllabusData.tlas} onChange={e => setSyl('tlas', e.target.value)}
              onFocus={() => setAiField({ section: 'strategies', label: 'TLA Strategies', fieldType: 'simple', field: 'tlas' })} />
          </SectionCard>
        </>
      )
    }

    // ── 6. Expected Outcomes ─────────────────────────────────────────────────
    if (syllabusSub === 'outcomes') {
      const iloCount = syllabusData.ilos.length
      const fixedCols = [
        { key: 'code',   label: 'Code',            width: 70 },
        { key: 'task',   label: 'Assessment Task',  width: 160 },
        { key: 'ird',    label: 'I/R/D',            width: 60 },
        { key: 'weight', label: 'Weight (%)',        width: 72 },
      ]
      const domainCols = [
        { key: 'c', label: 'C', width: 45 },
        { key: 'p', label: 'P', width: 45 },
        { key: 'a', label: 'A', width: 45 },
      ]
      const emptyTaskForIlos = { code: '', task: '', ird: '', weight: '', ilo_values: Array(iloCount).fill(''), c: '', p: '', a: '' }
      return (
        <>
          <SectionCard title="Intended Learning Outcomes (ILO)"
            action={<AddRowBtn label="Add ILO" onClick={addIlo} />}>
            <Stack spacing={1.5}>
              {syllabusData.ilos.map((ilo, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Chip label={'ILO' + (i + 1)} size="small"
                    sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, flexShrink: 0, height: 22, fontSize: '0.7rem', mt: 0.8 }} />
                  <LField label={`ILO ${i + 1}`} multiline minRows={2}
                    value={ilo} onChange={e => setSylArr('ilos', i, e.target.value)}
                    onFocus={() => setAiField({ section: 'outcomes', label: `ILO ${i + 1}`, fieldType: 'array', arrField: 'ilos', arrIndex: i })} />
                  <RemoveBtn onClick={() => removeIlo(i)} disabled={syllabusData.ilos.length <= 1} />
                </Box>
              ))}
            </Stack>
          </SectionCard>

          <SectionCard title="Assessment Method and Distribution Map"
            action={<AddRowBtn label="Add Row" onClick={() => addSylItem('assessment_tasks', emptyTaskForIlos)} />}>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {fixedCols.map(c => (
                      <th key={c.key} style={{ padding: '6px 8px', borderBottom: '2px solid #e0e0e0', textAlign: 'left', color: '#555', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</th>
                    ))}
                    {Array.from({ length: iloCount }, (_, i) => (
                      <th key={`iloh${i}`} style={{ padding: '6px 8px', borderBottom: '2px solid #e0e0e0', textAlign: 'left', color: '#555', fontWeight: 700, whiteSpace: 'nowrap' }}>ILO{i + 1}</th>
                    ))}
                    <th colSpan={3} style={{ padding: '6px 8px', borderBottom: '2px solid #e0e0e0', textAlign: 'center', color: '#555', fontWeight: 700 }}>Domain</th>
                    <th style={{ padding: '6px 4px', borderBottom: '2px solid #e0e0e0' }} />
                  </tr>
                  <tr style={{ backgroundColor: BG }}>
                    {Array.from({ length: fixedCols.length + iloCount }, (_, i) => (
                      <th key={i} style={{ borderBottom: '1px solid #e8e8e8' }} />
                    ))}
                    {domainCols.map(c => (
                      <th key={c.key} style={{ padding: '2px 8px', borderBottom: '1px solid #e8e8e8', textAlign: 'center', color: '#777', fontWeight: 600, fontSize: '0.72rem' }}>{c.label}</th>
                    ))}
                    <th style={{ borderBottom: '1px solid #e8e8e8' }} />
                  </tr>
                </thead>
                <tbody>
                  {syllabusData.assessment_tasks.map((t, i) => (
                    <tr key={i}>
                      {fixedCols.map(c => (
                        <td key={c.key} style={{ padding: '4px 5px', borderBottom: '1px solid #f0f0f0' }}>
                          {inlineInput(t[c.key] || '', e => setSylArrObj('assessment_tasks', i, c.key, e.target.value), c.width)}
                        </td>
                      ))}
                      {Array.from({ length: iloCount }, (_, j) => (
                        <td key={`ilo${j}`} style={{ padding: '4px 5px', borderBottom: '1px solid #f0f0f0' }}>
                          {inlineInput((t.ilo_values || [])[j] || '', e => setSylTaskIlo(i, j, e.target.value), 55)}
                        </td>
                      ))}
                      {domainCols.map(c => (
                        <td key={c.key} style={{ padding: '4px 5px', borderBottom: '1px solid #f0f0f0' }}>
                          {inlineInput(t[c.key] || '', e => setSylArrObj('assessment_tasks', i, c.key, e.target.value), c.width)}
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
        </>
      )
    }

    // ── 7. References & Educational Frameworks ───────────────────────────────
    if (syllabusSub === 'references') {
      const attrGroups = [
        { label: 'Institutional Graduate Attributes (IGA)', field: 'igas' },
        { label: 'Student Outcomes (SO)',                   field: 'student_outcomes' },
        { label: 'CDIO Framework Skills',                   field: 'cdio_skills' },
        { label: 'Sustainable Development Goals Skills',    field: 'sdg_skills' },
      ]
      return (
        <>
          <SectionCard title="Books and Other References"
            action={<AddRowBtn label="Add Reference" onClick={() => addSylItem('references', '')} />}>
            <Stack spacing={1.25}>
              {syllabusData.references.map((ref, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ color: MAROON, fontWeight: 700, minWidth: 22, flexShrink: 0 }}>{i + 1}.</Typography>
                  <LField label={`Reference ${i + 1}`} value={ref}
                    onChange={e => setSylArr('references', i, e.target.value)}
                    onFocus={() => setAiField({ section: 'references', label: `Reference ${i + 1}`, fieldType: 'array', arrField: 'references', arrIndex: i })} />
                  <RemoveBtn onClick={() => removeSylItem('references', i)} disabled={syllabusData.references.length <= 1} />
                </Box>
              ))}
            </Stack>
          </SectionCard>
          {attrGroups.map(({ label, field }) => (
            <SectionCard key={field} title={label}
              action={<AddRowBtn label="Add" onClick={() => addSylItem(field, EMPTY_ATTR)} />}>
              <Stack spacing={1.5}>
                {(syllabusData[field] || [{ ...EMPTY_ATTR }]).map((item, i) => (
                  <Box key={i} sx={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 1.5, p: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1.25, mb: 1, alignItems: 'center' }}>
                      <LField label="Code" value={item.code}
                        onChange={e => setSylArrObj(field, i, 'code', e.target.value)} sx={{ maxWidth: 110 }} />
                      <LField label="Title" value={item.title}
                        onChange={e => setSylArrObj(field, i, 'title', e.target.value)} />
                      <RemoveBtn onClick={() => removeSylItem(field, i)} disabled={(syllabusData[field] || []).length <= 1} />
                    </Box>
                    <LField label="Description" multiline minRows={2} value={item.description}
                      onChange={e => setSylArrObj(field, i, 'description', e.target.value)}
                      onFocus={() => setAiField({ section: 'references', label: `${label} – Item ${i + 1} Description`, fieldType: 'arrayObj', arrField: field, arrIndex: i, arrObjKey: 'description' })} />
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          ))}
        </>
      )
    }

    // ── 8. Course Policies ───────────────────────────────────────────────────
    if (syllabusSub === 'policies') {
      return (
        <>
          <SectionCard title="A. Grading System">
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
                  {(syllabusData.grading_rows && syllabusData.grading_rows.length
                    ? syllabusData.grading_rows
                    : DEFAULT_GRADING_ROWS
                  ).map((row, i) => (
                  <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
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

          <SectionCard title="B. Class Policies"
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
                    onChange={e => setSylArrObj('policies', i, 'content', e.target.value)}
                    onFocus={() => setAiField({ section: 'policies', label: `Policy: ${p.title || `Item ${i + 1}`}`, fieldType: 'arrayObj', arrField: 'policies', arrIndex: i, arrObjKey: 'content' })} />
                </Box>
              ))}
            </Stack>
          </SectionCard>

          <SectionCard title="C. Other Course Policies and Requirements">
            <LField label="Other Policies" multiline minRows={6}
              value={syllabusData.other_policies || ''} onChange={e => setSyl('other_policies', e.target.value)}
              onFocus={() => setAiField({ section: 'policies', label: 'Other Course Policies', fieldType: 'simple', field: 'other_policies' })} />
          </SectionCard>
        </>
      )
    }

    // ── 9. TLA Activities ────────────────────────────────────────────────────
    if (syllabusSub === 'tla_activities') {
      const chapters = syllabusData.tla_chapters?.length ? syllabusData.tla_chapters : [{ ...EMPTY_CHAPTER }]
      return (
        <SectionCard title="Teaching, Learning, and Assessment (TLA) Activities"
          action={<AddRowBtn label="Add Row" onClick={() => addSylItem('tla_chapters', { ...EMPTY_CHAPTER })} />}>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
              <thead>
                <tr>
                  <th style={TABLE_TH}>Ch.</th>
                  <th style={{ ...TABLE_TH, minWidth: 220 }}>Topics / Reading List</th>
                  <th style={{ ...TABLE_TH, minWidth: 55 }}>Wks</th>
                  <th style={{ ...TABLE_TH, minWidth: 200 }}>Topic Outcomes</th>
                  <th style={{ ...TABLE_TH, minWidth: 60 }}>ILO</th>
                  <th style={{ ...TABLE_TH, minWidth: 60 }}>SO</th>
                  <th style={{ ...TABLE_TH, minWidth: 150 }}>Delivery Method</th>
                  <th style={{ ...TABLE_TH, borderRight: 'none' }} />
                </tr>
              </thead>
              <tbody>
                {chapters.map((ch, i) => (
                  <tr key={i}>
                    <td style={TABLE_TD}>{inlineInput(ch.chapter,  e => setSylArrObj('tla_chapters', i, 'chapter',  e.target.value), 50)}</td>
                    <td style={TABLE_TD}>{inlineInput(ch.topics,   e => setSylArrObj('tla_chapters', i, 'topics',   e.target.value), 220)}</td>
                    <td style={TABLE_TD}>{inlineInput(ch.weeks,    e => setSylArrObj('tla_chapters', i, 'weeks',    e.target.value), 50)}</td>
                    <td style={TABLE_TD}>{inlineInput(ch.outcomes, e => setSylArrObj('tla_chapters', i, 'outcomes', e.target.value), 200)}</td>
                    <td style={TABLE_TD}>{inlineInput(ch.ilo,      e => setSylArrObj('tla_chapters', i, 'ilo',      e.target.value), 55)}</td>
                    <td style={TABLE_TD}>{inlineInput(ch.so,       e => setSylArrObj('tla_chapters', i, 'so',       e.target.value), 55)}</td>
                    <td style={TABLE_TD}>{inlineInput(ch.delivery, e => setSylArrObj('tla_chapters', i, 'delivery', e.target.value), 150)}</td>
                    <td style={{ ...TABLE_TD, borderRight: 'none' }}>
                      <RemoveBtn onClick={() => removeSylItem('tla_chapters', i)} disabled={chapters.length <= 1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </SectionCard>
      )
    }

    // ── 10. Schedules & Mappings ─────────────────────────────────────────────
    return (
      <>
        {/* ── Assessment Schedule ── */}
        <SectionCard title="Assessment Schedule"
          action={<AddRowBtn label="Add Method" onClick={() => addSylItem('schedule_methods', { name: '', values: Array(16).fill('') })} />}>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...TABLE_TH, minWidth: 180, verticalAlign: 'middle' }}>Distribution</th>
                  <th colSpan={16} style={{ ...TABLE_TH, textAlign: 'center', borderRight: 'none' }}>Week No.</th>
                  <th rowSpan={2} style={{ ...TABLE_TH, borderRight: 'none' }} />
                </tr>
                <tr>
                  {SCHEDULE_WEEKS.map(w => (
                    <th key={w} style={{ ...TABLE_TH, minWidth: 36, textAlign: 'center' }}>{w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(syllabusData.schedule_methods || []).map((row, ri) => (
                  <tr key={ri}>
                    <td style={TABLE_TD}>
                      {inlineInput(row.name, e => setSylArrObj('schedule_methods', ri, 'name', e.target.value), 175)}
                    </td>
                    {SCHEDULE_WEEKS.map((_, ci) => (
                      <td key={ci} style={{ ...TABLE_TD, textAlign: 'center' }}>
                        {inlineInput(
                          (row.values || [])[ci] || '',
                          e => {
                            setIsDirty(true); setSaveSuccess(false)
                            setSyllabusData(s => ({
                              ...s,
                              schedule_methods: s.schedule_methods.map((m, i) => {
                                if (i !== ri) return m
                                const vals = [...(m.values || Array(16).fill(''))]
                                vals[ci] = e.target.value
                                return { ...m, values: vals }
                              }),
                            }))
                          },
                          36,
                        )}
                      </td>
                    ))}
                    <td style={{ ...TABLE_TD, borderRight: 'none' }}>
                      <RemoveBtn onClick={() => removeSylItem('schedule_methods', ri)}
                        disabled={(syllabusData.schedule_methods || []).length <= 1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </SectionCard>

        {/* ── ILO–SO and ILO–CPA Mapping ── */}
        <SectionCard title="ILO–SO and ILO–CPA Mapping"
          action={
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <AddRowBtn label="+ SO Col" onClick={() => addMappingCol('so_headers', 'so_cpa_rows', 'so_vals')} />
              <Button size="small" onClick={() => removeMappingCol('so_headers', 'so_cpa_rows', 'so_vals', (syllabusData.so_headers || ['']).length - 1)}
                disabled={(syllabusData.so_headers || ['']).length <= 1}
                sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: '#999', textTransform: 'none', '&:hover': { color: MAROON } }}>
                − SO Col
              </Button>
            </Box>
          }>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...TABLE_TH, verticalAlign: 'middle' }}>ILOs</th>
                  <th colSpan={(syllabusData.so_headers || ['']).length}
                    style={{ ...TABLE_TH, textAlign: 'center' }}>
                    STUDENT OUTCOMES (SO): Mapping of Assessment Tasks (AT)
                  </th>
                  <th colSpan={3} style={{ ...TABLE_TH, textAlign: 'center', borderRight: 'none' }}>
                    Domain
                  </th>
                </tr>
                <tr>
                  {(syllabusData.so_headers || ['']).map((h, ci) => (
                    <th key={ci} style={{ ...TABLE_TH, textAlign: 'center', minWidth: 60, padding: '4px 6px' }}>
                      <input value={h || ''} placeholder="SO #"
                        onChange={e => { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, so_headers: s.so_headers.map((v, i) => i === ci ? e.target.value : v) })) }}
                        style={{ width: 52, textAlign: 'center', border: 'none', borderBottom: '2px solid #ccc',
                          background: 'transparent', fontSize: '0.82rem', fontWeight: 700, color: '#444', outline: 'none', padding: '1px 2px' }} />
                    </th>
                  ))}
                  {['C', 'P', 'A'].map(k => (
                    <th key={k} style={{ ...TABLE_TH, textAlign: 'center', minWidth: 50 }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syllabusData.ilos.map((_, ri) => {
                  const row = (syllabusData.so_cpa_rows || [])[ri] || { so_vals: [], c: '', p: '', a: '' }
                  return (
                    <tr key={ri}>
                      <td style={{ ...TABLE_TD, fontWeight: 600, color: MAROON, whiteSpace: 'nowrap', paddingLeft: 10, minWidth: 52 }}>ILO{ri + 1}</td>
                      {(syllabusData.so_headers || ['']).map((_, ci) => (
                        <td key={ci} style={{ ...TABLE_TD, textAlign: 'center', minWidth: 70 }}>
                          {inlineInput(
                            (row.so_vals || [])[ci] || '',
                            e => {
                              setIsDirty(true); setSaveSuccess(false)
                              setSyllabusData(s => ({
                                ...s,
                                so_cpa_rows: s.so_cpa_rows.map((r, i) => {
                                  if (i !== ri) return r
                                  const vals = [...(r.so_vals || [])]
                                  vals[ci] = e.target.value
                                  return { ...r, so_vals: vals }
                                }),
                              }))
                            },
                            50,
                          )}
                        </td>
                      ))}
                      {['c', 'p', 'a'].map(k => (
                        <td key={k} style={{ ...TABLE_TD, textAlign: 'center' }}>
                          {inlineInput(row[k] || '', e => {
                            setIsDirty(true); setSaveSuccess(false)
                            setSyllabusData(s => ({
                              ...s,
                              so_cpa_rows: s.so_cpa_rows.map((r, i) => i === ri ? { ...r, [k]: e.target.value } : r),
                            }))
                          }, 50)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
        </SectionCard>

        {/* ── ILO–IGA Mapping ── */}
        <SectionCard title="ILO–IGA Mapping"
          action={
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <AddRowBtn label="+ IGA Col" onClick={() => addMappingCol('iga_headers', 'iga_rows', 'vals')} />
              <Button size="small" onClick={() => removeMappingCol('iga_headers', 'iga_rows', 'vals', (syllabusData.iga_headers || ['']).length - 1)}
                disabled={(syllabusData.iga_headers || ['']).length <= 1}
                sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: '#999', textTransform: 'none', '&:hover': { color: MAROON } }}>
                − IGA Col
              </Button>
            </Box>
          }>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...TABLE_TH, verticalAlign: 'middle' }}>ILOs</th>
                  <th colSpan={(syllabusData.iga_headers || ['']).length}
                    style={{ ...TABLE_TH, textAlign: 'center', borderRight: 'none' }}>
                    INSTITUTIONAL GRADUATE ATTRIBUTES (IGA): Mapping of Assessment Tasks (AT)
                  </th>
                </tr>
                <tr>
                  {(syllabusData.iga_headers || ['']).map((h, ci) => (
                    <th key={ci} style={{ ...TABLE_TH, textAlign: 'center', minWidth: 60, padding: '4px 6px' }}>
                      <input value={h || ''} placeholder="IGA #"
                        onChange={e => { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, iga_headers: s.iga_headers.map((v, i) => i === ci ? e.target.value : v) })) }}
                        style={{ width: 52, textAlign: 'center', border: 'none', borderBottom: '2px solid #ccc',
                          background: 'transparent', fontSize: '0.82rem', fontWeight: 700, color: '#444', outline: 'none', padding: '1px 2px' }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syllabusData.ilos.map((_, ri) => {
                  const row = (syllabusData.iga_rows || [])[ri] || { vals: [] }
                  return (
                    <tr key={ri}>
                      <td style={{ ...TABLE_TD, fontWeight: 600, color: MAROON, whiteSpace: 'nowrap', paddingLeft: 10, minWidth: 52 }}>ILO{ri + 1}</td>
                      {(syllabusData.iga_headers || ['']).map((_, ci) => (
                        <td key={ci} style={{ ...TABLE_TD, textAlign: 'center', minWidth: 70 }}>
                          {inlineInput(
                            (row.vals || [])[ci] || '',
                            e => {
                              setIsDirty(true); setSaveSuccess(false)
                              setSyllabusData(s => ({
                                ...s,
                                iga_rows: s.iga_rows.map((r, i) => {
                                  if (i !== ri) return r
                                  const vals = [...(r.vals || [])]
                                  vals[ci] = e.target.value
                                  return { ...r, vals }
                                }),
                              }))
                            },
                            50,
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
        </SectionCard>

        {/* ── ILO–CDIO and ILO–SDG Mapping ── */}
        <SectionCard title="ILO–CDIO and ILO–SDG Mapping"
          action={
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <AddRowBtn label="+ CDIO" onClick={() => addMappingCol('cdio_headers', 'cdio_sdg_rows', 'cdio_vals')} />
              <Button size="small" onClick={() => removeMappingCol('cdio_headers', 'cdio_sdg_rows', 'cdio_vals', (syllabusData.cdio_headers || ['']).length - 1)}
                disabled={(syllabusData.cdio_headers || ['']).length <= 1}
                sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: '#999', textTransform: 'none', '&:hover': { color: MAROON } }}>
                − CDIO
              </Button>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <AddRowBtn label="+ SDG" onClick={() => addMappingCol('sdg_headers', 'cdio_sdg_rows', 'sdg_vals')} />
              <Button size="small" onClick={() => removeMappingCol('sdg_headers', 'cdio_sdg_rows', 'sdg_vals', (syllabusData.sdg_headers || ['']).length - 1)}
                disabled={(syllabusData.sdg_headers || ['']).length <= 1}
                sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: '#999', textTransform: 'none', '&:hover': { color: MAROON } }}>
                − SDG
              </Button>
            </Box>
          }>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...TABLE_TH, verticalAlign: 'middle' }}>ILOs</th>
                  <th colSpan={(syllabusData.cdio_headers || ['']).length}
                    style={{ ...TABLE_TH, textAlign: 'center' }}>
                    CDIO SKILLS
                  </th>
                  <th colSpan={(syllabusData.sdg_headers || ['']).length}
                    style={{ ...TABLE_TH, textAlign: 'center', borderRight: 'none' }}>
                    SDG Skills
                  </th>
                </tr>
                <tr>
                  {(syllabusData.cdio_headers || ['']).map((h, ci) => (
                    <th key={`cdio-${ci}`} style={{ ...TABLE_TH, textAlign: 'center', minWidth: 60, padding: '4px 6px' }}>
                      <input value={h || ''} placeholder="CDIO #"
                        onChange={e => { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, cdio_headers: s.cdio_headers.map((v, i) => i === ci ? e.target.value : v) })) }}
                        style={{ width: 52, textAlign: 'center', border: 'none', borderBottom: '2px solid #ccc',
                          background: 'transparent', fontSize: '0.82rem', fontWeight: 700, color: '#444', outline: 'none', padding: '1px 2px' }} />
                    </th>
                  ))}
                  {(syllabusData.sdg_headers || ['']).map((h, ci) => (
                    <th key={`sdg-${ci}`} style={{ ...TABLE_TH, textAlign: 'center', minWidth: 60, padding: '4px 6px' }}>
                      <input value={h || ''} placeholder="SDG #"
                        onChange={e => { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, sdg_headers: s.sdg_headers.map((v, i) => i === ci ? e.target.value : v) })) }}
                        style={{ width: 52, textAlign: 'center', border: 'none', borderBottom: '2px solid #ccc',
                          background: 'transparent', fontSize: '0.82rem', fontWeight: 700, color: '#444', outline: 'none', padding: '1px 2px' }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syllabusData.ilos.map((_, ri) => {
                  const row = (syllabusData.cdio_sdg_rows || [])[ri] || { cdio_vals: [], sdg_vals: [] }
                  return (
                    <tr key={ri}>
                      <td style={{ ...TABLE_TD, fontWeight: 600, color: MAROON, whiteSpace: 'nowrap', paddingLeft: 10, minWidth: 52 }}>ILO{ri + 1}</td>
                      {(syllabusData.cdio_headers || ['']).map((_, ci) => (
                        <td key={`c${ci}`} style={{ ...TABLE_TD, textAlign: 'center', minWidth: 70 }}>
                          {inlineInput(
                            (row.cdio_vals || [])[ci] || '',
                            e => {
                              setIsDirty(true); setSaveSuccess(false)
                              setSyllabusData(s => ({
                                ...s,
                                cdio_sdg_rows: s.cdio_sdg_rows.map((r, i) => {
                                  if (i !== ri) return r
                                  const vals = [...(r.cdio_vals || [])]
                                  vals[ci] = e.target.value
                                  return { ...r, cdio_vals: vals }
                                }),
                              }))
                            },
                            50,
                          )}
                        </td>
                      ))}
                      {(syllabusData.sdg_headers || ['']).map((_, ci) => (
                        <td key={`s${ci}`} style={{ ...TABLE_TD, textAlign: 'center' }}>
                          {inlineInput(
                            (row.sdg_vals || [])[ci] || '',
                            e => {
                              setIsDirty(true); setSaveSuccess(false)
                              setSyllabusData(s => ({
                                ...s,
                                cdio_sdg_rows: s.cdio_sdg_rows.map((r, i) => {
                                  if (i !== ri) return r
                                  const vals = [...(r.sdg_vals || [])]
                                  vals[ci] = e.target.value
                                  return { ...r, sdg_vals: vals }
                                }),
                              }))
                            },
                            50,
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
        </SectionCard>
      </>
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
      const showSaveFooter = isDirty
      const showAiFooter   = Boolean(aiField) && !AI_EXCLUDED_SECTIONS.has(syllabusSub)
      const totalFooterPb  = (showSaveFooter ? 72 : 0) + (showAiFooter ? 60 : 0)
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* scrollable content area */}
          <Box sx={{ flex: 1, overflow: 'auto', pb: totalFooterPb > 0 ? `${totalFooterPb}px` : 0 }}>
            {course && (
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                {/* hidden file input for syllabus upload */}
                <input
                  ref={syllabusUploadRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.txt"
                  style={{ display: 'none' }}
                  onChange={handleSyllabusUpload}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption"
                    sx={{ color: MAROON, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {syllabusData.course_code || course.course_code}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#1A1A1A', lineHeight: 1.2 }}>
                    {syllabusData.course_title || course.course_title}
                  </Typography>
                </Box>
                <Tooltip title={syllabusUploading ? 'Parsing syllabus…' : 'Upload existing syllabus (PDF, DOCX, XLSX, TXT) — fields will be auto-populated'}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={syllabusUploading}
                      startIcon={syllabusUploading ? <CircularProgress size={14} sx={{ color: MAROON }} /> : <CloudUploadIcon sx={{ fontSize: '1rem !important' }} />}
                      onClick={() => syllabusUploadRef.current?.click()}
                      sx={{
                        textTransform: 'none',
                        borderColor: MAROON,
                        color: MAROON,
                        fontSize: '0.75rem',
                        py: 0.5,
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                        borderRadius: 1.5,
                        '&:hover': { bgcolor: MAROON_LIGHT, borderColor: MAROON },
                      }}
                    >
                      {syllabusUploading ? 'Parsing…' : 'Upload Syllabus'}
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            )}
            {syllabusUploadError && (
              <AutoAlert message={syllabusUploadError} onClose={() => setSyllabusUploadError('')} sx={{ mb: 1.5 }} />
            )}
            {syllabusUploadSuccess && (
              <AutoAlert message="Syllabus imported! Review the fields below and save when ready." severity="success" onClose={() => setSyllabusUploadSuccess(false)} sx={{ mb: 1.5 }} />
            )}
            
            {/* Horizontal Checklist & Navigation */}
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                  Syllabus Completion Checklist
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: MAROON }}>
                  {Math.round((SYLLABUS_SECTIONS.filter(s => getSectionStatus(syllabusData, s.key)).length / SYLLABUS_SECTIONS.length) * 100)}% Completed
                </Typography>
              </Box>
              
              <Box sx={{ 
                display: 'flex', alignItems: 'center', gap: 1.25, overflowX: 'auto', pb: 1, 
                '&::-webkit-scrollbar': { height: 6 }, 
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 3 } 
              }}>
                {SYLLABUS_SECTIONS.map((section, index) => {
                  const isCompleted = getSectionStatus(syllabusData, section.key)
                  const isActive = syllabusSub === section.key
                  
                  let borderColor = '#e0e0e0'
                  let bgColor = '#fff'
                  let textColor = '#666'
                  
                  if (isActive) {
                    borderColor = MAROON
                    bgColor = MAROON_LIGHT
                    textColor = MAROON
                  } else if (isCompleted) {
                    borderColor = '#A5D6A7'
                    bgColor = '#E8F5E9'
                    textColor = '#2E7D32'
                  }

                  return (
                    <Box
                      key={section.key}
                      onClick={() => setSyllabusSub(section.key)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1,
                        px: 1.5, py: 1, borderRadius: 2, flexShrink: 0,
                        bgcolor: bgColor, border: `1px solid ${borderColor}`,
                        cursor: 'pointer', transition: 'all 0.2s ease',
                        '&:hover': { borderColor: isActive ? MAROON : (isCompleted ? '#81C784' : '#ccc') }
                      }}
                    >
                      <Box sx={{
                        width: 20, height: 20, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: isCompleted ? '#34C759' : (isActive ? MAROON : 'transparent'),
                        border: `1px solid ${isCompleted ? '#34C759' : (isActive ? MAROON : 'rgba(255,255,255,0.2)')}`,
                        color: (isCompleted || isActive) ? '#fff' : 'rgba(255,255,255,0.7)',
                        fontSize: '0.7rem', fontWeight: 800
                      }}>
                        {isCompleted ? '✓' : (index + 1)}
                      </Box>
                      <Typography variant="caption" sx={{ fontWeight: isActive ? 700 : 500, color: textColor, fontSize: '0.8rem' }}>
                        {section.label}
                      </Typography>
                    </Box>
                  )
                })}
              </Box>
            </Box>
            {renderSyllabusSection()}
          </Box>

          {/* Sticky save footer — appears when any field has been edited */}
          {showSaveFooter && (
            <Box sx={{
              position: 'sticky', bottom: showAiFooter ? '60px' : 0,
              background: 'rgba(30, 30, 35, 0.85)', backdropFilter: 'blur(24px)', borderTop: '1px solid rgba(255, 45, 85, 0.3)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
              px: 2.5, py: 1.25,
              display: 'flex', alignItems: 'center', gap: 2,
              zIndex: 10,
            }}>
              {saveError
                ? <>
                    <Typography variant="caption" sx={{ color: '#ff453a', flex: 1 }}>{saveError}</Typography>
                    <IconButton size="small" onClick={() => setSaveError('')} sx={{ color: '#ff453a', p: 0.25 }}>
                      <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>✕</span>
                    </IconButton>
                  </>
                : <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', flex: 1 }}>
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

          {/* AI generation footer — appears when a field is focused in an eligible section */}
          {showAiFooter && (
            <Box sx={{
              position: 'sticky', bottom: 0,
              bgcolor: '#1C1C1E',
              borderTop: `2px solid ${MAROON}`,
              boxShadow: '0 -4px 20px rgba(0,0,0,0.18)',
              px: 2, py: 1,
              display: 'flex', alignItems: 'center', gap: 1.5,
              zIndex: 20,
              minHeight: 60,
            }}>
              <AutoAwesomeIcon sx={{ color: MAROON, fontSize: '1.1rem', flexShrink: 0 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: '#aaa', display: 'block', lineHeight: 1, mb: 0.15 }}>AI Assist</Typography>
                <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                  {aiField.label}
                </Typography>
              </Box>
              {aiError && (
                <Typography variant="caption" sx={{ color: '#ef9a9a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aiError}</Typography>
              )}
              <Select
                size="small"
                value={aiProvider}
                onChange={e => setAiProvider(e.target.value)}
                sx={{
                  bgcolor: '#333', color: '#fff', fontSize: '0.75rem', height: 30,
                  minWidth: 110, flexShrink: 0,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#555' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#888' },
                  '& .MuiSvgIcon-root': { color: '#aaa' },
                  '& .MuiSelect-select': { py: 0.5 },
                }}
                MenuProps={{ PaperProps: { sx: { bgcolor: '#2a2a2a', color: '#fff' } } }}
              >
                {AI_PROVIDERS.map(p => (
                  <MenuItem key={p} value={p} sx={{ fontSize: '0.75rem', '&:hover': { bgcolor: '#444' } }}>
                    {cap(p)}
                  </MenuItem>
                ))}
              </Select>
              {getAiCurrentValue() && (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={aiGenerating}
                  onClick={() => handleAiGenerate('continue')}
                  sx={{ textTransform: 'none', color: '#ddd', borderColor: '#555', fontSize: '0.75rem', py: 0.25, px: 1.25, flexShrink: 0, '&:hover': { borderColor: '#aaa', bgcolor: '#333' } }}
                >
                  Continue
                </Button>
              )}
              <Button
                size="small"
                variant="contained"
                disabled={aiGenerating}
                onClick={() => handleAiGenerate('generate')}
                sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#a00' }, textTransform: 'none', fontSize: '0.75rem', py: 0.3, px: 1.5, fontWeight: 700, flexShrink: 0 }}
              >
                {aiGenerating ? 'Generating…' : 'Generate'}
              </Button>
              <IconButton size="small" onClick={() => setAiField(null)}
                sx={{ color: '#666', '&:hover': { color: '#fff' }, p: 0.5, flexShrink: 0 }}>
                <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>✕</span>
              </IconButton>
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
                    <Typography variant="body2" sx={{ color: '#fff', flex: 1 }}>{m.module_title}</Typography>
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
                    <Typography variant="body2" sx={{ color: '#fff', flex: 1 }}>{a.title}</Typography>
                    <Chip label={a.status} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                ))}
              </Stack>
            </SectionCard>
          )}
        </Stack>
      )
    }

    if (activeTab === 'analytics') {
      return (
        <SectionCard title="Course Analytics">
          <Typography variant="body2" sx={{ color: '#666' }}>
            This panel will display insights, student progress, and module engagement for this course.
          </Typography>
        </SectionCard>
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
            <Typography variant="caption" sx={{ color: uploadFile ? '#fff' : 'rgba(255,255,255,0.5)', px: 0.5 }}>
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
                        background: 'rgba(255,255,255,0.05)', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <InsertDriveFileIcon sx={{ fontSize: 15, color: MAROON, flexShrink: 0 }} />
                  <Typography variant="caption"
                    sx={{ color: '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

  const actualLeftWidth = isCollapsed ? 80 : leftWidth

  const sidebarContent = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '0' : '0 8px 0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: 57,
          boxSizing: 'border-box'
        }}
      >
        {!isCollapsed && (
          <div style={{ overflow: 'hidden', display: 'flex' }}>
            <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 28, objectFit: 'contain', objectPosition: 'left' }} />
          </div>
        )}
        <IconButton onClick={() => setIsCollapsed(!isCollapsed)} size="small" sx={{ color: '#fff' }}>
          <MenuIcon />
        </IconButton>
      </div>

      {/* User info */}
      <div style={{ padding: isCollapsed ? '14px 0 10px' : '14px 20px 10px', display: 'flex', flexDirection: 'column', alignItems: isCollapsed ? 'center' : 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
          <Avatar
            sx={{
              width: 36, height: 36,
              background: '#ff2d55',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {toInitials(user?.name || user?.email || 'U')}
          </Avatar>
          {!isCollapsed && (
            <div>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
                {user?.name || 'User'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem' }}>
                {user?.email}
              </Typography>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <Chip
            label="FACULTY"
            size="small"
            sx={{
              mt: 1.2,
              background: 'rgba(255, 45, 85, 0.15)',
              color: '#ff2d55',
              border: '1px solid rgba(255, 45, 85, 0.3)',
              fontWeight: 700,
              fontSize: '0.68rem',
              letterSpacing: '0.06em',
              height: 20,
            }}
          />
        )}
      </div>

      <Divider sx={{ mx: isCollapsed ? 1 : 2, borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Nav items */}
      <List sx={{ flex: 1, px: 1, py: 1, overflowX: 'hidden' }}>
        {WORKSPACE_TABS.map(({ key, label, Icon }) => {
          const isActive = activeTab === key
          return (
            <ListItem key={key} disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={isCollapsed ? label : ''} placement="right" disableHoverListener={!isCollapsed}>
              <ListItemButton
                onClick={() => { setActiveTab(key); setMobileNavOpen(false) }}
                sx={{
                  borderRadius: 2,
                  py: 1,
                  px: isCollapsed ? 0 : 2,
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                background:    isActive ? 'rgba(255, 45, 85, 0.15)'  : 'transparent',
                color:         isActive ? '#ff2d55'              : 'rgba(255,255,255,0.7)',
                  '&:hover': {
                  background: 'rgba(255, 45, 85, 0.1)',
                  color: '#ff2d55',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: isCollapsed ? 0 : 36,
                    mr: isCollapsed ? 0 : 1,
                    justifyContent: 'center',
                  color: isActive ? '#ff2d55' : 'rgba(255,255,255,0.7)',
                  }}
                >
                  <Icon fontSize="small" />
                </ListItemIcon>
                {!isCollapsed && (
                  <ListItemText
                    primary={label}
                    primaryTypographyProps={{
                      fontSize: '0.88rem',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  />
                )}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute', left: 0, width: 3, height: 20,
                  background: '#ff2d55', boxShadow: '0 0 8px #ff2d55',
                      borderRadius: '0 2px 2px 0',
                    }}
                  />
                )}
              </ListItemButton>
              </Tooltip>
            </ListItem>
          )
        })}
      </List>

      {/* Bottom: Settings, Help, Back to dashboard */}
      <Divider sx={{ mx: isCollapsed ? 1 : 2, borderColor: 'rgba(255,255,255,0.08)' }} />
      <List sx={{ px: 1, py: 1 }}>
        {[
          { label: 'Settings', icon: <SettingsIcon fontSize="small" />, action: () => {} },
          { label: 'Help Center', icon: <HelpIcon fontSize="small" />, action: () => {} },
          { label: 'Back to Courses', icon: <ArrowBackIcon fontSize="small" />, action: () => navigate('/faculty/dashboard') },
        ].map((item) => (
          <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isCollapsed ? item.label : ''} placement="right" disableHoverListener={!isCollapsed}>
              <ListItemButton
                onClick={item.action}
                sx={{
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  borderRadius: 2, py: 1, px: isCollapsed ? 0 : 2, color: 'rgba(255,255,255,0.7)',
                  '&:hover': { background: 'rgba(255, 45, 85, 0.1)', color: '#ff2d55' },
                }}
              >
                <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, mr: isCollapsed ? 0 : 1, justifyContent: 'center', color: 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                {!isCollapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.88rem', fontWeight: 500 }} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </div>
  )

  // ── Root ──────────────────────────────────────────────────────────────────
  return (
    <Box ref={containerRef}
      sx={{ height: '100vh', background: '#000000', backgroundImage: 'radial-gradient(circle at 15% 50%, rgba(255, 45, 85, 0.15), transparent 25%), radial-gradient(circle at 85% 30%, rgba(10, 132, 255, 0.15), transparent 25%)', display: 'flex', overflow: 'hidden' }}>

      <style>{`
        .MuiTypography-root { color: #ffffff !important; }
        .MuiTypography-colorTextSecondary { color: rgba(255,255,255,0.6) !important; }
        .MuiChip-root { background: rgba(255,255,255,0.1) !important; color: #ffffff !important; border: 1px solid rgba(255,255,255,0.1) !important; }
        .MuiInputBase-root { color: #ffffff !important; }
      `}</style>

      {/* LEFT — nav (hidden on mobile, accessible via Drawer) */}
      <Box sx={{ width: isMobile ? 0 : actualLeftWidth, transition: 'width 0.2s', overflowX: 'hidden', flexShrink: 0, display: isMobile ? 'none' : 'block',
                 background: 'rgba(20, 20, 25, 0.65)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRight: '1px solid rgba(255,255,255,0.1)', position: 'relative' }}>
        {sidebarContent}
      </Box>

        {/* Drag — left (desktop only) */}
      {!isMobile && !isCollapsed && (
          <Box onMouseDown={() => setDragging('left')}
            sx={{ width: 4, flexShrink: 0, cursor: 'col-resize',
                bgcolor: dragging === 'left' ? 'rgba(255, 45, 85, 0.3)' : 'transparent',
                '&:hover': { bgcolor: 'rgba(255, 45, 85, 0.2)' }, transition: 'background-color 0.15s' }} />
        )}

      {/* Main content area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            background: 'rgba(20, 20, 25, 0.65)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            zIndex: (theme) => theme.zIndex.drawer - 1,
          }}
        >
          <Toolbar sx={{ gap: 2, minHeight: '56px !important' }}>
            {isMobile && (
              <IconButton
                edge="start"
                onClick={() => setMobileNavOpen(true)}
                sx={{ display: { md: 'none' }, color: '#fff' }}
              >
                <MenuIcon />
              </IconButton>
            )}

            {isMobile && (
              <Tooltip title="Back to courses">
                <IconButton onClick={() => navigate('/faculty/dashboard')} size="small" sx={{ color: '#fff' }}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {course ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="caption"
                  sx={{ color: MAROON, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
                  {syllabusData.course_code || course.course_code}
                </Typography>
                <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 500 }} noWrap>
                  {syllabusData.course_title || course.course_title}
                </Typography>
              </Box>
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

            {/* User avatar button */}
            <Tooltip title="Account">
              <IconButton
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{ p: 0.5 }}
              >
                <Avatar
                  sx={{
                    width: 32, height: 32,
                    background: '#ff2d55',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  {toInitials(user?.name || user?.email || 'U')}
                </Avatar>
              </IconButton>
            </Tooltip>

            {/* User drop-down menu */}
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{
                sx: { mt: 1, borderRadius: 4, minWidth: 180, background: 'rgba(30, 30, 35, 0.8)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', color: '#fff' },
              }}
            >
              <MenuItem disabled sx={{ opacity: 1, pb: 0 }}>
                <div>
                  <Typography variant="body2" fontWeight={700} sx={{ color: '#fff' }}>{user?.name}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>{user?.email}</Typography>
                </div>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => setAnchorEl(null)}>
                <AccountCircleIcon fontSize="small" sx={{ mr: 1.5, color: 'rgba(255,255,255,0.6)' }} />
                Profile
              </MenuItem>
              <MenuItem onClick={() => { logout(); navigate('/signin') }} sx={{ color: '#ff2d55' }}>
                <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} />
                Sign Out
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        {/* Center & Right Panels */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: dragging ? 'none' : 'auto' }}>
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
                    bgcolor: dragging === 'right' ? 'rgba(255, 45, 85, 0.3)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(255, 45, 85, 0.2)' }, transition: 'background-color 0.15s' }} />
          )}

          {/* RIGHT */}
          <Box sx={{ width: isMobile ? 0 : rightWidth, display: isMobile ? 'none' : 'block', flexShrink: 0, background: 'rgba(20, 20, 25, 0.65)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                     borderLeft: '1px solid rgba(255,255,255,0.1)', overflow: 'auto', p: isMobile ? 0 : 2 }}>
            {renderUploadPanel()}
          </Box>
        </Box>
      </Box>

      {/* Mobile nav Drawer */}
      <Drawer anchor="left" open={isMobile && mobileNavOpen} onClose={() => setMobileNavOpen(false)}
        PaperProps={{ sx: { width: 240 } }}>
        {sidebarContent}
      </Drawer>

      {/* Mobile upload Drawer */}
      <Drawer anchor="right" open={isMobile && mobileUploadOpen} onClose={() => setMobileUploadOpen(false)}
        PaperProps={{ sx: { width: 300 } }}>
        <Box sx={{ p: 2 }}>{renderUploadPanel()}</Box>
      </Drawer>
    </Box>
  )
}
