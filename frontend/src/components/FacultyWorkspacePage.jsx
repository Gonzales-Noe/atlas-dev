// src/components/FacultyWorkspacePage.jsx
// 3-panel workspace — light theme matching sign-in page (white/#F7F9FC/#8B0000).
// Left: nav tabs | Middle: content + syllabus section tabs | Right: upload

import React, { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import AutoAlert from './AutoAlert'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
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
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AssignmentIcon from '@mui/icons-material/Assignment'
import SvgIcon from '@mui/material/SvgIcon'
import DeleteIcon from '@mui/icons-material/Delete'
import GradeIcon from '@mui/icons-material/Grade'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MenuIcon from '@mui/icons-material/Menu'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ChatIcon from '@mui/icons-material/Chat'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import SaveIcon from '@mui/icons-material/Save'
import EditIcon from '@mui/icons-material/Edit'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import useApi from '../hooks/useApi'
import api from '../config/api'
import { useAuth } from '../store/authStore'
import { toInitials, extractApiError } from '../utils'
import AtlasLogo from './AtlasLogo'
import OmrGradingPanel from './OmrGradingPanel'
import BubbleSheetPanel from './BubbleSheetPanel'
import { ChevronDown, Plus, Trash2, Zap, BookOpen, ClipboardList, ClipboardCheck } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────
const MAROON = '#8B0000'
const MAROON_LIGHT = '#FFF5F5'
const BG = '#F7F9FC'

const WORKSPACE_TABS = [
  { key: 'syllabus',   label: 'Syllabus',    Icon: MenuBookIcon },
  { key: 'module',     label: 'Modules',     Icon: ViewModuleIcon },
  { key: 'assessment', label: 'Assessments', Icon: AssignmentIcon },
  // { key: 'grading',    label: 'Grading',     Icon: GradeIcon },
]

const SYLLABUS_SECTIONS = [
  { key: 'overview',      label: 'Course Overview' },
  { key: 'basic',         label: 'Basic Info' },
  { key: 'details',       label: 'Course Details' },
  { key: 'iloat',         label: 'ILOs & Assessments' },
  { key: 'iloatmatrix',   label: 'ILO–AT Matrix' },
  { key: 'fwmap',         label: 'Framework Mapping' },
  { key: 'ilofwmatrix',   label: 'ILO–Framework Matrix' },
  { key: 'schedule',      label: 'Weekly Schedule' },
  { key: 'tos',           label: 'Table of Specifications' },
  { key: 'grading',       label: 'Grading' },
  { key: 'policies',      label: 'Policies' },
]

const PROVIDERS = ['gemini', 'gpt', 'groq', 'anthropic', 'openrouter']
const AI_PROVIDERS = ['gemini', 'anthropic', 'groq', 'gpt']
const AI_EXCLUDED_SECTIONS = new Set(['overview', 'iloatmatrix', 'ilofwmatrix', 'tos', 'grading'])
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

const EMPTY_TASK    = { code: '', task: '', ird: '', category: '', weight: '', ilo_values: [], subs: [], c: '', p: '', a: '' }
const EMPTY_ATTR    = { code: '', title: '', description: '' }
const EMPTY_POLICY  = { title: '', content: '' }
const EMPTY_CHAPTER = { chapter: '', topics: '', weeks: '', outcomes: '', ilo: '', ilo_refs: [], so: '', delivery: '' }

const SCHEDULE_WEEKS = [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']

// Bloom’s Taxonomy verbs mapped to year level (lower → higher order thinking)
const BLOOM_VERBS_BY_YEAR = {
  '1st Year': {
    Remember: ['define', 'identify', 'label', 'list', 'memorize', 'name', 'recall', 'recognize', 'repeat', 'state'],
    Understand: ['classify', 'describe', 'explain', 'illustrate', 'interpret', 'paraphrase', 'predict', 'summarize'],
  },
  '2nd Year': {
    Understand: ['classify', 'describe', 'explain', 'interpret', 'paraphrase', 'summarize'],
    Apply: ['apply', 'compute', 'demonstrate', 'employ', 'execute', 'implement', 'perform', 'show', 'solve', 'use'],
  },
  '3rd Year': {
    Apply: ['apply', 'demonstrate', 'implement', 'perform', 'solve', 'use'],
    Analyze: ['break down', 'categorize', 'compare', 'contrast', 'differentiate', 'distinguish', 'examine', 'organize', 'relate'],
  },
  '4th Year': {
    Evaluate: ['appraise', 'argue', 'assess', 'critique', 'defend', 'evaluate', 'judge', 'justify', 'recommend'],
    Create: ['build', 'compose', 'construct', 'design', 'develop', 'formulate', 'produce', 'propose'],
  },
}

function getBloomVerbsForYear(yearLevel) {
  const map = BLOOM_VERBS_BY_YEAR[yearLevel]
  if (!map) {
    // No year level set — return all levels
    return Object.values(BLOOM_VERBS_BY_YEAR).flatMap(m =>
      Object.entries(m).map(([level, verbs]) => ({ level, verbs }))
    ).reduce((acc, { level, verbs }) => {
      const ex = acc.find(x => x.level === level)
      if (ex) ex.verbs = [...new Set([...ex.verbs, ...verbs])]
      else acc.push({ level, verbs: [...verbs] })
      return acc
    }, [])
  }
  return Object.entries(map).map(([level, verbs]) => ({ level, verbs }))
}

const TABLE_TH = {
  padding: '6px 10px', borderBottom: '2px solid #e0e0e0', borderRight: '1px solid #eee',
  backgroundColor: BG, color: '#555', fontWeight: 700, fontSize: '0.75rem', textAlign: 'left', whiteSpace: 'nowrap',
}
const TABLE_TD = {
  padding: '3px 5px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f5f5f5', verticalAlign: 'top',
}

// ── TOS keyword-alignment helpers (ported from PEA pipeline mapping.js) ───────
const TOS_STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','by','for','from','has','have',
  'he','her','him','his','how','i','in','is','it','its','of','on','or','she',
  'so','that','the','their','them','they','this','to','was','we','were',
  'what','which','who','will','with','you','your',
])
function tosTokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !TOS_STOP_WORDS.has(t))
}
function tosJaccard(tokensA, tokensB) {
  const A = new Set(tokensA), B = new Set(tokensB)
  let inter = 0; for (const t of A) { if (B.has(t)) inter++ }
  const union = new Set([...A, ...B]).size
  return union === 0 ? 0 : inter / union
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
  year_level: '',
  semester_year: '', credit_hours: '', instructor_name: '',
  employee_id: '', instructor_email: '', contact_info: '', education: '',
  institution_contact: '',
  reference_cmo: '', date_prepared: '', revision_no: '', revision_date: '', period_of_study: '',
  // 4. Course Overview
  description: '', rationale: '', lecture_hours: '', lab_hours: '', total_hours: '',
  technology_integration: '',
  // 5. Assessment & Strategies
  assessment_criteria: '', tlas: '',
  // 6. Expected Outcomes
  ilos: [''],
  ilo_bloom: [{ level: '', verb: '' }],
  assessment_tasks: [{ ...EMPTY_TASK, ilo_values: [''] }],
  ats: [{ code: 'C1', label: 'Component 1', weight: 100, subs: [] }],
  tos: [{ id: 'tos-1', examCode: 'ME', examLabel: 'Midterm Examination', semester: '', preparedBy: '', checkedBy: '', approvedBy: '', topics: [{ id: 'r-1', topic: '', ilos: [], hours_class: 0, hours_min: 0, weight: '', bloom_items: { remember: '', understand: '', apply: '', analyze: '', evaluate: '', create: '' }, bloom_pct: { remember: '', understand: '', apply: '', analyze: '', evaluate: '', create: '' }, total_points: '' }] }],
  // 7. References & Frameworks
  references: [''],
  igas:             [{ ...EMPTY_ATTR }],
  student_outcomes: [{ ...EMPTY_ATTR }],
  cdio_skills:      [{ ...EMPTY_ATTR }],
  sdg_skills:       [{ ...EMPTY_ATTR }],
  // 8. Course Policies
  grading_rows:   DEFAULT_GRADING_ROWS.map(r => ({ ...r })),
  passing_grade: 75, use_plus_minus: false, remedial_enabled: true, round_grades: false,
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

// ── Sidebar toggle icons ─────────────────────────────────────────────────
function PanelLeftIcon(props) {
  return (
    <SvgIcon {...props} viewBox="0 0 20 18">
      {/* outer rounded rect */}
      <rect x="1" y="1" width="18" height="16" rx="2.5" ry="2.5"
        fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* vertical divider */}
      <line x1="7" y1="1" x2="7" y2="17" stroke="currentColor" strokeWidth="1.5" />
      {/* left strip filled */}
      <rect x="2" y="2" width="4.5" height="14" rx="1.5"
        fill="currentColor" opacity="0.55" />
    </SvgIcon>
  )
}

function PanelRightIcon(props) {
  return (
    <SvgIcon {...props} viewBox="0 0 20 18">
      {/* outer rounded rect */}
      <rect x="1" y="1" width="18" height="16" rx="2.5" ry="2.5"
        fill="none" stroke="currentColor" strokeWidth="1.5" />
      {/* vertical divider */}
      <line x1="13" y1="1" x2="13" y2="17" stroke="currentColor" strokeWidth="1.5" />
      {/* right strip filled */}
      <rect x="13.5" y="2" width="4.5" height="14" rx="1.5"
        fill="currentColor" opacity="0.55" />
    </SvgIcon>
  )
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

function inlineInput(value, onChange, minWidth = 80, onFocus) {
  return (
    <TextField size="small" value={value} onChange={onChange} onFocus={onFocus}
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

// ── PEA-style Assessment Task Card ────────────────────────────────────────
function getAllSubs(ats) {
  return ats.flatMap(at => at.subs.map(s => ({ ...s, parentCode: at.code, parentLabel: at.label })))
}

function MultiSelectCell({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const [inputVal, setInputVal] = useState(value || '')
  const ref = useRef(null)
  const inputRef = useRef(null)

  // Sync when parent value changes
  useEffect(() => { setInputVal(value || '') }, [value])

  // Current token being typed = text after the last comma
  const lastToken = inputVal.split(',').pop().trim().toLowerCase()
  const filtered = lastToken
    ? options.filter(o => o.code.toLowerCase().includes(lastToken) || o.label.toLowerCase().includes(lastToken))
    : options

  const validCodes = new Set(options.map(o => o.code.toUpperCase()))

  // Strip out any tokens that are not in the known options list, return cleaned string
  const sanitize = (raw) => {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
    const valid = parts.filter(s => validCodes.has(s.toUpperCase()))
    return valid.join(', ')
  }

  const commit = () => {
    const clean = sanitize(inputVal)
    setInputVal(clean)
    setOpen(false)
    onChange(clean)
  }

  // Close + commit (with validation) on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) commit()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, inputVal, onChange])

  const selected = inputVal.split(',').map(s => s.trim()).filter(Boolean)

  const selectOption = (code) => {
    const isChecked = selected.map(s => s.toUpperCase()).includes(code.toUpperCase())
    let next
    if (isChecked) {
      next = selected.filter(s => s.toUpperCase() !== code.toUpperCase()).join(', ')
    } else {
      // Replace the partial last token with the chosen code
      const prevParts = inputVal.split(',').slice(0, -1).map(s => s.trim()).filter(Boolean)
      next = [...prevParts, code].join(', ')
    }
    setInputVal(next)
    onChange(next)
    inputRef.current?.focus()
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <input
        ref={inputRef}
        type="text"
        value={inputVal}
        placeholder="—"
        onChange={e => { setInputVal(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === 'Escape') commit()
        }}
        style={{
          width: 110, fontSize: '0.73rem',
          border: '1px solid #ddd', borderRadius: 4,
          padding: '3px 6px', outline: 'none',
          color: inputVal ? '#333' : '#aaa', background: '#fff',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, zIndex: 200,
          background: '#fff', border: '1px solid #ddd', borderRadius: 6,
          boxShadow: '0 4px 14px rgba(0,0,0,0.13)',
          minWidth: 190, maxHeight: 220, overflowY: 'auto', padding: '4px 0',
        }}>
          {filtered.map(({ code, label }) => {
            const checked = selected.map(s => s.toUpperCase()).includes(code.toUpperCase())
            return (
              <div key={code}
                onMouseDown={e => { e.preventDefault(); selectOption(code) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '5px 12px', cursor: 'pointer', fontSize: '0.73rem',
                  background: checked ? '#FFF5F5' : 'transparent',
                  color: checked ? '#8B0000' : '#333',
                }}
              >
                <input type="checkbox" checked={checked} readOnly
                  style={{ accentColor: '#8B0000', flexShrink: 0, pointerEvents: 'none' }} />
                <span style={{ fontWeight: checked ? 700 : 400 }}>{label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PEAAssessmentCard({ ilos, ats, setAts }) {
  const [atsOpen, setAtsOpen] = useState(true)
  const totalWt = ats.reduce((a, b) => a + b.weight, 0)
  const subTotal = ats.flatMap(at => at.subs).reduce((a, s) => a + s.weight, 0)
  const wtOk = totalWt === 100

  const cardStyle = { background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 10, overflow: 'hidden' }
  const cardHeaderStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-panel)' }
  const cardTitleStyle = { fontSize: 12, fontWeight: 700, color: 'var(--c-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const badgeStyle = (background, color) => ({ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background, color })
  const addButtonStyle = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--c-accent)', background: 'transparent', border: '1px solid var(--c-accent-br)', borderRadius: 8, cursor: 'pointer', padding: '4px 10px' }
  const deleteButtonStyle = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-muted)', padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center' }
  const inputStyle = { width: '100%', padding: '5px 8px', fontSize: '0.8rem', border: '1px solid var(--c-border2)', borderRadius: 6, background: 'var(--c-card)', color: 'var(--c-text)', fontFamily: 'inherit' }
  const successBadgeStyle = { background: 'rgba(34,197,94,0.15)', color: '#22c55e' }
  const errorBadgeStyle = { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }

  const updScore = (atCode, si, iloId, val) => {
    setAts(p => p.map(at => at.code !== atCode ? at : {
      ...at,
      subs: at.subs.map((s, i) => i !== si ? s : {
        ...s,
        scores: { ...s.scores, [iloId]: parseInt(val, 10) || 0 },
      }),
    }))
  }
  const updIloTotal = (atCode, si, iloId, val) => {
    setAts(p => p.map(at => at.code !== atCode ? at : {
      ...at,
      subs: at.subs.map((s, i) => i !== si ? s : {
        ...s,
        iloTotals: { ...(s.iloTotals || {}), [iloId]: parseInt(val, 10) || 0 },
      }),
    }))
  }
  const togILO = (atCode, si, iloId, chk) => {
    setAts(p => p.map(at => at.code !== atCode ? at : {
      ...at,
      subs: at.subs.map((s, i) => {
        if (i !== si) return s
        const nextIlos = chk ? [...s.ilos, iloId] : s.ilos.filter(x => x !== iloId)
        return { ...s, ilos: nextIlos }
      }),
    }))
  }
  const updSub = (atCode, si, field, val) => {
    setAts(p => p.map(at => at.code !== atCode ? at : {
      ...at,
      subs: at.subs.map((s, i) => i !== si ? s : {
        ...s,
        [field]: field === 'weight' || field === 'total' ? (parseInt(val, 10) || 0) : val,
      }),
    }))
  }
  const updAt = (atCode, field, val) => {
    setAts(p => p.map(at => at.code !== atCode ? at : {
      ...at,
      [field]: field === 'weight' ? (parseInt(val, 10) || 0) : val,
    }))
  }

  const addTask = (atCode) => {
    setAts((p) => {
      const scores = Object.fromEntries(ilos.map(i => [i.id, 0]))
      const iloTotals = Object.fromEntries(ilos.map(i => [i.id, 0]))
      return p.map(at => at.code !== atCode ? at : {
        ...at,
        subs: [...at.subs, {
          code: `T${at.subs.length + 1}`,
          label: 'New task',
          weight: 0,
          ilos: [],
          scores: { ...scores },
          iloTotals: { ...iloTotals },
        }],
      })
    })
  }

  const addComponent = () => {
    setAts(p => {
      const code = `C${p.length + 1}`
      const label = 'New component'
      const scores = Object.fromEntries(ilos.map(i => [i.id, 0]))
      return [...p, {
        code,
        label,
        weight: 0,
        subs: [{
          code,
          label,
          weight: 0,
          ilos: [],
          scores,
          iloTotals: {},
        }],
      }]
    })
  }

  const delAt = (code) => setAts(p => p.filter(a => a.code !== code))
  const delSub = (atCode, si) => {
    setAts(p => p.map(at => at.code !== atCode ? at : {
      ...at,
      subs: at.subs.filter((_, i) => i !== si),
    }))
  }

  return (
    <div style={{ '--c-card': '#ffffff', '--c-border': 'rgba(0,0,0,0.09)', '--c-panel': '#F7F9FC', '--c-text': '#333333', '--c-muted': '#888888', '--c-muted2': '#666666', '--c-accent': '#8B0000', '--c-accent-br': 'rgba(139,0,0,0.3)', '--c-border2': 'rgba(0,0,0,0.15)' }}>
      <div style={{ ...cardStyle, marginBottom: 14 }}>
        <div style={{ ...cardHeaderStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => setAtsOpen(o => !o)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronDown size={13} style={{ color: 'var(--c-muted)', flexShrink: 0, transition: 'transform .15s', transform: atsOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
            <span style={cardTitleStyle}>Assessment tasks &amp; score distribution</span>
            <span style={badgeStyle('rgba(34,197,94,0.15)', '#22c55e')}>{getAllSubs(ats).length} tasks</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>Component total:</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, ...(wtOk ? successBadgeStyle : errorBadgeStyle) }}>{totalWt}%</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>Task total:</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, ...(subTotal === 100 ? successBadgeStyle : errorBadgeStyle) }}>{subTotal}%</span>
          </div>
        </div>
        {atsOpen && <div style={{ padding: 12 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--c-muted)', marginBottom: 10, lineHeight: 1.6 }}>
            Component weight = sum of all its task weights. For tasks mapped to multiple ILOs, distribute raw scores per ILO — must sum to the task total.
          </p>
          {ats.map(at => {
            const atSubTotal = at.subs.reduce((a, s) => a + s.weight, 0)
            const atOk = atSubTotal === at.weight
            return (
              <div key={at.code} style={{ border: '1px solid var(--c-border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 10px', background: 'var(--c-panel)' }}>
                  <div style={{ flex: '1 1 200px', maxWidth: '75%', minWidth: 0 }}>
                    <input defaultValue={at.label} onChange={e => updAt(at.code, 'label', e.target.value)} style={{ ...inputStyle, fontWeight: 600, fontSize: '0.82rem', width: '100%', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>Component wt:</span>
                    <input type="text" inputMode="numeric" value={String(parseInt(at.weight, 10) || 0)} onChange={e => updAt(at.code, 'weight', e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0')} style={{ ...inputStyle, width: 52, minWidth: 52, fontSize: '0.75rem', textAlign: 'center' }} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>%</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: 99, fontWeight: 600, ...(atOk ? successBadgeStyle : errorBadgeStyle) }}>Tasks: {atSubTotal}%</span>
                  <button type="button" style={deleteButtonStyle} onClick={() => delAt(at.code)}><Trash2 size={11} /></button>
                </div>

                <div style={{ padding: '6px 10px 10px' }}>
                  {at.subs.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 5, borderBottom: '1px solid var(--c-border)', marginBottom: 6, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 200px', maxWidth: '75%', minWidth: 0, display: 'flex', gap: 6 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--c-muted)', width: 44, flexShrink: 0 }}>Code</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--c-muted)', flex: 1 }}>Task label</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--c-muted)', flex: '1 1 200px', minWidth: 160 }}>ILOs + score dist.</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--c-muted)', width: 88, flexShrink: 0, textAlign: 'center' }}>Wt %</span>
                      <span style={{ width: 28, flexShrink: 0 }} />
                    </div>
                  )}
                    {at.subs.map((sub, si) => {
                      return (
                        <div key={sub.code} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: si < at.subs.length - 1 ? '1px solid var(--c-border)' : 'none', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px', maxWidth: '75%', minWidth: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <input value={sub.code} onChange={e => updSub(at.code, si, 'code', e.target.value)} style={{ ...inputStyle, fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, width: 52, flexShrink: 0, boxSizing: 'border-box' }} />
                            <input value={sub.label} onChange={e => updSub(at.code, si, 'label', e.target.value)} style={{ ...inputStyle, fontSize: '0.8rem', flex: 1, minWidth: 0, width: '100%', boxSizing: 'border-box' }} />
                          </div>
                          <div style={{ flex: '2 1 200px', minWidth: 160 }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                              {ilos.map(ilo => (
                                <label key={ilo.id} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', color: 'var(--c-muted2)', cursor: 'pointer' }}>
                                  <input type="checkbox" checked={sub.ilos.includes(ilo.id)} onChange={e => togILO(at.code, si, ilo.id, e.target.checked)} style={{ width: 9, height: 9 }} />
                                  {ilo.id}
                                </label>
                              ))}
                            </div>
                            {sub.ilos.map(iloId => {
                              const rowScore = parseInt(sub.scores[iloId], 10) || 0
                              const rowTotal = parseInt((sub.iloTotals || {})[iloId] ?? (sub.total || 0), 10) || 0
                              const rowOk = rowScore === rowTotal
                              return (
                                <div key={iloId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                                  <span style={{ minWidth: 32, fontSize: '0.72rem', color: 'var(--c-muted2)', fontFamily: 'monospace' }}>{iloId}</span>
                                  <input type="text" inputMode="numeric" value={String(rowScore)} onChange={e => updScore(at.code, si, iloId, e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0')}
                                    style={{ width: 52, minWidth: 48, padding: '3px 6px', fontSize: '0.75rem', border: `1px solid ${rowOk ? '#22c55e' : 'var(--c-border2)'}`, borderRadius: 4, background: 'var(--c-card)', color: 'var(--c-text)', textAlign: 'center', boxSizing: 'border-box' }}
                                  />
                                  <span style={{ fontSize: '0.72rem', color: rowOk ? '#22c55e' : '#ef4444' }}>/</span>
                                  <input type="text" inputMode="numeric" value={String(rowTotal)} onChange={e => updIloTotal(at.code, si, iloId, e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0')}
                                    style={{ width: 52, minWidth: 48, padding: '3px 4px', fontSize: '0.75rem', border: `1px solid ${rowOk ? '#22c55e' : '#ef4444'}`, borderRadius: 4, background: 'var(--c-card)', color: rowOk ? '#22c55e' : '#ef4444', textAlign: 'center', boxSizing: 'border-box', fontWeight: 600 }}
                                  />
                                  <span style={{ fontSize: '0.72rem', color: rowOk ? '#22c55e' : '#ef4444' }}>{rowOk ? '✓' : '⚠'}</span>
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flex: '0 0 88px', width: 88, flexShrink: 0 }}>
                            <input type="text" inputMode="numeric" value={String(parseInt(sub.weight, 10) || 0)} onChange={e => updSub(at.code, si, 'weight', e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0')} style={{ ...inputStyle, width: 56, minWidth: 52, fontSize: '0.75rem', boxSizing: 'border-box', textAlign: 'center' }} />
                            <span style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>%</span>
                          </div>
                          <button type="button" style={deleteButtonStyle} onClick={() => delSub(at.code, si)}><Trash2 size={11} /></button>
                        </div>
                      )
                    })}
                  <button type="button" style={{ ...addButtonStyle, marginTop: 6 }} onClick={() => addTask(at.code)}><Plus size={9} /> Add task</button>
                </div>
              </div>
            )
          })}
          <button type="button" style={{ ...addButtonStyle, marginTop: 4 }} onClick={addComponent}><Plus size={9} /> Add component</button>
        </div>}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function FacultyWorkspacePage({ activeTab: initialTab = 'syllabus' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState(null)

  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const courseId = courseIdParam || searchParams.get('course') || ''

  const [activeTab, setActiveTab]     = useState(initialTab)
  const [syllabusSub, setSyllabusSub] = useState('overview')

  const [leftWidth, setLeftWidth]   = useState(200)
  const [rightWidth, setRightWidth] = useState(320)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [dragging, setDragging]     = useState(null)
  const containerRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [mobileNavOpen, setMobileNavOpen]       = useState(false)
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false)

  function toggleLeftPanel() {
    setLeftCollapsed(v => !v)
    setDragging(null)
  }

  function toggleRightPanel() {
    setRightCollapsed(v => !v)
    setDragging(null)
  }

  const [resultText, setResultText]       = useState('')
  const [actionError, setActionError]     = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [syllabusParams, setSyllabusParams] = useState({ num_weeks: 18, provider: 'groq', top_k: 5, extra_instructions: '' })
  const [moduleParams,   setModuleParams]   = useState({ module_title: '', week_number: 1, provider: 'gemini', top_k: 5, extra_instructions: '' })
  const [assessmentParams, setAssessmentParams] = useState({
    faculty_topics: '',
    extra_instructions: '',
    provider: 'gemini',
    source_exam_code: '',
    source_exam_label: '',
    item_by_item: true,
    target_item_number: 1,
    related_item_number: '',
    relation_instruction: '',
    overwrite_item: true,
  })

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
  const [activeTosId, setActiveTosId]   = useState(null)
  const [tosListOpen, setTosListOpen]   = useState(true)
  const [tosDetailOpen, setTosDetailOpen] = useState(true)
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
  // ILO assistant
  const [iloBloomVerb, setIloBloomVerb] = useState('')
  const [iloFocusText, setIloFocusText] = useState('')

  // ── Source panel state ───────────────────────────────────────────────────
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [renamingDocId, setRenamingDocId]   = useState(null)
  const [renameValue, setRenameValue]       = useState('')
  const [deletingDocId, setDeletingDocId]   = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  // ── Module creation flow state ───────────────────────────────────────────
  const [moduleCreating, setModuleCreating]         = useState(false)
  const [moduleFromSchedule, setModuleFromSchedule] = useState(false)

  // ── Module detail / viewer state ─────────────────────────────────────────
  const [selectedModule, setSelectedModule]         = useState(null) // { module_id, ... }
  const [moduleContent, setModuleContent]           = useState(null) // JSON content
  const [moduleContentDirty, setModuleContentDirty] = useState(false)
  const [moduleSaving, setModuleSaving]             = useState(false)
  const [moduleExporting, setModuleExporting]       = useState(false)
  const [expandedSubtopics, setExpandedSubtopics]   = useState(new Set())
  const [subtopicGenerating, setSubtopicGenerating] = useState(null)
  const [assessmentCreating, setAssessmentCreating] = useState(false)
  const [assessmentSessionId, setAssessmentSessionId] = useState(null)
  const [assessmentToolsTab, setAssessmentToolsTab] = useState('builder')
  const [manualAssessmentItem, setManualAssessmentItem] = useState({
    question_text: '',
    choices: ['', '', '', ''],
    correct_answer: 'A',
    answer_key: '',
    points: '1',
    bloom_level: 'Remember',
    bloom_verb: '',
  })
  const [selectedAssessment, setSelectedAssessment] = useState(null)
  const [assessmentDetail, setAssessmentDetail] = useState(null)
  const [assessmentExporting, setAssessmentExporting] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingItemDraft, setEditingItemDraft] = useState(null)
  const [itemSaving, setItemSaving] = useState(false)
  // AI chatbox
  const [chatOpen, setChatOpen]       = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatField, setChatField]     = useState('')  // which section is focused

  // ── Curriculum quality metrics state ────────────────────────────────────
  const [qualityMetrics, setQualityMetrics]       = useState(null)
  const [qualityLoading, setQualityLoading]       = useState(false)
  const [qualityError, setQualityError]           = useState('')

  async function handleComputeMetrics() {
    setQualityLoading(true); setQualityError(''); setQualityMetrics(null)
    try {
      const { data } = await api.post('/curriculum/quality-metrics/', { syllabus_content: syllabusData })
      if (data.success) setQualityMetrics(data)
      else setQualityError(data.detail || data.error || 'Failed to compute metrics.')
    } catch (err) { setQualityError(extractApiError(err)) }
    finally { setQualityLoading(false) }
  }

  // ── Syllabus upload (parse) state ────────────────────────────────────────
  const syllabusUploadRef                   = useRef(null)
  const [syllabusUploading, setSyllabusUploading]     = useState(false)
  const [syllabusUploadError, setSyllabusUploadError] = useState('')
  const [syllabusUploadSuccess, setSyllabusUploadSuccess] = useState(false)
  const [activeFwKey, setActiveFwKey] = useState('SO')

  // ── Syllabus export & template state (session-based, no DB save) ────────
  const [syllabusTemplateFile, setSyllabusTemplateFile] = useState(null)  // session-only
  const [syllabusExporting, setSyllabusExporting] = useState(false)
  const [syllabusExportError, setSyllabusExportError] = useState('')

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

    // 7. ilo_bloom: parallel array to ilos (one {level, verb} per ILO)
    const normIloBloom = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.ilo_bloom || [])[i] || {}
      return { level: ex.level || '', verb: ex.verb || '' }
    })

    // 8. tos: Table of Specifications — exam objects with topic rows
    const BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    const mkEmptyTopicRow = () => ({
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      topic: '', ilos: [], hours_class: 0, hours_min: 0, weight: '',
      bloom_items: BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {}),
      bloom_pct:   BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {}),
      total_points: '',
    })
    const normTopicRow = (r) => ({
      id: r.id || `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      topic: r.topic || '',
      ilos: r.ilos || [],
      hours_class: r.hours_class ?? 0,
      hours_min:   r.hours_min ?? 0,
      weight: r.weight || '',
      bloom_items: BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: (r.bloom_items || {})[k] || (r.bloom_dist || {})[k] || '' }), {}),
      bloom_pct:   BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: (r.bloom_pct || {})[k] || '' }), {}),
      total_points: r.total_points || '',
    })
    const normTos = (() => {
      const raw_tos = raw.tos || []
      if (!raw_tos.length) return [{ id: 'tos-1', examCode: 'ME', examLabel: 'Midterm Examination', semester: '', preparedBy: '', checkedBy: '', approvedBy: '', totalTestItems: 0, topics: [mkEmptyTopicRow()] }]
      // Migrate old flat format: [{topic, bloom_dist, ...}] → single exam wrapper
      if (!raw_tos[0].topics && !raw_tos[0].examLabel) {
        return [{ id: 'tos-migrated', examCode: 'ME', examLabel: 'Examination', semester: '', preparedBy: '', checkedBy: '', approvedBy: '', totalTestItems: 0, topics: raw_tos.map(normTopicRow) }]
      }
      return raw_tos.map(exam => ({
        id: exam.id || `tos-${Date.now()}`,
        examCode:   exam.examCode   || '',
        examLabel:  exam.examLabel  || '',
        semester:   exam.semester   || '',
        preparedBy: exam.preparedBy || '',
        checkedBy:  exam.checkedBy  || '',
        approvedBy: exam.approvedBy || '',
        totalTestItems: exam.totalTestItems || 0,
        topics: (exam.topics || []).length ? exam.topics.map(normTopicRow) : [mkEmptyTopicRow()],
      }))
    })()

    return {
      ...EMPTY_SYLLABUS, ...raw,
      rationale: raw.rationale || '',
      ilo_bloom: normIloBloom,
      tos: normTos,
      assessment_tasks: normTasksResult.length
        ? normTasksResult
        : [{ ...EMPTY_TASK, ilo_values: Array(iloCount).fill('') }],
      tla_chapters: normChaptersResult.length ? normChaptersResult : [{ ...EMPTY_CHAPTER }],
      schedule_methods: normSchedule,
      so_headers:    soHeaders,    so_cpa_rows:   normSoCpa,
      iga_headers:   igaHeaders,   iga_rows:      normIga,
      cdio_headers:  cdioHeaders,  sdg_headers:   sdgHeaders,
      cdio_sdg_rows: normCdioSdg,
      ats: raw.ats || EMPTY_SYLLABUS.ats,
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
        ilo_bloom: [...(s.ilo_bloom || []), { level: '', verb: '' }],
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
      ilo_bloom: (s.ilo_bloom || []).filter((_, j) => j !== i),
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

  async function handleDeleteDoc(recordsId) {
    setDeletingDocId(recordsId)
    try {
      await api.delete(`/integrations/course-rag-documents/${recordsId}/delete/`)
      setSelectedDocIds(prev => { const next = new Set(prev); next.delete(recordsId); return next })
      docsApi.execute()
    } catch (err) { console.error('[handleDeleteDoc] error:', err?.response?.status, err?.response?.data, err); setUploadError(extractApiError(err)) }
    finally { setDeletingDocId(null) }
  }

  async function handleRenameDoc(recordsId, newName) {
    try {
      await api.patch(`/integrations/course-rag-documents/${recordsId}/rename/`, { name: newName })
      setRenamingDocId(null)
      docsApi.execute()
    } catch (err) { setUploadError(extractApiError(err)) }
  }

  async function handleAiGenerate(mode) {
    if (!aiField || !course) return
    setAiGenerating(true); setAiError('')
    try {
      const currentValue = getAiCurrentValue()
      const isIlo = aiField.arrField === 'ilos'
      let extraHint = ''
      if (isIlo) {
        if (iloBloomVerb) extraHint += `Use the Bloom's Taxonomy verb: "${iloBloomVerb}". `
        if (iloFocusText.trim()) extraHint += `The ILO should focus on: ${iloFocusText.trim()}. `
      }
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : undefined
      const { data } = await api.post('/curriculum/generate-syllabus-field/', {
        course_id: courseId,
        section: aiField.section,
        field_label: aiField.label,
        existing_content: mode === 'continue' ? currentValue : '',
        mode,
        provider: aiProvider,
        top_k: 5,
        extra_instructions: extraHint || undefined,
        selected_doc_ids: selectedIds,
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

  async function handleExportDocx() {
    if (!courseId) {
      setSyllabusExportError('Select a course first before exporting.')
      return
    }
    setSyllabusExporting(true)
    setSyllabusExportError('')
    try {
      const formData = new FormData()
      formData.append('course_id', courseId)
      formData.append('syllabus_data', JSON.stringify(syllabusData || {}))
      if (syllabusTemplateFile) {
        formData.append('template', syllabusTemplateFile)
      }

      const response = await api.post('/curriculum/export-syllabus-docx/', formData, {
        headers: { 'Content-Type': undefined },
        responseType: 'blob',
        timeout: 120000,
      })

      const blob = response.data
      const contentDisposition = response.headers?.['content-disposition'] || ''
      const match = contentDisposition.match(/filename="?([^";]+)"?/i)
      const isXlsx = syllabusTemplateFile?.name?.toLowerCase().endsWith('.xlsx')
      const ext = isXlsx ? 'xlsx' : 'docx'
      const baseName = (syllabusData.course_code || 'syllabus').replace(/[\\/\s]+/g, '_')
      const downloadName = match?.[1] || `${baseName}_syllabus.${ext}`

      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', downloadName)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      let message = 'Failed to export syllabus.'
      const blobData = err?.response?.data
      if (blobData instanceof Blob) {
        try {
          const text = await blobData.text()
          const parsed = JSON.parse(text)
          message = parsed?.error || parsed?.detail || message
        } catch (_) {
          message = err?.message || message
        }
      } else {
        message = extractApiError(err) || err?.message || message
      }
      setSyllabusExportError(message)
    } finally {
      setSyllabusExporting(false)
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
      year_level:       course.year_level           || location.state?.year_level || '',
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
      ats:               course.ats               || undefined,
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

  // ── Auto-sync Major Examination tasks → TOS when the TOS section opens ──
  useEffect(() => {
    if (syllabusSub !== 'tos') return
    const BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    setSyllabusData(s => {
      const majExam = (s.ats || []).find(a => a.label?.toLowerCase().includes('major exam'))
      if (!majExam || !majExam.subs?.length) return s

      const existingTos = s.tos || []
      const tosLabelMap = new Map(existingTos.map(t => [t.examLabel?.toLowerCase(), t]))

      let updated = false
      // Update examLabel + totalTestItems for existing TOS entries that match a task
      const syncedTos = existingTos.map(t => {
        const matchingTask = majExam.subs.find(
          sub => sub.label?.toLowerCase() === t.examLabel?.toLowerCase()
        )
        if (!matchingTask) return t
        const newTotal = Object.values(matchingTask.iloTotals || {}).reduce(
          (acc, v) => acc + (Number(v) || 0), 0
        )
        const labelChanged = t.examLabel !== matchingTask.label
        const totalChanged = newTotal > 0 && newTotal !== (t.totalTestItems || 0)
        if (!labelChanged && !totalChanged) return t
        updated = true
        return {
          ...t,
          examLabel: matchingTask.label,
          examCode: matchingTask.code || t.examCode,
          totalTestItems: totalChanged ? newTotal : t.totalTestItems,
        }
      })

      // Add TOS entries for tasks that have no matching exam yet
      const finalTos = [...syncedTos]
      for (const task of majExam.subs) {
        if (tosLabelMap.has(task.label?.toLowerCase())) continue
        const totalTestItems = Object.values(task.iloTotals || {}).reduce(
          (acc, v) => acc + (Number(v) || 0), 0
        )
        const now = Date.now()
        finalTos.push({
          id: `tos-${now}-${Math.random().toString(36).slice(2, 5)}`,
          examCode: task.code || '',
          examLabel: task.label || '',
          semester: '',
          preparedBy: '',
          checkedBy: '',
          approvedBy: '',
          totalTestItems,
          topics: [{
            id: `r-${now}-${Math.random().toString(36).slice(2, 5)}`,
            topic: '',
            ilos: [...(task.ilos || [])],
            hours_class: 0,
            hours_min: 0,
            weight: '',
            bloom_items: BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {}),
            bloom_pct:   BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {}),
            total_points: '',
          }],
        })
        updated = true
      }

      if (!updated) return s
      return { ...s, tos: finalTos }
    })
  }, [syllabusSub])

  // ── Save syllabus content ──────────────────────────────────────────────
  async function handleSaveSyllabus() {
    setSaveError('')
    setSaveLoading(true)
    try {
      const { data } = await api.put(`/curriculum/syllabus-content/${courseId}/`, {
        syllabus_content: syllabusData,
      }, { timeout: 60000 })
      setSyllabusId(data.syllabus_id)
      setIsDirty(false)
      setSaveSuccess(true)
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

  useEffect(() => {
    if (!isMobile) return
    setLeftCollapsed(false)
    setRightCollapsed(false)
    setDragging(null)
  }, [isMobile])

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
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : []
      const { data } = await api.post('/curriculum/generate-module/', {
        course_id: course.course_id,
        course_name: course.course_title,
        module_title: moduleParams.module_title,
        week_number: Number(moduleParams.week_number) || 1,
        provider: moduleParams.provider,
        top_k: Number(moduleParams.top_k),
        extra_instructions: moduleParams.extra_instructions,
        selected_doc_ids: selectedIds,
      })
      if (data.success && data.module_content) {
        // Open module viewer with the generated content
        setSelectedModule({
          module_id: data.module_id,
          module_title: data.module_title,
          week_number: data.week_number,
          status: 'Generated',
        })
        setModuleContent(data.module_content)
        setModuleContentDirty(false)
        setExpandedSubtopics(new Set())
        setChatMessages([])
        setModuleCreating(false)
        workspaceApi.execute()
      }
    } catch (err) { setActionError(extractApiError(err)) }
    finally { setActionLoading(false) }
  }

  async function handleOpenModule(mod) {
    setActionError('')
    if (mod.module_content) {
      setSelectedModule(mod)
      setModuleContent(mod.module_content)
      setModuleContentDirty(false)
      setExpandedSubtopics(new Set())
      setChatMessages([])
      return
    }
    // Fetch from server if not loaded
    try {
      const { data } = await api.get(`/curriculum/module/${mod.module_id}/`)
      if (data.success) {
        setSelectedModule(data.module)
        setModuleContent(data.module.module_content || null)
        setModuleContentDirty(false)
        setExpandedSubtopics(new Set())
        setChatMessages([])
      }
    } catch (err) { setActionError(extractApiError(err)) }
  }

  async function handleSaveModuleContent() {
    if (!selectedModule || !moduleContent) return
    setModuleSaving(true)
    try {
      await api.put(`/curriculum/module/${selectedModule.module_id}/save/`, { module_content: moduleContent })
      setModuleContentDirty(false)
      workspaceApi.execute()
    } catch (err) { setActionError(extractApiError(err)) }
    finally { setModuleSaving(false) }
  }

  async function handleExportModuleDocx() {
    if (!selectedModule?.module_id) {
      setActionError('Open a module first before exporting.')
      return
    }

    setModuleExporting(true)
    setActionError('')

    try {
      const formData = new FormData()
      formData.append('module_id', selectedModule.module_id)
      formData.append('module_data', JSON.stringify(moduleContent || {}))

      const response = await api.post('/curriculum/export-module-docx/', formData, {
        headers: { 'Content-Type': undefined },
        responseType: 'blob',
        timeout: 120000,
      })

      const blob = response.data
      const contentDisposition = response.headers?.['content-disposition'] || ''
      const match = contentDisposition.match(/filename="?([^";]+)"?/i)
      const title = (moduleContent?.module_title || selectedModule?.module_title || 'module').replace(/[\\/\s]+/g, '_')
      const downloadName = match?.[1] || `${title}_module.docx`

      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', downloadName)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      let message = 'Failed to export module.'
      const blobData = err?.response?.data
      if (blobData instanceof Blob) {
        try {
          const text = await blobData.text()
          const parsed = JSON.parse(text)
          message = parsed?.error || parsed?.detail || message
        } catch (_) {
          message = err?.message || message
        }
      } else {
        message = extractApiError(err) || err?.message || message
      }
      setActionError(message)
    } finally {
      setModuleExporting(false)
    }
  }

  async function handleGenerateSubtopicContent(subtopicId, subtopicTitle) {
    if (!selectedModule) return
    setSubtopicGenerating(subtopicId)
    try {
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : []
      const currentContent = moduleContent?.subtopics?.find(s => s.id === subtopicId)?.content || ''
      const { data } = await api.post('/curriculum/generate-subtopic-content/', {
        module_id: selectedModule.module_id,
        subtopic_title: subtopicTitle,
        subtopic_id: subtopicId,
        existing_content: currentContent,
        selected_doc_ids: selectedIds,
        provider: moduleParams.provider,
      })
      if (data.success) {
        setModuleContent(prev => ({
          ...prev,
          subtopics: prev.subtopics.map(st =>
            st.id === subtopicId ? { ...st, content: data.content } : st
          )
        }))
        setModuleContentDirty(true)
        setExpandedSubtopics(prev => { const next = new Set(prev); next.add(subtopicId); return next })
      }
    } catch (err) { setActionError(extractApiError(err)) }
    finally { setSubtopicGenerating(null) }
  }

  async function handleChatSend() {
    if (!chatInput.trim() || !selectedModule) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)
    try {
      const currentContent = chatField === 'introduction' ? moduleContent?.introduction || ''
        : chatField === 'short_activity' ? JSON.stringify(moduleContent?.short_activity || {})
        : (moduleContent?.learning_objectives || []).join('\n')
      const { data } = await api.post('/curriculum/module-ai-assist/', {
        module_id: selectedModule.module_id,
        field: chatField || 'general',
        current_content: currentContent,
        instruction: userMsg,
        provider: moduleParams.provider,
      })
      if (data.success) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.revised_content }])
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }])
    }
    finally { setChatLoading(false) }
  }

  function updateModuleField(field, value) {
    setModuleContent(prev => ({ ...prev, [field]: value }))
    setModuleContentDirty(true)
  }

  function updateSubtopicField(subtopicId, key, value) {
    setModuleContent(prev => ({
      ...prev,
      subtopics: prev.subtopics.map(st => st.id === subtopicId ? { ...st, [key]: value } : st)
    }))
    setModuleContentDirty(true)
  }

  function parseFacultyTopics(text) {
    return String(text || '')
      .split(/\r?\n|;/)
      .map(t => t.trim())
      .filter(Boolean)
  }

  function getMajorTosExams() {
    const tos = syllabusData?.tos || []
    const isMajorExam = (entry) => {
      const examCode = String(entry?.examCode || '').toLowerCase().trim()
      const examLabel = String(entry?.examLabel || entry?.label || '').toLowerCase().trim()
      const text = `${examCode} ${examLabel}`
      if (typeof entry?.isMajor === 'boolean') return entry.isMajor
      if (/(major|midterm|prelim|pre[-\s]?final|final)/i.test(text)) return true
      const compact = examCode.replace(/[^a-z0-9]/g, '')
      return ['me', 'mt', 'fe', 'prelim', 'prelims'].includes(compact)
    }

    const toInt = (v) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.trunc(n) : 0
    }

    const totalFromTopics = (topics) => {
      const rows = Array.isArray(topics) ? topics : []
      const byPoints = rows.reduce((sum, row) => sum + toInt(row?.total_points), 0)
      if (byPoints > 0) return byPoints
      const byWeight = rows.reduce((sum, row) => sum + toInt(row?.weight), 0)
      if (byWeight > 0) return byWeight
      const bloomKeys = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
      return rows.reduce((sum, row) => {
        const bloom = row?.bloom_items || {}
        return sum + bloomKeys.reduce((inner, key) => inner + toInt(bloom?.[key]), 0)
      }, 0)
    }

    return tos
      .filter(entry => entry && typeof entry === 'object' && isMajorExam(entry))
      .map((entry, idx) => {
        const examCode = String(entry.examCode || '').trim()
        const examLabel = String(entry.examLabel || examCode || `Major Exam ${idx + 1}`).trim()
        const totalExplicit = toInt(entry.totalTestItems)
        const totalItems = totalExplicit > 0 ? totalExplicit : totalFromTopics(entry.topics)
        return {
          examCode,
          examLabel,
          totalItems: totalItems > 0 ? totalItems : 0,
          topics: Array.isArray(entry.topics) ? entry.topics : [],
        }
      })
  }

  function getAssessmentBlueprint() {
    const majorExams = getMajorTosExams()
    const selectedByCode = majorExams.find(exam => exam.examCode && exam.examCode === assessmentParams.source_exam_code)
    const selectedByLabel = !selectedByCode
      ? majorExams.find(exam => exam.examLabel && exam.examLabel === assessmentParams.source_exam_label)
      : null
    const selectedExam = selectedByCode || selectedByLabel || majorExams[0] || null

    const assessmentName = selectedExam?.examLabel || 'Major Examination'
    const assessmentType = assessmentName.toLowerCase()
    const totalItems = Number(selectedExam?.totalItems || 0)

    return {
      hasMajorExam: Boolean(selectedExam),
      assessmentName,
      assessmentType,
      totalItems,
      examCode: selectedExam?.examCode || '',
      sourceTaskLabel: selectedExam?.examLabel || '',
      sourceMode: selectedExam ? 'TOS Major Examination' : 'No Major TOS Exam Found',
    }
  }

  async function handleGenerateAssessment() {
    if (!course) return

    const blueprint = getAssessmentBlueprint()
    if (!blueprint.hasMajorExam) {
      setActionError('No major examination found in TOS. Add a major exam (e.g., Midterm/Final) with total items first.')
      return
    }

    const targetItemNumber = Number(assessmentParams.target_item_number || 0)
    if (!Number.isFinite(targetItemNumber) || targetItemNumber < 1) {
      setActionError('Target item number must be at least 1.')
      return
    }
    if (blueprint.totalItems > 0 && targetItemNumber > blueprint.totalItems) {
      setActionError(`Target item number must be between 1 and ${blueprint.totalItems}.`)
      return
    }

    const relatedItemNumber = Number(assessmentParams.related_item_number || 0)
    if (relatedItemNumber && relatedItemNumber === targetItemNumber) {
      setActionError('Related item number cannot be the same as target item number.')
      return
    }

    setActionError('')
    setActionLoading(true)

    try {
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : []
      const facultyTopics = parseFacultyTopics(assessmentParams.faculty_topics)
      const { data } = await api.post('/curriculum/generate-assessment/', {
        course_id: course.course_id,
        assessment_type: blueprint.assessmentType,
        provider: assessmentParams.provider,
        extra_instructions: assessmentParams.extra_instructions,
        selected_doc_ids: selectedIds,
        source_exam_code: blueprint.examCode,
        source_exam_label: blueprint.assessmentName,
        faculty_topics: facultyTopics,
        assessment_id: assessmentSessionId || undefined,
        item_by_item: true,
        target_item_number: targetItemNumber,
        related_item_number: relatedItemNumber || undefined,
        relation_instruction: assessmentParams.relation_instruction,
        overwrite_item: Boolean(assessmentParams.overwrite_item),
      })

      if (data?.success) {
        const newAssessmentId = data?.assessment?.assessment_id || assessmentSessionId
        if (newAssessmentId) setAssessmentSessionId(newAssessmentId)
        if (Number.isFinite(Number(data?.next_item_number)) && Number(data.next_item_number) > 0) {
          const nextNum = Number(data.next_item_number)
          setAssessmentParams(p => ({
            ...p,
            target_item_number: nextNum,
            related_item_number: (Number(p.related_item_number || 0) >= nextNum) ? '' : p.related_item_number,
          }))
        }
        setAssessmentCreating(false)
        workspaceApi.execute()
        if (data?.assessment?.assessment_id) {
          await handleOpenAssessment(data.assessment)
        }
      }
    } catch (err) {
      setActionError(extractApiError(err))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleOpenAssessment(assessmentSummary) {
    setActionError('')
    try {
      const { data } = await api.get(`/curriculum/assessment/${assessmentSummary.assessment_id}/`)
      if (data?.success && data?.assessment) {
        setSelectedAssessment(assessmentSummary)
        setAssessmentDetail(data.assessment)
        setAssessmentSessionId(data.assessment.assessment_id || assessmentSummary.assessment_id)
        setAssessmentToolsTab('builder')
        setEditingItemId(null)
        setEditingItemDraft(null)
      }
    } catch (err) {
      setActionError(extractApiError(err))
    }
  }

  function handleStartItemEdit(item) {
    const existingChoices = Array.isArray(item.choices) ? item.choices : []
    const normalizedChoices = existingChoices.length >= 4 ? existingChoices : [...existingChoices, ...Array(4 - existingChoices.length).fill('')]
    setEditingItemId(item.item_id)
    setEditingItemDraft({
      question_text: item.question_text || '',
      choices: normalizedChoices,
      correct_answer: (item.correct_answer || '').toUpperCase(),
      answer_key: item.answer_key || '',
    })
  }

  function handleEditChoiceChange(index, value) {
    setEditingItemDraft(prev => {
      if (!prev) return prev
      const nextChoices = [...(prev.choices || [])]
      nextChoices[index] = value
      return { ...prev, choices: nextChoices }
    })
  }

  async function handleSaveItemEdit() {
    if (!editingItemDraft || !editingItemId) return
    const cleanedQuestion = String(editingItemDraft.question_text || '').trim()
    if (!cleanedQuestion) {
      setActionError('Question cannot be empty.')
      return
    }

    const cleanedChoices = Array.isArray(editingItemDraft.choices)
      ? editingItemDraft.choices.map(choice => String(choice || '').trim())
      : []

    const rawAnswer = String(editingItemDraft.correct_answer || '').trim().toUpperCase()
    const normalizedAnswer = rawAnswer ? (rawAnswer.match(/[A-E]/)?.[0] || '') : ''
    if (rawAnswer && !normalizedAnswer) {
      setActionError('Correct answer must be one of A, B, C, D, or E.')
      return
    }

    setItemSaving(true)
    setActionError('')
    try {
      const { data } = await api.patch(`/curriculum/assessment-item/${editingItemId}/`, {
        question_text: cleanedQuestion,
        choices: cleanedChoices,
        correct_answer: normalizedAnswer,
        answer_key: String(editingItemDraft.answer_key || '').trim(),
      })
      if (data.success) {
        setAssessmentDetail(prev => {
          const updated = { ...prev }
          updated.sections = (prev.sections || []).map(sec => ({
            ...sec,
            items: sec.items.map(it =>
              it.item_id === editingItemId ? { ...it, ...data.item } : it
            ),
          }))
          return updated
        })
        setEditingItemId(null)
        setEditingItemDraft(null)
      } else {
        setActionError(data.detail || 'Failed to save item.')
      }
    } catch (err) {
      const statusCode = err?.response?.status
      const responseText = typeof err?.response?.data === 'string' ? err.response.data : ''
      if (statusCode === 404 && responseText.includes('Page not found')) {
        setActionError('Save endpoint is unavailable on the running backend. Restart the Django API server, then try saving again.')
      } else {
        setActionError(extractApiError(err) || 'Failed to save item.')
      }
    } finally {
      setItemSaving(false)
    }
  }

  function updateManualChoice(index, value) {
    setManualAssessmentItem(prev => {
      const nextChoices = [...(prev.choices || ['', '', '', ''])]
      nextChoices[index] = value
      return { ...prev, choices: nextChoices }
    })
  }

  async function handleAddManualAssessmentItem() {
    if (!course) return
    const assessmentId = assessmentSessionId || assessmentDetail?.assessment_id
    if (!assessmentId) {
      setActionError('Open or create an assessment session first.')
      return
    }

    const questionText = String(manualAssessmentItem.question_text || '').trim()
    if (!questionText) {
      setActionError('Manual item question cannot be empty.')
      return
    }

    const choices = (manualAssessmentItem.choices || []).map(choice => String(choice || '').trim())
    const hasAtLeastTwoChoices = choices.filter(Boolean).length >= 2
    if (!hasAtLeastTwoChoices) {
      setActionError('Provide at least two choices for the manual item.')
      return
    }

    setActionLoading(true)
    setActionError('')
    try {
      const targetItemNumber = Number(assessmentParams.target_item_number || 0)
      const relatedItemNumber = Number(assessmentParams.related_item_number || 0)
      const payload = {
        course_id: course.course_id,
        assessment_type: getAssessmentBlueprint().assessmentType,
        provider: assessmentParams.provider,
        extra_instructions: assessmentParams.extra_instructions,
        selected_doc_ids: selectedDocIds.size > 0 ? [...selectedDocIds] : [],
        source_exam_code: assessmentParams.source_exam_code || getAssessmentBlueprint().examCode,
        source_exam_label: assessmentParams.source_exam_label || getAssessmentBlueprint().assessmentName,
        assessment_id: assessmentId,
        item_by_item: true,
        target_item_number: targetItemNumber,
        related_item_number: relatedItemNumber || undefined,
        relation_instruction: assessmentParams.relation_instruction,
        overwrite_item: Boolean(assessmentParams.overwrite_item),
        manual_item: {
          question_text: questionText,
          choices,
          correct_answer: String(manualAssessmentItem.correct_answer || 'A').trim().toUpperCase(),
          answer_key: String(manualAssessmentItem.answer_key || '').trim(),
          points: manualAssessmentItem.points,
          bloom_level: manualAssessmentItem.bloom_level,
          bloom_verb: manualAssessmentItem.bloom_verb,
        },
      }

      const { data } = await api.post('/curriculum/generate-assessment/', payload)
      if (data?.success) {
        const newAssessmentId = data?.assessment?.assessment_id || assessmentId
        if (newAssessmentId) setAssessmentSessionId(newAssessmentId)
        if (Number.isFinite(Number(data?.next_item_number)) && Number(data.next_item_number) > 0) {
          setAssessmentParams(p => ({
            ...p,
            target_item_number: Number(data.next_item_number),
            related_item_number: '',
          }))
        }
        setManualAssessmentItem(prev => ({
          ...prev,
          question_text: '',
          choices: ['', '', '', ''],
          correct_answer: 'A',
          answer_key: '',
          points: '1',
          bloom_level: 'Remember',
          bloom_verb: '',
        }))
        workspaceApi.execute()
        if (data?.assessment?.assessment_id) {
          await handleOpenAssessment(data.assessment)
        }
      }
    } catch (err) {
      setActionError(extractApiError(err))
    } finally {
      setActionLoading(false)
    }
  }

  function renderAssessmentToolsPanel() {
    const blueprint = getAssessmentBlueprint()
    const totalTarget = Number(assessmentDetail?.target_total_items || blueprint.totalItems || assessmentDetail?.total_items || 0)
    const currentCount = Number(assessmentDetail?.total_items || 0)
    const remainingCount = Math.max(0, totalTarget - currentCount)
    const targetItemValue = Number(assessmentParams.target_item_number || currentCount + 1 || 1)
    const relatedOptions = Array.from({ length: Math.max(0, targetItemValue - 1) }, (_, idx) => String(idx + 1))

    if (!selectedAssessment || !assessmentDetail) {
      return renderUploadPanel()
    }

    return (
      <Stack spacing={1.5}>
        <Tabs
          value={assessmentToolsTab}
          onChange={(_, value) => setAssessmentToolsTab(value)}
          variant="fullWidth"
          sx={{ minHeight: 34, mb: 0.5, '& .MuiTab-root': { minHeight: 34, textTransform: 'none', fontSize: '0.74rem', fontWeight: 700 } }}
        >
          <Tab value="builder" label="Builder" />
          <Tab value="manual" label="Manual" />
          <Tab value="sources" label="Sources" />
        </Tabs>

        {assessmentToolsTab === 'builder' && (
          <Stack spacing={1.15}>
            <Box sx={{ p: 1.1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: BG }}>
              <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.68rem' }}>
                Progress
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: MAROON, lineHeight: 1.25 }}>
                {currentCount}/{totalTarget || currentCount || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: '#777', display: 'block', mt: 0.25, fontSize: '0.68rem' }}>
                {remainingCount} item{remainingCount === 1 ? '' : 's'} left
              </Typography>
            </Box>

            <LField
              select
              label="Major Examination"
              value={assessmentParams.source_exam_code || assessmentParams.source_exam_label || blueprint.examCode || blueprint.assessmentName || ''}
              onChange={e => {
                const selected = getMajorTosExams().find(exam => (exam.examCode || exam.examLabel) === e.target.value)
                setAssessmentParams(p => ({
                  ...p,
                  source_exam_code: selected?.examCode || '',
                  source_exam_label: selected?.examLabel || '',
                }))
              }}
            >
              {getMajorTosExams().length === 0 ? (
                <MenuItem value="" disabled>
                  No major examinations found in TOS
                </MenuItem>
              ) : getMajorTosExams().map(exam => (
                <MenuItem key={`${exam.examCode || exam.examLabel}`} value={exam.examCode || exam.examLabel}>
                  {exam.examLabel} ({exam.totalItems || 0} items)
                </MenuItem>
              ))}
            </LField>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              <Box sx={{ p: 1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.25, bgcolor: '#fff' }}>
                <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.66rem' }}>Target Item</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#222' }}>{targetItemValue}</Typography>
              </Box>
              <Box sx={{ p: 1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.25, bgcolor: '#fff' }}>
                <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.66rem' }}>Current</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#222' }}>{currentCount}</Typography>
              </Box>
              <Box sx={{ p: 1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.25, bgcolor: '#fff' }}>
                <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.66rem' }}>Remaining</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#222' }}>{remainingCount}</Typography>
              </Box>
            </Box>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <LField
                type="number"
                label="Target Item Number"
                value={assessmentParams.target_item_number}
                onChange={e => setAssessmentParams(p => ({ ...p, target_item_number: e.target.value }))}
                inputProps={{ min: 1, max: totalTarget || undefined }}
              />
              <LField
                select
                label="Related to Item (optional)"
                value={assessmentParams.related_item_number}
                onChange={e => setAssessmentParams(p => ({ ...p, related_item_number: e.target.value }))}
              >
                <MenuItem value="">None</MenuItem>
                {relatedOptions.map(n => (
                  <MenuItem key={`right-related-${n}`} value={String(n)}>
                    Item {n}
                  </MenuItem>
                ))}
              </LField>
            </Stack>

            <LField
              label="Relation Instruction"
              multiline
              minRows={2}
              value={assessmentParams.relation_instruction}
              onChange={e => setAssessmentParams(p => ({ ...p, relation_instruction: e.target.value }))}
              placeholder="How should this item relate to the selected item?"
            />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Checkbox
                size="small"
                checked={Boolean(assessmentParams.overwrite_item)}
                onChange={e => setAssessmentParams(p => ({ ...p, overwrite_item: e.target.checked }))}
                sx={{ color: MAROON, '&.Mui-checked': { color: MAROON }, p: 0.2 }}
              />
              <Typography variant="caption" sx={{ color: '#666' }}>Overwrite existing item</Typography>
            </Box>

            <LField
              label="Extra Instructions"
              multiline
              minRows={2}
              value={assessmentParams.extra_instructions}
              onChange={e => setAssessmentParams(p => ({ ...p, extra_instructions: e.target.value }))}
            />

            <LField
              select
              label="Model Provider"
              value={assessmentParams.provider}
              onChange={e => setAssessmentParams(p => ({ ...p, provider: e.target.value }))}
            >
              {PROVIDERS.map(p => <MenuItem key={p} value={p}>{cap(p)}</MenuItem>)}
            </LField>

            <GenButton
              onClick={handleGenerateAssessment}
              disabled={actionLoading || remainingCount <= 0}
            >
              {actionLoading ? 'Generating…' : remainingCount > 0 ? 'Generate Item' : 'Assessment Complete'}
            </GenButton>
          </Stack>
        )}

        {assessmentToolsTab === 'manual' && (
          <Stack spacing={1.1}>
            <Box sx={{ p: 1.1, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: BG }}>
              <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.68rem' }}>
                Manual Item Entry
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: MAROON, lineHeight: 1.25 }}>
                {currentCount}/{totalTarget || currentCount || 0}
              </Typography>
            </Box>

            <LField
              type="number"
              label="Target Item Number"
              value={assessmentParams.target_item_number}
              onChange={e => setAssessmentParams(p => ({ ...p, target_item_number: e.target.value }))}
              inputProps={{ min: 1, max: totalTarget || undefined }}
            />

            <LField
              label="Question"
              multiline
              minRows={3}
              value={manualAssessmentItem.question_text}
              onChange={e => setManualAssessmentItem(p => ({ ...p, question_text: e.target.value }))}
            />

            {manualAssessmentItem.choices.map((choice, index) => (
              <LField
                key={`manual-choice-${index}`}
                label={`Choice ${String.fromCharCode(65 + index)}`}
                value={choice}
                onChange={e => updateManualChoice(index, e.target.value)}
              />
            ))}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <LField
                select
                label="Correct Answer"
                value={manualAssessmentItem.correct_answer}
                onChange={e => setManualAssessmentItem(p => ({ ...p, correct_answer: e.target.value }))}
              >
                <MenuItem value="A">A</MenuItem>
                <MenuItem value="B">B</MenuItem>
                <MenuItem value="C">C</MenuItem>
                <MenuItem value="D">D</MenuItem>
                <MenuItem value="E">E</MenuItem>
              </LField>
              <LField
                type="number"
                label="Points"
                value={manualAssessmentItem.points}
                onChange={e => setManualAssessmentItem(p => ({ ...p, points: e.target.value }))}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <LField
                select
                label="Bloom Level"
                value={manualAssessmentItem.bloom_level}
                onChange={e => setManualAssessmentItem(p => ({ ...p, bloom_level: e.target.value }))}
              >
                {['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'].map(level => (
                  <MenuItem key={level} value={level}>{level}</MenuItem>
                ))}
              </LField>
              <LField
                label="Bloom Verb"
                value={manualAssessmentItem.bloom_verb}
                onChange={e => setManualAssessmentItem(p => ({ ...p, bloom_verb: e.target.value }))}
              />
            </Stack>

            <LField
              label="Explanation / Answer Key"
              multiline
              minRows={3}
              value={manualAssessmentItem.answer_key}
              onChange={e => setManualAssessmentItem(p => ({ ...p, answer_key: e.target.value }))}
            />

            <GenButton onClick={handleAddManualAssessmentItem} disabled={actionLoading || remainingCount <= 0}>
              {actionLoading ? 'Saving…' : remainingCount > 0 ? 'Add Manual Item' : 'Assessment Complete'}
            </GenButton>
          </Stack>
        )}

        {assessmentToolsTab === 'sources' && renderUploadPanel()}
      </Stack>
    )
  }

  async function handleExportAssessmentDocx() {
    if (!assessmentDetail) {
      setActionError('Open an assessment first before exporting.')
      return
    }

    setAssessmentExporting(true)
    setActionError('')

    try {
      const formData = new FormData()
      if (assessmentDetail.assessment_id) {
        formData.append('assessment_id', assessmentDetail.assessment_id)
      }
      formData.append('assessment_data', JSON.stringify(assessmentDetail))

      const response = await api.post('/curriculum/export-assessment-docx/', formData, {
        headers: { 'Content-Type': undefined },
        responseType: 'blob',
        timeout: 120000,
      })

      const blob = response.data
      const contentDisposition = response.headers?.['content-disposition'] || ''
      const match = contentDisposition.match(/filename="?([^";]+)"?/i)
      const safeTitle = (assessmentDetail.title || 'assessment').replace(/[\\/\s]+/g, '_')
      const downloadName = match?.[1] || `${safeTitle}_assessment.docx`

      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', downloadName)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      let message = 'Failed to export assessment.'
      const blobData = err?.response?.data
      if (blobData instanceof Blob) {
        try {
          const text = await blobData.text()
          const parsed = JSON.parse(text)
          message = parsed?.error || parsed?.detail || message
        } catch (_) {
          message = err?.message || message
        }
      } else {
        message = extractApiError(err) || err?.message || message
      }
      setActionError(message)
    } finally {
      setAssessmentExporting(false)
    }
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
    if (workspaceApi.error && !workspaceApi.data) return <AutoAlert message={workspaceApi.error} onClose={() => {}} />

    // ── 1. Course Overview ───────────────────────────────────────────────────
    if (syllabusSub === 'overview') {
      const iloCount  = (syllabusData.ilos || []).length
      const atCount   = (syllabusData.assessment_tasks || []).length
      const refCount  = (syllabusData.references || []).length
      const polCount  = (syllabusData.policies || []).length
      const statCards = [
        { label: 'ILOs',             value: iloCount, color: MAROON },
        { label: 'Assessment Tasks', value: atCount,  color: '#1565c0' },
        { label: 'References',       value: refCount, color: '#2e7d32' },
        { label: 'Policies',         value: polCount, color: '#6a1b9a' },
      ]
      const soHeaders   = syllabusData.so_headers   || ['']
      const igaHeaders  = syllabusData.iga_headers  || ['']
      const cdioHeaders = syllabusData.cdio_headers || ['']
      const sdgHeaders  = syllabusData.sdg_headers  || ['']
      const groupColors = { SO: '#1565c0', IGA: MAROON, CDIO: '#2e7d32', SDG: '#6a1b9a' }
      const allFwCols = [
        ...soHeaders.map((h, i)   => ({ label: h || `SO${i+1}`,   source: 'so',   ci: i, group: 'SO' })),
        ...igaHeaders.map((h, i)  => ({ label: h || `IGA${i+1}`,  source: 'iga',  ci: i, group: 'IGA' })),
        ...cdioHeaders.map((h, i) => ({ label: h || `CDIO${i+1}`, source: 'cdio', ci: i, group: 'CDIO' })),
        ...sdgHeaders.map((h, i)  => ({ label: h || `SDG${i+1}`,  source: 'sdg',  ci: i, group: 'SDG' })),
      ]
      function getFwValOv(ri, source, ci) {
        if (source === 'so')   return ((syllabusData.so_cpa_rows   || [])[ri]?.so_vals   || [])[ci] || ''
        if (source === 'iga')  return ((syllabusData.iga_rows      || [])[ri]?.vals      || [])[ci] || ''
        if (source === 'cdio') return ((syllabusData.cdio_sdg_rows || [])[ri]?.cdio_vals || [])[ci] || ''
        if (source === 'sdg')  return ((syllabusData.cdio_sdg_rows || [])[ri]?.sdg_vals  || [])[ci] || ''
        return ''
      }
      return (
        <>
          <SectionCard title="Syllabus Summary">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1.5 }}>
              {statCards.map(({ label, value, color }) => (
                <Box key={label} sx={{ textAlign: 'center', p: 1.5, border: '1px solid', borderColor: color + '33', borderRadius: 2, bgcolor: color + '0d' }}>
                  <Typography variant="h4" sx={{ fontWeight: 800, color, lineHeight: 1 }}>{value}</Typography>
                  <Typography variant="caption" sx={{ color: '#666', fontSize: '0.75rem' }}>{label}</Typography>
                </Box>
              ))}
            </Box>
          </SectionCard>

          <SectionCard title="Framework Alignment">
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    <th style={{ ...TABLE_TH, minWidth: 60 }}>ILO</th>
                    {allFwCols.map((col, i) => (
                      <th key={i} style={{ ...TABLE_TH, minWidth: 52, textAlign: 'center', fontSize: '0.72rem', color: groupColors[col.group] || '#555' }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(syllabusData.ilos || []).map((_, ri) => (
                    <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? '#fff' : BG }}>
                      <td style={{ ...TABLE_TD, fontWeight: 700, color: MAROON, whiteSpace: 'nowrap' }}>ILO{ri + 1}</td>
                      {allFwCols.map((col, ci) => {
                        const val = getFwValOv(ri, col.source, col.ci)
                        return (
                          <td key={ci} style={{ ...TABLE_TD, textAlign: 'center', backgroundColor: val ? (groupColors[col.group] || MAROON) + '18' : undefined }}>
                            <Typography variant="caption" sx={{ color: val ? (groupColors[col.group] || MAROON) : '#ccc', fontWeight: val ? 700 : 400 }}>
                              {val || '–'}
                            </Typography>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 1 }}>
              Read-only overview. Edit framework mappings in the Framework Mapping section.
            </Typography>
          </SectionCard>
        </>
      )
    }

    // ── 2. Basic Info ────────────────────────────────────────────────────────
    if (syllabusSub === 'basic') {
      return (
        <>
          <SectionCard title="Institution">
            <Box sx={{ display: 'grid', gap: 1.75 }}>
              <LField label="Institution Name"
                value={syllabusData.university_name || ''} onChange={e => setSyl('university_name', e.target.value)} />
              <LField label="Campus / Branch" value={syllabusData.program || ''} onChange={e => setSyl('program', e.target.value)} />
              <LField label="College / Department" value={syllabusData.college || ''} onChange={e => setSyl('college', e.target.value)} />
              <LField label="Address" value={syllabusData.document_title || ''} onChange={e => setSyl('document_title', e.target.value)} />
              <LField label="Contact" value={syllabusData.institution_contact || ''} onChange={e => setSyl('institution_contact', e.target.value)} />
            </Box>
          </SectionCard>

          <SectionCard title="University Direction">
            <LField label="Vision" multiline minRows={3}
              value={syllabusData.vision || ''} onChange={e => setSyl('vision', e.target.value)}
              onFocus={() => setAiField({ section: 'basic', label: 'Vision', fieldType: 'simple', field: 'vision' })} />
            <Box sx={{ mt: 2 }}>
              <LField label="Mission" multiline minRows={4}
                value={syllabusData.mission || ''} onChange={e => setSyl('mission', e.target.value)}
                onFocus={() => setAiField({ section: 'basic', label: 'Mission', fieldType: 'simple', field: 'mission' })} />
            </Box>
          </SectionCard>

          <SectionCard title="Course Identification">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <LField label="Course Title"    value={syllabusData.course_title    || ''} onChange={e => setSyl('course_title',    e.target.value)} />
              <LField label="Course Code"     value={syllabusData.course_code     || ''} onChange={e => setSyl('course_code',     e.target.value)} />
              <LField label="Category"        value={syllabusData.course_category || ''} onChange={e => setSyl('course_category', e.target.value)} />
              <LField label="Pre-requisite"   value={syllabusData.prerequisites   || ''} onChange={e => setSyl('prerequisites',   e.target.value)} />
              <LField select label="Year Level" value={syllabusData.year_level || ''} onChange={e => setSyl('year_level', e.target.value)}>
                <MenuItem value="">— Not specified —</MenuItem>
                {YEAR_LEVELS.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
              </LField>
              <LField label="Credit Hours"    value={syllabusData.credit_hours    || ''} onChange={e => setSyl('credit_hours',    e.target.value)} />
              <LField label="Semester / Year" value={syllabusData.semester_year   || ''} onChange={e => setSyl('semester_year',   e.target.value)} />
              <LField label="Reference CMO"   value={syllabusData.reference_cmo   || ''} onChange={e => setSyl('reference_cmo',   e.target.value)} />
              <LField label="Date Prepared"   value={syllabusData.date_prepared   || ''} onChange={e => setSyl('date_prepared',   e.target.value)} />
              <LField label="Revision No."    value={syllabusData.revision_no     || ''} onChange={e => setSyl('revision_no',     e.target.value)} />
              <LField label="Revision Date"   value={syllabusData.revision_date   || ''} onChange={e => setSyl('revision_date',   e.target.value)} />
              <LField label="Period of Study" value={syllabusData.period_of_study || ''} onChange={e => setSyl('period_of_study', e.target.value)}
                sx={{ gridColumn: 'span 2' }} />
            </Box>
          </SectionCard>

          <SectionCard title="Instructor">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <LField label="Name" value={syllabusData.instructor_name || ''} onChange={e => setSyl('instructor_name', e.target.value)} />
              <LField label="Employee ID" value={syllabusData.employee_id || ''} onChange={e => setSyl('employee_id', e.target.value)} />
              <LField label="Email" value={syllabusData.instructor_email || ''} onChange={e => setSyl('instructor_email', e.target.value)} />
              <LField label="Contact" value={syllabusData.contact_info || ''} onChange={e => setSyl('contact_info', e.target.value)} />
              <LField label="Qualifications" value={syllabusData.education || ''} onChange={e => setSyl('education', e.target.value)}
                sx={{ gridColumn: 'span 2' }} />
            </Box>
          </SectionCard>
        </>
      )
    }

    // ── 3. Course Details ────────────────────────────────────────────────────
    if (syllabusSub === 'details') {
      return (
        <>
          <SectionCard title="Rationale &amp; Description">
            <LField label="Course Rationale" multiline minRows={4}
              value={syllabusData.rationale || ''} onChange={e => setSyl('rationale', e.target.value)}
              onFocus={() => setAiField({ section: 'details', label: 'Course Rationale', fieldType: 'simple', field: 'rationale' })} />
            <Box sx={{ mt: 2 }}>
              <LField label="Course Description" multiline minRows={6}
                value={syllabusData.description} onChange={e => setSyl('description', e.target.value)}
                onFocus={() => setAiField({ section: 'details', label: 'Course Description', fieldType: 'simple', field: 'description' })} />
            </Box>
          </SectionCard>

          <SectionCard title="Contact Hours &amp; Strategies">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.75, mb: 2 }}>
              <LField label="Lecture Hours" type="number"
                value={syllabusData.lecture_hours} onChange={e => setSyl('lecture_hours', e.target.value)} />
              <LField label="Laboratory Hours" type="number"
                value={syllabusData.lab_hours} onChange={e => setSyl('lab_hours', e.target.value)} />
              <LField label="Total Hours" type="number"
                value={syllabusData.total_hours || (Number(syllabusData.lecture_hours||0) + Number(syllabusData.lab_hours||0) || '')}
                onChange={e => setSyl('total_hours', e.target.value)} />
            </Box>
            <LField label="Teaching &amp; learning strategies" multiline minRows={6}
              value={syllabusData.tlas} onChange={e => setSyl('tlas', e.target.value)}
              onFocus={() => setAiField({ section: 'details', label: 'Teaching & learning strategies', fieldType: 'simple', field: 'tlas' })} />
            <Box sx={{ mt: 2 }}>
              <LField label="Technology integration" multiline minRows={4}
                value={syllabusData.technology_integration || ''} onChange={e => setSyl('technology_integration', e.target.value)}
                onFocus={() => setAiField({ section: 'details', label: 'Technology integration', fieldType: 'simple', field: 'technology_integration' })} />
            </Box>
          </SectionCard>

          <SectionCard title="References"
            action={<AddRowBtn label="Add Reference" onClick={() => addSylItem('references', '')} />}>
            <Stack spacing={1.25}>
              {syllabusData.references.map((ref, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ color: MAROON, fontWeight: 700, minWidth: 22, flexShrink: 0 }}>{i + 1}.</Typography>
                  <LField label={`Reference ${i + 1}`} value={ref}
                    onChange={e => setSylArr('references', i, e.target.value)}
                    onFocus={() => setAiField({ section: 'details', label: `Reference ${i + 1}`, fieldType: 'array', arrField: 'references', arrIndex: i })} />
                  <RemoveBtn onClick={() => removeSylItem('references', i)} disabled={syllabusData.references.length <= 1} />
                </Box>
              ))}
            </Stack>
          </SectionCard>
        </>
      )
    }

    // ── 4. ILOs & Assessments ────────────────────────────────────────────────
    if (syllabusSub === 'iloat') {
      const iloCount = syllabusData.ilos.length
      return (
        <>
          <SectionCard title="Intended Learning Outcomes (ILO)"
            action={<AddRowBtn label="Add ILO" onClick={addIlo} />}>
            <Stack spacing={1.5}>
              {syllabusData.ilos.map((ilo, i) => (
                <Box key={i} sx={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 1.5, p: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Chip label={'ILO' + (i + 1)} size="small"
                      sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, flexShrink: 0, height: 22, fontSize: '0.7rem', mt: 0.8 }} />
                    <LField label={`ILO ${i + 1}`} multiline minRows={2}
                      value={ilo} onChange={e => setSylArr('ilos', i, e.target.value)}
                      onFocus={() => setAiField({ section: 'iloat', label: `ILO ${i + 1}`, fieldType: 'array', arrField: 'ilos', arrIndex: i })} />
                    <RemoveBtn onClick={() => removeIlo(i)} disabled={syllabusData.ilos.length <= 1} />
                  </Box>
                </Box>
              ))}
            </Stack>
          </SectionCard>

          <PEAAssessmentCard
            ilos={syllabusData.ilos.map((_, idx) => ({ id: `ILO${idx + 1}` }))}
            ats={syllabusData.ats || []}
            setAts={updater => {
              setIsDirty(true); setSaveSuccess(false)
              setSyllabusData(s => ({ ...s, ats: typeof updater === 'function' ? updater(s.ats || []) : updater }))
            }}
          />
        </>
      )
    }

    // ── 5. ILO–AT Matrix ─────────────────────────────────────────────────────
    if (syllabusSub === 'iloatmatrix') {
      const iloCount = syllabusData.ilos.length
      const atsData = syllabusData.ats || []
      // Flatten sub-tasks with parent component info
      const rows = atsData.flatMap(at =>
        at.subs.map(s => ({ ...s, compCode: at.code, compLabel: at.label, compWeight: at.weight }))
      )
      return (
        <SectionCard title="ILO–AT matrix">
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
              <thead>
                <tr style={{ backgroundColor: BG }}>
                  <th style={{ ...TABLE_TH, minWidth: 80 }}>Component</th>
                  <th style={{ ...TABLE_TH, minWidth: 60 }}>Code</th>
                  <th style={{ ...TABLE_TH, minWidth: 160 }}>Task</th>
                  <th style={{ ...TABLE_TH, minWidth: 58, textAlign: 'center' }}>Wt %</th>
                  {syllabusData.ilos.map((_, i) => (
                    <th key={i} style={{ ...TABLE_TH, minWidth: 52, textAlign: 'center', color: MAROON }}>ILO{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4 + iloCount} style={{ ...TABLE_TD, color: '#aaa', textAlign: 'center', padding: '16px' }}>
                      No tasks defined yet. Add components and tasks in the ILOs &amp; Assessments section.
                    </td>
                  </tr>
                ) : rows.map((sub, ti) => (
                  <tr key={ti} style={{ backgroundColor: ti % 2 === 0 ? '#fff' : BG }}>
                    <td style={{ ...TABLE_TD, fontWeight: 700, color: MAROON, whiteSpace: 'nowrap' }}>{sub.compLabel || sub.compCode}</td>
                    <td style={{ ...TABLE_TD, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap', color: '#555' }}>{sub.code}</td>
                    <td style={{ ...TABLE_TD, minWidth: 160 }}>{sub.label}</td>
                    <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: '#555' }}>{sub.weight}%</Typography>
                    </td>
                    {Array.from({ length: iloCount }, (_, j) => {
                      const iloId = `ILO${j + 1}`
                      const mapped = (sub.ilos || []).includes(iloId)
                      return (
                        <td key={j} style={{ ...TABLE_TD, textAlign: 'center', backgroundColor: mapped ? MAROON + '18' : undefined }}>
                          <Typography variant="caption" sx={{ color: mapped ? MAROON : '#ccc', fontWeight: mapped ? 700 : 400 }}>
                            {mapped ? '✓' : '–'}
                          </Typography>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 1 }}>
            Read-only alignment view. Edit components and tasks in the ILOs &amp; Assessments section.
          </Typography>
        </SectionCard>
      )
    }

    // ── 6. Framework Mapping ─────────────────────────────────────────────────
    if (syllabusSub === 'fwmap') {
      const fwTabs = [
        { key: 'SO',   label: 'Student Outcomes',                  itemsField: 'student_outcomes', headersField: 'so_headers',   rowsField: 'so_cpa_rows',   rowValKey: 'so_vals',   hasCPA: true },
        { key: 'IGA',  label: 'Institutional Graduate Attributes', itemsField: 'igas',             headersField: 'iga_headers',  rowsField: 'iga_rows',      rowValKey: 'vals',      hasCPA: false },
        { key: 'CDIO', label: 'CDIO Framework Skills',             itemsField: 'cdio_skills',      headersField: 'cdio_headers', rowsField: 'cdio_sdg_rows', rowValKey: 'cdio_vals', hasCPA: false },
        { key: 'SDG',  label: 'SDG Skills',                        itemsField: 'sdg_skills',       headersField: 'sdg_headers',  rowsField: 'cdio_sdg_rows', rowValKey: 'sdg_vals',  hasCPA: false },
      ]
      const activeFw = fwTabs.find(f => f.key === activeFwKey) || fwTabs[0]
      const getRowVal = (ri, ci) => {
        if (activeFw.key === 'SO')   return ((syllabusData.so_cpa_rows   || [])[ri]?.so_vals   || [])[ci] || ''
        if (activeFw.key === 'IGA')  return ((syllabusData.iga_rows      || [])[ri]?.vals      || [])[ci] || ''
        if (activeFw.key === 'CDIO') return ((syllabusData.cdio_sdg_rows || [])[ri]?.cdio_vals || [])[ci] || ''
        if (activeFw.key === 'SDG')  return ((syllabusData.cdio_sdg_rows || [])[ri]?.sdg_vals  || [])[ci] || ''
        return ''
      }
      const setRowVal = (ri, ci, val) => {
        setIsDirty(true); setSaveSuccess(false)
        if (activeFw.key === 'SO')   setSyllabusData(s => ({ ...s, so_cpa_rows:   s.so_cpa_rows.map((r, i)   => { if (i !== ri) return r; const vals = [...(r.so_vals   || [])]; vals[ci] = val; return { ...r, so_vals: vals } }) }))
        if (activeFw.key === 'IGA')  setSyllabusData(s => ({ ...s, iga_rows:      s.iga_rows.map((r, i)      => { if (i !== ri) return r; const vals = [...(r.vals      || [])]; vals[ci] = val; return { ...r, vals } }) }))
        if (activeFw.key === 'CDIO') setSyllabusData(s => ({ ...s, cdio_sdg_rows: s.cdio_sdg_rows.map((r, i) => { if (i !== ri) return r; const vals = [...(r.cdio_vals || [])]; vals[ci] = val; return { ...r, cdio_vals: vals } }) }))
        if (activeFw.key === 'SDG')  setSyllabusData(s => ({ ...s, cdio_sdg_rows: s.cdio_sdg_rows.map((r, i) => { if (i !== ri) return r; const vals = [...(r.sdg_vals  || [])]; vals[ci] = val; return { ...r, sdg_vals: vals } }) }))
      }
      // Collect sub-task AT codes only for the dropdown
      const atCodes = (syllabusData.ats || []).flatMap(comp =>
        (comp.subs || []).map(s => ({ code: s.code, label: `${s.code} – ${s.label || s.code}` }))
      )
      return (
        <SectionCard title="Framework mapping"
          action={
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <AddRowBtn label="+ Col" onClick={() => addMappingCol(activeFw.headersField, activeFw.rowsField, activeFw.rowValKey)} />
              <Button size="small"
                onClick={() => removeMappingCol(activeFw.headersField, activeFw.rowsField, activeFw.rowValKey, (syllabusData[activeFw.headersField] || ['']).length - 1)}
                disabled={(syllabusData[activeFw.headersField] || ['']).length <= 1}
                sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: '#999', textTransform: 'none', '&:hover': { color: MAROON } }}>
                − Col
              </Button>
            </Box>
          }>
          {/* Tab strip */}
          <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap', borderBottom: '1px solid rgba(0,0,0,0.07)', pb: 1 }}>
            {fwTabs.map(fw => (
              <Button key={fw.key} size="small" onClick={() => setActiveFwKey(fw.key)}
                variant={fw.key === activeFwKey ? 'contained' : 'outlined'}
                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25, minWidth: 0,
                  ...(fw.key === activeFwKey
                    ? { bgcolor: MAROON, '&:hover': { bgcolor: '#a00' } }
                    : { borderColor: MAROON + '55', color: MAROON, '&:hover': { borderColor: MAROON, bgcolor: MAROON_LIGHT } }) }}>
                {fw.key}
              </Button>
            ))}
          </Box>
          {/* Framework items (reference list) */}
          <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {activeFw.label} — Framework reference
          </Typography>
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            {(syllabusData[activeFw.itemsField] || [{ ...EMPTY_ATTR }]).map((item, i) => (
              <Box key={i} sx={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 1.5, p: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1.25, mb: 1, alignItems: 'center' }}>
                  <LField label="Code" value={item.code}
                    onChange={e => setSylArrObj(activeFw.itemsField, i, 'code', e.target.value)} sx={{ maxWidth: 110 }} />
                  <LField label="Title / Outcome" value={item.title}
                    onChange={e => setSylArrObj(activeFw.itemsField, i, 'title', e.target.value)} />
                  <RemoveBtn onClick={() => removeSylItem(activeFw.itemsField, i)} disabled={(syllabusData[activeFw.itemsField] || []).length <= 1} />
                </Box>
                <LField label="Description" multiline minRows={2} value={item.description}
                  onChange={e => setSylArrObj(activeFw.itemsField, i, 'description', e.target.value)}
                  onFocus={() => setAiField({ section: 'fwmap', label: `${activeFw.label} – Item ${i + 1} Description`, fieldType: 'arrayObj', arrField: activeFw.itemsField, arrIndex: i, arrObjKey: 'description' })} />
              </Box>
            ))}
            <AddRowBtn label={`Add ${activeFw.key}`} onClick={() => addSylItem(activeFw.itemsField, { ...EMPTY_ATTR })} />
          </Stack>
          {/* ILO → Framework mapping table */}
          <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 0.75, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ILO → {activeFw.key} mapping
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...TABLE_TH, verticalAlign: 'middle' }}>ILOs</th>
                  <th colSpan={(syllabusData[activeFw.headersField] || ['']).length} style={{ ...TABLE_TH, textAlign: 'center' }}>
                    {activeFw.label}: Mapping of Assessment Tasks (AT)
                  </th>
                  {activeFw.hasCPA && <th colSpan={3} style={{ ...TABLE_TH, textAlign: 'center', borderRight: 'none' }}>Domain</th>}
                </tr>
                <tr>
                  {(syllabusData[activeFw.headersField] || ['']).map((h, ci) => (
                    <th key={ci} style={{ ...TABLE_TH, textAlign: 'center', minWidth: 60, padding: '4px 6px' }}>
                      <input value={h || ''} placeholder={`${activeFw.key} #`}
                        onChange={e => { setIsDirty(true); setSaveSuccess(false); setSyllabusData(s => ({ ...s, [activeFw.headersField]: s[activeFw.headersField].map((v, i) => i === ci ? e.target.value : v) })) }}
                        style={{ width: 52, textAlign: 'center', border: 'none', borderBottom: '2px solid #ccc', background: 'transparent', fontSize: '0.82rem', fontWeight: 700, color: '#444', outline: 'none', padding: '1px 2px' }} />
                    </th>
                  ))}
                  {activeFw.hasCPA && ['C', 'P', 'A'].map(k => (
                    <th key={k} style={{ ...TABLE_TH, textAlign: 'center', minWidth: 50 }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {syllabusData.ilos.map((_, ri) => {
                  const soRow = (syllabusData.so_cpa_rows || [])[ri] || { so_vals: [], c: '', p: '', a: '' }
                  return (
                    <tr key={ri}>
                      <td style={{ ...TABLE_TD, fontWeight: 600, color: MAROON, whiteSpace: 'nowrap', paddingLeft: 10, minWidth: 52 }}>ILO{ri + 1}</td>
                      {(syllabusData[activeFw.headersField] || ['']).map((_, ci) => {
                        const cellVal = getRowVal(ri, ci)
                        return (
                          <td key={ci} style={{ ...TABLE_TD, textAlign: 'center', minWidth: 100 }}>
                            <MultiSelectCell
                              value={cellVal}
                              options={atCodes}
                              onChange={val => setRowVal(ri, ci, val)}
                            />
                          </td>
                        )
                      })}
                      {activeFw.hasCPA && ['c', 'p', 'a'].map(k => (
                        <td key={k} style={{ ...TABLE_TD, textAlign: 'center', minWidth: 100 }}>
                          <MultiSelectCell
                            value={soRow[k] || ''}
                            options={atCodes}
                            onChange={val => {
                              setIsDirty(true); setSaveSuccess(false)
                              setSyllabusData(s => ({ ...s, so_cpa_rows: (s.so_cpa_rows || []).map((r, i) => i === ri ? { ...r, [k]: val } : r) }))
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
        </SectionCard>
      )
    }

    // ── 7. ILO–Framework Matrix ──────────────────────────────────────────────
    if (syllabusSub === 'ilofwmatrix') {
      const soHeaders   = syllabusData.so_headers   || ['']
      const igaHeaders  = syllabusData.iga_headers  || ['']
      const cdioHeaders = syllabusData.cdio_headers || ['']
      const sdgHeaders  = syllabusData.sdg_headers  || ['']
      const groupColors = { SO: '#1565c0', IGA: MAROON, CDIO: '#2e7d32', SDG: '#6a1b9a' }
      const allFwRows = [
        ...soHeaders.map((h, i)   => ({ code: h || `SO${i+1}`,   outcome: `Student Outcome ${i+1}`,                  source: 'so',   ci: i, group: 'SO' })),
        ...igaHeaders.map((h, i)  => ({ code: h || `IGA${i+1}`,  outcome: `Institutional Graduate Attribute ${i+1}`, source: 'iga',  ci: i, group: 'IGA' })),
        ...cdioHeaders.map((h, i) => ({ code: h || `CDIO${i+1}`, outcome: `CDIO Skill ${i+1}`,                       source: 'cdio', ci: i, group: 'CDIO' })),
        ...sdgHeaders.map((h, i)  => ({ code: h || `SDG${i+1}`,  outcome: `SDG Skill ${i+1}`,                        source: 'sdg',  ci: i, group: 'SDG' })),
      ]
      function getFwVal(source, ri, ci) {
        if (source === 'so')   return ((syllabusData.so_cpa_rows   || [])[ri]?.so_vals   || [])[ci] || ''
        if (source === 'iga')  return ((syllabusData.iga_rows      || [])[ri]?.vals      || [])[ci] || ''
        if (source === 'cdio') return ((syllabusData.cdio_sdg_rows || [])[ri]?.cdio_vals || [])[ci] || ''
        if (source === 'sdg')  return ((syllabusData.cdio_sdg_rows || [])[ri]?.sdg_vals  || [])[ci] || ''
        return ''
      }
      return (
        <SectionCard title="ILO–Framework matrix">
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem', width: '100%' }}>
              <thead>
                <tr style={{ backgroundColor: BG }}>
                  <th style={{ ...TABLE_TH, minWidth: 70 }}>Code</th>
                  <th style={{ ...TABLE_TH, minWidth: 150 }}>Outcome / Attribute</th>
                  {syllabusData.ilos.map((_, i) => (
                    <th key={i} style={{ ...TABLE_TH, minWidth: 52, textAlign: 'center', color: MAROON }}>ILO{i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allFwRows.map((row, idx) => {
                  const rowColor = groupColors[row.group] || '#555'
                  return (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : BG }}>
                      <td style={{ ...TABLE_TD, fontWeight: 600, color: rowColor, whiteSpace: 'nowrap' }}>{row.code}</td>
                      <td style={{ ...TABLE_TD, color: '#555', fontSize: '0.75rem' }}>{row.outcome}</td>
                      {syllabusData.ilos.map((_, ri) => {
                        const val = getFwVal(row.source, ri, row.ci)
                        return (
                          <td key={ri} style={{ ...TABLE_TD, textAlign: 'center', backgroundColor: val ? rowColor + '18' : undefined }}>
                            <Typography variant="caption" sx={{ color: val ? rowColor : '#ccc', fontWeight: val ? 700 : 400 }}>
                              {val || '–'}
                            </Typography>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
          <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 1 }}>
            Read-only combined view. Edit mappings in the Framework Mapping section.
          </Typography>
        </SectionCard>
      )
    }

    // ── 8. Weekly Schedule ───────────────────────────────────────────────────
    if (syllabusSub === 'schedule') {
      const chapters = syllabusData.tla_chapters?.length ? syllabusData.tla_chapters : [{ ...EMPTY_CHAPTER }]
      const _allSubs = (syllabusData.ats || []).flatMap(at => at.subs || [])
      const SELECT_STYLE = { fontSize: '0.82rem', border: '1px solid #ddd', borderRadius: 4, padding: '3px 5px', background: '#fff', color: '#333' }
      return (
        <SectionCard title="Weekly schedule"
          action={<AddRowBtn label="Add Week" onClick={() => addSylItem('tla_chapters', { ...EMPTY_CHAPTER })} />}>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...TABLE_TH, minWidth: 36, width: 36 }}>Week</th>
                  <th style={{ ...TABLE_TH, minWidth: 380 }}>Topic / activity</th>
                  <th style={{ ...TABLE_TH, minWidth: 200 }}>Task</th>
                  <th style={{ ...TABLE_TH, minWidth: 110 }}>Delivery</th>
                  <th style={{ ...TABLE_TH, minWidth: 130 }}>ILOs &amp; pts</th>
                  <th style={{ ...TABLE_TH, minWidth: 44, width: 44, textAlign: 'center' }}>Action</th>
                  <th style={{ ...TABLE_TH, borderRight: 'none' }} />
                </tr>
              </thead>
              <tbody>
                {chapters.map((ch, i) => {
                  const _weekNum = parseInt(ch.chapter, 10) || null
                  const _isLecture = !ch.outcomes || ch.outcomes === 'Lecture/Discussion'
                  const _subTask = !_isLecture ? _allSubs.find(s => s.code === ch.outcomes) : null
                  const _existingMod = _isLecture && _weekNum
                    ? (workspaceApi.data?.modules || []).find(m => m.week_number === _weekNum)
                    : null
                  const _existingAssessment = !_isLecture
                    ? (workspaceApi.data?.assessments || []).find(a =>
                        a.title?.toLowerCase().includes((ch.outcomes || '').toLowerCase())
                      )
                    : null
                  const _btnLabel = _isLecture
                    ? (_existingMod ? 'View Module' : 'Generate Module')
                    : (_existingAssessment ? 'View Assessment' : 'Generate Assessment')
                  const _btnColor = _isLecture
                    ? (_existingMod ? '#1565c0' : MAROON)
                    : (_existingAssessment ? '#2e7d32' : '#e65100')
                  const _btnHover = _isLecture
                    ? (_existingMod ? '#e3f2fd' : MAROON_LIGHT)
                    : (_existingAssessment ? '#e8f5e9' : '#fff3e0')
                  return (
                  <tr key={i}>
                    <td style={{ ...TABLE_TD, textAlign: 'center' }}>{inlineInput(ch.chapter, e => setSylArrObj('tla_chapters', i, 'chapter', e.target.value), 32)}</td>
                    <td style={{ ...TABLE_TD, minWidth: 380, verticalAlign: 'top' }}>
                      <textarea
                        value={ch.topics || ''}
                        onChange={e => setSylArrObj('tla_chapters', i, 'topics', e.target.value)}
                        rows={2}
                        className="subtle-scroll"
                        style={{ width: '100%', fontSize: '0.82rem', border: '1px solid #ddd', borderRadius: 4, padding: '4px 6px', resize: 'none', overflowY: 'auto', overflowX: 'hidden', outline: 'none', fontFamily: 'inherit', color: '#333', background: '#fff', boxSizing: 'border-box', lineHeight: 1.4 }}
                      />
                    </td>
                    <td style={TABLE_TD}>
                      <select
                        value={ch.outcomes || ''}
                        onChange={e => {
                          const newOutcome = e.target.value
                          const sub = _allSubs.find(s => s.code === newOutcome)
                          const autoIlo = (sub?.ilos?.length) ? sub.ilos.join(', ') : undefined
                          setIsDirty(true); setSaveSuccess(false)
                          setSyllabusData(s => ({
                            ...s,
                            tla_chapters: s.tla_chapters.map((c, j) => {
                              if (j !== i) return c
                              const next = { ...c, outcomes: newOutcome }
                              if (autoIlo !== undefined) next.ilo = autoIlo
                              return next
                            }),
                          }))
                        }}
                        style={{ ...SELECT_STYLE, width: 200 }}
                      >
                        <option value="">—</option>
                        <option value="Lecture/Discussion">Lecture/Discussion</option>
                        {(syllabusData.ats || []).flatMap(comp =>
                          (comp.subs || []).map(s => (
                            <option key={s.code} value={s.code}>{s.code} – {s.label || s.code}</option>
                          ))
                        )}
                      </select>
                    </td>
                    <td style={TABLE_TD}>
                      <select
                        value={ch.delivery || ''}
                        onChange={e => setSylArrObj('tla_chapters', i, 'delivery', e.target.value)}
                        style={{ ...SELECT_STYLE, width: 105 }}
                      >
                        <option value="">—</option>
                        <option>F2F</option><option>Online</option><option>Hybrid</option><option>Exam</option><option>Lab</option>
                      </select>
                    </td>
                    <td style={{ ...TABLE_TD, minWidth: 130 }}>
                      {_isLecture ? (
                        <span style={{ color: '#ccc', fontSize: '0.8rem' }}>—</span>
                      ) : _subTask ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {(_subTask.ilos || []).map(iloId => (
                              <span key={iloId} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: MAROON_LIGHT, color: MAROON, whiteSpace: 'nowrap' }}>{iloId}</span>
                            ))}
                          </div>
                          {(_subTask.ilos || []).length > 0 && (
                            <span style={{ fontSize: '0.68rem', color: '#888' }}>
                              {(_subTask.ilos || []).map(iloId => {
                                const pts = (_subTask.iloTotals || {})[iloId] ?? (_subTask.total || 0)
                                return `${iloId}:${pts}`
                              }).join(' ')} pts
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#ccc', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...TABLE_TD, textAlign: 'center', width: 44, minWidth: 44 }}>
                      <button
                        type="button"
                        title={_btnLabel}
                        onClick={() => {
                          if (_isLecture) {
                            if (!_existingMod) {
                              setModuleParams(p => ({ ...p, week_number: _weekNum || 1, module_title: ch.topics || '' }))
                              setModuleFromSchedule(true)
                              setModuleCreating(true)
                              setSelectedModule(null); setModuleContent(null); setChatOpen(false)
                            } else {
                              setModuleCreating(false)
                              setModuleFromSchedule(false)
                              setSelectedModule(null); setModuleContent(null); setChatOpen(false)
                            }
                            setResultText('')
                            setActiveTab('module')
                          } else {
                            setActiveTab('assessment')
                          }
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: `1.5px solid ${_btnColor}`, borderRadius: 6, background: 'transparent', color: _btnColor, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = _btnHover }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        {_isLecture
                          ? (_existingMod ? <BookOpen size={14} /> : <Zap size={14} />)
                          : (_existingAssessment ? <ClipboardCheck size={14} /> : <ClipboardList size={14} />)
                        }
                      </button>
                    </td>
                    <td style={{ ...TABLE_TD, borderRight: 'none' }}>
                      <RemoveBtn onClick={() => removeSylItem('tla_chapters', i)} disabled={chapters.length <= 1} />
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </Box>
        </SectionCard>
      )
    }

    if (syllabusSub === 'tos') {
      const BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
      const tosExams = syllabusData.tos || []
      const effectiveTosId = (activeTosId && tosExams.some(t => t.id === activeTosId)) ? activeTosId : (tosExams[0]?.id || null)
      const activeTos = tosExams.find(t => t.id === effectiveTosId) || null

      const newTopicRow = () => ({
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        topic: '', ilos: [], hours_class: 0, hours_min: 0, weight: '',
        bloom_items: BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {}),
        bloom_pct:   BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: '' }), {}),
        total_points: '',
      })

      const addTosExam = () => {
        const next = { id: `tos-${Date.now()}`, examCode: `EXAM${tosExams.length + 1}`, examLabel: `Examination ${tosExams.length + 1}`, semester: '', preparedBy: '', checkedBy: '', approvedBy: '', totalTestItems: 0, topics: [newTopicRow()] }
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: [...s.tos, next] }))
        setActiveTosId(next.id)
      }
      const delTosExam = (id) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.filter(t => t.id !== id) }))
        if (effectiveTosId === id) setActiveTosId(null)
      }
      const updTosExam = (id, field, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== id ? t : { ...t, [field]: val }) }))
      }
      const addTopicRow = (examId) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== examId ? t : { ...t, topics: [...t.topics, newTopicRow()] }) }))
      }
      const delTopicRow = (examId, rowId) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== examId ? t : { ...t, topics: t.topics.filter(r => r.id !== rowId) }) }))
      }
      const updTopicRow = (examId, rowId, field, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== examId ? t : { ...t, topics: t.topics.map(r => r.id !== rowId ? r : { ...r, [field]: val }) }) }))
      }
      const updBloomItems = (examId, rowId, bloom, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== examId ? t : { ...t, topics: t.topics.map(r => r.id !== rowId ? r : { ...r, bloom_items: { ...r.bloom_items, [bloom]: val } }) }) }))
      }
      const updBloomPct = (examId, rowId, bloom, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== examId ? t : { ...t, topics: t.topics.map(r => r.id !== rowId ? r : { ...r, bloom_pct: { ...r.bloom_pct, [bloom]: val } }) }) }))
      }
      const togIlo = (examId, rowId, iloKey, checked) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== examId ? t : { ...t, topics: t.topics.map(r => r.id !== rowId ? r : { ...r, ilos: checked ? [...(r.ilos || []), iloKey] : (r.ilos || []).filter(x => x !== iloKey) }) }) }))
      }

      const totalHrs       = activeTos ? activeTos.topics.reduce((s, r) => s + (Number(r.hours_class) || 0), 0) : 0
      const totalMins      = activeTos ? activeTos.topics.reduce((s, r) => s + (Number(r.hours_min) || 0), 0) : 0
      const totalTestItems = activeTos ? (Number(activeTos.totalTestItems) || 0) : 0
      const computedWeight = (row) => totalHrs > 0 ? (Number(row.hours_class) || 0) / totalHrs * 100 : 0
      const computedPts    = (row) => Math.round(computedWeight(row) / 100 * totalTestItems)
      const computedBItems = (row, k) => { const pts = computedPts(row); return pts > 0 ? Math.round((parseFloat((row.bloom_pct || {})[k]) || 0) / 100 * pts) : 0 }

      // ── ILO-Bloom alignment helpers ────────────────────────────────────────
      const BLOOM_LEVEL_NUM = { remember: 1, understand: 2, apply: 3, analyze: 4, evaluate: 5, create: 6 }
      // Weights from ceiling downward: ceiling gets most, lower levels get less
      const BLOOM_SUGGEST_WEIGHTS = { 1:[100], 2:[70,30], 3:[60,30,10], 4:[55,25,12,8], 5:[50,20,15,10,5], 6:[45,18,15,12,6,4] }

      // Highest Bloom level (1-6) among the ILOs mapped to this row
      const rowIloCeiling = (row) => {
        const levels = (row.ilos || []).map(key => {
          const idx = parseInt(key.replace('ILO', '')) - 1
          return BLOOM_LEVEL_NUM[(syllabusData.ilo_bloom[idx]?.level || '').toLowerCase()] || 0
        }).filter(n => n > 0)
        return levels.length > 0 ? Math.max(...levels) : 0
      }

      // Background color for a bloom cell based on its relation to the ILO ceiling
      const bloomCellBg = (row, k) => {
        const ceiling = rowIloCeiling(row)
        if (ceiling === 0) return 'rgba(139,0,0,0.03)'
        const level = BLOOM_LEVEL_NUM[k]
        if (level > ceiling) return 'rgba(0,0,0,0.045)' // above ceiling — gray (out of scope)
        if (level === ceiling) return 'rgba(34,197,94,0.11)' // at ceiling — green (target)
        return 'rgba(139,0,0,0.03)' // below ceiling — normal (prerequisite)
      }

      // 'aligned' | 'mismatch' | 'over' | null
      const checkAlignment = (row) => {
        const ceiling = rowIloCeiling(row)
        if (ceiling === 0) return null
        const totalPct = BLOOM_KEYS.reduce((s, k) => s + (parseFloat((row.bloom_pct || {})[k]) || 0), 0)
        if (totalPct === 0) return null
        const hasAbove = BLOOM_KEYS.slice(ceiling).some(k => (parseFloat((row.bloom_pct || {})[k]) || 0) > 0)
        if (hasAbove) return 'over'
        const topK = BLOOM_KEYS.reduce((best, k) =>
          (parseFloat((row.bloom_pct || {})[k] || 0) >= parseFloat((row.bloom_pct || {})[best] || 0)) ? k : best
        , BLOOM_KEYS[0])
        return BLOOM_KEYS.indexOf(topK) + 1 === ceiling ? 'aligned' : 'mismatch'
      }

      // Fill bloom_pct distribution weighted toward the ILO ceiling
      const applyBloomSuggestion = (examId, rowId, row) => {
        const ceiling = rowIloCeiling(row)
        if (ceiling === 0) return
        const w = BLOOM_SUGGEST_WEIGHTS[ceiling]
        const pct = {}
        BLOOM_KEYS.forEach((k, i) => { pct[k] = i < ceiling ? String(w[ceiling - 1 - i]) : '0' })
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({ ...s, tos: s.tos.map(t => t.id !== examId ? t : { ...t, topics: t.topics.map(r => r.id !== rowId ? r : { ...r, bloom_pct: pct }) }) }))
      }

      // ── integrateTOS keyword-alignment helpers ─────────────────────────────
      // Mirrors PEA pipeline mapping.js integrateTOS(): Jaccard similarity between
      // topic text and each ILO's text, threshold 0.05. Returns array of ILO keys
      // (e.g. ['ILO1','ILO3']) that the system auto-detects as aligned.
      const autoDetectIlos = (row) => {
        const topicTokens = tosTokenize(row.topic)
        if (topicTokens.length === 0) return []
        return syllabusData.ilos.reduce((acc, iloText, j) => {
          if (tosJaccard(topicTokens, tosTokenize(iloText)) > 0.05) acc.push(`ILO${j + 1}`)
          return acc
        }, [])
      }

      // Dominant Bloom level = highest-weighted key in bloom_pct (mirrors integrateTOS dominantLevel)
      const dominantBloom = (row) => {
        let maxPct = 0, dominant = null
        BLOOM_KEYS.forEach(k => {
          const v = parseFloat((row.bloom_pct || {})[k]) || 0
          if (v > maxPct) { maxPct = v; dominant = k }
        })
        return dominant
      }

      // 'confirmed' | 'mismatch' | 'unlinked' | 'unverified'
      // confirmed  — ≥1 selected ILO overlaps with auto-detected ILOs
      // mismatch   — selected ILOs don't overlap with auto-detected ILOs
      // unlinked   — ILOs detected but none selected
      // unverified — topic text too sparse (no ILOs detected at all)
      const keywordAlignStatus = (row) => {
        const detected  = autoDetectIlos(row)
        const selected  = row.ilos || []
        if (detected.length === 0) return 'unverified'
        if (selected.length === 0) return 'unlinked'
        const overlap = selected.some(k => detected.includes(k))
        return overlap ? 'confirmed' : 'mismatch'
      }

      return (
        <Box>
          {/* ── TOS List ─────────────────────────────────────────────── */}
          <Paper elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 2.5, mb: 2, overflow: 'hidden' }}>
            <Box
              sx={{ px: 2.5, py: 1.25, bgcolor: BG, borderBottom: tosListOpen ? '1px solid rgba(0,0,0,0.07)' : 'none', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setTosListOpen(o => !o)}>
              <ChevronDown size={14} style={{ color: '#888', marginRight: 6, flexShrink: 0, transition: 'transform .15s', transform: tosListOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#444', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
                Table of Specifications
              </Typography>
              <Chip label={`${tosExams.length} exam${tosExams.length !== 1 ? 's' : ''}`} size="small"
                sx={{ fontSize: '0.68rem', height: 18, bgcolor: 'rgba(139,0,0,0.08)', color: MAROON, mr: 1, fontWeight: 600 }} />
              <Box onClick={e => e.stopPropagation()}>
                <AddRowBtn label="Add TOS" onClick={addTosExam} />
              </Box>
            </Box>
            {tosListOpen && (
              <Box sx={{ px: 2.5, py: 1.5 }}>
                {tosExams.length === 0 ? (
                  <Typography variant="caption" sx={{ color: '#aaa' }}>No TOS yet. Click "Add TOS" to create one per examination.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {tosExams.map(t => (
                      <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', border: `1px solid ${t.id === effectiveTosId ? MAROON : '#ddd'}`, borderRadius: 99, overflow: 'hidden' }}>
                        <Box component="button" type="button" onClick={() => setActiveTosId(t.id)}
                          sx={{ px: 1.5, py: 0.5, fontSize: '0.75rem', cursor: 'pointer', border: 'none', bgcolor: t.id === effectiveTosId ? MAROON_LIGHT : 'transparent', color: t.id === effectiveTosId ? MAROON : '#666', fontWeight: t.id === effectiveTosId ? 700 : 400 }}>
                          {t.examLabel}
                        </Box>
                        <Box component="button" type="button" onClick={() => delTosExam(t.id)}
                          sx={{ px: 1, py: 0.5, fontSize: '0.72rem', cursor: 'pointer', border: 'none', bgcolor: 'transparent', color: '#bbb', borderLeft: '1px solid #eee', '&:hover': { color: MAROON } }}>
                          ✕
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Paper>

          {/* ── TOS Detail ───────────────────────────────────────────── */}
          {activeTos && (
            <Paper elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 2.5, mb: 2, overflow: 'hidden' }}>
              <Box
                sx={{ px: 2.5, py: 1.25, bgcolor: BG, borderBottom: tosDetailOpen ? '1px solid rgba(0,0,0,0.07)' : 'none', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setTosDetailOpen(o => !o)}>
                <ChevronDown size={14} style={{ color: '#888', marginRight: 6, flexShrink: 0, transition: 'transform .15s', transform: tosDetailOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#444', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
                  TOS — {activeTos.examLabel}
                </Typography>
              </Box>
              {tosDetailOpen && (
                <>
                  {/* Header fields */}
                  <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid rgba(0,0,0,0.07)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                    <LField label="Exam label" value={activeTos.examLabel} onChange={e => updTosExam(activeTos.id, 'examLabel', e.target.value)} />
                    <LField label="Semester / year" value={activeTos.semester} onChange={e => updTosExam(activeTos.id, 'semester', e.target.value)} />
                    <LField label="Prepared by" value={activeTos.preparedBy} onChange={e => updTosExam(activeTos.id, 'preparedBy', e.target.value)} />
                    <LField label="Checked and verified by" value={activeTos.checkedBy} onChange={e => updTosExam(activeTos.id, 'checkedBy', e.target.value)} />
                    <LField label="Approved by" value={activeTos.approvedBy} onChange={e => updTosExam(activeTos.id, 'approvedBy', e.target.value)} />
                    <LField label="Total test items" type="number" value={activeTos.totalTestItems || ''} onChange={e => updTosExam(activeTos.id, 'totalTestItems', Number(e.target.value) || 0)} />
                  </Box>
                  {/* Table */}
                  <Box sx={{ p: 2.5 }}>
                    <Box sx={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 520 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 1100 }}>
                        <thead>
                          <tr>
                            <th rowSpan={2} style={{ ...TABLE_TH, minWidth: 190, textAlign: 'left' }}>Topic</th>
                            <th rowSpan={2} style={{ ...TABLE_TH, minWidth: 90, textAlign: 'center' }}>ILOs</th>
                            <th colSpan={2} style={{ ...TABLE_TH, textAlign: 'center' }}>No. of hrs</th>
                            <th rowSpan={2} style={{ ...TABLE_TH, minWidth: 72, textAlign: 'center' }}>Weight (%)</th>
                            {BLOOM_KEYS.map(k => (
                              <th key={k} colSpan={2} style={{ ...TABLE_TH, minWidth: 110, textAlign: 'center', color: MAROON, textTransform: 'capitalize' }}>
                                {k.charAt(0).toUpperCase() + k.slice(1)}
                              </th>
                            ))}
                            <th rowSpan={2} style={{ ...TABLE_TH, minWidth: 68, textAlign: 'center' }}>Total pts</th>
                            <th rowSpan={2} style={{ ...TABLE_TH, borderRight: 'none', width: 32 }} />
                          </tr>
                          <tr>
                            <th style={{ ...TABLE_TH, minWidth: 56, textAlign: 'center' }}>Class</th>
                            <th style={{ ...TABLE_TH, minWidth: 56, textAlign: 'center' }}>Min</th>
                            {BLOOM_KEYS.map(k => (
                              <React.Fragment key={k}>
                                <th style={{ ...TABLE_TH, minWidth: 54, textAlign: 'center', fontSize: '0.68rem', backgroundColor: 'rgba(139,0,0,0.05)' }}>Items</th>
                                <th style={{ ...TABLE_TH, minWidth: 54, textAlign: 'center', fontSize: '0.68rem', backgroundColor: 'rgba(139,0,0,0.05)' }}>%</th>
                              </React.Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeTos.topics.map(row => (
                            <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ ...TABLE_TD, textAlign: 'left' }}>
                                {inlineInput(row.topic || '', e => updTopicRow(activeTos.id, row.id, 'topic', e.target.value), 180)}
                              </td>
                              <td style={{ ...TABLE_TD, minWidth: 110 }}>
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                                  {syllabusData.ilos.map((_, j) => {
                                    const iloBloom = syllabusData.ilo_bloom[j]
                                    const iloLevel = iloBloom?.level ? iloBloom.level.charAt(0).toUpperCase() + iloBloom.level.slice(1).toLowerCase() : null
                                    const iloVerb  = iloBloom?.verb || null
                                    return (
                                      <label key={j} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                        title={iloLevel ? `ILO${j+1} targets: ${iloLevel}${iloVerb ? ` (${iloVerb})` : ''}` : `ILO${j+1}`}>
                                        <input type="checkbox"
                                          checked={(row.ilos || []).includes(`ILO${j + 1}`)}
                                          onChange={e => togIlo(activeTos.id, row.id, `ILO${j + 1}`, e.target.checked)} />
                                        ILO{j + 1}
                                        {iloLevel && <span style={{ fontSize: '0.6rem', color: MAROON, fontWeight: 700, marginLeft: 1 }}>{iloLevel.slice(0,3)}</span>}
                                      </label>
                                    )
                                  })}
                                </div>
                                {(() => {
                                  const ceiling = rowIloCeiling(row)
                                  const align   = checkAlignment(row)
                                  const ceilKey = ceiling > 0 ? BLOOM_KEYS[ceiling - 1] : null
                                  return ceiling > 0 ? (
                                    <div style={{ marginTop: 5, paddingTop: 4, borderTop: '1px dashed #e0e0e0', display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                                      <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 99, background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                        🎯 {ceilKey.charAt(0).toUpperCase() + ceilKey.slice(1)}
                                      </span>
                                      {align === 'aligned'  && <span style={{ fontSize: '0.62rem', color: '#16a34a', fontWeight: 700 }}>✓ Aligned</span>}
                                      {align === 'mismatch' && <span style={{ fontSize: '0.62rem', color: '#dc2626', fontWeight: 700 }}>⚠ Mismatch</span>}
                                      {align === 'over'     && <span style={{ fontSize: '0.62rem', color: '#d97706', fontWeight: 700 }}>↑ Over</span>}
                                      <button type="button"
                                        onClick={() => applyBloomSuggestion(activeTos.id, row.id, row)}
                                        style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: 99, border: `1px solid ${MAROON}`, background: MAROON_LIGHT, color: MAROON, cursor: 'pointer', fontWeight: 700, lineHeight: 1.5 }}
                                        title="Auto-fill Bloom % weighted toward the ILO ceiling level">
                                        ✦ Auto
                                      </button>
                                    </div>
                                  ) : null
                                })()}
                                {/* ── Keyword (integrateTOS) alignment panel ── */}
                                {(() => {
                                  const detected = autoDetectIlos(row)
                                  const status   = keywordAlignStatus(row)
                                  const domBloom = dominantBloom(row)
                                  const statusCfg = {
                                    confirmed:  { color: '#16a34a', icon: '✓', label: 'Confirmed' },
                                    mismatch:   { color: '#dc2626', icon: '⚠', label: 'Mismatch'  },
                                    unlinked:   { color: '#d97706', icon: '⊘', label: 'Unlinked'  },
                                    unverified: { color: '#9ca3af', icon: '○', label: 'Unverified'},
                                  }[status]
                                  return (
                                    <div style={{ marginTop: 5, paddingTop: 4, borderTop: '1px dashed #e0e0e0' }}>
                                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '0.58rem', color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>🔍 Keyword:</span>
                                        {detected.length > 0
                                          ? detected.map(k => (
                                              <span key={k} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 99, background: 'rgba(59,130,246,0.10)', color: '#2563eb', fontWeight: 700 }}>{k}</span>
                                            ))
                                          : <span style={{ fontSize: '0.6rem', color: '#bbb' }}>—</span>
                                        }
                                      </div>
                                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', marginTop: 3 }}>
                                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: statusCfg.color, whiteSpace: 'nowrap' }}>
                                          {statusCfg.icon} {statusCfg.label}
                                        </span>
                                        {domBloom && (
                                          <span style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 99, background: 'rgba(139,0,0,0.07)', color: MAROON, fontWeight: 700 }}>
                                            {domBloom.charAt(0).toUpperCase() + domBloom.slice(1)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })()}
                              </td>
                              <td style={{ ...TABLE_TD, textAlign: 'center' }}>{inlineInput(row.hours_class ?? 0, e => updTopicRow(activeTos.id, row.id, 'hours_class', e.target.value), 52)}</td>
                              <td style={{ ...TABLE_TD, textAlign: 'center' }}>{inlineInput(row.hours_min ?? 0, e => updTopicRow(activeTos.id, row.id, 'hours_min', e.target.value), 52)}</td>
                              <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: MAROON }}>
                                  {totalHrs > 0 ? computedWeight(row).toFixed(1) + '%' : '—'}
                                </Typography>
                              </td>
                              {BLOOM_KEYS.map(k => {
                                const bg      = bloomCellBg(row, k)
                                const ceiling = rowIloCeiling(row)
                                const level   = BLOOM_LEVEL_NUM[k]
                                const isAbove = ceiling > 0 && level > ceiling
                                return (
                                  <React.Fragment key={k}>
                                    <td style={{ ...TABLE_TD, textAlign: 'center', backgroundColor: bg, opacity: isAbove ? 0.45 : 1 }}>
                                      <Typography variant="caption" sx={{ fontWeight: 600, color: level === ceiling ? '#16a34a' : '#555' }}>
                                        {computedBItems(row, k) > 0 ? computedBItems(row, k) : '—'}
                                      </Typography>
                                    </td>
                                    <td style={{ ...TABLE_TD, textAlign: 'center', backgroundColor: bg, opacity: isAbove ? 0.45 : 1 }}>
                                      {inlineInput((row.bloom_pct || {})[k] || '', e => updBloomPct(activeTos.id, row.id, k, e.target.value), 50)}
                                    </td>
                                  </React.Fragment>
                                )
                              })}
                              <td style={{ ...TABLE_TD, textAlign: 'center', backgroundColor: MAROON_LIGHT }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: MAROON }}>
                                  {computedPts(row) > 0 ? computedPts(row) : '—'}
                                </Typography>
                              </td>
                              <td style={{ ...TABLE_TD, borderRight: 'none' }}>
                                <RemoveBtn onClick={() => delTopicRow(activeTos.id, row.id)} disabled={activeTos.topics.length <= 1} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: BG }}>
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'left' }}>Total</td>
                            <td style={TABLE_TD} />
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center' }}>{totalHrs}</td>
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center' }}>{totalMins}</td>
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center' }}>100%</td>
                            {BLOOM_KEYS.map(k => {
                              const sumItems = activeTos.topics.reduce((acc, r) => acc + computedBItems(r, k), 0)
                              const sumPct   = activeTos.topics.reduce((acc, r) => acc + (parseFloat((r.bloom_pct || {})[k]) || 0), 0)
                              return (
                                <React.Fragment key={k}>
                                  <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center', backgroundColor: 'rgba(139,0,0,0.04)' }}>
                                    {sumItems > 0 ? sumItems : ''}
                                  </td>
                                  <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center', backgroundColor: 'rgba(139,0,0,0.04)' }}>
                                    {sumPct > 0 ? `${sumPct.toFixed(1)}%` : ''}
                                  </td>
                                </React.Fragment>
                              )
                            })}
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center', backgroundColor: MAROON_LIGHT, color: MAROON }}>
                              {totalTestItems > 0 ? totalTestItems : '—'}
                            </td>
                            <td style={{ ...TABLE_TD, borderRight: 'none' }} />
                          </tr>
                        </tfoot>
                      </table>
                    </Box>
                    <Box sx={{ mt: 1.5 }}>
                      <AddRowBtn label="Add topic row" onClick={() => addTopicRow(activeTos.id)} />
                    </Box>
                    <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 1 }}>
                      Weight % and Total Pts are auto-computed from hours and Total Test Items. Enter Bloom % per level per topic (must sum to 100%) — item counts are derived automatically.
                    </Typography>
                  </Box>
                </>
              )}
            </Paper>
          )}
        </Box>
      )
    }

    // ── 10. Grading ──────────────────────────────────────────────────────────
    if (syllabusSub === 'grading') {
      return (
        <SectionCard title="Grade equivalence scale">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {['Grade', 'Description', 'Range'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', borderBottom: '2px solid #e0e0e0', textAlign: 'left', color: '#555', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(syllabusData.grading_rows && syllabusData.grading_rows.length
                    ? syllabusData.grading_rows
                    : DEFAULT_GRADING_ROWS
                  ).map((row, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : BG }}>
                      <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                        {inlineInput(row.grade,  e => setSylArrObj('grading_rows', i, 'grade',  e.target.value), 60)}
                      </td>
                      <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                        {inlineInput(row.rating, e => setSylArrObj('grading_rows', i, 'rating', e.target.value), 140)}
                      </td>
                      <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                        {inlineInput(row.range,  e => setSylArrObj('grading_rows', i, 'range',  e.target.value), 90)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Box>
              <Box sx={{ borderLeft: `3px solid ${MAROON}`, mb: 2, bgcolor: MAROON_LIGHT, borderRadius: '0 8px 8px 0', p: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: MAROON, fontWeight: 700, fontSize: '0.82rem' }}>Passing grade:</Typography>
                  <TextField size="small" type="number"
                    value={syllabusData.passing_grade ?? 75}
                    onChange={e => setSyl('passing_grade', Number(e.target.value))}
                    sx={{ width: 70, '& .MuiOutlinedInput-root': { fontSize: '0.82rem', '&:hover fieldset': { borderColor: MAROON }, '&.Mui-focused fieldset': { borderColor: MAROON } } }}
                    inputProps={{ style: { padding: '4px 8px' } }} />
                </Box>
                <Typography variant="caption" sx={{ color: '#666', lineHeight: 1.5, display: 'block' }}>
                  Students scoring 70–74 receive a remedial activity. Final grade shall be 3.0 or 5.0. No rounding off allowed.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[
                  { field: 'use_plus_minus',   label: 'Use plus/minus grades' },
                  { field: 'remedial_enabled', label: 'Enable remedial activities (70–74)' },
                  { field: 'round_grades',     label: 'Round final grades' },
                ].map(({ field, label }) => (
                  <Box key={field} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', fontSize: '0.82rem', color: '#444' }}>
                    <input type="checkbox" checked={!!syllabusData[field]} onChange={e => setSyl(field, e.target.checked)} />
                    {label}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </SectionCard>
      )
    }

    // ── 11. Policies ─────────────────────────────────────────────────────────
    if (syllabusSub === 'policies') {
      return (
        <SectionCard title="Course policies"
          action={<AddRowBtn label="Add policy" onClick={() => addSylItem('policies', EMPTY_POLICY)} />}>
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
      )
    }

    return null
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
      const isIloField     = aiField?.arrField === 'ilos'
      const aiFooterHeight = showAiFooter ? (isIloField ? 96 : 60) : 0
      const totalFooterPb  = (showSaveFooter ? 72 : 0) + aiFooterHeight
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
                <Tooltip title={syllabusExporting ? 'Exporting…' : 'Export syllabus as DOCX'}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={syllabusExporting}
                      startIcon={syllabusExporting ? <CircularProgress size={14} sx={{ color: MAROON }} /> : <InsertDriveFileIcon sx={{ fontSize: '1rem !important' }} />}
                      onClick={handleExportDocx}
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
                      {syllabusExporting ? 'Exporting…' : 'Export DOCX'}
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
            {syllabusExportError && (
              <AutoAlert message={syllabusExportError} onClose={() => setSyllabusExportError('')} sx={{ mb: 1.5 }} />
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
          {showSaveFooter && (
            <Box sx={{
              position: 'sticky', bottom: showAiFooter ? `${aiFooterHeight}px` : 0,
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

          {/* AI generation footer — appears when a field is focused in an eligible section */}
          {showAiFooter && (
            <Box sx={{
              position: 'sticky', bottom: 0,
              bgcolor: '#1C1C1E',
              borderTop: `2px solid ${MAROON}`,
              boxShadow: '0 -4px 20px rgba(0,0,0,0.18)',
              px: 2, py: 1,
              display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
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
              {/* ILO Bloom Verb assistant — visible only when an ILO field is active */}
              {aiField?.arrField === 'ilos' && (
                <>
                  <select
                    value={iloBloomVerb}
                    onChange={e => setIloBloomVerb(e.target.value)}
                    style={{
                      background: '#2a2a2a', color: '#fff',
                      border: '1px solid #555', borderRadius: 4,
                      fontSize: '0.75rem', padding: '4px 8px', height: 30,
                      minWidth: 150, flexShrink: 0, cursor: 'pointer',
                    }}
                  >
                    <option value="">— Bloom verb —</option>
                    {getBloomVerbsForYear(syllabusData.year_level).map(({ level, verbs }) => (
                      <optgroup key={level} label={level}>
                        {verbs.map(v => <option key={v} value={v}>{v}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <TextField
                    size="small"
                    multiline
                    minRows={1}
                    placeholder="ILO focus (optional) — describe what this ILO should cover…"
                    value={iloFocusText}
                    onChange={e => setIloFocusText(e.target.value)}
                    sx={{
                      flex: '1 1 180px', minWidth: 160, maxWidth: 320,
                      '& .MuiOutlinedInput-root': {
                        color: '#fff', fontSize: '0.75rem', background: '#2a2a2a',
                        '& fieldset': { borderColor: '#555' },
                        '&:hover fieldset': { borderColor: '#888' },
                        '&.Mui-focused fieldset': { borderColor: MAROON },
                      },
                      '& .MuiInputBase-input': { py: 0.5, px: 1 },
                      '& textarea': { resize: 'vertical', minHeight: '1.4em' },
                    }}
                  />
                </>
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
    if (workspaceApi.error && !workspaceApi.data) return <AutoAlert message={workspaceApi.error} onClose={() => {}} />

    if (activeTab === 'module') {
      // Lecture/Discussion topics from weekly schedule for dropdowns
      const lectureWeeks = (syllabusData.tla_chapters || [])
        .filter(ch => !ch.outcomes || ch.outcomes === 'Lecture/Discussion')
        .filter(ch => ch.topics && ch.topics.trim())
        .map(ch => ({ week: parseInt(ch.chapter, 10) || ch.chapter, topic: ch.topics.trim() }))

      // ── DETAIL view ────────────────────────────────────────────────────
      if (selectedModule && moduleContent) {
        const mc = moduleContent
        return (
          <Box sx={{ position: 'relative' }}>
            <Stack spacing={2}>
              <AutoAlert message={actionError} onClose={() => setActionError('')} />

              {/* Header bar */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Tooltip title="Back to modules list">
                  <IconButton size="small"
                    onClick={() => { setSelectedModule(null); setModuleContent(null); setChatOpen(false) }}
                    sx={{ color: '#666', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 1 }}>
                    <ArrowBackIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" sx={{ color: '#888', display: 'block' }}>
                    Module {mc.module_number} · Week {selectedModule.week_number}
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: MAROON, fontSize: '0.9rem' }}>
                    {mc.module_title}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <Tooltip title="AI Chatbox">
                    <IconButton size="small"
                      onClick={() => setChatOpen(o => !o)}
                      sx={{ color: chatOpen ? MAROON : '#666', border: `1px solid ${chatOpen ? MAROON : 'rgba(0,0,0,0.15)'}`, borderRadius: 1 }}>
                      <ChatIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Button size="small" startIcon={<InsertDriveFileIcon sx={{ fontSize: '0.85rem !important' }} />}
                    disabled={moduleExporting || !moduleContent}
                    onClick={handleExportModuleDocx}
                    sx={{
                      borderColor: MAROON,
                      color: MAROON,
                      borderRadius: 1.5,
                      textTransform: 'none',
                      fontSize: '0.78rem',
                      px: 1.25,
                      py: 0.4,
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      '&:hover': { bgcolor: MAROON_LIGHT, borderColor: MAROON },
                    }}>
                    {moduleExporting ? 'Exporting…' : 'Export DOCX'}
                  </Button>
                  <Button size="small" startIcon={<SaveIcon sx={{ fontSize: '0.85rem !important' }} />}
                    disabled={!moduleContentDirty || moduleSaving}
                    onClick={handleSaveModuleContent}
                    sx={{ bgcolor: moduleContentDirty ? MAROON : '#ccc', color: '#fff', borderRadius: 1.5,
                          textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.4,
                          '&:hover': { bgcolor: '#6a0000' }, '&:disabled': { bgcolor: '#ccc', color: '#fff' } }}>
                    {moduleSaving ? 'Saving…' : 'Save'}
                  </Button>
                </Box>
              </Box>

              {/* Introduction */}
              <SectionCard title="Introduction">
                <TextField multiline minRows={3} fullWidth
                  value={mc.introduction || ''}
                  onChange={e => updateModuleField('introduction', e.target.value)}
                  onClick={() => setChatField('introduction')}
                  placeholder="Module introduction…"
                  sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.84rem' } }} />
              </SectionCard>

              {/* Learning Objectives */}
              <SectionCard title="Learning Objectives">
                <Stack spacing={1}>
                  {(mc.learning_objectives || []).map((obj, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <Typography variant="body2" sx={{ color: MAROON, fontWeight: 700, mt: 0.8, flexShrink: 0 }}>{i + 1}.</Typography>
                      <TextField fullWidth size="small"
                        value={obj}
                        onChange={e => {
                          const arr = [...(mc.learning_objectives || [])]
                          arr[i] = e.target.value
                          updateModuleField('learning_objectives', arr)
                        }}
                        onClick={() => setChatField('learning_objectives')}
                        sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.84rem' } }} />
                      <IconButton size="small" sx={{ color: '#bbb', mt: 0.3 }}
                        onClick={() => {
                          const arr = (mc.learning_objectives || []).filter((_, j) => j !== i)
                          updateModuleField('learning_objectives', arr)
                        }}>
                        <DeleteIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon />}
                    onClick={() => updateModuleField('learning_objectives', [...(mc.learning_objectives || []), ''])}
                    sx={{ alignSelf: 'flex-start', color: MAROON, textTransform: 'none', fontSize: '0.78rem' }}>
                    Add Objective
                  </Button>
                </Stack>
              </SectionCard>

              {/* Subtopics */}
              <SectionCard title="Subtopics">
                <Stack spacing={1}>
                  {(mc.subtopics || []).map((st) => {
                    const isExpanded = expandedSubtopics.has(st.id)
                    const isGen = subtopicGenerating === st.id
                    return (
                      <Box key={st.id} sx={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 1.5, overflow: 'hidden' }}>
                        {/* Subtopic header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.9,
                                   bgcolor: isExpanded ? MAROON_LIGHT : '#fafafa', cursor: 'pointer' }}
                          onClick={() => setExpandedSubtopics(prev => {
                            const next = new Set(prev)
                            isExpanded ? next.delete(st.id) : next.add(st.id)
                            return next
                          })}>
                          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, color: '#333', fontSize: '0.84rem' }}>
                            {st.title || '(Untitled)'}
                          </Typography>
                          <Tooltip title="Generate content from sources">
                            <span>
                              <IconButton size="small" disabled={isGen}
                                onClick={e => { e.stopPropagation(); handleGenerateSubtopicContent(st.id, st.title) }}
                                sx={{ color: MAROON, '&:hover': { bgcolor: MAROON_LIGHT } }}>
                                {isGen
                                  ? <CircularProgress size={14} sx={{ color: MAROON }} />
                                  : <AutoAwesomeIcon sx={{ fontSize: '1rem' }} />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          {isExpanded
                            ? <ExpandLessIcon sx={{ fontSize: '1.1rem', color: '#666' }} />
                            : <ExpandMoreIcon sx={{ fontSize: '1.1rem', color: '#666' }} />}
                        </Box>
                        {/* Subtopic content */}
                        {isExpanded && (
                          <Box sx={{ px: 1.5, py: 1, bgcolor: '#fff' }}>
                            <TextField multiline minRows={5} fullWidth
                              value={st.content || ''}
                              onChange={e => updateSubtopicField(st.id, 'content', e.target.value)}
                              onClick={() => setChatField(`subtopic:${st.id}`)}
                              placeholder="Subtopic content will appear here after generation or manual editing…"
                              sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.83rem' } }} />
                          </Box>
                        )}
                      </Box>
                    )
                  })}
                </Stack>
              </SectionCard>

              {/* Short Activity */}
              <SectionCard title="Short Activity">
                <Stack spacing={1.5}>
                  <LField label="Activity Title"
                    value={mc.short_activity?.title || ''}
                    onChange={e => updateModuleField('short_activity', { ...mc.short_activity, title: e.target.value })}
                    onClick={() => setChatField('short_activity')} />
                  <LField label="Duration"
                    value={mc.short_activity?.duration || ''}
                    onChange={e => updateModuleField('short_activity', { ...mc.short_activity, duration: e.target.value })} />
                  <LField label="Description" multiline minRows={3}
                    value={mc.short_activity?.description || ''}
                    onChange={e => updateModuleField('short_activity', { ...mc.short_activity, description: e.target.value })} />
                </Stack>
              </SectionCard>
            </Stack>

            {/* AI Chatbox panel */}
            {chatOpen && (
              <Box sx={{
                position: 'fixed', bottom: 24, right: 24, width: 340, zIndex: 1300,
                bgcolor: '#fff', borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                border: `1.5px solid ${MAROON}33`, display: 'flex', flexDirection: 'column', maxHeight: 480,
              }}>
                {/* Chat header */}
                <Box sx={{ px: 2, py: 1.25, bgcolor: MAROON, borderRadius: '8px 8px 0 0',
                           display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AutoAwesomeIcon sx={{ color: '#fff', fontSize: '1rem' }} />
                  <Typography variant="subtitle2" sx={{ color: '#fff', flex: 1, fontWeight: 700, fontSize: '0.84rem' }}>
                    AI Module Assistant
                  </Typography>
                  {chatField && (
                    <Chip label={chatField.startsWith('subtopic:') ? 'Subtopic' : chatField}
                      size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.65rem', height: 18 }} />
                  )}
                  <IconButton size="small" onClick={() => setChatOpen(false)} sx={{ color: '#fff', p: 0.25 }}>
                    <CloseIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                </Box>
                {/* Messages */}
                <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {chatMessages.length === 0 && (
                    <Typography variant="caption" sx={{ color: '#aaa', textAlign: 'center', mt: 2 }}>
                      Ask me to rewrite, expand, or improve any section of this module.
                    </Typography>
                  )}
                  {chatMessages.map((msg, i) => (
                    <Box key={i} sx={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%', bgcolor: msg.role === 'user' ? MAROON : '#f3f3f3',
                      color: msg.role === 'user' ? '#fff' : '#333',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      px: 1.5, py: 0.75, fontSize: '0.8rem', lineHeight: 1.5,
                    }}>
                      {msg.content}
                    </Box>
                  ))}
                  {chatLoading && (
                    <Box sx={{ alignSelf: 'flex-start' }}>
                      <CircularProgress size={16} sx={{ color: MAROON }} />
                    </Box>
                  )}
                </Box>
                {/* Input */}
                <Box sx={{ px: 1.25, py: 1, borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', gap: 0.75 }}>
                  <TextField size="small" fullWidth multiline maxRows={3}
                    placeholder="Ask the AI to modify this module…"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend() } }}
                    sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8rem', borderRadius: 1.5 } }} />
                  <IconButton size="small" disabled={!chatInput.trim() || chatLoading}
                    onClick={handleChatSend}
                    sx={{ bgcolor: MAROON, color: '#fff', borderRadius: 1.5, alignSelf: 'flex-end',
                          '&:hover': { bgcolor: '#6a0000' }, '&:disabled': { bgcolor: '#ddd' } }}>
                    <SendIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                </Box>
              </Box>
            )}
          </Box>
        )
      }

      // ── LIST view ──────────────────────────────────────────────────────
      if (!moduleCreating) {
        const modules = workspaceApi.data?.modules || []
        return (
          <Stack spacing={2}>
            <AutoAlert message={actionError} onClose={() => setActionError('')} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2"
                sx={{ fontWeight: 700, color: '#444', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Modules
              </Typography>
              <Button size="small" startIcon={<AddIcon sx={{ fontSize: '0.85rem !important' }} />}
                onClick={() => {
                  setModuleFromSchedule(false)
                  setModuleParams(p => ({ ...p, module_title: '', week_number: '' }))
                  setResultText('')
                  setModuleCreating(true)
                }}
                sx={{ bgcolor: MAROON, color: '#fff', borderRadius: 1.5, textTransform: 'none', fontSize: '0.78rem',
                     px: 1.5, py: 0.4, '&:hover': { bgcolor: '#6a0000' } }}>
                Create Module
              </Button>
            </Box>
            {modules.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <ViewModuleIcon sx={{ fontSize: 44, color: '#ddd', display: 'block', mx: 'auto', mb: 1.5 }} />
                <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>No modules yet.</Typography>
                <Typography variant="caption" sx={{ color: '#ccc' }}>
                  Click <b>Create Module</b> above or use the ⚡ button in the Weekly Schedule.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={0.75}>
                {modules.map(m => (
                  <Box key={m.module_id}
                    onClick={() => handleOpenModule(m)}
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', px: 1.75, py: 1.1,
                          bgcolor: '#fff', borderRadius: 1.5, border: '1px solid rgba(0,0,0,0.07)',
                          cursor: 'pointer',
                          '&:hover': { borderColor: MAROON + '55', bgcolor: MAROON_LIGHT } }}>
                    <Chip label={'Wk ' + m.week_number} size="small"
                      sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ color: '#333', flex: 1, fontWeight: 500 }}>{m.module_title}</Typography>
                    <Chip label={m.status} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        )
      }

      // ── CREATE view ────────────────────────────────────────────────────
      return (
        <Stack spacing={2}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
          {/* Back + header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Back to modules list">
              <IconButton size="small"
                onClick={() => { setModuleCreating(false); setModuleFromSchedule(false); setResultText('') }}
                sx={{ color: '#666', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 1 }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography variant="subtitle2"
              sx={{ fontWeight: 700, color: '#444', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Create Module
            </Typography>
          </Box>

          {/* Module Generator > Module Builder */}
          <SectionCard title="Module Generator">
            <SectionCard title="Module Builder">
              <Stack spacing={1.75}>
                {/* Module Topic */}
                {moduleFromSchedule ? (
                  <LField label="Module Topic" value={moduleParams.module_title}
                    InputProps={{ readOnly: true }}
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: BG } }} />
                ) : (
                  <LField select label="Module Topic" value={moduleParams.module_title}
                    onChange={e => {
                      const sel = lectureWeeks.find(lw => lw.topic === e.target.value)
                      setModuleParams(p => ({ ...p, module_title: e.target.value, week_number: sel ? sel.week : p.week_number }))
                    }}>
                    <MenuItem value=""><em>— Select a Lecture/Discussion topic —</em></MenuItem>
                    {lectureWeeks.map((lw, i) => (
                      <MenuItem key={i} value={lw.topic}>
                        Wk {lw.week} — {lw.topic.length > 60 ? lw.topic.slice(0, 57) + '…' : lw.topic}
                      </MenuItem>
                    ))}
                  </LField>
                )}

                {/* Week Number */}
                {moduleFromSchedule ? (
                  <LField label="Week Number" value={moduleParams.week_number}
                    InputProps={{ readOnly: true }}
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: BG } }} />
                ) : (
                  <LField select label="Week Number" value={moduleParams.week_number}
                    onChange={e => {
                      const sel = lectureWeeks.find(lw => String(lw.week) === String(e.target.value))
                      setModuleParams(p => ({ ...p, week_number: e.target.value, module_title: sel ? sel.topic : p.module_title }))
                    }}>
                    <MenuItem value=""><em>— Select week —</em></MenuItem>
                    {lectureWeeks.map((lw, i) => (
                      <MenuItem key={i} value={lw.week}>
                        Week {lw.week}{lw.topic ? ` — ${lw.topic.slice(0, 40)}` : ''}
                      </MenuItem>
                    ))}
                  </LField>
                )}

                {/* Extra Instructions / Scope */}
                <LField label="Extra Instructions / Scope" multiline minRows={3}
                  value={moduleParams.extra_instructions}
                  onChange={e => setModuleParams(p => ({ ...p, extra_instructions: e.target.value }))}
                  placeholder="Describe subtopics, scope, or specific content the module should focus on…" />

                {/* top-k */}
                <LField type="number" label="Knowledge References (top-k)" value={moduleParams.top_k}
                  onChange={e => setModuleParams(p => ({ ...p, top_k: e.target.value }))} />

                {/* Provider */}
                <LField select label="Model Provider" value={moduleParams.provider}
                  onChange={e => setModuleParams(p => ({ ...p, provider: e.target.value }))}>
                  {PROVIDERS.map(p => <MenuItem key={p} value={p}>{cap(p)}</MenuItem>)}
                </LField>

                <GenButton onClick={handleGenerateModule} disabled={actionLoading || !moduleParams.module_title.toString().trim()}>
                  {actionLoading ? 'Generating…' : 'Generate Module'}
                </GenButton>
                {actionLoading && (
                  <Box sx={{ textAlign: 'center', py: 1.5 }}>
                    <CircularProgress size={22} sx={{ color: MAROON }} />
                    <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 0.75 }}>
                      Running RAG pipeline and generating structured module…
                    </Typography>
                  </Box>
                )}
              </Stack>
            </SectionCard>
          </SectionCard>
        </Stack>
      )
    }

    if (activeTab === 'assessment') {
      const majorExams = getMajorTosExams()
      const blueprint = getAssessmentBlueprint()
      const assessments = workspaceApi.data?.assessments || []

      if (selectedAssessment && assessmentDetail) {
        return (
          <Stack spacing={2}>
            <AutoAlert message={actionError} onClose={() => setActionError('')} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Tooltip title="Back to assessments list">
                <IconButton
                  size="small"
                  onClick={() => {
                    setSelectedAssessment(null)
                    setAssessmentDetail(null)
                    setAssessmentSessionId(null)
                    setAssessmentToolsTab('builder')
                    setEditingItemId(null)
                    setEditingItemDraft(null)
                  }}
                  sx={{ color: '#666', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 1 }}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: '#888', display: 'block' }}>
                  {assessmentDetail.assessment_type || 'assessment'} · {assessmentDetail.total_items || 0} items
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: MAROON, fontSize: '0.9rem' }}>
                  {assessmentDetail.title || 'Assessment'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  label={`${assessmentDetail.total_items || 0}/${assessmentDetail.target_total_items || assessmentDetail.total_items || 0}`}
                  sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 22, fontSize: '0.68rem' }}
                />
                <Chip
                  size="small"
                  label={`${Math.max(0, (assessmentDetail.target_total_items || assessmentDetail.total_items || 0) - (assessmentDetail.total_items || 0))} left`}
                  sx={{ bgcolor: '#f3f5f8', color: '#555', fontWeight: 600, height: 22, fontSize: '0.68rem' }}
                />
                <Button
                  size="small"
                  startIcon={<AddIcon sx={{ fontSize: '0.8rem !important' }} />}
                  onClick={() => setAssessmentToolsTab('builder')}
                  disabled={(assessmentDetail.target_total_items || assessmentDetail.total_items || 0) <= (assessmentDetail.total_items || 0)}
                  sx={{
                    borderColor: MAROON,
                    color: MAROON,
                    borderRadius: 1.5,
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    px: 1.2,
                    py: 0.35,
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    '&:hover': { bgcolor: MAROON_LIGHT, borderColor: MAROON },
                  }}>
                  {(assessmentDetail.target_total_items || assessmentDetail.total_items || 0) > (assessmentDetail.total_items || 0) ? 'Add Item' : 'Complete'}
                </Button>
              </Box>
              <Button size="small" startIcon={<InsertDriveFileIcon sx={{ fontSize: '0.85rem !important' }} />}
                disabled={assessmentExporting}
                onClick={handleExportAssessmentDocx}
                sx={{
                  borderColor: MAROON,
                  color: MAROON,
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontSize: '0.78rem',
                  px: 1.25,
                  py: 0.4,
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  '&:hover': { bgcolor: MAROON_LIGHT, borderColor: MAROON },
                }}>
                {assessmentExporting ? 'Exporting…' : 'Export DOCX'}
              </Button>
            </Box>

            {(assessmentDetail.sections || []).length === 0 ? (
              <SectionCard title="Assessment Items">
                <Typography variant="body2" sx={{ color: '#999' }}>
                  No sectioned items found for this assessment.
                </Typography>
              </SectionCard>
            ) : (
              <Stack spacing={1.2}>
                {(assessmentDetail.sections || []).map((section, secIndex) => (
                  <SectionCard
                    key={`${section.section_title}-${secIndex}`}
                    title={`${section.section_title} (${section.allocated_items || (section.items || []).length} items)`}
                  >
                    <Box sx={{ mb: 1.25, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {Object.entries(section.bloom_distribution || {}).map(([level, count]) => (
                        <Chip
                          key={`${section.section_title}-${level}`}
                          size="small"
                          label={`${level}: ${count}`}
                          sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem' }}
                        />
                      ))}
                    </Box>
                    <Stack spacing={0.6}>
                      {(section.items || []).map(item => {
                        const isEditing = editingItemId === item.item_id
                        const draft = isEditing ? editingItemDraft : null
                        return (
                          <Box
                            key={item.item_id || `${section.section_title}-${item.item_number}`}
                            sx={{ px: 1.25, py: 0.9, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.25, bgcolor: '#fff' }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
                              <Typography variant="caption" sx={{ color: '#777', fontWeight: 700, flex: 1 }}>
                                Item {item.item_number}
                              </Typography>
                              {!isEditing ? (
                                <Button
                                  size="small"
                                  startIcon={<EditIcon sx={{ fontSize: '0.8rem !important' }} />}
                                  onClick={() => handleStartItemEdit(item)}
                                  sx={{ textTransform: 'none', color: MAROON, fontSize: '0.72rem', px: 1, minWidth: 0 }}
                                >
                                  Edit
                                </Button>
                              ) : (
                                <Stack direction="row" spacing={0.6}>
                                  <Button
                                    size="small"
                                    startIcon={<CloseIcon sx={{ fontSize: '0.8rem !important' }} />}
                                    disabled={itemSaving}
                                    onClick={() => {
                                      setEditingItemId(null)
                                      setEditingItemDraft(null)
                                    }}
                                    sx={{ textTransform: 'none', color: '#666', fontSize: '0.72rem', px: 1, minWidth: 0 }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    startIcon={<SaveIcon sx={{ fontSize: '0.8rem !important' }} />}
                                    disabled={itemSaving}
                                    onClick={handleSaveItemEdit}
                                    sx={{ textTransform: 'none', bgcolor: MAROON, '&:hover': { bgcolor: '#6a0000' }, fontSize: '0.72rem', px: 1.2, minWidth: 0 }}
                                  >
                                    {itemSaving ? 'Saving…' : 'Save'}
                                  </Button>
                                </Stack>
                              )}
                            </Box>

                            {!isEditing ? (
                              <>
                                <Typography variant="body2" sx={{ color: '#2f2f2f', fontWeight: 600 }}>
                                  {item.item_number}. {item.question_text}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#777' }}>
                                  Bloom: {item.bloom_level || 'N/A'}{item.bloom_verb ? ` (${item.bloom_verb})` : ''}
                                </Typography>
                                {!!item.matched_module_title && (
                                  <Typography variant="caption" display="block" sx={{ color: '#8a5a00', mt: 0.35 }}>
                                    Grounded on module: {item.matched_module_title}{item.matched_module_week ? ` (Week ${item.matched_module_week})` : ''}
                                  </Typography>
                                )}
                                {(item.choices || []).length > 0 && (
                                  <Stack spacing={0.35} sx={{ mt: 0.9 }}>
                                    {(item.choices || []).map((choice, choiceIndex) => (
                                      <Typography
                                        key={`${item.item_id || item.item_number}-choice-${choiceIndex}`}
                                        variant="body2"
                                        sx={{ color: '#4a4a4a', pl: 0.5 }}>
                                        {choice}
                                      </Typography>
                                    ))}
                                  </Stack>
                                )}
                                {(item.correct_answer || item.answer_key) && (
                                  <Stack spacing={0.2} sx={{ mt: 0.8 }}>
                                    {!!item.correct_answer && (
                                      <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 700 }}>
                                        Correct Answer: {item.correct_answer}
                                      </Typography>
                                    )}
                                    {!!item.answer_key && (
                                      <Typography variant="caption" sx={{ color: '#666' }}>
                                        Explanation: {item.answer_key}
                                      </Typography>
                                    )}
                                  </Stack>
                                )}
                              </>
                            ) : (
                              <Stack spacing={0.85}>
                                <TextField
                                  size="small"
                                  fullWidth
                                  multiline
                                  minRows={2}
                                  label="Question"
                                  value={draft?.question_text || ''}
                                  onChange={e => setEditingItemDraft(prev => ({ ...prev, question_text: e.target.value }))}
                                />
                                <Stack spacing={0.55}>
                                  {(draft?.choices || []).map((choice, choiceIndex) => (
                                    <TextField
                                      key={`${item.item_id || item.item_number}-choice-edit-${choiceIndex}`}
                                      size="small"
                                      fullWidth
                                      label={`Choice ${String.fromCharCode(65 + choiceIndex)}`}
                                      value={choice}
                                      onChange={e => handleEditChoiceChange(choiceIndex, e.target.value)}
                                    />
                                  ))}
                                </Stack>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8}>
                                  <TextField
                                    size="small"
                                    select
                                    label="Correct Answer"
                                    value={draft?.correct_answer || ''}
                                    onChange={e => setEditingItemDraft(prev => ({
                                      ...prev,
                                      correct_answer: (e.target.value || '').toUpperCase(),
                                    }))}
                                    sx={{ maxWidth: { sm: 180 } }}
                                  >
                                    <MenuItem value="">No answer</MenuItem>
                                    <MenuItem value="A">A</MenuItem>
                                    <MenuItem value="B">B</MenuItem>
                                    <MenuItem value="C">C</MenuItem>
                                    <MenuItem value="D">D</MenuItem>
                                    <MenuItem value="E">E</MenuItem>
                                  </TextField>
                                  <TextField
                                    size="small"
                                    fullWidth
                                    label="Explanation / Answer Key"
                                    value={draft?.answer_key || ''}
                                    onChange={e => setEditingItemDraft(prev => ({ ...prev, answer_key: e.target.value }))}
                                  />
                                </Stack>
                              </Stack>
                            )}
                          </Box>
                        )
                      })}
                    </Stack>
                  </SectionCard>
                ))}
              </Stack>
            )}
          </Stack>
        )
      }

      if (!assessmentCreating) {
        return (
          <Stack spacing={2}>
            <AutoAlert message={actionError} onClose={() => setActionError('')} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2"
                sx={{ fontWeight: 700, color: '#444', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Assessments
              </Typography>
              <Button size="small" startIcon={<AddIcon sx={{ fontSize: '0.85rem !important' }} />}
                onClick={() => {
                  setAssessmentCreating(true)
                  setAssessmentSessionId(null)
                  setSelectedAssessment(null)
                  setAssessmentDetail(null)
                  if (majorExams.length > 0) {
                    setAssessmentParams(p => ({
                      ...p,
                      source_exam_code: p.source_exam_code || majorExams[0].examCode || '',
                      source_exam_label: p.source_exam_label || majorExams[0].examLabel || '',
                      item_by_item: true,
                      target_item_number: 1,
                      related_item_number: '',
                      relation_instruction: '',
                      overwrite_item: true,
                    }))
                  }
                }}
                sx={{
                  bgcolor: MAROON,
                  color: '#fff',
                  borderRadius: 1.5,
                  textTransform: 'none',
                  fontSize: '0.78rem',
                  px: 1.5,
                  py: 0.4,
                  '&:hover': { bgcolor: '#6a0000' },
                }}>
                Create Assessment
              </Button>
            </Box>

            {assessments.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <AssignmentIcon sx={{ fontSize: 44, color: '#ddd', display: 'block', mx: 'auto', mb: 1.5 }} />
                <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>No assessments yet.</Typography>
                <Typography variant="caption" sx={{ color: '#ccc' }}>
                  Click Create Assessment to build items from your syllabus TOS and score distribution.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={0.75}>
                {assessments.map(a => (
                  <Box
                    key={a.assessment_id}
                    onClick={() => handleOpenAssessment(a)}
                    sx={{
                      display: 'flex',
                      gap: 1,
                      alignItems: 'center',
                      px: 1.75,
                      py: 1.1,
                      bgcolor: '#fff',
                      borderRadius: 1.5,
                      border: '1px solid rgba(0,0,0,0.07)',
                      cursor: 'pointer',
                      '&:hover': { borderColor: MAROON + '55', bgcolor: MAROON_LIGHT },
                    }}>
                    <Chip label={a.assessment_type} size="small"
                      sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ color: '#333', flex: 1, fontWeight: 500 }}>{a.title}</Typography>
                    <Chip label={a.status} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        )
      }

      return (
        <Stack spacing={2}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="Back to assessments list">
              <IconButton size="small"
                onClick={() => { setAssessmentCreating(false) }}
                
                sx={{ color: '#666', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 1 }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography variant="subtitle2"
              sx={{ fontWeight: 700, color: '#444', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Create Assessment
            </Typography>
          </Box>
          <SectionCard title="Assessment Builder">
            <Stack spacing={1.75}>
              <LField
                select
                label="Major Examination (from TOS)"
                value={assessmentParams.source_exam_code || assessmentParams.source_exam_label || blueprint.examCode || blueprint.assessmentName || ''}
                onChange={e => {
                  const selected = majorExams.find(exam => (exam.examCode || exam.examLabel) === e.target.value)
                  setAssessmentParams(p => ({
                    ...p,
                    source_exam_code: selected?.examCode || '',
                    source_exam_label: selected?.examLabel || '',
                  }))
                }}
              >
                {majorExams.length === 0 ? (
                  <MenuItem value="" disabled>
                    No major examinations found in TOS
                  </MenuItem>
                ) : (
                  majorExams.map(exam => (
                    <MenuItem key={`${exam.examCode || exam.examLabel}`} value={exam.examCode || exam.examLabel}>
                      {exam.examLabel} ({exam.totalItems || 0} items)
                    </MenuItem>
                  ))
                )}
              </LField>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25 }}>
                {[
                  { label: 'Assessment Name', value: blueprint.assessmentName },
                  { label: 'Assessment Type', value: blueprint.assessmentType },
                  { label: 'Number of Items', value: blueprint.totalItems },
                ].map(card => (
                  <Box key={card.label} sx={{ p: 1.25, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: BG }}>
                    <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.7rem' }}>{card.label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#222', mt: 0.25 }}>{card.value || 'Auto'}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ p: 1.25, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: '#fff' }}>
                <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.7rem', mb: 0.5 }}>
                  Assessment Source
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#222' }}>
                  {blueprint.sourceMode} {blueprint.examCode ? `· ${blueprint.examCode}` : ''} {blueprint.sourceTaskLabel ? `· ${blueprint.sourceTaskLabel}` : ''}
                </Typography>
                <Typography variant="caption" sx={{ color: '#777', display: 'block', mt: 0.5 }}>
                  Topics are taken from the selected TOS exam. If no TOS topics are available, faculty topic input below is used.
                </Typography>
              </Box>
              <Box sx={{ p: 1.25, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: '#fff' }}>
                <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.7rem', mb: 0.5 }}>
                  Generation Mode
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#222', mb: 0.75 }}>
                  One item at a time (token-managed)
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.1}>
                  <LField
                    type="number"
                    label="Target Item Number"
                    value={assessmentParams.target_item_number}
                    onChange={e => setAssessmentParams(p => ({ ...p, target_item_number: e.target.value }))}
                    inputProps={{ min: 1, max: blueprint.totalItems || undefined }}
                  />
                  <LField
                    select
                    label="Related to Item (optional)"
                    value={assessmentParams.related_item_number}
                    onChange={e => setAssessmentParams(p => ({ ...p, related_item_number: e.target.value }))}
                  >
                    <MenuItem value="">None</MenuItem>
                    {Array.from({ length: Math.max(0, Number(assessmentParams.target_item_number || 0) - 1) }, (_, idx) => idx + 1).map(n => (
                      <MenuItem key={`related-item-${n}`} value={String(n)}>
                        Item {n}
                      </MenuItem>
                    ))}
                  </LField>
                </Stack>
                <Box sx={{ mt: 1 }}>
                  <LField
                    label="Relation Instruction (optional)"
                    multiline
                    minRows={2}
                    value={assessmentParams.relation_instruction}
                    onChange={e => setAssessmentParams(p => ({ ...p, relation_instruction: e.target.value }))}
                    placeholder="Example: Make this item an application follow-up of the related item."
                  />
                </Box>
                <Box sx={{ mt: 0.9, display: 'flex', alignItems: 'center', gap: 0.8 }}>
                  <Checkbox
                    size="small"
                    checked={Boolean(assessmentParams.overwrite_item)}
                    onChange={e => setAssessmentParams(p => ({ ...p, overwrite_item: e.target.checked }))}
                    sx={{ color: MAROON, '&.Mui-checked': { color: MAROON }, p: 0.2 }}
                  />
                  <Typography variant="caption" sx={{ color: '#666' }}>
                    Overwrite item if it already exists
                  </Typography>
                </Box>
                {!!assessmentSessionId && (
                  <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 0.6 }}>
                    Continuing draft assessment session.
                  </Typography>
                )}
              </Box>
              <LField
                label="Faculty topics override (optional)"
                multiline
                minRows={3}
                value={assessmentParams.faculty_topics}
                onChange={e => setAssessmentParams(p => ({ ...p, faculty_topics: e.target.value }))}
                placeholder="One topic per line or separated by semicolons. Leave blank to use the TOS topics automatically."
              />
              <LField label="Extra Instructions" multiline minRows={2} value={assessmentParams.extra_instructions}
                onChange={e => setAssessmentParams(p => ({ ...p, extra_instructions: e.target.value }))} />
              <LField select label="Model Provider" value={assessmentParams.provider}
                onChange={e => setAssessmentParams(p => ({ ...p, provider: e.target.value }))}>
                {PROVIDERS.map(p => <MenuItem key={p} value={p}>{cap(p)}</MenuItem>)}
              </LField>
              <GenButton onClick={handleGenerateAssessment} disabled={actionLoading}>
                {actionLoading ? 'Generating...' : 'Generate Selected Item'}
              </GenButton>
              <Typography variant="caption" sx={{ color: '#888' }}>
                This mode generates one item per request, keeps numbering from 1 to N, and supports optional item-to-item relationship prompts.
              </Typography>
            </Stack>
          </SectionCard>

        </Stack>

        )
      }

      return (
        <BubbleSheetPanel courseId={courseId} assessments={workspaceApi.data?.assessments || []} />
      )
    }

  function renderUploadPanel() {
    const docs = docsApi.data?.documents || docsApi.data?.results || []
    return (
    <>

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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
              <Typography variant="caption"
                sx={{ color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.62rem' }}>
                Uploaded ({docs.length})
              </Typography>
              {selectedDocIds.size > 0 && (
                <Typography variant="caption" sx={{ color: MAROON, fontWeight: 600, fontSize: '0.62rem' }}>
                  {selectedDocIds.size} selected for generation
                </Typography>
              )}
            </Box>
            {selectedDocIds.size === 0 && (
              <Typography variant="caption" sx={{ color: '#bbb', display: 'block', mb: 0.75, fontSize: '0.6rem' }}>
                Check sources to limit generation to selected files only.
              </Typography>
            )}
            <Stack spacing={0.5}>
              {docs.map((doc, i) => {
                const docId = doc.records_id || doc.id || String(i)
                const isChecked = selectedDocIds.has(docId)
                const isDeleting = deletingDocId === docId
                return (
                  <Box key={docId}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5,
                          bgcolor: isChecked ? MAROON_LIGHT : BG, borderRadius: 1.5,
                          border: `1px solid ${isChecked ? MAROON + '44' : 'rgba(0,0,0,0.07)'}`,
                          transition: 'all 0.15s' }}>
                    <Checkbox
                      size="small"
                      checked={isChecked}
                      onChange={() => {
                        setSelectedDocIds(prev => {
                          const next = new Set(prev)
                          if (next.has(docId)) next.delete(docId)
                          else next.add(docId)
                          return next
                        })
                      }}
                      sx={{ p: 0.25, color: MAROON, '&.Mui-checked': { color: MAROON }, flexShrink: 0 }}
                    />
                    <InsertDriveFileIcon sx={{ fontSize: 14, color: MAROON, flexShrink: 0 }} />
                    <Typography variant="caption"
                      sx={{ color: '#444', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            fontSize: '0.72rem' }}>
                      {doc.storage_path || doc.file_name || 'Unnamed file'}
                    </Typography>
                    <Chip label={doc.rag_status || 'OK'} size="small"
                      sx={{ height: 16, fontSize: '0.58rem', flexShrink: 0,
                           bgcolor: doc.rag_status === 'COMPLETED' ? '#E8F5E9' : '#FFF3E0',
                           color:   doc.rag_status === 'COMPLETED' ? '#2E7D32' : '#E65100' }} />
                    <Tooltip title="Delete source and its vectors">
                      <IconButton size="small"
                        disabled={isDeleting}
                        onClick={() => setConfirmDeleteId(docId)}
                        sx={{ p: 0.25, color: '#ccc', flexShrink: 0,
                             '&:hover': { color: '#c62828', bgcolor: '#ffebee' } }}>
                        {isDeleting
                          ? <CircularProgress size={12} sx={{ color: '#c62828' }} />
                          : <DeleteIcon sx={{ fontSize: 14 }} />}
                      </IconButton>
                    </Tooltip>
                  </Box>
                )
              })}
            </Stack>
          </Box>
        )}

        {/* Delete confirmation dialog */}
        <Dialog open={Boolean(confirmDeleteId)} onClose={() => setConfirmDeleteId(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: '#c62828' }}>Delete Source?</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ fontSize: '0.85rem' }}>
              This will permanently remove the file and all its indexed vectors from the knowledge base.
              Generation tools will no longer use it.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
            <Button size="small" onClick={() => setConfirmDeleteId(null)}
              sx={{ textTransform: 'none', color: '#666' }}>Cancel</Button>
            <Button size="small" variant="contained"
              onClick={() => { const id = confirmDeleteId; setConfirmDeleteId(null); handleDeleteDoc(id) }}
              sx={{ bgcolor: '#c62828', '&:hover': { bgcolor: '#b71c1c' }, textTransform: 'none', fontWeight: 600 }}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Templates Section (lower right) ──────────────────────────────────────── */}
        <Divider sx={{ my: 2 }} />
        <Typography variant="caption"
          sx={{ fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.62rem', display: 'block', mb: 1.5 }}>
          Export Templates
        </Typography>

        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" sx={{ color: '#666', display: 'block', mb: 0.75, fontSize: '0.75rem' }}>
              Upload a DOCX or XLSX template with {'{{fieldName}}'} placeholders. Leave empty for default format.
            </Typography>
            <Button variant="outlined" component="label" fullWidth
              sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none', borderRadius: 1.5, fontSize: '0.8rem',
                   '&:hover': { bgcolor: MAROON_LIGHT, borderColor: MAROON } }}>
              {syllabusTemplateFile ? '✓ Template Loaded' : 'Choose Template'}
              <input hidden type="file"
                accept=".docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => setSyllabusTemplateFile(e.target.files?.[0] || null)} />
            </Button>
            {syllabusTemplateFile && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, px: 1, py: 0.5, bgcolor: MAROON_LIGHT, borderRadius: 1 }}>
                <InsertDriveFileIcon sx={{ fontSize: 14, color: MAROON, flexShrink: 0 }} />
                <Typography variant="caption" sx={{ color: '#333', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.7rem' }}>
                  {syllabusTemplateFile.name}
                </Typography>
                <IconButton size="small"
                  onClick={() => setSyllabusTemplateFile(null)}
                  sx={{ p: 0.25, color: MAROON, flexShrink: 0 }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            )}
          </Box>
        </Stack>
      </>
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
              <Button key={key} onClick={() => { setActiveTab(key); setMobileNavOpen(false); if (key !== 'module') { setModuleCreating(false); setModuleFromSchedule(false); setSelectedModule(null); setModuleContent(null); setChatOpen(false) } }}
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
        <Box sx={{ p: 2 }}>
          {activeTab === 'assessment' && selectedAssessment && assessmentDetail
            ? renderAssessmentToolsPanel()
            : renderUploadPanel()}
        </Box>
      </Drawer>

      {/* Three-panel area */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: dragging ? 'none' : 'auto' }}>

        {/* LEFT — nav (desktop) or compact rail when collapsed */}
        {!isMobile && !leftCollapsed && (
          <Box sx={{ width: leftWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', bgcolor: '#fff', borderRight: '1px solid rgba(0,0,0,0.08)' }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption"
                sx={{ color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.6rem', fontWeight: 700 }}>
                Workspace
              </Typography>
              <Tooltip title="Collapse panel">
                <IconButton size="small" onClick={toggleLeftPanel} sx={{ color: '#777' }}>
                  <PanelLeftIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Stack sx={{ p: 1, gap: 0.25 }}>
              {WORKSPACE_TABS.map(({ key, label, Icon }) => {
                const on = activeTab === key
                return (
                  <Button key={key} onClick={() => { setActiveTab(key); if (key !== 'module') { setModuleCreating(false); setModuleFromSchedule(false); setSelectedModule(null); setModuleContent(null); setChatOpen(false) } }}
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
        )}

        {!isMobile && leftCollapsed && (
          <Box sx={{ width: 68, flexShrink: 0, bgcolor: '#fff', borderRight: '1px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 44, borderRadius: 3, bgcolor: '#F3F5F8', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, py: 1 }}>
              <Tooltip title="Expand panel">
                <IconButton size="small" onClick={toggleLeftPanel} sx={{ color: '#666' }}>
                  <PanelLeftIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Divider flexItem sx={{ mx: 0.5 }} />
              {WORKSPACE_TABS.map(({ key, label, Icon }) => {
                const on = activeTab === key
                return (
                  <Tooltip key={key} title={label} placement="right">
                    <IconButton size="small" onClick={() => { setActiveTab(key); setLeftCollapsed(false) }}
                      sx={{ color: on ? MAROON : '#666', bgcolor: on ? MAROON_LIGHT : 'transparent', '&:hover': { bgcolor: BG, color: MAROON } }}>
                      <Icon sx={{ fontSize: '1rem' }} />
                    </IconButton>
                  </Tooltip>
                )
              })}
            </Box>
          </Box>
        )}

        {/* Drag — left (desktop only when expanded) */}
        {!isMobile && !leftCollapsed && (
          <Box onMouseDown={() => setDragging('left')}
            sx={{ width: 4, flexShrink: 0, cursor: 'col-resize',
                  bgcolor: dragging === 'left' ? MAROON + '44' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(139,0,0,0.14)' }, transition: 'background-color 0.15s' }} />
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

        {/* Drag — right (desktop only when expanded) */}
        {!isMobile && !rightCollapsed && (
          <Box onMouseDown={() => setDragging('right')}
            sx={{ width: 4, flexShrink: 0, cursor: 'col-resize',
                  bgcolor: dragging === 'right' ? MAROON + '44' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(139,0,0,0.14)' }, transition: 'background-color 0.15s' }} />
        )}

        {/* RIGHT — sources panel (desktop) or compact rail when collapsed */}
        {!isMobile && !rightCollapsed && (
          <Box sx={{ width: rightWidth, flexShrink: 0, bgcolor: '#fff', borderLeft: '1px solid rgba(0,0,0,0.08)', overflow: 'auto', p: 0 }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1f1f1f' }}>
                {activeTab === 'assessment' && selectedAssessment && assessmentDetail ? 'Assessment Tools' : 'Sources'}
              </Typography>
              <Tooltip title="Collapse panel">
                <IconButton size="small" onClick={toggleRightPanel} sx={{ color: '#666' }}>
                  <PanelRightIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ p: 2 }}>
              {activeTab === 'assessment' && selectedAssessment && assessmentDetail
                ? renderAssessmentToolsPanel()
                : renderUploadPanel()}
            </Box>
          </Box>
        )}

        {!isMobile && rightCollapsed && (
          <Box sx={{ width: 68, flexShrink: 0, bgcolor: '#fff', borderLeft: '1px solid rgba(0,0,0,0.08)', display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 44, borderRadius: 3, bgcolor: '#F3F5F8', border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, py: 1 }}>
              <Tooltip title="Expand sources">
                <IconButton size="small" onClick={toggleRightPanel} sx={{ color: '#666' }}>
                  <PanelRightIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Divider flexItem sx={{ mx: 0.5 }} />
              <Tooltip title="Add source" placement="left">
                <IconButton size="small" onClick={() => setRightCollapsed(false)} sx={{ color: '#666', '&:hover': { color: MAROON, bgcolor: MAROON_LIGHT } }}>
                  <AddIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="View uploaded source" placement="left">
                <IconButton size="small" onClick={() => setRightCollapsed(false)}
                  sx={{ color: '#D32F2F', '&:hover': { bgcolor: '#FFF1F1' } }}>
                  <PictureAsPdfIcon sx={{ fontSize: '1.15rem' }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Source panel" placement="left">
                <IconButton size="small" onClick={() => setRightCollapsed(false)} sx={{ color: '#666' }}>
                  <ViewModuleIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}