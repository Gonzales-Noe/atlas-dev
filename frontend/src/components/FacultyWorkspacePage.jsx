// src/components/FacultyWorkspacePage.jsx
// 3-panel workspace — shared dark faculty workspace theme.
// Left: nav tabs | Middle: content + syllabus section tabs | Right: upload

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import AutoAlert from './AutoAlert'
import MarkdownText, { MarkdownInline } from './MarkdownText'
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
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
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
import AnalyticsIcon from '@mui/icons-material/Analytics'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import LogoutIcon from '@mui/icons-material/Logout'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MenuIcon from '@mui/icons-material/Menu'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import DownloadIcon from '@mui/icons-material/Download'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import TableChartIcon from '@mui/icons-material/TableChart'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ChatIcon from '@mui/icons-material/Chat'
import SendIcon from '@mui/icons-material/Send'
import CloseIcon from '@mui/icons-material/Close'
import SaveIcon from '@mui/icons-material/Save'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import LockIcon from '@mui/icons-material/Lock'
import ReplayIcon from '@mui/icons-material/Replay'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import useApi from '../hooks/useApi'
import api from '../config/api'
import { useAuth } from '../store/authStore'
import { extractApiError } from '../utils'
import { materializeTosExam, materializeTosList, tosMaterializedEqual, displayedTopicMinutes } from '../utils/tosFormula'
import { collectLectureDiscussionTopics, isLectureDiscussionDelivery, lectureTopicLines } from '../utils/lectureTopics'
import { notifyGenerationComplete } from '../utils/userPreferences'
import WorkspacePipelineStepper from './WorkspacePipelineStepper'
import WorkspacePageHeader from './WorkspacePageHeader'
import useWorkspaceProgress from '../hooks/useWorkspaceProgress'
import OmrGradingPanel from './OmrGradingPanel'
import BubbleSheetPanel from './BubbleSheetPanel'
import FacultyAnalyticsReports from './FacultyAnalyticsReports'
import { ChevronDown, Plus, Trash2, Zap, BookOpen, ClipboardList, ClipboardCheck } from 'lucide-react'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { applyFixedSyllabusContent, applyTableOverride, SYLLABUS_SECTION_BLUEPRINTS } from '../config/syllabusStructure'

// ── Constants ─────────────────────────────────────────────────────────────
const MAROON = '#16A34A'
const MAROON_LIGHT = 'rgba(22,163,74,0.16)'
const BG = '#0F0F12'

const WORKSPACE_TABS = [
  { key: 'syllabus',   label: 'Syllabus',    Icon: MenuBookIcon },
  { key: 'module',     label: 'Modules',     Icon: ViewModuleIcon },
  { key: 'tos',        label: 'TOS',         Icon: TableChartIcon },
  { key: 'assessment', label: 'Assessments', Icon: AssignmentIcon },
  { key: 'grading',    label: 'Grading',     Icon: GradeIcon },
  { key: 'analytics',  label: 'Analytics',   Icon: AnalyticsIcon },
]

const SYLLABUS_SECTIONS = [
  { key: 'university-information', label: 'University Information' },
  { key: 'course-information',    label: 'Course Information' },
  { key: 'iloat-references',      label: 'ILO, AT, and References' },
  { key: 'framework-mapping',     label: 'Framework Mapping' },
  { key: 'course-policies',       label: 'Course Policies' },
  { key: 'tla-activities',        label: 'Teaching, Learning, and Assessment (TLA) Activities' },
  { key: 'mapping-of-at',         label: 'Mapping of AT' },
]

// Maps the field keys the Admin Syllabus Format stores to the keys this
// workspace uses in syllabusData, so fields fixed by the institution can be
// prefilled and locked here.
const ADMIN_FIXED_FIELDS = {
  'vision': 'vision',
  'mission': 'mission',
  'course-title': 'course_title',
  'course-code': 'course_code',
  'course-category': 'course_category',
  'prerequisites': 'prerequisites',
  'semester-year': 'semester_year',
  'credit-hours': 'credit_hours',
  'reference-cmo': 'reference_cmo',
  'date-prepared': 'date_prepared',
  'revision-no': 'revision_no',
  'revision-date': 'revision_date',
  'period-of-study': 'period_of_study',
  'instructor-code': 'employee_id',
  'instructor-qualification': 'education',
  'instructor-email': 'instructor_email',
  'course-rationale-description': 'rationale',
  'contact-hours': 'contact_hours',
  'criteria-for-assessment': 'assessment_criteria',
  'tla-strategies': 'tlas',
  'class-policy': 'class_policy',
  'missed-examinations': 'missed_examinations',
  'academic-dishonesty': 'academic_dishonesty',
  'dropping': 'dropping',
  'other-policies': 'other_policies',
}

const PROVIDERS = ['auto', 'groq', 'gemma', 'cloudflare', 'openrouter', 'ollama']
const PROVIDER_LABELS = {
  auto: 'Auto (best available free model)',
  groq: 'Groq — GPT-OSS 120B',
  gemma: 'Google AI Studio — Gemma 4 31B',
  cloudflare: 'Cloudflare — GPT-OSS 120B',
  openrouter: 'OpenRouter — free models',
  ollama: 'Ollama (VPS local)',
}
const ASSESSMENT_TYPES = [
  'quiz', 'long quiz', 'midterm exam', 'final exam',
  'assignment', 'project', 'activity', 'performance task',
]

// How deeply the AI should structure a generated module.
const STRUCTURING_LEVELS = [
  { value: 'standard',  label: 'Standard',      description: '3–5 subtopics — balanced depth for a class session' },
  { value: 'detailed',  label: 'Detailed',      description: '4–6 subtopics — deep coverage, full lecture or lab series' },
  { value: 'concise',   label: 'Concise',       description: '2–3 subtopics — a quick refresher or orientation' },
  { value: 'activity',  label: 'Activity-led',  description: 'The class activity drives it; subtopics support it' },
]

const EMPTY_TASK    = { code: '', task: '', ird: '', category: '', weight: '', ilo_values: [], subs: [], c: '', p: '', a: '' }
const EMPTY_ATTR    = { code: '', title: '', description: '' }
const EMPTY_POLICY  = { title: '', content: '' }
const EMPTY_CHAPTER = { chapter: '', topics: '', weeks: '', outcomes: '', ilo: '', ilo_refs: [], so: '', delivery: '' }
const ILO_FIELD_COUNT = 3

function iloGenerateCount(ilos) {
  const count = Array.isArray(ilos) ? ilos.length : 0
  return Math.max(ILO_FIELD_COUNT, count)
}

function ensureIloCount(state, count) {
  const current = Array.isArray(state.ilos) ? state.ilos : []
  if (current.length >= count) return state
  const missing = count - current.length
  const soLen = (state.so_headers || ['']).length
  const igaLen = (state.iga_headers || ['']).length
  const cdioLen = (state.cdio_headers || ['']).length
  const sdgLen = (state.sdg_headers || ['']).length
  return {
    ...state,
    ilos: [...current, ...Array(missing).fill('')],
    ilo_bloom: [
      ...(state.ilo_bloom || []),
      ...Array.from({ length: missing }, () => ({ level: '', verb: '' })),
    ],
    assessment_tasks: (state.assessment_tasks || []).map(task => ({
      ...task,
      ilo_values: [...(task.ilo_values || []), ...Array(missing).fill('')],
    })),
    so_cpa_rows: [
      ...(state.so_cpa_rows || []),
      ...Array.from({ length: missing }, () => ({ so_vals: Array(soLen).fill(''), c: '', p: '', a: '' })),
    ],
    iga_rows: [
      ...(state.iga_rows || []),
      ...Array.from({ length: missing }, () => ({ vals: Array(igaLen).fill('') })),
    ],
    cdio_sdg_rows: [
      ...(state.cdio_sdg_rows || []),
      ...Array.from({ length: missing }, () => ({
        cdio_vals: Array(cdioLen).fill(''),
        sdg_vals: Array(sdgLen).fill(''),
      })),
    ],
  }
}

function ensureChapterCount(state, count) {
  const chapters = Array.isArray(state.tla_chapters) ? state.tla_chapters : []
  if (chapters.length >= count) return state
  const extra = Array.from({ length: count - chapters.length }, () => ({ ...EMPTY_CHAPTER }))
  return { ...state, tla_chapters: [...chapters, ...extra] }
}

function firstSentence(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const match = clean.match(/^.*?[.!?](?=\s|$)/)
  return (match ? match[0] : clean).trim()
}

function shapeRationale(text) {
  const clean = String(text || '')
    .replace(/^```[\w]*\n?|```$/g, '')
    .replace(/^\s*course rationale and description\s*[:\-–]?\s*/i, '')
    .trim()
  const sentences = clean.split(/(?<=[.!?])\s+/).map(part => part.trim()).filter(Boolean)
  if (sentences.length <= 3) return clean
  return sentences.slice(0, 3).join(' ')
}

function isInstructionEcho(text) {
  return /\b(8\s*[–-]\s*16|7\s*[–-]\s*12|hard cap|bloom'?s?\s+verb|one short sentence|one brief sentence|we need|no second clause|word count|these rules|verb list|do not mention|imperative verb|topic outcomes?\s*\d|output a single|field name)\b/i.test(text)
}

function shapeIlo(text) {
  let clean = String(text || '')
    .replace(/```/g, '')
    .replace(/students (?:should|will) be able to:?/ig, '')
    .replace(/upon completion of this course,?\s*(?:the students should be able to:?)?/ig, '')
    .replace(/^outcome for\b[^:\n]{0,80}:\s*/i, '')
    .trim()
  const line = clean
    .split(/\n+/)
    .map(part => part.replace(/^\s*(?:ILO\s*\d+\s*[:.\-)]\s*|\d+[.)]\s*|[-*•]\s*)/i, '').trim())
    .find(Boolean) || clean
  const sentence = firstSentence(line)
  if (!sentence || isInstructionEcho(sentence)) return ''
  return sentence
}

function shapeOutcome(text) {
  const clean = String(text || '')
    .replace(/```/g, '')
    .replace(/^outcome for\b[^:\n]{0,80}:\s*/i, '')
    .trim()
  const line = clean.split(/\n+/).map(part => part.trim()).find(Boolean) || ''
  const sentence = firstSentence(line)
  if (!sentence || isInstructionEcho(sentence)) return ''
  return sentence
}

function isClassOrientationTitle(title) {
  const lowered = String(title || '').trim().toLowerCase()
  return lowered === 'class orientation'
    || lowered === 'introduction to the course'
    || lowered === 'orientation'
    || lowered.startsWith('class orientation')
}

const ORIENTATION_TOPICS = 'Class Orientation'
const ORIENTATION_OUTCOME = 'Presentation of Syllabus, Class Rules'
const ORIENTATION_DELIVERY = 'Discussion'

function iloChoices(ilos) {
  const rows = (Array.isArray(ilos) ? ilos : []).map((text, index) => ({
    number: String(index + 1),
    text: String(text || '').trim(),
  })).filter(item => item.text)
  if (rows.length) return rows
  return [1, 2, 3].map(number => ({ number: String(number), text: `Intended learning outcome ${number}` }))
}

function soChoices(outcomes, soHeaders) {
  const headerNumbers = (soHeaders || []).map(value => String(value).replace(/\D/g, '')).filter(Boolean)
  const headerSet = new Set(headerNumbers)
  const rows = (Array.isArray(outcomes) ? outcomes : []).map((item, index) => {
    const number = (String(item?.code || '').match(/\d+/) || [String(index + 1)])[0]
    const text = String(item?.description || item?.title || '').trim()
    return { number, text }
  }).filter(item => item.text && (headerSet.size === 0 || headerSet.has(item.number)))
  if (rows.length) return rows
  const fallback = headerNumbers.length ? headerNumbers : ['1', '2', '3', '4', '5', '6']
  return fallback.map(number => ({ number, text: `Student outcome ${number}` }))
}

function parseTopicMap(text, count, iloNumbers, soNumbers) {
  const allowedIlo = new Set(iloNumbers)
  const allowedSo = new Set(soNumbers)
  const pairs = []
  String(text || '').split('\n').forEach(line => {
    const nums = line.trim().split(/[\t, ]+/).filter(part => /^\d+$/.test(part))
    if (nums.length < 2) return
    const ilo = nums[nums.length - 2]
    const so = nums[nums.length - 1]
    if (allowedIlo.has(ilo) && allowedSo.has(so)) pairs.push({ ilo, so })
  })
  const iloList = iloNumbers.length ? iloNumbers : ['1']
  const soList = soNumbers.length ? soNumbers : ['1']
  while (pairs.length < count) {
    const index = pairs.length
    pairs.push({ ilo: iloList[index % iloList.length], so: soList[index % soList.length] })
  }
  return pairs.slice(0, count)
}

function topicLineTitle(line) {
  return String(line || '').trim().replace(/^(?:[-*•–—]|\d+[.)])\s+/, '')
}

function shapeTopicsBlock(block) {
  const lines = String(block || '')
    .split(/\n/)
    .map(line => line.replace(/\s+$/, ''))
    .filter(line => line.trim())
  if (!lines.length) return ''
  return lines.map((line, index) => {
    const title = topicLineTitle(line)
    if (index === 0 || index === lines.length - 1) return title
    return `     ${title}`
  }).join('\n')
}

function shapeTopicsCell(text, options) {
  const stripped = String(text || '').replace(/```[\w]*\n?|```/g, '').trim()
  if (!options || !options.span) {
    const blocks = stripped.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean)
    return blocks.map(shapeTopicsBlock).filter(Boolean).join('\n\n')
  }
  const parsed = []
  let sawBlank = false
  stripped.split(/\n/).forEach(raw => {
    if (!raw.trim()) {
      if (parsed.length) sawBlank = true
      return
    }
    const title = topicLineTitle(raw)
    if (!title) return
    parsed.push({
      indented: /^\s+/.test(raw) || /^[-*•–—]/.test(raw.trim()),
      title,
      afterBlank: sawBlank,
    })
    sawBlank = false
  })
  if (!parsed.length) return ''
  if (options.span <= 1) {
    const sub = parsed.slice(1).find(row => row.indented) || parsed[1]
    return sub?.title ? `${parsed[0].title}\n     ${sub.title}` : parsed[0].title
  }
  let activity = ''
  let body = parsed
  if (options.activity) {
    const splitAt = parsed.findIndex(row => row.afterBlank && !row.indented)
    if (splitAt > 0) {
      activity = parsed[splitAt].title
      body = parsed.slice(0, splitAt)
    } else if (!parsed[parsed.length - 1].indented && parsed.length > 2) {
      activity = parsed[parsed.length - 1].title
      body = parsed.slice(0, -1)
    }
  }
  const topics = []
  body.forEach(row => {
    if (!row.indented || !topics.length) {
      if (topics.length < 3) topics.push({ title: row.title, subs: [] })
      return
    }
    const current = topics[topics.length - 1]
    if (current.subs.length < 2) current.subs.push(row.title)
  })
  if (topics.length && topics.every(topic => !topic.subs.length) && body.length > 1) {
    topics.length = 0
    for (let index = 0; index < body.length && topics.length < 3; index += 2) {
      const sub = body[index + 1]?.title
      topics.push({ title: body[index].title, subs: sub ? [sub] : [] })
    }
  }
  const lines = topics.flatMap(topic => [topic.title, ...topic.subs.map(sub => `     ${sub}`)])
  return activity ? `${lines.join('\n')}\n\n${activity}` : lines.join('\n')
}

function weekSpan(label) {
  const range = String(label || '').trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (!range) return 1
  return Math.max(1, Number(range[2]) - Number(range[1]) + 1)
}

const FINAL_WEEK_TOPICS = 'Final Examination and Submission of Requirements'
const FINAL_WEEK_OUTCOME = 'Complete the final examination and submit the requirements.'

function isFinalWeekRow(row) {
  const weeks = String(row?.weeks || '').trim()
  const title = String(row?.title || '').trim().toLowerCase()
  return weeks === '18' || /(?:^|-)18$/.test(weeks) || title.includes('final examination') || title.includes('submission of requirements')
}

function writingStillRunning(generating, assigning, progress) {
  if (!(generating || assigning)) return false
  if (progress?.total > 0 && progress.completed >= progress.total) return false
  return true
}

function shapeGeneratedField(section, text) {
  if (section === 'rationale') return shapeRationale(text)
  if (section === 'ilo') return shapeIlo(text)
  if (section === 'topics') return shapeTopicsCell(text)
  if (section === 'topic_outcome') return shapeOutcome(text)
  return String(text || '').trim()
}

function parseAssignedWeekPlan(text) {
  return String(text || '').split(/\n/).flatMap(line => {
    const trimmed = line.trim()
    if (!trimmed) return []
    const tab = trimmed.indexOf('\t')
    const weeks = (tab === -1 ? trimmed : trimmed.slice(0, tab)).trim()
    const title = tab === -1 ? '' : trimmed.slice(tab + 1).trim()
    if (!/^\d+(?:-\d+)?$/.test(weeks)) return []
    return [{ weeks, title }]
  })
}

async function requestSyllabusField(api, body, shape) {
  const post = payload => api.post('/curriculum/generate-syllabus-field/', payload, { timeout: 120000 })
  const read = data => {
    const raw = data?.generated_text || ''
    const text = shape ? shape(raw) : String(raw).trim()
    return { data, text }
  }
  try {
    const first = read((await post(body)).data)
    if (first.text || first.data?.provider_used === 'ollama' || body.provider === 'ollama') return first
    return read((await post({ ...body, provider: 'ollama' })).data)
  } catch (err) {
    if (body.provider === 'ollama') throw err
    const message = err?.response?.data?.error || err?.response?.data?.detail || err?.message || ''
    if (/ollama/i.test(String(message))) throw err
    return read((await post({ ...body, provider: 'ollama' })).data)
  }
}

function SyllabusDraftText({ text, section, sx }) {
  if (section === 'topics') {
    return (
      <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0, ...sx }}>
        {text}
      </Box>
    )
  }
  return <MarkdownText text={text} sx={sx} />
}

const DEFAULT_SO_HEADERS   = ['', '', '', '', '']
const DEFAULT_IGA_HEADERS  = ['', '', '', '', '', '']
const DEFAULT_CDIO_HEADERS = ['', '', '']
const DEFAULT_SDG_HEADERS  = ['', '', '', '']
const SO_PLACEHOLDERS = [['2', '3'], ['5', '6'], ['5', '6', '', '', '']]
const IGA_PLACEHOLDERS = [['2', '3', '4', '5'], ['3', '6'], ['3', '6', '', '', '', '']]
const CDIO_PLACEHOLDERS = [['4'], ['3', '4'], ['3', '4', '']]
const SDG_PLACEHOLDERS = [['1', '5'], ['3', '4'], ['3', '4', '', '']]

// Sample default rows for the Mapping of AT tables (per the institution's
// sample syllabus). Only the first ILO rows carry sample values.
const DEFAULT_SO_CPA_ROWS = [
  { so_vals: ['WA LA PA', 'LA', '', '', ''],    c: '', p: 'WA PA', a: '' },
  { so_vals: ['WA LA MA', 'LA', '', '', ''],    c: '', p: 'WA MA', a: 'LA' },
  { so_vals: ['WA LA FA FP', 'LA FP', '', '', ''], c: '', p: 'WA FA', a: 'LA FP' },
]
const DEFAULT_IGA_ROWS = [
  { vals: ['WA PA', 'LA', '', '', '', ''] },
  { vals: ['WA MA', 'LA', '', '', '', ''] },
  { vals: ['WA FA', 'LA FP', '', '', '', ''] },
]
const DEFAULT_CDIO_SDG_ROWS = [
  { cdio_vals: ['WA LA PA', '', ''],    sdg_vals: ['WA PA', '', '', ''] },
  { cdio_vals: ['WA LA MA', '', ''],    sdg_vals: ['WA MA', 'LA', '', ''] },
  { cdio_vals: ['WA LA FA FP', '', ''], sdg_vals: ['WA FA', 'LA FP', '', ''] },
]
const blankSoCpaRow = () => ({ so_vals: Array(DEFAULT_SO_HEADERS.length).fill(''), c: '', p: '', a: '' })
const blankIgaRow = () => ({ vals: Array(DEFAULT_IGA_HEADERS.length).fill('') })
const blankCdioSdgRow = () => ({ cdio_vals: Array(DEFAULT_CDIO_HEADERS.length).fill(''), sdg_vals: Array(DEFAULT_SDG_HEADERS.length).fill('') })

function sameHeaderList(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && left.every((value, index) => String(value ?? '').trim() === right[index])
}

function fitMapHeaders(values, fallback, placeholders, source) {
  const cleaned = (Array.isArray(values) ? values : []).map(value => String(value ?? '').trim())
  const count = fallback.length
  const locked = source === 'ollama' || source === 'faculty'
  const placeholder = (placeholders || []).some(sample => sameHeaderList(cleaned, sample))
  if (!locked && (!cleaned.some(Boolean) || placeholder)) return Array(count).fill('')
  const next = cleaned.slice(0, count)
  while (next.length < count) next.push('')
  return next
}

function frameworkCatalog(items, label) {
  return (items || []).flatMap((item, index) => {
    const number = String(item?.code || '').replace(/\D/g, '') || String(index + 1)
    const text = [item?.title, item?.description].map(part => String(part || '').trim()).filter(Boolean).join('. ')
    return text ? [`${label} ${number}: ${text}`] : []
  })
}

function topicBriefLines(chapters) {
  return (chapters || []).flatMap(chapter => {
    const title = String(chapter?.topics || '').split('\n').map(line => line.trim()).find(Boolean) || ''
    if (!title || /^class orientation$/i.test(title)) return []
    const week = String(chapter?.weeks || '').trim()
    return [`Topic${week ? ` week ${week}` : ''}: ${title}`]
  })
}

function parseFrameworkColumns(text) {
  const found = { so: [], iga: [], cdio: [], sdg: [] }
  let any = false
  String(text || '').split(/\n/).forEach(line => {
    const match = line.trim().match(/^(SO|IGA|CDIO|SDG)\s*[:\-]\s*(.*)$/i)
    if (!match) return
    const numbers = match[2].match(/\d+/g) || []
    if (numbers.length) any = true
    found[match[1].toLowerCase()] = numbers
  })
  return any ? found : null
}

function placeFrameworkNumbers(count, numbers, allowed) {
  const next = Array(count).fill('')
  const used = new Set()
  let index = 0
  ;(numbers || []).forEach(number => {
    if (index >= count || used.has(number) || (allowed.size && !allowed.has(number))) return
    used.add(number)
    next[index] = number
    index += 1
  })
  return next
}

function frameworkColumnRequest(data) {
  const ilos = (data?.ilos || []).map(text => String(text || '').trim()).filter(Boolean)
  const topics = topicBriefLines(data?.tla_chapters)
  const so = frameworkCatalog(data?.student_outcomes, 'SO')
  const iga = frameworkCatalog(data?.igas, 'IGA')
  const cdio = frameworkCatalog(data?.cdio_skills, 'CDIO')
  const sdg = frameworkCatalog(data?.sdg_skills, 'SDG')
  if (!ilos.length || !topics.length || !(so.length || iga.length || cdio.length || sdg.length)) return null
  const allowed = {
    so: new Set(so.map(line => line.match(/^SO\s+(\d+)/)?.[1]).filter(Boolean)),
    iga: new Set(iga.map(line => line.match(/^IGA\s+(\d+)/)?.[1]).filter(Boolean)),
    cdio: new Set(cdio.map(line => line.match(/^CDIO\s+(\d+)/)?.[1]).filter(Boolean)),
    sdg: new Set(sdg.map(line => line.match(/^SDG\s+(\d+)/)?.[1]).filter(Boolean)),
  }
  const brief = [
    'Student outcomes:',
    ...so,
    '',
    'Institutional graduate attributes:',
    ...iga,
    '',
    'CDIO skills:',
    ...cdio,
    '',
    'SDG skills:',
    ...sdg,
    '',
    'Intended learning outcomes:',
    ...ilos.map((text, index) => `ILO ${index + 1}: ${text}`),
    '',
    'Topics:',
    ...topics,
  ].join('\n')
  return { brief, allowed }
}

function valuesForHeaders(oldHeaders, oldValues, nextHeaders) {
  const byKey = new Map()
  ;(oldHeaders || []).forEach((header, index) => {
    const key = String(header ?? '').replace(/\D/g, '')
    if (key && !byKey.has(key)) byKey.set(key, (oldValues || [])[index] || '')
  })
  return nextHeaders.map((header, index) => {
    const key = String(header).replace(/\D/g, '')
    if (key && byKey.has(key)) return byKey.get(key)
    return (oldValues || [])[index] || ''
  })
}

function frameworkHeaders(state) {
  const source = state?.framework_column_source || ''
  return {
    so: fitMapHeaders(state?.so_headers, DEFAULT_SO_HEADERS, SO_PLACEHOLDERS, source),
    iga: fitMapHeaders(state?.iga_headers, DEFAULT_IGA_HEADERS, IGA_PLACEHOLDERS, source),
    cdio: fitMapHeaders(state?.cdio_headers, DEFAULT_CDIO_HEADERS, CDIO_PLACEHOLDERS, source),
    sdg: fitMapHeaders(state?.sdg_headers, DEFAULT_SDG_HEADERS, SDG_PLACEHOLDERS, source),
  }
}

function iloTaskCodes(ats, iloIndex) {
  const tokens = new Set([`ILO${iloIndex + 1}`.toUpperCase(), String(iloIndex + 1)])
  const codes = []
  const seen = new Set()
  ;(ats || []).forEach(component => {
    ;(component.subs || []).forEach(task => {
      const checked = (task.ilos || []).some(id => tokens.has(String(id).trim().toUpperCase()))
      const code = String(task.code || '').trim()
      const key = code.toUpperCase()
      if (!checked || !code || seen.has(key)) return
      seen.add(key)
      codes.push(code)
    })
  })
  return codes.join(', ')
}

function anyTaskIloChecked(ats) {
  return (ats || []).some(component => (component.subs || []).some(task => (
    String(task.code || '').trim() && (task.ilos || []).length
  )))
}

function soColumnsForIlo(chapters, iloIndex, soHeaders) {
  const want = String(iloIndex + 1)
  const numbers = new Set()
  ;(chapters || []).forEach(chapter => {
    const ilo = String(chapter.ilo || '').trim()
    const so = String(chapter.so || '').replace(/\D/g, '')
    if (ilo === want && so) numbers.add(so)
  })
  const numbered = header => Boolean(String(header ?? '').replace(/\D/g, ''))
  if (!numbers.size) return soHeaders.map(numbered)
  return soHeaders.map(header => numbered(header) && numbers.has(String(header).replace(/\D/g, '')))
}

function withMappedAssessmentCodes(state, { onlyIfChecked = false } = {}) {
  if (onlyIfChecked && !anyTaskIloChecked(state.ats)) return state
  const headers = frameworkHeaders(state)
  const iloCount = Math.max(Array.isArray(state.ilos) ? state.ilos.length : 0, 1)
  const fillNumbered = (headers, text) => headers.map(header => (
    String(header ?? '').replace(/\D/g, '') ? text : ''
  ))
  return {
    ...state,
    so_headers: headers.so,
    iga_headers: headers.iga,
    cdio_headers: headers.cdio,
    sdg_headers: headers.sdg,
    so_cpa_rows: Array.from({ length: iloCount }, (_, index) => {
      const text = iloTaskCodes(state.ats, index)
      const columns = soColumnsForIlo(state.tla_chapters, index, headers.so)
      return {
        c: text,
        p: text,
        a: text,
        so_vals: headers.so.map((_, column) => (columns[column] ? text : '')),
      }
    }),
    iga_rows: Array.from({ length: iloCount }, (_, index) => ({
      vals: fillNumbered(headers.iga, iloTaskCodes(state.ats, index)),
    })),
    cdio_sdg_rows: Array.from({ length: iloCount }, (_, index) => {
      const text = iloTaskCodes(state.ats, index)
      return {
        cdio_vals: fillNumbered(headers.cdio, text),
        sdg_vals: fillNumbered(headers.sdg, text),
      }
    }),
  }
}

function weeksCoveredByLabel(label) {
  const text = String(label ?? '').trim().replace(/[–—]/g, '-')
  if (!text || text === '0') return []
  const range = text.match(/(\d+)\s*-\s*(\d+)/)
  const withoutWeekWord = text.replace(/weeks?/gi, '')
  if (range && !/[a-z]/i.test(withoutWeekWord)) {
    const low = Math.min(Number(range[1]), Number(range[2]))
    const high = Math.max(Number(range[1]), Number(range[2]))
    if (high - low > 30) return []
    return Array.from({ length: high - low + 1 }, (_, offset) => low + offset)
  }
  if (/^\d+$/.test(text) || /^weeks?\s*\d+$/i.test(text)) {
    return [Number(text.match(/\d+/)[0])]
  }
  return []
}

function weeksForChapter(chapter) {
  const fromWeeks = weeksCoveredByLabel(chapter?.weeks)
  if (fromWeeks.length) return fromWeeks
  return weeksCoveredByLabel(chapter?.chapter)
}

function scheduleMarkIsPlotted(value) {
  const mark = String(value || '').trim()
  return Boolean(mark) && mark !== '0'
}

function mergeScheduleNamesIntoTopics(topics, wanted, knownNames) {
  const lines = String(topics || '').replace(/\r\n/g, '\n').split('\n')
  const kept = lines.filter((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return true
    if (/^\s/.test(line)) return true
    if (!knownNames.has(trimmed.toLowerCase())) return true
    if (index !== 0) return false
    const laterContent = lines.slice(1).some(item => {
      const text = item.trim()
      return text && !knownNames.has(text.toLowerCase())
    })
    return laterContent
  })
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop()
  const readingIndex = kept.findIndex(line => /^reading list\s*:/i.test(line.trim()))
  const insertAt = readingIndex === -1 ? kept.length : readingIndex
  const present = new Set(kept.map(line => line.trim().toLowerCase()))
  const additions = wanted.filter(name => !present.has(name.toLowerCase()))
  kept.splice(insertAt, 0, ...additions)
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function applyScheduleMethodsToTopics(state, previousNames = []) {
  const methods = Array.isArray(state.schedule_methods) ? state.schedule_methods : []
  const names = methods.map(method => String(method.name || '').trim()).filter(name => name && name !== '0')
  const knownNames = new Set([...names, ...previousNames].map(name => String(name || '').trim().toLowerCase()).filter(Boolean))
  const chapters = (state.tla_chapters || []).map(chapter => {
    const covered = new Set(weeksForChapter(chapter))
    const wanted = []
    const seen = new Set()
    methods.forEach(method => {
      const name = String(method.name || '').trim()
      const key = name.toLowerCase()
      if (!name || name === '0' || seen.has(key)) return
      const plotted = (method.values || []).some((value, index) => (
        scheduleMarkIsPlotted(value) && covered.has(index + 1)
      ))
      if (!plotted) return
      seen.add(key)
      wanted.push(name)
    })
    return { ...chapter, topics: mergeScheduleNamesIntoTopics(chapter.topics, wanted, knownNames) }
  })
  return { ...state, tla_chapters: chapters }
}

function syncScheduleMethodsFromTasks(state) {
  const previous = Array.isArray(state.schedule_methods) ? state.schedule_methods : []
  const previousNames = previous.map(method => method.name)
  const byId = new Map()
  const byName = new Map()
  previous.forEach(method => {
    if (method.taskId) byId.set(method.taskId, method)
    const name = String(method.name || '').trim().toLowerCase()
    if (name && !byName.has(name)) byName.set(name, method)
  })
  const used = new Set()
  const take = method => {
    if (!method || used.has(method)) return null
    used.add(method)
    return method
  }
  const schedule_methods = []
  const ats = (state.ats || []).map((component, componentIndex) => ({
    ...component,
    subs: (component.subs || []).map((task, taskIndex) => {
      const code = String(task.code || '').trim()
      const label = String(task.label || '').trim()
      if (!code && !label) return task
      const taskId = task.scheduleId || `at-${componentIndex}-${taskIndex}`
      const name = label || code
      const prior = take(byId.get(taskId))
        || take(byName.get(name.toLowerCase()))
        || take(byName.get(code.toLowerCase()))
      const values = Array.from({ length: TLA_WEEK_COUNT }, (_, index) => (prior?.values || [])[index] || '')
      schedule_methods.push({ name, taskId, values })
      return task.scheduleId === taskId ? task : { ...task, scheduleId: taskId }
    }),
  }))
  return applyScheduleMethodsToTopics({ ...state, ats, schedule_methods }, previousNames)
}

const DEFAULT_GRADING_ROWS = [
  { grade: '1.0',  rating: 'Excellent',    range: '97–100' },
  { grade: '1.25', rating: 'Very Good',    range: '94–96.99' },
  { grade: '1.5',  rating: 'Very Good',    range: '91–93.99' },
  { grade: '1.75', rating: 'Good',         range: '88–90.99' },
  { grade: '2.0',  rating: 'Good',         range: '85–87.99' },
  { grade: '2.25', rating: 'Satisfactory', range: '82–84.99' },
  { grade: '2.5',  rating: 'Satisfactory', range: '79–81.99' },
  { grade: '2.75', rating: 'Fair',         range: '76–78.99' },
  { grade: '3.0',  rating: 'Fair',         range: '75–75.99' },
  { grade: '5.0',  rating: 'Failing',      range: 'Below 75' },
  { grade: 'INC',  rating: 'Incomplete',   range: '' },
]
const TLA_WEEK_COUNT = 18
const TLA_DEFAULT_CHAPTER_ROWS = 8
const ASSESSMENT_SCHEDULE_DEFAULT_ROWS = 6

// Weekly Schedule controls are shared across all courses. Only the Topic /
// Activity field is AI-generatable. Delivery is chosen from this list, or typed.
const WEEKLY_SCHEDULE_DELIVERY_OPTIONS = [
  'Lecture/Discussion',
  'Student Presentation',
  'Guided Reading',
  'Video Presentation',
  'Problem-Solving Session',
  'Hands-on Activity',
  'Case Study Analysis',
  'Group Activity',
]

function filterDeliveryOptions(options, input) {
  const query = String(input || '').trim().toLowerCase()
  if (!query) return options
  const starts = []
  const contains = []
  options.forEach(option => {
    const label = option.toLowerCase()
    if (label.startsWith(query)) starts.push(option)
    else if (label.includes(query)) contains.push(option)
  })
  return [...starts, ...contains]
}

function DeliveryMethodField({ value, onChange }) {
  const current = String(value || '')
  return (
    <Autocomplete
      freeSolo
      autoHighlight
      clearOnBlur={false}
      size="small"
      options={WEEKLY_SCHEDULE_DELIVERY_OPTIONS}
      value={current || null}
      inputValue={current}
      onChange={(_, next) => onChange(typeof next === 'string' ? next : '')}
      onInputChange={(_, next, reason) => {
        if (reason === 'input' || reason === 'clear') onChange(next)
      }}
      filterOptions={(options, state) => {
        const matches = filterDeliveryOptions(options, state.inputValue)
        const typed = state.inputValue.trim()
        if (!typed || options.some(option => option.toLowerCase() === typed.toLowerCase())) return matches
        return matches.length ? matches : [typed]
      }}
      renderInput={params => (
        <TextField
          {...params}
          placeholder="Type or choose"
          sx={{
            minWidth: 196,
            '& .MuiInputBase-root': {
              fontSize: '0.82rem',
              bgcolor: '#1A1A1F',
              color: '#F0F0F2',
              pr: '28px !important',
            },
            '& .MuiInputBase-input': { py: '5px' },
            '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.42)', opacity: 1 },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.14)' },
            '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(134,239,172,0.45)' },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#86EFAC' },
            '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.55)' },
          }}
        />
      )}
      slotProps={{
        paper: {
          sx: {
            bgcolor: '#1A1A1F',
            color: '#F0F0F2',
            border: '1px solid rgba(255,255,255,0.14)',
            '& .MuiAutocomplete-option': { fontSize: '0.82rem' },
            '& .MuiAutocomplete-option.Mui-focused': { bgcolor: 'rgba(22,163,74,0.28)' },
          },
        },
      }}
    />
  )
}

function normalizeWeeklyScheduleChoice(value, options, fallback = '') {
  const choice = String(value || '').trim()
  if (!choice) return ''
  return options.includes(choice) ? choice : fallback
}

function normalizeSectionToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function syllabusEditorKey(section) {
  const candidates = [section.key, section.label]
  for (const candidate of candidates) {
    const token = normalizeSectionToken(candidate)
    const builtIn = SYLLABUS_SECTIONS.find(
      item => normalizeSectionToken(item.key) === token || normalizeSectionToken(item.label) === token,
    )
    if (builtIn) return builtIn.key
  }
  const aliases = {
    universityinformation: 'university-information',
    universitydirection: 'university-information',
    universityinfo: 'university-information',
    courseinformation: 'course-information',
    courseinfo: 'course-information',
    courseidentification: 'course-information',
    basic: 'course-information',
    basicinfo: 'course-information',
    basicinformation: 'course-information',
    coursedetails: 'course-information',
    details: 'course-information',
    iloatreferences: 'iloat-references',
    iloat: 'iloat-references',
    iloassessments: 'iloat-references',
    ilosassessments: 'iloat-references',
    frameworkmapping: 'framework-mapping',
    frameworkalignment: 'framework-mapping',
    fwmap: 'framework-mapping',
    coursepolicies: 'course-policies',
    policies: 'course-policies',
    grading: 'course-policies',
    gradingsystem: 'course-policies',
    gradingcriteria: 'course-policies',
    tlaactivities: 'tla-activities',
    tlactivities: 'tla-activities',
    weeklyschedule: 'tla-activities',
    courseoutline: 'tla-activities',
    schedule: 'tla-activities',
    mappingofat: 'mapping-of-at',
    atmapping: 'mapping-of-at',
    ilofwmatrix: 'mapping-of-at',
    iloframeworkmatrix: 'mapping-of-at',
    iloframeworkmapping: 'mapping-of-at',
    iloatmatrix: 'mapping-of-at',
  }
  for (const candidate of candidates) {
    const editorKey = aliases[normalizeSectionToken(candidate)]
    if (editorKey) return editorKey
  }
  return null
}

const TABLE_TH = {
  padding: '6px 10px', borderBottom: '2px solid #e0e0e0', borderRight: '1px solid #eee',
  backgroundColor: BG, color: '#555', fontWeight: 700, fontSize: '0.75rem', textAlign: 'left',
  whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word',
}
const TABLE_TD = {
  padding: '3px 5px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f5f5f5', verticalAlign: 'top',
  whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'break-word', overflow: 'visible',
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
  university_name: '',
  college: '',
  program: '',
  document_title: '',
  // University Information
  vision: '', mission: '',
  // Course Information
  course_title: '', course_code: '', course_category: '', prerequisites: '',
  year_level: '',
  semester_year: '', credit_hours: '', instructor_name: '',
  employee_id: '', instructor_email: '', contact_info: '', education: '',
  institution_contact: '',
  reference_cmo: '', date_prepared: '', revision_no: '', revision_date: '', period_of_study: '',
  description: '', rationale: '', contact_hours: '', lecture_hours: '', lab_hours: '', total_hours: '',
  technology_integration: '',
  assessment_criteria: '', tlas: '',
  // ILO, AT, and References
  ilos: ['', '', ''],
  ilo_bloom: [{ level: '', verb: '' }],
  assessment_tasks: [{ ...EMPTY_TASK, ilo_values: [''] }],
  ats: [],
  tos: [],
  references: ['', '', '', '', ''],
  igas:             Array.from({ length: 8 }, (_, i) => ({ ...EMPTY_ATTR, code: `IGA${i + 1}` })),
  student_outcomes: Array.from({ length: 6 }, (_, i) => ({ ...EMPTY_ATTR, code: `SO${i + 1}` })),
  cdio_skills:      Array.from({ length: 4 }, (_, i) => ({ ...EMPTY_ATTR, code: `CDIO${i + 1}` })),
  sdg_skills:       Array.from({ length: 5 }, (_, i) => ({ ...EMPTY_ATTR, code: `SDG${i + 1}` })),
  // Course Policies
  grading_rows:   DEFAULT_GRADING_ROWS.map(row => ({ ...row })),
  passing_grade: '', use_plus_minus: false, remedial_enabled: false, round_grades: false,
  policies:       [],
  class_policy: '', missed_examinations: '', academic_dishonesty: '', dropping: '',
  other_policies: '',
  // TLA Activities
  tla_chapters: [{ ...EMPTY_CHAPTER }],
  // Schedules & Mappings
  schedule_methods:  [],
  framework_column_source: '',
  so_headers:        DEFAULT_SO_HEADERS,
  so_cpa_rows:       [...DEFAULT_SO_CPA_ROWS.map(r => ({ ...r, so_vals: [...r.so_vals] })), blankSoCpaRow(), blankSoCpaRow(), blankSoCpaRow(), blankSoCpaRow()],
  iga_headers:       DEFAULT_IGA_HEADERS,
  iga_rows:          [...DEFAULT_IGA_ROWS.map(r => ({ vals: [...r.vals] })), blankIgaRow(), blankIgaRow(), blankIgaRow(), blankIgaRow()],
  cdio_headers:      DEFAULT_CDIO_HEADERS,
  sdg_headers:       DEFAULT_SDG_HEADERS,
  cdio_sdg_rows:     [...DEFAULT_CDIO_SDG_ROWS.map(r => ({ cdio_vals: [...r.cdio_vals], sdg_vals: [...r.sdg_vals] })), blankCdioSdgRow(), blankCdioSdgRow(), blankCdioSdgRow(), blankCdioSdgRow()],
  custom_sections:   {},
  custom_subsections: {},
  custom_tables: {},
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
      InputLabelProps={{
        ...props.InputLabelProps,
        sx: { whiteSpace: 'normal', lineHeight: 1.25, ...(props.InputLabelProps?.sx || {}) },
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          '&:hover fieldset': { borderColor: MAROON },
          '&.Mui-focused fieldset': { borderColor: MAROON },
        },
        '& .MuiInputLabel-root.Mui-focused': { color: MAROON },
        '& .MuiSelect-select': { whiteSpace: 'normal', wordBreak: 'break-word' },
        // MUI's default disabled colors are near-black and unreadable on the
        // dark workspace, so institution-fixed fields keep light text.
        '& .MuiInputBase-input.Mui-disabled': {
          WebkitTextFillColor: 'rgba(255,255,255,0.92)',
          color: 'rgba(255,255,255,0.92)',
          opacity: 1,
        },
        '& .MuiSelect-select.Mui-disabled': {
          WebkitTextFillColor: 'rgba(255,255,255,0.92)',
          color: 'rgba(255,255,255,0.92)',
          opacity: 1,
        },
        '& .MuiOutlinedInput-root.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.06)' },
        '& .MuiOutlinedInput-root.Mui-disabled fieldset': { borderColor: 'var(--border-color)' },
        '& .MuiInputLabel-root.Mui-disabled': { color: 'rgba(255,255,255,0.72)' },
        '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.62)' },
        '& .MuiFormHelperText-root.Mui-error': { color: '#FF7B72' },
        ...props.sx,
      }}
      SelectProps={{ MenuProps: { PaperProps: { elevation: 2 } }, ...props.SelectProps }}
    />
  )
}

const ALL_BLUEPRINT_TABLES = SYLLABUS_SECTION_BLUEPRINTS.flatMap(section => [
  ...(section.tables || []),
  ...(section.tabs || []).map(tab => tab.table).filter(Boolean),
])

function SylField({ rules, fieldKey, value, InputProps, helperText, ...props }) {
  const dataKey = ADMIN_FIXED_FIELDS[fieldKey] || fieldKey
  const locked = Boolean(rules && Object.prototype.hasOwnProperty.call(rules, dataKey))
  if (!locked) return <LField {...props} value={value} InputProps={InputProps} helperText={helperText} />
  const fixedText = String(rules[dataKey] ?? '')
  return (
    <LField
      {...props}
      value={fixedText.trim() ? fixedText : value}
      disabled
      helperText={helperText || 'Fixed by your institution'}
      InputProps={{ ...InputProps, readOnly: true }}
    />
  )
}

function FixedBlueprintTable({ table }) {
  const groups = table.columnGroups || []
  const subGroups = table.subGroups || []
  const hasRowLabels = Boolean(table.rowLabels)
  const dataColCount = table.columns.length
  const totalCols = dataColCount + (hasRowLabels ? 1 : 0)
  const headerDepth = (groups.length ? 1 : 0) + (subGroups.length ? 1 : 0) + (table.noHeader ? 0 : 1)
  const leafColumns = subGroups.length && table.columns[0] === subGroups[0].title
    ? table.columns.map((column, index) => (index === 0 ? '' : column))
    : table.columns
  const rows = table.defaultRows || []
  const cellStyle = { ...TABLE_TD, padding: '5px 8px', whiteSpace: 'pre-wrap' }
  const headStyle = { ...TABLE_TH, padding: '6px 8px' }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      {table.intro && (
        <Typography variant="body2" sx={{ mb: 1, color: 'rgba(255,255,255,0.72)' }}>{table.intro}</Typography>
      )}
      <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
        <thead>
          {groups.length > 0 && (
            <tr style={{ backgroundColor: BG }}>
              {hasRowLabels && <th rowSpan={headerDepth} style={headStyle}>{table.rowLabels.header}</th>}
              {groups.map((group, index) => (
                <th key={index} colSpan={group.span} style={{ ...headStyle, textAlign: 'center' }}>
                  {group.title}{group.dynamic ? ' (per ILO)' : ''}
                </th>
              ))}
            </tr>
          )}
          {subGroups.length > 0 && (
            <tr style={{ backgroundColor: BG }}>
              {subGroups.map((group, index) => (
                <th key={index} colSpan={group.span} style={{ ...headStyle, textAlign: 'center' }}>{group.title}</th>
              ))}
            </tr>
          )}
          {!table.noHeader && (
            <tr style={{ backgroundColor: BG }}>
              {groups.length === 0 && hasRowLabels && (
                <th rowSpan={headerDepth} style={headStyle}>{table.rowLabels.header}</th>
              )}
              {leafColumns.map((column, index) => (
                <th key={index} style={headStyle}>{column || ' '}</th>
              ))}
            </tr>
          )}
          {table.noHeader && groups.length === 0 && hasRowLabels && (
            <tr style={{ backgroundColor: BG }}><th style={headStyle}>{table.rowLabels.header}</th></tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const cells = []
            ;(row || []).forEach((cell, cellIndex) => {
              if (cell === null && cells.length) {
                cells[cells.length - 1].colSpan += 1
                return
              }
              cells.push({ value: cell, colSpan: 1, key: cellIndex })
            })
            return (
              <tr key={rowIndex} style={{ backgroundColor: rowIndex % 2 === 0 ? '#1A1A1F' : BG }}>
                {hasRowLabels && (
                  <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700, color: MAROON }}>
                    {table.rowLabels.values?.[rowIndex] || ''}
                  </td>
                )}
                {cells.map(cell => (
                  <td key={cell.key} colSpan={cell.colSpan > 1 ? cell.colSpan : undefined} style={cellStyle}>
                    {cell.value || ' '}
                  </td>
                ))}
              </tr>
            )
          })}
          {table.totalRow && (
            <tr style={{ backgroundColor: BG }}>
              {hasRowLabels && <td style={{ ...cellStyle, fontWeight: 700 }}>{table.totalRow.label}</td>}
              {Array.from({ length: dataColCount }, (_, columnIndex) => (
                <td key={columnIndex} style={cellStyle}>
                  {table.totalRow.columns.includes(columnIndex) ? 'Total' : ''}
                </td>
              ))}
            </tr>
          )}
          {table.noteRow && (
            <tr>
              <td style={{ ...cellStyle, fontWeight: 700 }}>{table.noteRow.label}</td>
              <td colSpan={totalCols - 1} style={cellStyle}>{table.noteRow.text}</td>
            </tr>
          )}
        </tbody>
      </table>
      {table.footer && (
        <Typography variant="body2" sx={{ mt: 1, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6 }}>{table.footer}</Typography>
      )}
      <Typography variant="caption" sx={{ display: 'block', mt: 1, color: MAROON, fontWeight: 600 }}>
        Fixed by your institution. This table cannot be edited.
      </Typography>
    </Box>
  )
}

function GenButton({ children, ...props }) {
  return (
    <Button variant="contained" fullWidth {...props}
      sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontWeight: 600, borderRadius: 1.5, ...props.sx }}>
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

function inlineInput(value, onChange, minWidth = 80, onFocus, options = {}) {
  const { numeric = false, allowRange = false } = options
  const numericPattern = allowRange ? /^\d*(?:-\d*)?$/ : /^\d*$/
  const handleChange = event => {
    if (!numeric || numericPattern.test(event.target.value)) onChange(event)
  }
  return (
    <TextField
      size="small"
      value={value}
      onChange={handleChange}
      onFocus={onFocus}
      // Keep these as text inputs so browsers do not render number spinners.
      // Validation below still limits numeric cells to digits (or a numeric range for Wks).
      type="text"
      onKeyDown={numeric ? event => {
        if (['e', 'E', '+', '.', ','].includes(event.key) || (!allowRange && event.key === '-')) {
          event.preventDefault()
        }
      } : undefined}
      sx={{
        minWidth,
        '& .MuiOutlinedInput-root': {
          fontSize: '0.8rem',
          '&:hover fieldset': { borderColor: MAROON },
          '&.Mui-focused fieldset': { borderColor: MAROON },
        },
      }}
      inputProps={{
        inputMode: 'numeric',
        style: { padding: '5px 8px' },
      }}
    />
  )
}

function sameAiField(field, selected) {
  if (!field || !selected || field.fieldType !== selected.fieldType) return false
  if (field.fieldType === 'simple') return field.field === selected.field
  if (field.fieldType === 'array') return field.arrField === selected.arrField && field.arrIndex === selected.arrIndex
  if (field.fieldType === 'arrayObj') {
    return field.arrField === selected.arrField && field.arrIndex === selected.arrIndex && field.arrObjKey === selected.arrObjKey
  }
  return false
}

function TopicsCell({ value, onChange, onFocus, selected }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 44)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      style={{ width: '100%', fontSize: '0.82rem', border: selected ? '1px solid #86EFAC' : '1px solid rgba(255,255,255,0.14)', borderRadius: 4, padding: '4px 6px', resize: 'none', overflow: 'hidden', outline: 'none', fontFamily: 'inherit', color: '#F0F0F2', background: '#1A1A1F', boxSizing: 'border-box', lineHeight: 1.4, minHeight: '44px', whiteSpace: 'pre-wrap' }}
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
          color: inputVal ? '#F0F0F2' : 'rgba(255,255,255,0.4)', background: '#1A1A1F',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, zIndex: 200,
          background: '#1A1A1F', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6,
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
                  background: checked ? 'rgba(22,163,74,0.18)' : 'transparent',
                   color: checked ? '#86EFAC' : '#F0F0F2',
                }}
              >
                <input type="checkbox" checked={checked} readOnly
                  style={{ accentColor: '#15803D', flexShrink: 0, pointerEvents: 'none' }} />
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
    <div style={{ '--c-card': '#16161E', '--c-border': 'rgba(255,255,255,0.09)', '--c-panel': '#0F0F12', '--c-text': '#F0F0F2', '--c-muted': 'rgba(255,255,255,0.5)', '--c-muted2': 'rgba(255,255,255,0.68)', '--c-accent': '#86EFAC', '--c-accent-br': 'rgba(134,239,172,0.45)', '--c-border2': 'rgba(255,255,255,0.14)' }}>
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
                        <div key={si} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', borderBottom: si < at.subs.length - 1 ? '1px solid var(--c-border)' : 'none', flexWrap: 'wrap' }}>
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

const DISTRIBUTION_NOTE = 'All internal assessments with feedback will be made available within 2 week after each assessment submission except Final Project.'

function AssessmentDistributionMap({ title, ilos, ats, setAts }) {
  const iloIds = ilos.map(ilo => ilo.id)
  const rows = []
  ;(ats || []).forEach((component, componentIndex) => {
    ;(component.subs || []).forEach((sub, subIndex) => {
      rows.push({ componentIndex, subIndex, sub })
    })
  })

  const patchSub = (componentIndex, subIndex, recipe) => {
    setAts(current => (current || []).map((component, index) => {
      if (index !== componentIndex) return component
      return {
        ...component,
        subs: (component.subs || []).map((sub, subAt) => (
          subAt === subIndex ? recipe(sub) : sub
        )),
      }
    }))
  }

  const blankSub = (count) => ({
    code: `T${count}`,
    label: 'New task',
    weight: 0,
    ird: '',
    c: '',
    p: '',
    a: '',
    ilos: [],
    scores: Object.fromEntries(iloIds.map(id => [id, 0])),
    iloTotals: Object.fromEntries(iloIds.map(id => [id, 0])),
  })

  const addRow = () => {
    setAts(current => {
      const list = current || []
      if (!list.length) {
        return [{
          code: 'C1',
          label: 'New component',
          weight: 0,
          subs: [blankSub(1)],
        }]
      }
      const last = list.length - 1
      return list.map((component, index) => (
        index === last
          ? { ...component, subs: [...(component.subs || []), blankSub((component.subs || []).length + 1)] }
          : component
      ))
    })
  }

  const removeRow = (componentIndex, subIndex) => {
    setAts(current => (current || []).flatMap((component, index) => {
      if (index !== componentIndex) return [component]
      const subs = (component.subs || []).filter((_, at) => at !== subIndex)
      return subs.length ? [{ ...component, subs }] : []
    }))
  }

  const setIloScore = (componentIndex, subIndex, iloId, raw) => {
    const digits = String(raw || '').replace(/\D/g, '')
    patchSub(componentIndex, subIndex, sub => {
      const current = sub.ilos || []
      const nextIlos = digits
        ? (current.includes(iloId) ? current : [...current, iloId])
        : current.filter(id => id !== iloId)
      return {
        ...sub,
        ilos: nextIlos,
        scores: { ...(sub.scores || {}), [iloId]: digits ? parseInt(digits, 10) : 0 },
      }
    })
  }

  const iloShown = (sub, iloId) => {
    const checked = (sub.ilos || []).includes(iloId)
    const score = parseInt(sub.scores?.[iloId], 10) || 0
    if (!checked && !score) return ''
    return String(score)
  }

  const domainShown = value => {
    const number = parseInt(value, 10)
    return number ? String(number) : ''
  }

  const sum = (read) => rows.reduce((total, row) => total + (parseInt(read(row.sub), 10) || 0), 0)
  const head = { ...TABLE_TH, textAlign: 'center' }
  const cell = { ...TABLE_TD, textAlign: 'center' }

  return (
    <SectionCard
      title={title || 'Table 2: Assessment Method and Distribution Map'}
      action={<AddRowBtn label="Add row" onClick={addRow} />}
    >
      <Box sx={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
          <thead>
            <tr>
              <th colSpan={4} style={head}>Assessment Tasks (AT) Distribution</th>
              <th colSpan={Math.max(iloIds.length, 1)} style={head}>Intended Learning Outcomes (per ILO)</th>
              <th colSpan={3} style={head}>Domains</th>
              <th style={{ ...head, borderRight: 'none' }} />
            </tr>
            <tr>
              {['Code', 'Assessment Tasks', 'I/R/D', '(%)'].map(label => (
                <th key={label} style={head}>{label}</th>
              ))}
              {iloIds.map((_, index) => (
                <th key={`ilo-${index}`} style={{ ...head, minWidth: 48 }}>{index + 1}</th>
              ))}
              {['C', 'P', 'A'].map(label => (
                <th key={label} style={{ ...head, minWidth: 48 }}>{label}</th>
              ))}
              <th style={{ ...head, borderRight: 'none' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={`${row.componentIndex}-${row.subIndex}`}>
                <td style={cell}>{inlineInput(row.sub.code || '', event => patchSub(row.componentIndex, row.subIndex, sub => ({ ...sub, code: event.target.value })), 64)}</td>
                <td style={{ ...cell, textAlign: 'left', minWidth: 160 }}>{inlineInput(row.sub.label || '', event => patchSub(row.componentIndex, row.subIndex, sub => ({ ...sub, label: event.target.value })), 150)}</td>
                <td style={cell}>{inlineInput(row.sub.ird || '', event => patchSub(row.componentIndex, row.subIndex, sub => ({ ...sub, ird: event.target.value })), 56)}</td>
                <td style={cell}>{inlineInput(String(parseInt(row.sub.weight, 10) || 0), event => patchSub(row.componentIndex, row.subIndex, sub => ({ ...sub, weight: parseInt(event.target.value.replace(/\D/g, ''), 10) || 0 })), 52, undefined, { numeric: true })}</td>
                {iloIds.map(iloId => (
                  <td key={iloId} style={cell}>
                    {inlineInput(
                      iloShown(row.sub, iloId),
                      event => setIloScore(row.componentIndex, row.subIndex, iloId, event.target.value),
                      48,
                      undefined,
                      { numeric: true },
                    )}
                  </td>
                ))}
                {['c', 'p', 'a'].map(key => (
                  <td key={key} style={cell}>
                    {inlineInput(
                      domainShown(row.sub[key]),
                      event => patchSub(row.componentIndex, row.subIndex, sub => ({
                        ...sub,
                        [key]: event.target.value.replace(/\D/g, ''),
                      })),
                      48,
                      undefined,
                      { numeric: true },
                    )}
                  </td>
                ))}
                <td style={{ ...cell, borderRight: 'none' }}>
                  <RemoveBtn onClick={() => removeRow(row.componentIndex, row.subIndex)} disabled={!rows.length} />
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} style={{ ...cell, fontWeight: 700, textAlign: 'right' }}>Total (auto)</td>
              <td style={{ ...cell, fontWeight: 700 }}>{sum(sub => sub.weight)}</td>
              {iloIds.map(iloId => <td key={`total-${iloId}`} style={cell} />)}
              {['c', 'p', 'a'].map(key => (
                <td key={`total-${key}`} style={{ ...cell, fontWeight: 700 }}>{sum(sub => sub[key])}</td>
              ))}
              <td style={{ ...cell, borderRight: 'none' }} />
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Note:</td>
              <td colSpan={4 + iloIds.length + 3} style={{ ...cell, textAlign: 'left', borderRight: 'none' }}>{DISTRIBUTION_NOTE}</td>
            </tr>
          </tbody>
        </table>
      </Box>
    </SectionCard>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function FacultyWorkspacePage({ activeTab: initialTab = 'syllabus' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, updateProfile } = useAuth()

  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const courseId = courseIdParam || searchParams.get('course') || ''

  const [activeTab, setActiveTab]     = useState(initialTab)
  const [syllabusSub, setSyllabusSub] = useState('university-information')

  function selectWorkspaceTab(key) {
    setActiveTab(key)
    setMobileNavOpen(false)
    if (key !== 'module') { setSelectedModule(null); setModuleContent(null); setChatOpen(false) }
  }

  const [rightWidth, setRightWidth] = useState(380)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [dragging, setDragging]     = useState(null)
  const containerRef = useRef(null)
  // Tracks which course the syllabus form was seeded for — a workspace refresh
  // must not overwrite unsaved syllabus edits.
  const seededCourseRef = useRef(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [mobileNavOpen, setMobileNavOpen]       = useState(false)
  const [mobileUploadOpen, setMobileUploadOpen] = useState(false)

  function toggleRightPanel() {
    setRightCollapsed(v => !v)
    setDragging(null)
  }

  const [resultText, setResultText]       = useState('')
  const [actionError, setActionError]     = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [syllabusParams, setSyllabusParams] = useState({ num_weeks: 18, provider: 'auto', top_k: 5, extra_instructions: '' })
  const [moduleParams,   setModuleParams]   = useState({ module_title: '', week_number: 1, topic_id: '', structuring_level: 'standard', provider: 'auto', top_k: 5, extra_instructions: '' })
  const [assessmentParams, setAssessmentParams] = useState({
    faculty_topics: '',
    extra_instructions: '',
    provider: 'auto',
    source_exam_code: '',
    source_exam_label: '',
    item_by_item: true,
    item_batch_count: 5,
    target_item_number: 1,
    related_item_number: '',
    relation_instruction: '',
    overwrite_item: true,
  })
  const [assessmentBatchProgress, setAssessmentBatchProgress] = useState(null)

  const [uploadForm, setUploadForm]         = useState({ module_tag: '', term_tag: '' })
  const [uploadFile, setUploadFile]         = useState(null)
  const [uploadError, setUploadError]       = useState('')
  const [uploadSuccess, setUploadSuccess]   = useState('')
  const [uploadStatus, setUploadStatus]     = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading]           = useState(false)

  // ── Editable syllabus state ─────────────────────────────────────────────
  const [syllabusData, setSyllabusData] = useState(EMPTY_SYLLABUS)
  const [frameworkAssigning, setFrameworkAssigning] = useState(false)
  const [frameworkAssignError, setFrameworkAssignError] = useState('')
  const [adminFormatSections, setAdminFormatSections] = useState([])
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
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError]         = useState('')
  const [aiPipelineDrafts, setAiPipelineDrafts] = useState(null)
  const [aiPipelineProgress, setAiPipelineProgress] = useState(null)
  const [aiReviewOpen, setAiReviewOpen] = useState(false)
  // ── Source panel state ───────────────────────────────────────────────────
  const [selectedDocIds, setSelectedDocIds] = useState(new Set())
  const [renamingDocId, setRenamingDocId]   = useState(null)
  const [renameValue, setRenameValue]       = useState('')
  const [deletingDocId, setDeletingDocId]   = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingAssessmentId, setDeletingAssessmentId] = useState(null)
  const [confirmDeleteAssessmentId, setConfirmDeleteAssessmentId] = useState(null)

  // ── Module creation flow state ───────────────────────────────────────────
  const [moduleGeneratingAll, setModuleGeneratingAll] = useState(false)
  const [moduleGeneratingTopic, setModuleGeneratingTopic] = useState(new Set())
  const [moduleGenProgress, setModuleGenProgress] = useState(null)
  const [deletedModuleIds, setDeletedModuleIds] = useState(new Set())

  // ── Syllabus section / subsection the Module topics are read from ────────
  const [moduleTopicSectionKey, setModuleTopicSectionKey]       = useState('')
  const [moduleTopicSubsectionKey, setModuleTopicSubsectionKey] = useState('')
  const [moduleTopicConfirmed, setModuleTopicConfirmed]         = useState(false)
  const [topicSourceDialogOpen, setTopicSourceDialogOpen]       = useState(false)
  const [topicSourceSaving, setTopicSourceSaving]               = useState(false)
  const [topicSourceError, setTopicSourceError]                 = useState('')
  const [topicSourceNoticeOpen, setTopicSourceNoticeOpen]       = useState(false)
  const [generateDialogOpen, setGenerateDialogOpen]             = useState(false)
  const [generateDialogMode, setGenerateDialogMode]             = useState('single') // 'single' | 'all'
  const [pendingGenerate, setPendingGenerate]                   = useState(null)

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
  // Assessment generation popup (Create Assessment = multi-topic scope, Generate Assessment = single topic)
  const [assessmentGenDialogOpen, setAssessmentGenDialogOpen] = useState(false)
  const [assessmentGenMode, setAssessmentGenMode] = useState('single') // 'single' | 'multi'
  const [assessmentGenTitle, setAssessmentGenTitle] = useState('Major Examination')
  const [assessmentGenSelectedTopics, setAssessmentGenSelectedTopics] = useState([])
  const [assessmentGenItemCount, setAssessmentGenItemCount] = useState(50)
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
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null)
  const [copiedAssessmentId, setCopiedAssessmentId] = useState('')
  const [answerSheetDialogOpen, setAnswerSheetDialogOpen] = useState(false)
  const [bubbleSheetMenuAnchor, setBubbleSheetMenuAnchor] = useState(null)
  const [bubbleSheetPreviewOpen, setBubbleSheetPreviewOpen] = useState(false)
  const [bubbleSheetPreviewUrl, setBubbleSheetPreviewUrl] = useState('')
  const [bubbleSheetPreviewTitle, setBubbleSheetPreviewTitle] = useState('')
  const [bubbleSheetPreviewLoading, setBubbleSheetPreviewLoading] = useState(false)
  const [answerSheetLoading, setAnswerSheetLoading] = useState(false)
  const [answerSheetSaving, setAnswerSheetSaving] = useState(false)
  const [answerSheetTemplate, setAnswerSheetTemplate] = useState(null)
  const [answerSheetForm, setAnswerSheetForm] = useState({
    name: '',
    num_choices: 4,
    num_id_columns: 8,
  })
  const [editingItemId, setEditingItemId] = useState(null)
  const [editingItemDraft, setEditingItemDraft] = useState(null)
  const [itemSaving, setItemSaving] = useState(false)
  // AI chatbox
  const [chatOpen, setChatOpen]       = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatField, setChatField]     = useState('')  // which section is focused

  // ── Syllabus upload (parse) state ────────────────────────────────────────
  const syllabusUploadRef                   = useRef(null)
  const [syllabusUploading, setSyllabusUploading]     = useState(false)
  const [syllabusUploadProgress, setSyllabusUploadProgress] = useState(null)
  const [syllabusUploadError, setSyllabusUploadError] = useState('')
  const [syllabusUploadSuccess, setSyllabusUploadSuccess] = useState(false)
  const [activeFwKey, setActiveFwKey] = useState('SO')

  // ── Syllabus export & template state (session-based, no DB save) ────────
  const [syllabusTemplateFile, setSyllabusTemplateFile] = useState(null)  // session-only
  const [syllabusExporting, setSyllabusExporting] = useState(null)
  const [syllabusExportError, setSyllabusExportError] = useState('')
  const [tosExporting, setTosExporting] = useState(false)
  const [tosExportError, setTosExportError] = useState('')

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
    setSyllabusData(s => {
      let next = { ...s, [field]: s[field].map((item, j) => j === i ? { ...item, [key]: value } : item) }
      if (field === 'tla_chapters' && (key === 'ilo' || key === 'so')) next = withMappedAssessmentCodes(next)
      if (field === 'tla_chapters' && key === 'weeks') next = applyScheduleMethodsToTopics(next)
      return next
    })
  }
  function addSylItem(field, empty) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(s => ({ ...s, [field]: [...s[field], typeof empty === 'object' ? { ...empty } : empty] }))
  }
  function removeSylItem(field, i) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(s => {
      if (field !== 'schedule_methods') {
        return { ...s, [field]: s[field].filter((_, j) => j !== i) }
      }
      const previousNames = (s.schedule_methods || []).map(method => method.name)
      const schedule_methods = (s.schedule_methods || []).filter((_, j) => j !== i)
      return applyScheduleMethodsToTopics({ ...s, schedule_methods }, previousNames)
    })
  }

  // Normalize raw syllabus data — migrates old formats and initialises all structured fields
  function normalizeSyllabusData(raw) {
    if (!raw) return { ...EMPTY_SYLLABUS }
    const storedIlos = Array.isArray(raw.ilos) ? raw.ilos : []
    const iloCount = Math.max(ILO_FIELD_COUNT, storedIlos.length)

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
    const columnSource = raw.framework_column_source || ''
    const soHeaders = fitMapHeaders(raw.so_headers, DEFAULT_SO_HEADERS, SO_PLACEHOLDERS, columnSource)
    const normSoCpa = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.so_cpa_rows || [])[i] || {}
      return {
        so_vals: valuesForHeaders(raw.so_headers, ex.so_vals, soHeaders),
        c: ex.c || '', p: ex.p || '', a: ex.a || '',
      }
    })

    // 4. IGA mapping rows
    const igaHeaders = fitMapHeaders(raw.iga_headers, DEFAULT_IGA_HEADERS, IGA_PLACEHOLDERS, columnSource)
    const normIga = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.iga_rows || [])[i] || {}
      return { vals: valuesForHeaders(raw.iga_headers, ex.vals, igaHeaders) }
    })

    // 5. CDIO/SDG mapping rows
    const cdioHeaders = fitMapHeaders(raw.cdio_headers, DEFAULT_CDIO_HEADERS, CDIO_PLACEHOLDERS, columnSource)
    const sdgHeaders  = fitMapHeaders(raw.sdg_headers, DEFAULT_SDG_HEADERS, SDG_PLACEHOLDERS, columnSource)
    const normCdioSdg = Array.from({ length: iloCount }, (_, i) => {
      const ex = (raw.cdio_sdg_rows || [])[i] || {}
      return {
        cdio_vals: valuesForHeaders(raw.cdio_headers, ex.cdio_vals, cdioHeaders),
        sdg_vals:  valuesForHeaders(raw.sdg_headers, ex.sdg_vals, sdgHeaders),
      }
    })

    // 6. Assessment schedule methods
    const normSchedule = (raw.schedule_methods || []).map(m => ({
      name: m.name || '',
      taskId: m.taskId || '',
      values: Array.from({ length: TLA_WEEK_COUNT }, (_, j) => (m.values || [])[j] || ''),
    }))

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
      weight: r.weight === 0 || r.weight ? r.weight : '',
      bloom_items: BLOOM_KEYS.reduce((a, k) => {
        const stored = (r.bloom_items || {})[k]
        const distributed = (r.bloom_dist || {})[k]
        const count = stored === 0 || stored ? stored : (distributed === 0 || distributed ? distributed : '')
        return { ...a, [k]: count }
      }, {}),
      bloom_pct:   BLOOM_KEYS.reduce((a, k) => ({ ...a, [k]: (r.bloom_pct || {})[k] || '' }), {}),
      total_points: r.total_points === 0 || r.total_points ? r.total_points : '',
    })
    const normTos = (() => {
      const raw_tos = raw.tos || []
      if (!raw_tos.length) return []
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
        totalExamMinutes: exam.totalExamMinutes || 0,
        topics: (exam.topics || []).length ? exam.topics.map(normTopicRow) : [mkEmptyTopicRow()],
      }))
    })()

    return syncScheduleMethodsFromTasks(withMappedAssessmentCodes({
      ...EMPTY_SYLLABUS, ...raw,
      rationale: raw.rationale || '',
      ilos: Array.from({ length: iloCount }, (_, i) => storedIlos[i] || ''),
      ilo_bloom: normIloBloom,
      tos: normTos,
      assessment_tasks: normTasksResult.length
        ? normTasksResult
        : [{ ...EMPTY_TASK, ilo_values: Array(iloCount).fill('') }],
      tla_chapters: normChaptersResult.length ? normChaptersResult : [{ ...EMPTY_CHAPTER }],
      schedule_methods: normSchedule,
      framework_column_source: columnSource,
      so_headers:    soHeaders,    so_cpa_rows:   normSoCpa,
      iga_headers:   igaHeaders,   iga_rows:      normIga,
      cdio_headers:  cdioHeaders,  sdg_headers:   sdgHeaders,
      cdio_sdg_rows: normCdioSdg,
      ats: raw.ats || EMPTY_SYLLABUS.ats,
      custom_sections: raw.custom_sections || {},
      custom_subsections: raw.custom_subsections || {},
      custom_tables: raw.custom_tables || {},
    }, { onlyIfChecked: true }))
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

  function getAiFieldsForCurrentSection(data = syllabusData) {
    if (!activeConfiguredSection || activeConfiguredSection.is_static) return []
    const locked = field => Object.prototype.hasOwnProperty.call(fixedFieldRules, field)

    if (activeSyllabusSectionKey === 'course-information') {
      const fields = []
      if (!locked('rationale')) {
        fields.push({
          section: 'rationale',
          field: 'rationale',
          label: 'Course Rationale and Description',
          fieldType: 'simple',
        })
      }
      if (!locked('tlas')) {
        fields.push({
          section: 'tlas',
          field: 'tlas',
          label: 'Teaching, Learning, and Assessment Strategies',
          fieldType: 'simple',
        })
      }
      return fields
    }
    if (activeSyllabusSectionKey === 'iloat-references') {
      if (fixedTableFor('iloat-references', 'ilo-table')) return []
      const count = iloGenerateCount(data.ilos)
      return Array.from({ length: count }, (_, index) => ({
        section: 'ilo',
        label: `Intended Learning Outcome ${index + 1}`,
        fieldType: 'array',
        arrField: 'ilos',
        arrIndex: index,
      }))
    }
    if (activeSyllabusSectionKey === 'mapping-of-at') {
      const mappingFixed = fixedTableFor('mapping-of-at', 'ilo-so-cpa-map')
        && fixedTableFor('mapping-of-at', 'ilo-iga-map')
        && fixedTableFor('mapping-of-at', 'ilo-cdio-sdg-map')
      if (mappingFixed) return []
      return [{
        section: 'framework_columns',
        label: 'Framework column numbers',
        fieldType: 'frameworkColumns',
      }]
    }
    if (activeSyllabusSectionKey === 'tla-activities') {
      if (fixedTableFor('tla-activities', 'tla-table')) return []
      const chapters = data.tla_chapters?.length ? data.tla_chapters : [{ ...EMPTY_CHAPTER }]
      return chapters.flatMap((_, index) => ([
        {
          section: 'topics',
          label: `Topics / Reading List ${index + 1}`,
          fieldType: 'arrayObj',
          arrField: 'tla_chapters',
          arrIndex: index,
          arrObjKey: 'topics',
        },
        {
          section: 'topic_outcome',
          label: `Topic Outcomes ${index + 1}`,
          fieldType: 'arrayObj',
          arrField: 'tla_chapters',
          arrIndex: index,
          arrObjKey: 'outcomes',
        },
      ]))
    }
    return []
  }

  function updateSyllabusWithAiText(current, field, text, tableRows = null) {
    if (field.fieldType === 'customTable') {
      return {
        ...current,
        custom_tables: {
          ...(current.custom_tables || {}),
          [field.section]: {
            ...(current.custom_tables?.[field.section] || {}),
            [field.tableKey]: tableRows,
          },
        },
      }
    }
    if (field.fieldType === 'simple') {
      const next = { ...current, [field.field]: text }
      if (field.field === 'rationale') next.description = text
      return next
    }
    if (field.fieldType === 'array') {
      return {
        ...current,
        [field.arrField]: (current[field.arrField] || []).map((value, index) => (
          index === field.arrIndex ? text : value
        )),
      }
    }
    if (field.fieldType === 'arrayObj') {
      const values = current[field.arrField] || []
      if (field.createIfMissing && !values.length && field.arrIndex === 0) {
        return {
          ...current,
          [field.arrField]: [{ ...EMPTY_POLICY, [field.arrObjKey]: text }],
        }
      }
      return {
        ...current,
        [field.arrField]: values.map((item, index) => (
          index === field.arrIndex ? { ...item, [field.arrObjKey]: text } : item
        )),
      }
    }
    if (field.fieldType === 'customSubsection') {
      return {
        ...current,
        custom_subsections: {
          ...(current.custom_subsections || {}),
          [field.field]: {
            ...(current.custom_subsections?.[field.field] || {}),
            [field.subsectionKey]: text,
          },
        },
      }
    }
    return current
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

  function parseGeneratedTableRows(responseText, columns) {
    const cleanText = responseText
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
    const rowsStart = cleanText.indexOf('[')
    const rowsEnd = cleanText.lastIndexOf(']')
    if (rowsStart < 0 || rowsEnd < rowsStart) {
      throw new Error('The table draft was not in a readable format. Please try again.')
    }

    let parsedRows
    try {
      parsedRows = JSON.parse(cleanText.slice(rowsStart, rowsEnd + 1))
    } catch {
      throw new Error('The table draft was not in a readable format. Please try again.')
    }
    if (!Array.isArray(parsedRows) || parsedRows.length !== 5) {
      throw new Error('The table draft did not include five rows. Please try again.')
    }

    return parsedRows.map((row, rowIndex) => {
      if (!Array.isArray(row) || row.length !== columns.length) {
        throw new Error(`Row ${rowIndex + 1} did not match the table columns. Please try again.`)
      }
      return row.map(cell => {
        if (cell === null || cell === undefined || typeof cell === 'object') {
          throw new Error('The table draft contains an invalid cell. Please try again.')
        }
        return String(cell).trim()
      })
    })
  }

  async function generateTlaActivities(source) {
    if (!course) return
    setAiGenerating(true)
    setAiError('')
    setAiPipelineDrafts(null)
    setAiPipelineProgress({ completed: 0, total: 1, label: 'Weekly topic plan' })
    try {
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : undefined
      const planResult = await requestSyllabusField(api, {
        course_id: courseId,
        section: 'week_plan',
        field_label: 'Weekly topic plan',
        existing_content: '',
        mode: 'generate',
        top_k: 5,
        extra_instructions: '',
        assessment_criteria: source.assessment_criteria || '',
        selected_doc_ids: selectedIds,
      }, text => (parseAssignedWeekPlan(text).length ? text : ''))
      const plan = parseAssignedWeekPlan(planResult.data?.generated_text)
      if (!plan.length) {
        throw new Error('The weekly plan did not include any topics. Try again.')
      }
      setSyllabusData(current => ({
        ...current,
        tla_chapters: plan.map((row, index) => ({
          ...EMPTY_CHAPTER,
          chapter: String(index + 1),
          weeks: row.weeks,
          ...(isClassOrientationTitle(row.title) ? {
            topics: ORIENTATION_TOPICS,
            outcomes: ORIENTATION_OUTCOME,
            delivery: ORIENTATION_DELIVERY,
          } : isFinalWeekRow(row) ? {
            topics: FINAL_WEEK_TOPICS,
            outcomes: FINAL_WEEK_OUTCOME,
          } : {}),
        })),
      }))
      setIsDirty(true)
      setSaveSuccess(false)

      const drafts = plan.map((row, index) => ({
        section: 'weeks',
        label: isClassOrientationTitle(row.title)
          ? 'Weeks 1 · Class Orientation'
          : `Weeks ${row.weeks}${row.title ? ` · ${row.title}` : ''}`,
        fieldType: 'arrayObj',
        arrField: 'tla_chapters',
        arrIndex: index,
        arrObjKey: 'weeks',
        text: row.weeks,
      }))
      const topicLabels = []
      const contentCount = plan.filter(row => !isClassOrientationTitle(row.title) && !isFinalWeekRow(row)).length
      const total = contentCount * 2 + 1
      let completed = 0
      for (let index = 0; index < plan.length; index += 1) {
        const row = plan[index]
        if (isClassOrientationTitle(row.title)) {
          topicLabels.push(ORIENTATION_TOPICS)
          drafts.push(
            {
              section: 'topics',
              label: 'Topics / Reading List (1 · Class Orientation)',
              fieldType: 'arrayObj',
              arrField: 'tla_chapters',
              arrIndex: index,
              arrObjKey: 'topics',
              text: ORIENTATION_TOPICS,
            },
            {
              section: 'topic_outcome',
              label: 'Topic Outcomes (1 · Class Orientation)',
              fieldType: 'arrayObj',
              arrField: 'tla_chapters',
              arrIndex: index,
              arrObjKey: 'outcomes',
              text: ORIENTATION_OUTCOME,
            },
            {
              section: 'delivery',
              label: 'Delivery (1 · Class Orientation)',
              fieldType: 'arrayObj',
              arrField: 'tla_chapters',
              arrIndex: index,
              arrObjKey: 'delivery',
              text: ORIENTATION_DELIVERY,
            },
          )
          continue
        }
        if (isFinalWeekRow(row)) {
          topicLabels.push(FINAL_WEEK_TOPICS)
          drafts.push(
            {
              section: 'topics',
              label: `Topics / Reading List (${row.weeks || '18'})`,
              fieldType: 'arrayObj',
              arrField: 'tla_chapters',
              arrIndex: index,
              arrObjKey: 'topics',
              text: FINAL_WEEK_TOPICS,
            },
            {
              section: 'topic_outcome',
              label: `Topic Outcomes (${row.weeks || '18'})`,
              fieldType: 'arrayObj',
              arrField: 'tla_chapters',
              arrIndex: index,
              arrObjKey: 'outcomes',
              text: FINAL_WEEK_OUTCOME,
            },
          )
          continue
        }
        const span = weekSpan(row.weeks)
        const withActivity = span >= 2
        const topicHint = [
          row.title
            ? `Topic title: ${row.title}. The first line must be this title.`
            : 'Continue the course sequence.',
          `This row covers week ${row.weeks}.`,
          withActivity
            ? 'This topic spans two weeks. Write 1 to 3 topic titles. Under each title, indent 1 or 2 subtopic titles. Then a blank line and one activity title for the whole cell. Only one activity.'
            : 'This topic covers one week. Write the topic title, then one indented subtopic. No activity.',
          'Titles only. No sentences. Do not write the week numbers in this cell.',
        ].join(' ')
        setAiPipelineProgress({ completed, total, label: `Topics / Reading List ${row.weeks}` })
        const topicsResult = await requestSyllabusField(api, {
          course_id: courseId,
          section: 'topics',
          field_label: `Topics / Reading List ${index + 1}`,
          existing_content: '',
          mode: 'generate',
          top_k: 5,
          extra_instructions: topicHint,
          assessment_criteria: source.assessment_criteria || '',
          selected_doc_ids: selectedIds,
        }, text => shapeTopicsCell(text, { span, activity: withActivity }))
        const topicsText = topicsResult.text
        if (!topicsText) {
          throw new Error(`The AI did not return topics for weeks ${row.weeks}. Try again.`)
        }
        topicLabels.push(topicsText.split('\n').map(line => line.trim()).find(Boolean) || row.title || 'Topic')
        drafts.push({
          section: 'topics',
          label: `Topics / Reading List (${row.weeks})`,
          fieldType: 'arrayObj',
          arrField: 'tla_chapters',
          arrIndex: index,
          arrObjKey: 'topics',
          text: topicsText,
        })
        completed += 1

        const topicName = row.title || topicLabels[index]
        setAiPipelineProgress({ completed, total, label: `Topic Outcomes ${row.weeks}` })
        const outcomeResult = await requestSyllabusField(api, {
          course_id: courseId,
          section: 'topic_outcome',
          field_label: 'Topic outcome',
          existing_content: '',
          mode: 'generate',
          top_k: 5,
          extra_instructions: `Topic: ${topicName}.`,
          assessment_criteria: source.assessment_criteria || '',
          selected_doc_ids: selectedIds,
        }, shapeOutcome)
        const outcomeText = outcomeResult.text
        if (!outcomeText) {
          throw new Error(`The AI did not return a topic outcome for weeks ${row.weeks}. Try again.`)
        }
        drafts.push({
          section: 'topic_outcome',
          label: `Topic Outcomes (${row.weeks})`,
          fieldType: 'arrayObj',
          arrField: 'tla_chapters',
          arrIndex: index,
          arrObjKey: 'outcomes',
          text: outcomeText,
        })
        completed += 1
      }

      const ilos = iloChoices(source.ilos)
      const sos = soChoices(source.student_outcomes, source.so_headers)
      const mapInstructions = [
        'Intended learning outcomes:',
        ...ilos.map(row => `${row.number}. ${row.text}`),
        '',
        'Student outcomes:',
        ...sos.map(row => `${row.number}. ${row.text}`),
        '',
        'Topics, in order:',
        ...topicLabels.map((title, index) => `${index + 1}. ${title}`),
      ].join('\n')
      setAiPipelineProgress({ completed, total, label: 'ILO and SO mapping' })
      let mapText = ''
      try {
        const mapResult = await requestSyllabusField(api, {
          course_id: courseId,
          section: 'topic_map',
          field_label: 'ILO and SO mapping',
          existing_content: '',
          mode: 'generate',
          top_k: 5,
          extra_instructions: mapInstructions,
          assessment_criteria: source.assessment_criteria || '',
          selected_doc_ids: selectedIds,
        })
        mapText = mapResult.text || ''
      } catch {
        mapText = ''
      }
      const pairs = parseTopicMap(
        mapText,
        plan.length,
        ilos.map(row => row.number),
        sos.map(row => row.number),
      )
      pairs.forEach((pair, index) => {
        const row = plan[index]
        const topicName = topicLabels[index] || row.title || `row ${index + 1}`
        drafts.push(
          {
            section: 'ilo',
            label: `ILO · ${topicName}`,
            fieldType: 'arrayObj',
            arrField: 'tla_chapters',
            arrIndex: index,
            arrObjKey: 'ilo',
            text: pair.ilo,
          },
          {
            section: 'so',
            label: `SO · ${topicName}`,
            fieldType: 'arrayObj',
            arrField: 'tla_chapters',
            arrIndex: index,
            arrObjKey: 'so',
            text: pair.so,
          },
        )
      })
      setAiPipelineDrafts(drafts)
      setAiPipelineProgress(null)
      setAiGenerating(false)
      setAiReviewOpen(true)
      setAiField(null)
      notifyGenerationComplete('Syllabus', `${plan.length} topic row${plan.length === 1 ? '' : 's'} generated`)
    } catch (err) {
      setAiError(extractApiError(err))
      setAiPipelineProgress(null)
    } finally {
      setAiGenerating(false)
    }
  }

  async function assignFrameworkColumns(data = syllabusData) {
    const request = frameworkColumnRequest(data)
    if (!courseId || !request) {
      const message = 'Add the ILOs, topics, and framework statements before assigning columns.'
      setFrameworkAssignError(message)
      setAiError(message)
      return
    }
    setFrameworkAssigning(true)
    setFrameworkAssignError('')
    setAiError('')
    const result = await requestSyllabusField(api, {
      course_id: courseId,
      section: 'framework_columns',
      field_label: 'Framework column numbers',
      existing_content: '',
      mode: 'generate',
      provider: 'ollama',
      top_k: 1,
      extra_instructions: request.brief,
    }, text => (parseFrameworkColumns(text) ? text : ''))
    const parsed = parseFrameworkColumns(result.text)
    const soHeaders = parsed ? placeFrameworkNumbers(DEFAULT_SO_HEADERS.length, parsed.so, request.allowed.so) : []
    const igaHeaders = parsed ? placeFrameworkNumbers(DEFAULT_IGA_HEADERS.length, parsed.iga, request.allowed.iga) : []
    const cdioHeaders = parsed ? placeFrameworkNumbers(DEFAULT_CDIO_HEADERS.length, parsed.cdio, request.allowed.cdio) : []
    const sdgHeaders = parsed ? placeFrameworkNumbers(DEFAULT_SDG_HEADERS.length, parsed.sdg, request.allowed.sdg) : []
    const placed = [soHeaders, igaHeaders, cdioHeaders, sdgHeaders].some(list => list.some(Boolean))
    if (!placed) {
      throw new Error('Ollama did not return framework column numbers.')
    }
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(current => withMappedAssessmentCodes({
      ...current,
      framework_column_source: 'ollama',
      so_headers: soHeaders,
      iga_headers: igaHeaders,
      cdio_headers: cdioHeaders,
      sdg_headers: sdgHeaders,
    }))
  }

  async function generateOneField(field) {
    if (!course || !field) return
    const source = syllabusData
    setAiGenerating(true)
    setAiError('')
    setAiPipelineDrafts(null)
    setAiPipelineProgress({ completed: 0, total: 1, label: field.label })
    try {
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : undefined
      let extra = ''
      let shape = text => shapeGeneratedField(field.section, text)
      if (field.arrField === 'tla_chapters') {
        const chapter = (source.tla_chapters || [])[field.arrIndex] || {}
        const span = weekSpan(chapter.weeks)
        const examRow = isFinalWeekRow({ weeks: chapter.weeks, title: chapter.topics })
        const withActivity = span >= 2 && !examRow
        const title = String(chapter.topics || '').split('\n').map(line => line.trim()).find(Boolean) || ''
        if (field.arrObjKey === 'topics') {
          extra = [
            title ? `Topic title: ${title}. The first line must be this title.` : 'Continue the course sequence.',
            chapter.weeks ? `This row covers week ${chapter.weeks}.` : '',
            withActivity
              ? 'This topic spans two weeks. Write 1 to 3 topic titles. Under each title, indent 1 or 2 subtopic titles. Then a blank line and one activity title for the whole cell. Only one activity.'
              : 'This topic covers one week. Write the topic title, then one indented subtopic. No activity.',
            'Titles only. No sentences. Do not write the week numbers in this cell.',
          ].filter(Boolean).join(' ')
          shape = text => shapeTopicsCell(text, { span: examRow ? 1 : span, activity: withActivity })
        } else if (field.arrObjKey === 'outcomes') {
          extra = `Topic: ${title || 'this topic'}.`
          shape = shapeOutcome
        }
      }
      const fieldResult = await requestSyllabusField(api, {
        course_id: courseId,
        section: field.section,
        field_label: field.label,
        existing_content: '',
        mode: 'generate',
        top_k: 5,
        extra_instructions: extra,
        assessment_criteria: source.assessment_criteria || '',
        selected_doc_ids: selectedIds,
      }, shape)
      if (!fieldResult.text) {
        throw new Error(`The AI did not return text for "${field.label}". Try again.`)
      }
      setAiPipelineDrafts([{ ...field, text: fieldResult.text }])
      setAiPipelineProgress(null)
      setAiGenerating(false)
      setAiReviewOpen(true)
      notifyGenerationComplete('Syllabus', field.label)
    } catch (err) {
      setAiError(extractApiError(err))
      setAiPipelineProgress(null)
    } finally {
      setAiGenerating(false)
    }
  }

  async function handleGenerateSection() {
    let source = syllabusData
    if (activeSyllabusSectionKey === 'mapping-of-at') {
      setAiGenerating(true)
      setAiError('')
      try {
        await assignFrameworkColumns(source)
      } catch (err) {
        const message = err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Ollama could not assign the framework columns.'
        setFrameworkAssignError(String(message))
        setAiError(String(message))
      } finally {
        setFrameworkAssigning(false)
        setAiGenerating(false)
      }
      return
    }
    if (activeSyllabusSectionKey === 'iloat-references') {
      const expanded = ensureIloCount(source, iloGenerateCount(source.ilos))
      if (expanded !== source) {
        source = expanded
        setSyllabusData(expanded)
        setIsDirty(true)
        setSaveSuccess(false)
      }
    }
    if (activeSyllabusSectionKey === 'tla-activities') {
      if (fixedTableFor('tla-activities', 'tla-table')) return
      await generateTlaActivities(source)
      return
    }
    const fields = getAiFieldsForCurrentSection(source)
    if (!course || !fields.length) return
    setAiGenerating(true)
    setAiError('')
    setAiPipelineDrafts(null)
    setAiPipelineProgress({ completed: 0, total: fields.length, label: fields[0].label })
    try {
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : undefined
      const drafts = []
      const usedIloVerbs = []
      for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index]
        setAiPipelineProgress({ completed: index, total: fields.length, label: field.label })
        const extraHints = []
        if (field.section === 'ilo' && usedIloVerbs.length) {
          extraHints.push(`Do not start with ${usedIloVerbs.join(' or ')}. Use a different verb.`)
        }
        const fieldResult = await requestSyllabusField(api, {
          course_id: courseId,
          section: field.section,
          field_label: field.label,
          existing_content: '',
          mode: 'generate',
          top_k: 5,
          extra_instructions: extraHints.join(' '),
          assessment_criteria: source.assessment_criteria || '',
          selected_doc_ids: selectedIds,
        }, text => shapeGeneratedField(field.section, text))
        const generatedText = fieldResult.text
        if (!generatedText) {
          throw new Error(`The AI did not return text for "${field.label}". Try generating the section again.`)
        }
        if (field.section === 'ilo') {
          const opening = generatedText.replace(/^[^\w]+/, '').split(/\s+/)[0] || ''
          if (opening) usedIloVerbs.push(opening.replace(/[.,:;]$/, ''))
        }
        if (field.fieldType === 'customTable') {
          drafts.push({ ...field, rows: parseGeneratedTableRows(generatedText, field.columns) })
        } else {
          drafts.push({ ...field, text: generatedText })
        }
      }
      setAiPipelineDrafts(drafts)
      setAiPipelineProgress(null)
      setAiGenerating(false)
      setAiReviewOpen(true)
      setAiField(null)
      notifyGenerationComplete('Syllabus', `${fields.length} section${fields.length === 1 ? '' : 's'} generated`)
    } catch (err) {
      setAiError(extractApiError(err))
      setAiPipelineProgress(null)
    } finally {
      setAiGenerating(false)
    }
  }

  function discardAiDrafts() {
    setAiPipelineDrafts(null)
    setAiPipelineProgress(null)
    setAiError('')
    setAiReviewOpen(false)
  }

  function acceptAiDraftsAndContinue() {
    if (!aiPipelineDrafts?.length) return
    setSyllabusData(current => {
      let next = current
      const iloNeeded = aiPipelineDrafts
        .filter(draft => draft.section === 'ilo')
        .reduce((max, draft) => Math.max(max, (draft.arrIndex ?? 0) + 1), 0)
      if (iloNeeded) next = ensureIloCount(next, Math.max(ILO_FIELD_COUNT, iloNeeded))
      const chapterNeeded = aiPipelineDrafts
        .filter(draft => draft.arrField === 'tla_chapters')
        .reduce((max, draft) => Math.max(max, (draft.arrIndex ?? 0) + 1), 0)
      if (chapterNeeded) next = ensureChapterCount(next, chapterNeeded)
      return applyScheduleMethodsToTopics(aiPipelineDrafts.reduce(
        (state, draft) => updateSyllabusWithAiText(state, draft, draft.text, draft.rows),
        next,
      ))
    })
    setIsDirty(true)
    setSaveSuccess(false)
    setAiPipelineDrafts(null)
    setAiPipelineProgress(null)
    setAiError('')
    setAiReviewOpen(false)
    const currentIndex = configuredSections.findIndex(section => section.key === activeConfiguredSection?.key)
    const nextSection = configuredSections[currentIndex + 1]
    if (nextSection) {
      setSyllabusSub(nextSection.key)
    } else {
      setActiveTab('module')
    }
  }

  function regenerateAiDrafts() {
    setAiReviewOpen(true)
    if (aiPipelineDrafts?.length === 1) {
      generateOneField(aiPipelineDrafts[0])
      return
    }
    handleGenerateSection()
  }

  function parsedHasContent(value) {
    if (value == null || value === '') return false
    if (Array.isArray(value)) return value.some(parsedHasContent)
    if (typeof value === 'object') return Object.values(value).some(parsedHasContent)
    return true
  }

  async function handleSyllabusUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setSyllabusUploading(true)
    setSyllabusUploadError('')
    setSyllabusUploadSuccess(false)
    setSyllabusUploadProgress(null)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('course_id', courseId)
    try {
      const { data } = await api.post('/curriculum/import-syllabus-json/', formData, {
        headers: { 'Content-Type': undefined },
        timeout: 180000,
      })
      const imported = data?.syllabus_content
      if (!data?.success || !parsedHasContent(imported)) {
        setSyllabusUploadError('Could not find syllabus text in this file.')
        return
      }
      const base = {
        ...EMPTY_SYLLABUS,
        university_name: course?.institution_name || '',
        college: course?.college_name || '',
        program: course?.program_name || '',
        course_title: course?.course_title || '',
        course_code: course?.course_code || '',
        credit_hours: course?.credit_hours != null ? String(course.credit_hours) : '',
        instructor_name: course?.instructor_name || '',
        instructor_email: course?.instructor_email || '',
        year_level: course?.year_level || '',
        course_category: course?.course_category || '',
      }
      Object.entries(imported).forEach(([key, value]) => {
        if (value == null || value === '') return
        if (Array.isArray(value) && value.length === 0) return
        base[key] = value
      })
      setSyllabusData(normalizeSyllabusData(base))
      setIsDirty(true)
      setSaveSuccess(false)
      setSyllabusSub('basic')
      setSyllabusUploadSuccess(true)
    } catch (err) {
      setSyllabusUploadError(extractApiError(err))
    } finally {
      setSyllabusUploading(false)
      setSyllabusUploadProgress(null)
      if (syllabusUploadRef.current) syllabusUploadRef.current.value = ''
    }
  }

  async function downloadSyllabusBlob(response, fallbackExt) {
    const blob = response.data
    const contentDisposition = response.headers?.['content-disposition'] || ''
    const match = contentDisposition.match(/filename="?([^";]+)"?/i)
    const baseName = (syllabusData.course_code || 'syllabus').replace(/[\\/\s]+/g, '_')
    const downloadName = match?.[1] || `${baseName}_syllabus.${fallbackExt}`
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.setAttribute('download', downloadName)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(blobUrl)
  }

  async function readExportError(err, fallback) {
    let message = fallback
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
    return message
  }

  function syllabusForPersist(data = syllabusData) {
    return { ...(data || {}), tos: materializeTosList(data?.tos) }
  }

  async function handleExportDocx() {
    if (!courseId || syllabusExporting) {
      if (!courseId) setSyllabusExportError('Select a course first before exporting.')
      return
    }
    setSyllabusExporting('docx')
    setSyllabusExportError('')
    try {
      const formData = new FormData()
      formData.append('course_id', courseId)
      formData.append('syllabus_data', JSON.stringify(syllabusForPersist()))
      if (syllabusTemplateFile) {
        formData.append('template', syllabusTemplateFile)
      }

      const response = await api.post('/curriculum/export-syllabus-docx/', formData, {
        headers: { 'Content-Type': undefined },
        responseType: 'blob',
        timeout: 120000,
      })

      const isXlsx = syllabusTemplateFile?.name?.toLowerCase().endsWith('.xlsx')
      await downloadSyllabusBlob(response, isXlsx ? 'xlsx' : 'docx')
    } catch (err) {
      setSyllabusExportError(await readExportError(err, 'Failed to export syllabus.'))
    } finally {
      setSyllabusExporting(null)
    }
  }

  async function handleExportPdf() {
    if (!courseId || syllabusExporting) {
      if (!courseId) setSyllabusExportError('Select a course first before exporting.')
      return
    }
    setSyllabusExporting('pdf')
    setSyllabusExportError('')
    try {
      const formData = new FormData()
      formData.append('course_id', courseId)
      formData.append('syllabus_data', JSON.stringify(syllabusForPersist()))
      const response = await api.post('/curriculum/export-syllabus-pdf/', formData, {
        headers: { 'Content-Type': undefined },
        responseType: 'blob',
        timeout: 120000,
      })
      await downloadSyllabusBlob(response, 'pdf')
    } catch (err) {
      setSyllabusExportError(await readExportError(err, 'Failed to export styled PDF.'))
    } finally {
      setSyllabusExporting(null)
    }
  }

  // ── Table of Specifications download ──────────────────────────────────────
  // Sends the live (unsaved) syllabus so the download always matches what the
  // faculty member is looking at, falling back to the last saved copy server-side.
  async function handleExportTos() {
    if (!courseId) {
      setTosExportError('Select a course first before downloading.')
      return
    }
    setTosExporting(true)
    setTosExportError('')
    try {
      const formData = new FormData()
      formData.append('course_id', courseId)
      formData.append('syllabus_data', JSON.stringify(syllabusForPersist()))

      const response = await api.post('/curriculum/export-tos-docx/', formData, {
        headers: { 'Content-Type': undefined },
        responseType: 'blob',
        timeout: 120000,
      })

      const disposition = response.headers?.['content-disposition'] || ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const baseName = (syllabusData.course_code || 'syllabus').replace(/[\\/\s]+/g, '_')
      const downloadName = match?.[1] || `${baseName}_table_of_specifications.docx`

      const blobUrl = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = blobUrl
      link.setAttribute('download', downloadName)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (err) {
      // Error responses come back as a blob, so unwrap it before reading.
      let message = 'Failed to download the Table of Specifications.'
      const blobData = err?.response?.data
      if (blobData instanceof Blob) {
        try {
          const parsed = JSON.parse(await blobData.text())
          message = parsed?.error || parsed?.detail || message
        } catch (_) {
          message = err?.message || message
        }
      } else {
        message = extractApiError(err) || err?.message || message
      }
      setTosExportError(message)
    } finally {
      setTosExporting(false)
    }
  }

  // ── API ─────────────────────────────────────────────────────────────────
  const workspaceApi = useApi(
    courseId ? `/curriculum/faculty-course-workspace/${courseId}/` : null,
    { immediate: Boolean(courseId), deps: [courseId] },
  )
  const docsUrl = courseId ? `/integrations/course-rag-documents/?course_id=${courseId}` : null
  const docsApi = useApi(docsUrl, { immediate: Boolean(courseId), deps: [courseId] })
  const docsIndexing = (docsApi.data?.documents || []).some(doc => doc.rag_status === 'PROCESSING')
  useEffect(() => {
    if (!docsIndexing || !docsUrl) return undefined
    const timer = setTimeout(() => {
      api.get(docsUrl).then(({ data }) => docsApi.setData(data)).catch(() => {})
    }, 4000)
    return () => clearTimeout(timer)
  }, [docsIndexing, docsApi.data, docsUrl])
  const course = workspaceApi.data?.course

  // ── ATLAS pipeline progress (Step 11: Faculty Review & Approval) ──
  // Tracks per-module completion: auto-detected from workspace data +
  // manual faculty approval via the header "Mark as Done" check.
  const workspaceProgress = useWorkspaceProgress(courseId, workspaceApi.data)
  const { isStepDone, markStepDone } = workspaceProgress
  // The Admin Syllabus Format is stored per institution. Any field the admin
  // fixed is shown with the admin's content and cannot be edited here.
  const loadAdminFormat = useCallback(() => {
    api.get('/users/institution-customization/')
      .then(({ data }) => {
        const sections = Array.isArray(data?.syllabus_sections) ? data.syllabus_sections : []
        setAdminFormatSections(sections)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadAdminFormat()
    function refresh() {
      if (document.visibilityState !== 'visible') return
      loadAdminFormat()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [loadAdminFormat])

  const fixedFieldRules = useMemo(() => {
    const rules = {}
    adminFormatSections.forEach(section => {
      if (section.enabled === false) return
      const sectionFixed = Boolean(section.is_static)
      ;(section.fields || []).forEach(field => {
        const dataKey = ADMIN_FIXED_FIELDS[field.key]
        if (dataKey && (sectionFixed || field.fixed)) rules[dataKey] = field.content || ''
      })
    })
    return rules
  }, [adminFormatSections])

  // Field names are editable by the admin in the Syllabus Format. Override by
  // the stable blueprint key and fall back to the built-in label.
  const fieldLabelOverrides = useMemo(() => {
    const labels = {}
    adminFormatSections.forEach(section => {
      if (section.enabled === false) return
      ;(section.fields || []).forEach(field => {
        if (field.key && field.label) labels[field.key] = field.label
      })
    })
    return labels
  }, [adminFormatSections])
  const labelFor = (fieldKey, fallback) => fieldLabelOverrides[fieldKey] || fallback
  const titleForTable = (sectionKey, tableKey, fallback) => {
    const admin = adminFormatSections.find(section => (
      section.enabled !== false && (section.key === sectionKey || section.editor === sectionKey)
    ))
    const custom = admin?.table_titles?.[tableKey]
    return typeof custom === 'string' && custom.trim() ? custom.trim() : fallback
  }

  // Tables the admin fixed in the Syllabus Format are stored per institution
  // under section.blueprint_tables. Faculty see those rows read-only. The
  // lookup is also flattened by table key so a saved override still applies if
  // the stored section key ever differs from the canonical blueprint key.
  const adminFixedTables = useMemo(() => {
    const bySection = {}
    const byTable = {}
    adminFormatSections.forEach(section => {
      if (section.enabled === false) return
      const key = section.key || section.editor
      const tables = section.blueprint_tables || {}
      if (key) bySection[key] = { ...(bySection[key] || {}), ...tables }
      Object.entries(tables).forEach(([tableKey, override]) => {
        if (override) byTable[tableKey] = override
      })
    })
    return { bySection, byTable }
  }, [adminFormatSections])

  const fixedTableFor = useCallback((sectionKey, tableKey) => {
    const adminSection = adminFormatSections.find(section => (
      section.enabled !== false && (section.key === sectionKey || section.editor === sectionKey)
    ))
    const override = adminFixedTables.bySection[sectionKey]?.[tableKey] || adminFixedTables.byTable[tableKey]
    // A saved table, or a whole section marked Fixed, is read-only for every account.
    // Fixed off keeps the admin's draft but lets Faculty edit their own copy.
    if (!adminSection?.is_static && (!override || override.fixed === false)) return null
    const descriptor = ALL_BLUEPRINT_TABLES.find(table => table.key === tableKey)
    return descriptor ? applyTableOverride(descriptor, override || null) : null
  }, [adminFixedTables, adminFormatSections])

  // Re-applied after every render so loading a saved syllabus or AI generation
  // can never overwrite content the institution fixed. Tables are included,
  // so a newly opened course already shows the seeded statements.
  useEffect(() => {
    setSyllabusData(current => applyFixedSyllabusContent(current, adminFormatSections))
  })
  const configuredSections = (() => {
    const builtinKeys = new Set(SYLLABUS_SECTIONS.map(section => section.key))
    const matchAdmin = section => adminFormatSections.find(item => (
      item.enabled !== false && (item.key === section.key || item.editor === section.key)
    ))
    const builtin = SYLLABUS_SECTIONS.map(section => {
      const admin = matchAdmin(section)
      return {
        ...section,
        editorKey: section.key,
        label: admin?.label || section.label,
        is_static: Boolean(admin?.is_static),
        static_content: admin?.static_content || '',
        subsections: Array.isArray(admin?.subsections) ? admin.subsections : [],
        table_enabled: Boolean(admin?.table_enabled),
        table_columns: admin?.table_columns || [],
        table_column_groups: admin?.table_column_groups || [],
      }
    })
    const extras = adminFormatSections
      .filter(section => section.enabled !== false && section.key && !builtinKeys.has(section.key) && !builtinKeys.has(section.editor))
      .map(section => ({
        key: section.key,
        label: section.label || section.key,
        editorKey: section.key,
        custom: true,
        is_static: Boolean(section.is_static),
        static_content: section.static_content || '',
        subsections: Array.isArray(section.subsections) ? section.subsections : [],
        table_enabled: Boolean(section.table_enabled),
        table_columns: section.table_columns || [],
        table_column_groups: section.table_column_groups || [],
      }))
    return [...builtin, ...extras]
  })()
  const activeConfiguredSection = configuredSections.find(section => section.key === syllabusSub)
  const activeSyllabusSectionKey = activeConfiguredSection?.editorKey || activeConfiguredSection?.key || ''
  const frameworkAssignKey = (() => {
    if (activeSyllabusSectionKey !== 'mapping-of-at') return ''
    if (syllabusData.framework_column_source === 'faculty' || syllabusData.framework_column_source === 'ollama') return ''
    const headers = frameworkHeaders(syllabusData)
    const blank = [headers.so, headers.iga, headers.cdio, headers.sdg].every(list => list.every(cell => !String(cell).trim()))
    if (!blank) return ''
    const ilos = (syllabusData.ilos || []).map(text => String(text || '').trim()).filter(Boolean)
    const topics = topicBriefLines(syllabusData.tla_chapters)
    const so = frameworkCatalog(syllabusData.student_outcomes, 'SO')
    const iga = frameworkCatalog(syllabusData.igas, 'IGA')
    const cdio = frameworkCatalog(syllabusData.cdio_skills, 'CDIO')
    const sdg = frameworkCatalog(syllabusData.sdg_skills, 'SDG')
    if (!ilos.length || !topics.length || !(so.length || iga.length || cdio.length || sdg.length)) return ''
    return JSON.stringify({ ilos, topics, so, iga, cdio, sdg })
  })()

  useEffect(() => {
    if (!frameworkAssignKey || !courseId) return undefined
    let cancelled = false
    assignFrameworkColumns().catch(err => {
      if (cancelled) return
      const message = err?.response?.data?.error || err?.response?.data?.detail || err?.message || 'Ollama could not assign the framework columns.'
      setFrameworkAssignError(String(message))
    }).finally(() => {
      if (!cancelled) setFrameworkAssigning(false)
    })
    return () => { cancelled = true }
  }, [frameworkAssignKey, courseId])

  useEffect(() => {
    setSyllabusSub(current => (
      configuredSections.some(section => section.key === current)
        ? current
        : configuredSections[0]?.key || ''
    ))
  }, [workspaceApi.data, courseId])

  // The module topic source is locked per course the first time the faculty
  // confirms it — pull it back from the course record on every load.
  useEffect(() => {
    const courseData = workspaceApi.data?.course
    if (!courseData) return
    if (courseData.module_topic_confirmed_at) {
      setModuleTopicConfirmed(true)
      setModuleTopicSectionKey(courseData.module_topic_section_key || '')
      setModuleTopicSubsectionKey(courseData.module_topic_subsection_key || '')
    } else {
      setModuleTopicConfirmed(false)
    }
  }, [workspaceApi.data?.course])

  // Before the faculty confirms a source, pre-select the section that already
  // holds topics so the dialog opens on a sensible default.
  useEffect(() => {
    if (moduleTopicConfirmed) return
    setModuleTopicSectionKey(current => (
      configuredSections.some(section => section.key === current)
        ? current
        : findDefaultTopicSection()
    ))
  }, [workspaceApi.data, courseId])

  // Keep the chosen subsection valid for the chosen section.
  useEffect(() => {
    const section = configuredSections.find(item => item.key === moduleTopicSectionKey)
    const subsections = section?.subsections || []
    setModuleTopicSubsectionKey(current => (
      current && subsections.some(sub => sub.key === current) ? current : ''
    ))
  }, [configuredSections, moduleTopicSectionKey])

  // Module topics come from TLA Activities, so the old section picker
  // must not block the Module tab.
  useEffect(() => {
    if (activeTab !== 'module') return
    setTopicSourceDialogOpen(false)
  }, [activeTab])

  // A Lecture/Discussion topic queued from TLA Activities opens the
  // generate dialog on the Module tab.
  useEffect(() => {
    if (activeTab !== 'module' || !pendingGenerate) return
    setModuleParams(p => ({
      ...p,
      module_title: pendingGenerate.topic,
      week_number: pendingGenerate.week,
      topic_id: pendingGenerate.topic_id || '',
    }))
    setPendingGenerate(null)
    setGenerateDialogMode('single')
    setGenerateDialogOpen(true)
  }, [activeTab, pendingGenerate])

  // Pre-populate syllabus form: saved JSON first, then fall back to course fields.
  // Seeded ONCE per course — a workspace refresh (after generating a module,
  // confirming the topic source, saving, …) must never discard unsaved edits.
  useEffect(() => {
    const apiData = workspaceApi.data
    if (!apiData) return
    const course = apiData.course
    setSyllabusId(apiData.syllabus?.syllabus_id || null)

    const seededFor = seededCourseRef.current
    if (seededFor === courseId) return            // same course — just a refresh
    const switchingCourse = Boolean(seededFor && seededFor !== courseId)
    if (switchingCourse) {
      setIsDirty(false)
      setSaveSuccess(false)
    } else if (isDirty) {
      seededCourseRef.current = courseId          // keep the faculty's unsaved work
      return
    }
    seededCourseRef.current = courseId

    const saved = apiData.syllabus?.syllabus_content
    const hasSaved = saved && typeof saved === 'object'
    // A course added after the admin locked content may only have the fixed
    // keys stored. Course identity still comes from the course record.
    if (!hasSaved && !course) return
    if (!course) {
      setSyllabusData(normalizeSyllabusData({ ...EMPTY_SYLLABUS, ...saved }))
      setIsDirty(false)
      return
    }
    const toStr = v => v != null ? String(v) : ''
    const mapAttr = arr => (arr || []).length
      ? arr.map(g => ({ code: g.code || '', title: g.title || '', description: g.description || '' }))
      : [{ ...EMPTY_ATTR }]
    const courseIlos = (course.ilos || []).length ? course.ilos.map(String) : ['']
    const iloCount   = courseIlos.length
    const fromCourse = {
      university_name:  course.institution_name || '',
      college:          course.college_name || '',
      program:          course.program_name || '',
      document_title:   '',
      // University Direction
      vision:           course.vision             || '',
      mission:          course.mission            || '',
      // Course Specifications
      course_title:     course.course_title       || '',
      course_code:      course.course_code        || '',
      course_category:  course.course_category    || '',
      prerequisites:    course.prerequisites      || '',
      year_level:       course.year_level        || '',
      semester_year:    course.semester_year      || '',
      credit_hours:     toStr(course.credit_hours),
      instructor_name:  course.instructor_name    || '',
      instructor_email: course.instructor_email   || '',
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
      grading_rows:     course.grading_rows || [],
      policies:         (course.policies || []).length
        ? course.policies.map(p => ({ title: p.title || '', content: p.content || '' }))
        : [],
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
      custom_sections:   {},
    }
    setSyllabusData(normalizeSyllabusData(hasSaved ? { ...fromCourse, ...saved } : fromCourse))
    setIsDirty(false)
  }, [workspaceApi.data])

  // Auto-clear transient notifications
  useEffect(() => { if (!actionError) return; const t = setTimeout(() => setActionError(''), 3000); return () => clearTimeout(t) }, [actionError])
  useEffect(() => { if (!aiError) return; const t = setTimeout(() => setAiError(''), 4000); return () => clearTimeout(t) }, [aiError])
  useEffect(() => { if (!syllabusUploadSuccess) return; const t = setTimeout(() => setSyllabusUploadSuccess(false), 5000); return () => clearTimeout(t) }, [syllabusUploadSuccess])

  // Clear AI field selection when the syllabus section tab changes
  useEffect(() => { setAiField(null) }, [syllabusSub])

  // ── Auto-sync Major Examination tasks → TOS when the TOS tab opens ──
  useEffect(() => {
    if (activeTab !== 'tos' && activeSyllabusSectionKey !== 'tos') return
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
          totalExamMinutes: 0,
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
  }, [activeTab, activeSyllabusSectionKey])

  // Keep saved TOS rows equal to the institutional formula: hours drive
  // weight, points, and minutes; Bloom percentages drive item counts.
  useEffect(() => {
    setSyllabusData(prev => {
      const nextTos = materializeTosList(prev.tos)
      if (tosMaterializedEqual(prev.tos, nextTos)) return prev
      return { ...prev, tos: nextTos }
    })
  }, [syllabusData.tos])

  // ── Save syllabus content ──────────────────────────────────────────────
  async function handleSaveSyllabus() {
    setSaveError('')
    const missingRequiredSubsections = configuredSections.flatMap(section => {
      if (section.is_static) return []
      const answers = syllabusData.custom_subsections?.[section.key] || {}
      return (Array.isArray(section.subsections) ? section.subsections : [])
        .filter(subsection => {
          if (!subsection.required) return false
          if (!subsection.table_enabled) return !String(answers[subsection.key] || '').trim()
          const columns = Array.isArray(subsection.table_columns) ? subsection.table_columns : []
          const storedRows = syllabusData.custom_tables?.[section.key]?.[subsection.key]
          const rows = Array.isArray(storedRows) ? storedRows : []
          return !rows.some(row => columns.length > 0
            && columns.every((_, columnIndex) => String(row[columnIndex] || '').trim()))
        })
        .map(subsection => `${section.label}: ${subsection.label}`)
    })
    if (missingRequiredSubsections.length) {
      setSaveError(`Complete required fields: ${missingRequiredSubsections.join(', ')}.`)
      return
    }
    const restored = applyFixedSyllabusContent(syllabusForPersist(), adminFormatSections)
    setSyllabusData(restored)
    setSaveLoading(true)
    try {
      const { data } = await api.put(`/curriculum/syllabus-content/${courseId}/`, {
        syllabus_content: restored,
        syllabus_id: syllabusId,
      }, { timeout: 60000 })
      if (data?.syllabus_content && typeof data.syllabus_content === 'object') {
        setSyllabusData(normalizeSyllabusData(data.syllabus_content))
      }
      setSyllabusId(data.syllabus_id)
      setIsDirty(false)
      setSaveSuccess(true)
      markStepDone('syllabus', true)
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
      if (dragging === 'right') setRightWidth(Math.max(250, Math.min(480, rect.right - e.clientX)))
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  useEffect(() => {
    if (!isMobile) return
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
      notifyGenerationComplete('Syllabus', `${course.course_code} ${course.course_title}`)
    } catch (err) { setActionError(extractApiError(err)) }
    finally { setActionLoading(false) }
  }

  // ── Module topic sources ──────────────────────────────────────────────────
  // Topics that need a module live inside the Syllabus tab. Depending on the
  // section they are stored as a table, as free text, or as TLA Activity rows.
  // The Module tab reads Lecture/Discussion rows from that table.
  function findColumnIndex(columns, hints) {
    for (const hint of hints) {
      const index = columns.findIndex(col => String(col || '').toLowerCase().includes(hint))
      if (index >= 0) return index
    }
    return -1
  }

  function topicsFromTableRows(rows, columns) {
    const topicCol = findColumnIndex(
      columns,
      ['topic', 'activity', 'subject', 'lesson', 'module', 'title', 'content', 'description'],
    )
    const weekCol = findColumnIndex(columns, ['week', 'chapter', 'session', 'meeting'])
    const topics = []
    ;(rows || []).forEach((row, index) => {
      const cells = Array.isArray(row) ? row.map(cell => String(cell ?? '').trim()) : []
      const raw = topicCol >= 0 ? cells[topicCol] : (cells.find(Boolean) || '')
      const topic = String(raw || '').trim()
      if (!topic) return
      const weekMatch = weekCol >= 0 ? String(cells[weekCol] || '').match(/\d+/) : null
      topics.push({
        id: `table-${index}`,
        week: weekMatch ? parseInt(weekMatch[0], 10) : index + 1,
        topic,
        context: cells.filter(Boolean).join(' · '),
      })
    })
    return topics
  }

  function topicsFromText(text) {
    const topics = []
    String(text || '').split(/\r?\n/).forEach((line, index) => {
      const cleaned = line.replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, '').trim()
      if (!cleaned) return
      const weekMatch = cleaned.match(/week\s*(\d+)/i)
      topics.push({
        id: `text-${index}`,
        week: weekMatch ? parseInt(weekMatch[1], 10) : index + 1,
        topic: cleaned,
        context: '',
      })
    })
    return topics
  }

  function collectScheduleTopics() {
    return collectLectureDiscussionTopics(syllabusData.tla_chapters)
  }

  function lectureTopicSource() {
    const section = configuredSections.find(item => item.editorKey === 'tla-activities')
    return {
      section_key: section?.key || 'tla-activities',
      section_label: section?.label || 'Teaching, Learning, and Assessment (TLA) Activities',
      subsection_key: '',
      subsection_label: 'Lecture/Discussion',
    }
  }

  // Which section should the topic source start on? The first one that already
  // holds topics, so the selection dialog never opens on an empty section.
  function findDefaultTopicSection() {
    const withTopics = configuredSections.find(section => {
      if (section.editorKey === 'tla-activities') {
        return (syllabusData.tla_chapters || []).some(ch => String(ch.topics || '').trim())
      }
      if (section.table_enabled) {
        return (syllabusData.custom_tables?.[section.key]?.['__section__'] || []).length > 0
      }
      return (section.subsections || []).some(sub => (
        (syllabusData.custom_tables?.[section.key]?.[sub.key] || []).length > 0
      ))
    })
    if (withTopics) return withTopics.key
    return configuredSections.find(section => section.editorKey === 'tla-activities')?.key
      || configuredSections.find(section => section.table_enabled)?.key
      || configuredSections.find(section => (section.subsections || []).length > 0)?.key
      || configuredSections[0]?.key
      || ''
  }

  function collectModuleTopics(sectionKey = moduleTopicSectionKey, subsectionKey = moduleTopicSubsectionKey) {
    const section = configuredSections.find(item => item.key === sectionKey)
    if (!section) return []
    const subsection = subsectionKey
      ? (section.subsections || []).find(sub => sub.key === subsectionKey)
      : null

    // The section's own table (custom_tables[section]['__section__']) holds the
    // topics whenever the section is table-driven.
    const sectionTableRows = section.table_enabled
      ? (syllabusData.custom_tables?.[section.key]?.['__section__'] || [])
      : []
    const sectionTableTopics = topicsFromTableRows(sectionTableRows, section.table_columns || [])

    // A specific subsection was picked → read that one.
    if (subsection) {
      const subRows = syllabusData.custom_tables?.[section.key]?.[subsection.key] || []
      const subTableTopics = topicsFromTableRows(subRows, subsection.table_columns || [])
      if (subTableTopics.length) return subTableTopics
      // The subsection has no table of its own — the section's table still
      // holds the topics, so keep recognising it.
      if (sectionTableTopics.length) return sectionTableTopics
      return topicsFromText(syllabusData.custom_subsections?.[section.key]?.[subsection.key] || '')
    }

    // Whole section — TLA Activities keeps lecture topics in the chapter rows.
    if (section.editorKey === 'tla-activities') {
      const scheduleTopics = collectScheduleTopics()
      if (scheduleTopics.length) return scheduleTopics
    }

    // Whole section — its own table first, then every subsection table.
    if (sectionTableTopics.length) return sectionTableTopics
    const targets = []
    ;(section.subsections || [])
      .filter(sub => sub.table_enabled && (sub.table_columns || []).length)
      .forEach(sub => targets.push({ key: sub.key, columns: sub.table_columns || [] }))
    const fromTables = targets.flatMap(target => topicsFromTableRows(
      syllabusData.custom_tables?.[section.key]?.[target.key] || [],
      target.columns,
    ))
    if (fromTables.length) return fromTables

    // Whole section — free text.
    const texts = []
    if (syllabusData.custom_sections?.[section.key]) {
      texts.push(syllabusData.custom_sections[section.key])
    }
    ;(section.subsections || []).forEach(sub => {
      const text = syllabusData.custom_subsections?.[section.key]?.[sub.key]
      if (text) texts.push(text)
    })
    return texts.flatMap(text => topicsFromText(text))
  }

  function activeTopicSource() {
    const section = configuredSections.find(item => item.key === moduleTopicSectionKey)
    const subsection = (section?.subsections || []).find(sub => sub.key === moduleTopicSubsectionKey)
    return {
      section_key: moduleTopicSectionKey,
      section_label: section?.label || '',
      subsection_key: moduleTopicSubsectionKey,
      subsection_label: subsection?.label || '',
    }
  }

  // ── Topic source (locked once confirmed) ─────────────────────────────────
  async function handleConfirmTopicSource() {
    if (!courseId) return
    if (!moduleTopicSectionKey) {
      setTopicSourceError('Choose the syllabus section that holds the topics for your modules.')
      return
    }
    setTopicSourceSaving(true)
    setTopicSourceError('')
    try {
      const { data } = await api.patch(`/curriculum/course/${courseId}/module-topic/`, {
        section_key: moduleTopicSectionKey,
        subsection_key: moduleTopicSubsectionKey,
      })
      setModuleTopicConfirmed(true)
      setModuleTopicSectionKey(data.module_topic_section_key || moduleTopicSectionKey)
      setModuleTopicSubsectionKey(data.module_topic_subsection_key || '')
      setTopicSourceDialogOpen(false)
      setTopicSourceNoticeOpen(true)
      workspaceApi.execute()
    } catch (err) {
      setTopicSourceError(extractApiError(err))
    } finally {
      setTopicSourceSaving(false)
    }
  }

  // ── Generate dialog ──────────────────────────────────────────────────────
  function openGenerateDialog(mode, topic) {
    setGenerateDialogMode(mode)
    setModuleParams(p => ({
      ...p,
      module_title: mode === 'single' && topic ? topic.topic : '',
      week_number: mode === 'single' && topic ? topic.week : '',
      topic_id: mode === 'single' && topic ? topic.id : '',
    }))
    setGenerateDialogOpen(true)
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function presentGeneratedModule(data) {
    const content = data.module_content || {}
    const subtopics = Array.isArray(content.subtopics) ? content.subtopics : []
    const hasActivity = Boolean(content.short_activity && (content.short_activity.title || content.short_activity.description))
    const total = 2 + subtopics.length + (hasActivity ? 1 : 0)
    const shown = {
      module_number: content.module_number,
      module_title: content.module_title || data.module_title,
      introduction: content.introduction || '',
      learning_objectives: [],
      subtopics: [],
      short_activity: null,
    }
    setSelectedModule({
      module_id: data.module_id,
      module_title: data.module_title,
      week_number: data.week_number,
      status: 'Generated',
    })
    setModuleContent(shown)
    setModuleContentDirty(false)
    setExpandedSubtopics(new Set())
    setChatMessages([])
    setModuleGenProgress({
      label: 'Building the module',
      detail: 'Introduction',
      completed: 1,
      total,
    })
    await wait(320)
    shown.learning_objectives = Array.isArray(content.learning_objectives) ? content.learning_objectives : []
    setModuleContent({ ...shown, learning_objectives: [...shown.learning_objectives] })
    setModuleGenProgress({
      label: 'Building the module',
      detail: 'Learning objectives',
      completed: 2,
      total,
    })
    let completed = 2
    for (const subtopic of subtopics) {
      await wait(320)
      shown.subtopics = [...shown.subtopics, subtopic]
      setModuleContent({ ...shown, subtopics: [...shown.subtopics] })
      if (subtopic?.id) setExpandedSubtopics(prev => new Set(prev).add(subtopic.id))
      completed += 1
      setModuleGenProgress({
        label: 'Building the module',
        detail: subtopic?.title || 'Subtopic',
        completed,
        total,
      })
    }
    if (hasActivity) {
      await wait(320)
      shown.short_activity = content.short_activity
      setModuleContent({ ...shown })
      setModuleGenProgress({
        label: 'Building the module',
        detail: content.short_activity.title || 'Short activity',
        completed: total,
        total,
      })
    }
  }

  async function handleGenerateModule() {
    if (!course || actionLoading) return
    const params = { ...moduleParams }
    const week = Number(params.week_number) || 1
    setGenerateDialogOpen(false)
    setActionError('')
    setActionLoading(true)
    setResultText('')
    setModuleGenProgress({
      label: 'Building the module',
      detail: params.module_title || 'Preparing the first section…',
      completed: 0,
      total: 0,
    })
    setModuleGeneratingTopic(prev => new Set(prev).add(week))
    try {
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : []
      const topics = collectScheduleTopics()
      const topic = topics.find(
        item => item.id === params.topic_id || item.topic === params.module_title,
      )
      const source = lectureTopicSource()
      const { data } = await api.post('/curriculum/generate-module/', {
        course_id: course.course_id,
        course_name: course.course_title,
        module_title: params.module_title,
        week_number: week,
        section_key: source.section_key,
        section_label: source.section_label,
        subsection_key: source.subsection_key,
        subsection_label: source.subsection_label,
        topic: topic?.topic || params.module_title,
        syllabus_context: topic?.context || '',
        structuring_level: params.structuring_level || 'standard',
        provider: params.provider,
        top_k: Number(params.top_k),
        extra_instructions: params.extra_instructions,
        selected_doc_ids: selectedIds,
      }, { timeout: 300000 })
      if (data.success && data.module_content) {
        await presentGeneratedModule(data)
        workspaceApi.execute()
        notifyGenerationComplete('Module', data.module_title || params.module_title)
      }
    } catch (err) { setActionError(extractApiError(err)) }
    finally {
      setActionLoading(false)
      setModuleGenProgress(null)
      setModuleGeneratingTopic(prev => { const next = new Set(prev); next.delete(week); return next })
    }
  }

  async function handleGenerateAllModules() {
    if (!course || moduleGeneratingAll) return
    const topics = collectScheduleTopics()
    if (!topics.length) {
      setGenerateDialogOpen(false)
      setActionError('No Lecture/Discussion topics in Teaching, Learning, and Assessment (TLA) Activities. Set Delivery Method to Lecture/Discussion and add a topic list. Reading lists are not topics.')
      return
    }
    const source = lectureTopicSource()
    const existingModules = workspaceApi.data?.modules || []
    const topicsWithoutModules = topics.filter(topic => {
      const existing = existingModules.find(mod => mod.week_number === topic.week)
      if (!existing) return true
      return deletedModuleIds.has(String(existing.module_id))
    })
    setGenerateDialogOpen(false)
    if (!topicsWithoutModules.length) {
      setActionError('Every Lecture/Discussion week already has a module.')
      return
    }
    setModuleGeneratingAll(true)
    setActionError('')
    setModuleGenProgress({
      label: 'Generating modules',
      detail: 'Starting…',
      completed: 0,
      total: topicsWithoutModules.length,
    })
    try {
      let completed = 0
      for (const topic of topicsWithoutModules) {
        const week = topic.week
        setModuleGeneratingTopic(prev => new Set(prev).add(week))
        setModuleGenProgress({
          label: 'Generating modules',
          detail: `Week ${week}: ${topic.topic}`,
          completed,
          total: topicsWithoutModules.length,
        })
        try {
          const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : []
          await api.post('/curriculum/generate-module/', {
            course_id: course.course_id,
            course_name: course.course_title,
            module_title: topic.topic,
            week_number: week,
            section_key: source.section_key,
            section_label: source.section_label,
            subsection_key: source.subsection_key,
            subsection_label: source.subsection_label,
            topic: topic.topic,
            syllabus_context: topic.context || '',
            structuring_level: moduleParams.structuring_level || 'standard',
            provider: moduleParams.provider || 'auto',
            top_k: Number(moduleParams.top_k) || 5,
            extra_instructions: moduleParams.extra_instructions || '',
            selected_doc_ids: selectedIds,
          }, { timeout: 300000 })
          completed += 1
          setModuleGenProgress({
            label: 'Generating modules',
            detail: `Week ${week} added`,
            completed,
            total: topicsWithoutModules.length,
          })
          await workspaceApi.execute()
        } catch (err) {
          setActionError(extractApiError(err))
        } finally {
          setModuleGeneratingTopic(prev => { const next = new Set(prev); next.delete(week); return next })
        }
      }
      notifyGenerationComplete('Modules', `${topicsWithoutModules.length} module${topicsWithoutModules.length === 1 ? '' : 's'} generated`)
    } finally {
      setModuleGeneratingAll(false)
      setModuleGenProgress(null)
    }
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
      markStepDone('module', true)
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
        notifyGenerationComplete('Subtopic', subtopicTitle)
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
    const assessmentType = 'Major Examination'
    const totalItems = Number(selectedExam?.totalItems || 0)

    return {
      hasMajorExam: Boolean(selectedExam),
      assessmentName,
      assessmentType,
      totalItems,
      examCode: selectedExam?.examCode || '',
      sourceTaskLabel: selectedExam?.examLabel || '',
      sourceMode: selectedExam ? 'TOS Major Examination' : 'No Major TOS Exam Found',
      selectedExam: selectedExam || null,
    }
  }

  function getSectionTosBloomDistribution(sectionTitle) {
    const blueprint = getAssessmentBlueprint()
    const majorExams = getMajorTosExams()
    const selectedExam = majorExams.find(exam =>
      (exam.examCode && exam.examCode === blueprint.examCode)
      || (exam.examLabel && exam.examLabel === blueprint.assessmentName)
    ) || majorExams[0]
    if (!selectedExam) return {}

    const normalizedSection = String(sectionTitle || '').trim().toLowerCase()
    const row = (selectedExam.topics || []).find(topic => {
      const topicName = String(topic?.topic || topic?.label || '').trim().toLowerCase()
      return topicName === normalizedSection
    })
    if (!row) return {}

    const bloomKeys = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    const distribution = {}
    for (const key of bloomKeys) {
      const count = Number(row?.bloom_items?.[key] || 0)
      if (count > 0) {
        distribution[key.charAt(0).toUpperCase() + key.slice(1)] = count
      }
    }
    return distribution
  }

  function getTosBloomLevels() {
    const blueprint = getAssessmentBlueprint()
    const majorExams = getMajorTosExams()
    const selectedExam = majorExams.find(exam =>
      (exam.examCode && exam.examCode === blueprint.examCode)
      || (exam.examLabel && exam.examLabel === blueprint.assessmentName)
    ) || majorExams[0]
    if (!selectedExam) return ['Remember']

    const levels = new Set()
    const bloomKeys = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    for (const topic of selectedExam.topics || []) {
      for (const key of bloomKeys) {
        if (Number(topic?.bloom_items?.[key] || 0) > 0) {
          levels.add(key.charAt(0).toUpperCase() + key.slice(1))
        }
      }
    }
    return levels.size > 0 ? Array.from(levels) : ['Remember']
  }

  function formatAssessmentId(id) {
    const raw = String(id || '').trim()
    if (!raw) return ''
    if (raw.length <= 10) return raw
    return `${raw.slice(0, 6)}...${raw.slice(-4)}`
  }

  async function copyAssessmentId(id) {
    const raw = String(id || '').trim()
    if (!raw) return
    try {
      await navigator.clipboard.writeText(raw)
      setCopiedAssessmentId(raw)
      setTimeout(() => setCopiedAssessmentId(prev => (prev === raw ? '' : prev)), 1500)
    } catch {
      // no-op
    }
  }

  function getSelectedExamDisplayName() {
    if (assessmentDetail?.title) return assessmentDetail.title
    const blueprint = getAssessmentBlueprint()
    const total = assessmentDetail?.target_total_items || blueprint.totalItems
    const base = blueprint.assessmentName || 'Major Examination'
    return total ? `${base} (${total} items)` : base
  }

  // Topics of the generated modules — the assessment source for every assessment.
  function assessmentModuleTopics() {
    const seen = new Set()
    return (workspaceApi.data?.modules || [])
      .filter(mod => !deletedModuleIds.has(String(mod.module_id)))
      .map(mod => ({ topic: String(mod.module_title || '').trim(), week: mod.week_number || null }))
      .filter(item => item.topic && !seen.has(item.topic) && seen.add(item.topic))
  }

  function findMatchingModuleForTopic(topic) {
    const topicText = String(topic || '').trim()
    if (!topicText) return null
    const modules = assessmentModuleTopics()
    const exact = modules.find(module => module.topic.toLowerCase() === topicText.toLowerCase())
    if (exact) return exact
    const topicTokens = tosTokenize(topicText)
    let best = null
    for (const module of modules) {
      const score = tosJaccard(topicTokens, tosTokenize(module.topic))
      if (!best || score > best.score) best = { ...module, score }
    }
    return best && best.score >= 0.12 ? best : null
  }

  // TOS is the assessment authority. Generated modules are used to confirm and display
  // which weekly module covers each TOS topic.
  function assessmentGenAvailableTopics() {
    const blueprint = getAssessmentBlueprint()
    const topics = blueprint.selectedExam?.topics || []
    return topics
      .map(row => {
        const topic = String(row?.topic || row?.label || '').trim()
        const module = findMatchingModuleForTopic(topic)
        return { topic, week: module?.week || null, moduleTitle: module?.topic || '' }
      })
      .filter(item => item.topic)
  }

  function toggleAssessmentGenTopic(topic) {
    if (assessmentGenMode === 'single') {
      setAssessmentGenSelectedTopics([topic])
      return
    }
    setAssessmentGenSelectedTopics(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    )
  }

  function examSelectValue(exam) {
    if (!exam) return ''
    return `${exam.examCode || ''}::${exam.examLabel || ''}`
  }

  function applyAssessmentGenExam(exam, { clearTopics = true } = {}) {
    if (!exam) return
    setAssessmentParams(prev => ({
      ...prev,
      source_exam_code: exam.examCode || '',
      source_exam_label: exam.examLabel || '',
      target_total_items: exam.totalItems || 0,
      assessment_type: 'Major Examination',
    }))
    setAssessmentGenTitle(exam.examLabel || 'Assessment')
    setAssessmentGenItemCount(Math.max(1, Number(exam.totalItems || 1)))
    if (clearTopics) setAssessmentGenSelectedTopics([])
  }

  function openAssessmentGenDialog(mode, prefillTopic) {
    const majorExams = getMajorTosExams()
    const blueprint = getAssessmentBlueprint()
    const selectedExam = blueprint.selectedExam || majorExams[0] || null
    setAssessmentGenMode(mode)
    if (selectedExam) {
      setAssessmentParams(prev => ({
        ...prev,
        source_exam_code: selectedExam.examCode || '',
        source_exam_label: selectedExam.examLabel || '',
        target_total_items: selectedExam.totalItems || 0,
      }))
    }
    setAssessmentGenTitle(selectedExam?.examLabel || 'Assessment')
    setAssessmentGenItemCount(Math.max(1, Number(selectedExam?.totalItems || blueprint.totalItems || 50)))
    if (mode === 'single' && prefillTopic) {
      setAssessmentGenSelectedTopics([prefillTopic])
    } else {
      setAssessmentGenSelectedTopics([])
    }
    setAssessmentGenDialogOpen(true)
  }

  function plannedAssessmentItemCount(selectedTopics) {
    const exam = getAssessmentBlueprint().selectedExam
    if (!exam) return Math.max(0, Number(assessmentGenItemCount || 0))
    const selected = new Set((selectedTopics || []).map(topic => String(topic || '').trim().toLowerCase()))
    const bloomKeys = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
    let total = 0
    for (const row of exam.topics || []) {
      const name = String(row?.topic || row?.label || '').trim().toLowerCase()
      if (selected.size > 0 && !selected.has(name)) continue
      const bloom = row?.bloom_items || {}
      const bloomSum = bloomKeys.reduce((sum, key) => sum + (Number(bloom?.[key]) || 0), 0)
      if (bloomSum > 0) total += bloomSum
      else total += Number(row?.total_points) || Number(row?.weight) || 0
    }
    if (total > 0) return total
    return Number(exam.totalItems || 0)
  }

  async function handleAssessmentGenSubmit() {
    if (!course) return
    const blueprint = getAssessmentBlueprint()
    if (assessmentGenSelectedTopics.length === 0) {
      setActionError('Select at least one TOS topic for the assessment.')
      return
    }
    const plannedHint = plannedAssessmentItemCount(assessmentGenSelectedTopics)
    const selectedTopics = [...assessmentGenSelectedTopics]
    const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : []
    setAssessmentGenDialogOpen(false)
    setActionLoading(true)
    setActionError('')
    setAssessmentBatchProgress({ generated: 0, requested: plannedHint })
    let assessmentId = null
    let latestSummary = null
    let generated = 0
    let planned = plannedHint
    let stalls = 0
    try {
      for (let step = 0; step < 80 && stalls < 2; step += 1) {
        setAssessmentBatchProgress({
          generated,
          requested: planned,
          detail: generated > 0
            ? `Writing the next items after ${generated}…`
            : 'Preparing the assessment items…',
        })
        const { data } = await api.post('/curriculum/generate-assessment/', {
          course_id: course.course_id,
          assessment_type: blueprint.hasMajorExam ? 'Major Examination' : (assessmentGenTitle || 'Assessment'),
          provider: 'auto',
          extra_instructions: '',
          selected_doc_ids: selectedIds,
          source_exam_code: blueprint.examCode,
          source_exam_label: blueprint.assessmentName || assessmentGenTitle,
          faculty_topics: selectedTopics,
          total_items: blueprint.hasMajorExam ? undefined : assessmentGenItemCount,
          incremental: true,
          assessment_id: assessmentId || undefined,
        }, { timeout: 300000 })
        assessmentId = data?.assessment?.assessment_id || assessmentId
        latestSummary = data?.assessment || latestSummary
        const returnedNow = Array.isArray(data?.items)
          ? data.items.length
          : Number(data?.returned_count ?? data?.batch_generated ?? 0)
        const savedCount = Number(data?.generated_count)
        const nextPlanned = Number(data?.total_items || planned || 0)
        if (!Number.isFinite(returnedNow) || returnedNow <= 0) stalls += 1
        else stalls = 0
        if (Number.isFinite(savedCount) && savedCount >= 0) generated = savedCount
        else if (Number.isFinite(returnedNow) && returnedNow > 0) generated += returnedNow
        planned = nextPlanned > 0 ? nextPlanned : planned
        setAssessmentBatchProgress({
          generated,
          requested: planned,
          detail: data?.completed
            ? `${generated} of ${planned || generated} items ready`
            : `Writing the next items after ${generated}…`,
        })
        if (latestSummary?.assessment_id && generated > 0) {
          refreshAssessmentItems(latestSummary).catch(() => {})
        }
        if (data?.completed || (planned > 0 && generated >= planned)) break
        if (!data?.success && generated === 0) {
          throw new Error(data?.detail || 'Assessment generation failed.')
        }
      }
      if (latestSummary?.assessment_id) {
        setAssessmentSessionId(latestSummary.assessment_id)
        await handleOpenAssessment(latestSummary)
      }
      workspaceApi.execute()
      if (generated > 0) {
        markStepDone('assessment', true)
        notifyGenerationComplete('Assessment', assessmentGenTitle || 'Assessment')
      }
      if (planned > 0 && generated < planned) {
        setActionError(`Generated ${generated} of ${planned} items. The remaining items still need another try.`)
      } else if (generated === 0) {
        setActionError('Assessment generation did not return any items. Please try again.')
      }
    } catch (err) {
      const payload = err?.response?.data
      if (payload?.assessment?.assessment_id) {
        await handleOpenAssessment(payload.assessment)
      }
      const got = Number(payload?.generated_count || generated || 0)
      const total = Number(payload?.total_items || planned || 0)
      setActionError(
        got > 0 && total > 0
          ? `Generated ${got} of ${total} items. ${payload?.detail || 'Generation stopped early.'}`
          : (extractApiError(err) || err?.message || 'Assessment generation failed.')
      )
    } finally {
      setActionLoading(false)
      setAssessmentBatchProgress(null)
    }
  }

  async function handleGenerateAssessment() {
    if (!course) return

    const blueprint = getAssessmentBlueprint()
    if (!blueprint.hasMajorExam) {
      setActionError('No major examination found in TOS. Add a major exam (e.g., Midterm/Final) with total items first.')
      return
    }

    const startItemNumber = Number(assessmentParams.target_item_number || 0)
    if (!Number.isFinite(startItemNumber) || startItemNumber < 1) {
      setActionError('Target item number must be at least 1.')
      return
    }
    if (blueprint.totalItems > 0 && startItemNumber > blueprint.totalItems) {
      setActionError(`Target item number must be between 1 and ${blueprint.totalItems}.`)
      return
    }

    const relatedItemNumber = Number(assessmentParams.related_item_number || 0)
    if (relatedItemNumber && relatedItemNumber === startItemNumber) {
      setActionError('Related item number cannot be the same as target item number.')
      return
    }

    const requestedBatchCount = Number(assessmentParams.item_batch_count || 1)
    const safeBatchCount = Math.max(1, Number.isFinite(requestedBatchCount) ? requestedBatchCount : 1)

    setActionError('')
    setActionLoading(true)
    setAssessmentBatchProgress({ generated: 0, requested: safeBatchCount })

    try {
      const selectedIds = selectedDocIds.size > 0 ? [...selectedDocIds] : []
      const facultyTopics = parseFacultyTopics(assessmentParams.faculty_topics)

      let generatedSoFar = 0
      let nextTargetNumber = startItemNumber
      let latestAssessmentId = assessmentSessionId || null
      let latestAssessmentSummary = null
      let stopLoop = false

      while (!stopLoop && generatedSoFar < safeBatchCount) {
        const { data } = await api.post('/curriculum/generate-assessment/', {
          course_id: course.course_id,
          assessment_type: 'Major Examination',
          provider: assessmentParams.provider,
          extra_instructions: assessmentParams.extra_instructions,
          selected_doc_ids: selectedIds,
          source_exam_code: blueprint.examCode,
          source_exam_label: blueprint.assessmentName,
          faculty_topics: facultyTopics,
          assessment_id: latestAssessmentId || undefined,
          item_by_item: true,
          item_batch_count: 1,
          target_item_number: nextTargetNumber,
          related_item_number: relatedItemNumber || undefined,
          relation_instruction: assessmentParams.relation_instruction,
          overwrite_item: Boolean(assessmentParams.overwrite_item)
            || (blueprint.totalItems > 0 && Number(assessmentDetail?.total_items || 0) >= blueprint.totalItems),
        }, { timeout: 300000 })

        if (!data?.success) {
          throw new Error(data?.detail || 'Generation failed during batch loop.')
        }

        latestAssessmentSummary = data?.assessment || latestAssessmentSummary
        latestAssessmentId = data?.assessment?.assessment_id || latestAssessmentId

        const newlyGeneratedCount = Number(
          data?.generated_count || (Array.isArray(data?.generated_items) ? data.generated_items.length : 1)
        )
        generatedSoFar += Math.max(1, newlyGeneratedCount)
        if (generatedSoFar > safeBatchCount) generatedSoFar = safeBatchCount

        setAssessmentBatchProgress({ generated: generatedSoFar, requested: safeBatchCount })

        const nextNum = Number(data?.next_item_number || 0)
        const completed = Boolean(data?.completed)

        if (Number.isFinite(nextNum) && nextNum > 0) {
          nextTargetNumber = nextNum
        }

        if (completed || !(Number.isFinite(nextNum) && nextNum > 0)) {
          stopLoop = true
        }
      }

      if (latestAssessmentId) setAssessmentSessionId(latestAssessmentId)

      setAssessmentParams(p => ({
        ...p,
        target_item_number: nextTargetNumber,
        related_item_number: (Number(p.related_item_number || 0) >= nextTargetNumber) ? '' : p.related_item_number,
      }))

      setAssessmentCreating(false)
      workspaceApi.execute()
      markStepDone('assessment', true)
      notifyGenerationComplete('Assessment', getSelectedExamDisplayName())
      if (latestAssessmentSummary?.assessment_id) {
        await handleOpenAssessment(latestAssessmentSummary)
      }
    } catch (err) {
      setActionError(extractApiError(err) || err?.message || 'Assessment generation failed.')
      setAssessmentBatchProgress(null)
    } finally {
      setActionLoading(false)
      setTimeout(() => setAssessmentBatchProgress(null), 1200)
    }
  }

  async function refreshAssessmentItems(assessmentSummary) {
    const { data } = await api.get(`/curriculum/assessment/${assessmentSummary.assessment_id}/`, { timeout: 20000 })
    if (data?.success && data?.assessment) {
      setSelectedAssessment(assessmentSummary)
      setAssessmentDetail(data.assessment)
      setAssessmentSessionId(data.assessment.assessment_id || assessmentSummary.assessment_id)
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
        // Fetch linked bubble sheet template if one exists
        try {
          const tr = await api.get(`/grading/bubble/templates/?course_id=${courseId}`)
          const templates = tr?.data?.templates || []
          const linked = templates.find(t => t.assessment_id === data.assessment.assessment_id) || null
          setAnswerSheetTemplate(linked)
          if (linked) {
            setAnswerSheetForm({
              name: linked.name || data.assessment.title || 'Answer Sheet',
              num_choices: Number(linked.num_choices || 4),
              num_id_columns: Number(linked.layout_metadata?.num_id_columns || 8),
            })
          }
        } catch { /* ignore — template fetch is non-critical */ }
        const blueprint = getAssessmentBlueprint()
        if (blueprint.examCode || blueprint.assessmentName) {
          setAssessmentParams(p => ({
            ...p,
            source_exam_code: blueprint.examCode || p.source_exam_code,
            source_exam_label: blueprint.assessmentName || p.source_exam_label,
          }))
        }
      }
    } catch (err) {
      setActionError(extractApiError(err))
    }
  }

  async function handleDeleteAssessment(assessmentId) {
    if (!assessmentId) return
    setDeletingAssessmentId(assessmentId)
    setActionError('')
    try {
      const { data } = await api.delete(`/curriculum/assessment/${assessmentId}/`)
      if (data?.success) {
        if (selectedAssessment?.assessment_id === assessmentId) {
          setSelectedAssessment(null)
          setAssessmentDetail(null)
          setAssessmentSessionId(null)
          setAssessmentToolsTab('builder')
          setEditingItemId(null)
          setEditingItemDraft(null)
          setAnswerSheetTemplate(null)
        }
        workspaceApi.execute()
      }
    } catch (err) {
      setActionError(extractApiError(err))
    } finally {
      setDeletingAssessmentId(null)
    }
  }

  function handleStartItemEdit(item) {
    const existingChoices = Array.isArray(item.choices) ? item.choices.slice(0, 4) : []
    const normalizedChoices = [...existingChoices, ...Array(Math.max(0, 4 - existingChoices.length)).fill('')]
    setEditingItemId(item.item_id)
    setEditingItemDraft({
      question_text: item.question_text || '',
      choices: normalizedChoices,
      correct_answer: (item.correct_answer || '').toUpperCase().replace(/[^A-D*]/g, ''),
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
    const normalizedAnswer = rawAnswer ? (rawAnswer.match(/[A-D*]/)?.[0] || '') : ''
    if (rawAnswer && !normalizedAnswer) {
      setActionError('Correct answer must be one of A, B, C, D, or Bonus.')
      return
    }
    if (cleanedChoices.filter(Boolean).length !== 4) {
      setActionError('Provide exactly 4 choices (A-D).')
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

  async function handleRegenerateItemChoices(itemNumber) {
    if (!course) return
    const assessmentId = assessmentSessionId || assessmentDetail?.assessment_id
    if (!assessmentId) {
      setActionError('Open or create an assessment session first.')
      return
    }

    setActionLoading(true)
    setActionError('')
    try {
      const { data } = await api.post('/curriculum/generate-assessment/', {
        course_id: course.course_id,
        assessment_type: 'Major Examination',
        provider: assessmentParams.provider,
        extra_instructions: assessmentParams.extra_instructions,
        source_exam_code: assessmentParams.source_exam_code || getAssessmentBlueprint().examCode,
        source_exam_label: assessmentParams.source_exam_label || getAssessmentBlueprint().assessmentName,
        assessment_id: assessmentId,
        item_by_item: true,
        target_item_number: itemNumber,
        overwrite_item: true,
        regenerate_choices_only: true,
      }, { timeout: 300000 })
      if (data?.success) {
        workspaceApi.execute()
        if (data?.assessment?.assessment_id) {
          await handleOpenAssessment(data.assessment)
        }
      } else {
        setActionError(data?.detail || 'Failed to regenerate choices.')
      }
    } catch (err) {
      setActionError(extractApiError(err))
    } finally {
      setActionLoading(false)
    }
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
    if (choices.filter(Boolean).length !== 4) {
      setActionError('Provide exactly 4 choices (A-D) for the manual item.')
      return
    }

    setActionLoading(true)
    setActionError('')
    try {
      const targetItemNumber = Number(assessmentParams.target_item_number || 0)
      const relatedItemNumber = Number(assessmentParams.related_item_number || 0)
      const payload = {
        course_id: course.course_id,
        assessment_type: 'Major Examination',
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

      const { data } = await api.post('/curriculum/generate-assessment/', payload, { timeout: 300000 })
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
    const explicitTarget = Number(assessmentDetail?.target_total_items || 0)
    const inferredTarget = blueprint.totalItems > 0 ? blueprint.totalItems : null
    const targetTotal = explicitTarget > 0 ? explicitTarget : inferredTarget
    const currentCount = Number(assessmentDetail?.total_items || 0)
    const remainingCount = targetTotal !== null ? Math.max(0, targetTotal - currentCount) : null
    const canAddItems = targetTotal === null || currentCount < targetTotal
    const isAtMax = targetTotal !== null && currentCount >= targetTotal
    const targetItemValue = Number(assessmentParams.target_item_number || currentCount + 1 || 1)
    const relatedOptions = Array.from({ length: Math.max(0, targetItemValue - 1) }, (_, idx) => String(idx + 1))
    const maxTargetValue = targetTotal || undefined

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
                {currentCount}/{targetTotal !== null ? targetTotal : '—'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#777', display: 'block', mt: 0.25, fontSize: '0.68rem' }}>
                {targetTotal !== null ? `${remainingCount} item${remainingCount === 1 ? '' : 's'} left` : 'Add items until completed'}
              </Typography>
              {isAtMax && (
                <Typography variant="caption" sx={{ color: MAROON, display: 'block', mt: 0.5, fontSize: '0.66rem', fontWeight: 700 }}>
                  All items generated ({currentCount}/{targetTotal}). Use Regenerate or manually edit existing items.
                </Typography>
              )}
            </Box>

            <Box sx={{ p: 1.1, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 1.5, bgcolor: '#1A1A1F' }}>
              <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.68rem', mb: 0.35 }}>
                Major Examination
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#222', lineHeight: 1.35, wordBreak: 'break-word', whiteSpace: 'normal' }}>
                {getSelectedExamDisplayName()}
              </Typography>
            </Box>

            <LField
              type="number"
              label="Items to Generate"
              value={assessmentParams.item_batch_count}
              onChange={e => setAssessmentParams(p => ({ ...p, item_batch_count: e.target.value }))}
              inputProps={{ min: 1 }}
            />
            <LField
              type="number"
              label="Starting Item Number"
              value={assessmentParams.target_item_number}
              onChange={e => setAssessmentParams(p => ({ ...p, target_item_number: e.target.value }))}
              inputProps={{ min: 1, max: maxTargetValue }}
            />
            <LField
              select
              label="Related to Item (optional)"
              value={assessmentParams.related_item_number}
              onChange={e => setAssessmentParams(p => ({ ...p, related_item_number: e.target.value }))}
              SelectProps={{
                renderValue: selected => (selected ? `Item ${selected}` : 'None'),
              }}
            >
              <MenuItem value="">None</MenuItem>
              {relatedOptions.map(n => (
                <MenuItem key={`right-related-${n}`} value={String(n)}>
                  Item {n}
                </MenuItem>
              ))}
            </LField>

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

            {assessmentBatchProgress && (
              <Box sx={{ p: 1, border: '1px solid rgba(21,128,61,0.18)', borderRadius: 1.25, bgcolor: MAROON_LIGHT }}>
                <Typography variant="caption" sx={{ color: MAROON, fontWeight: 700, display: 'block' }}>
                  {assessmentBatchProgress.generated}/{assessmentBatchProgress.requested} items are generated. {assessmentBatchProgress.detail || 'Still generating...'}
                </Typography>
              </Box>
            )}

            <GenButton
              onClick={handleGenerateAssessment}
              disabled={actionLoading}
            >
              {actionLoading
                ? 'Generating…'
                : !canAddItems && isAtMax
                  ? 'Regenerate Item (Overwrite)'
                  : !canAddItems
                    ? 'Assessment Complete'
                    : 'Generate Items'}
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
                {currentCount}/{targetTotal || currentCount || 0}
              </Typography>
            </Box>

            <LField
              type="number"
              label="Target Item Number"
              value={assessmentParams.target_item_number}
              onChange={e => setAssessmentParams(p => ({ ...p, target_item_number: e.target.value }))}
              inputProps={{ min: 1, max: maxTargetValue }}
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
                {getTosBloomLevels().map(level => (
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

            {isAtMax ? (
              <Typography variant="caption" sx={{ color: '#666', fontStyle: 'italic' }}>
                Item limit reached ({currentCount}/{targetTotal}). Edit existing items above or use Builder → Regenerate to overwrite.
              </Typography>
            ) : (
              <GenButton onClick={handleAddManualAssessmentItem} disabled={actionLoading || !canAddItems}>
                {actionLoading ? 'Saving…' : canAddItems ? 'Add Manual Item' : 'Assessment Complete'}
              </GenButton>
            )}
          </Stack>
        )}

        {assessmentToolsTab === 'sources' && renderUploadPanel()}
      </Stack>
    )
  }

  async function handleExportAssessmentDocx({ includeChoices = true, includeAnswerKey = false } = {}) {
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
      formData.append('include_choices', includeChoices ? 'true' : 'false')
      formData.append('include_answer_key', includeAnswerKey ? 'true' : 'false')

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

  async function handleViewBubbleSheet() {
    setBubbleSheetPreviewLoading(true)
    setActionError('')
    try {
      if (!answerSheetTemplate?.template_id) {
        setActionError('No answer sheet template exists yet. Create one first.')
        return
      }
      const pdfR = await api.post(
        `/grading/bubble/templates/${answerSheetTemplate.template_id}/generate-pdf/`,
        {},
        { responseType: 'blob' }
      )
      setBubbleSheetPreviewUrl(URL.createObjectURL(pdfR.data))
      setBubbleSheetPreviewTitle(answerSheetTemplate.name)
      setBubbleSheetPreviewOpen(true)
    } catch (err) {
      setActionError(extractApiError(err) || 'Failed to load bubble sheet preview.')
    } finally {
      setBubbleSheetPreviewLoading(false)
    }
  }

  async function handleOpenAnswerSheetDialog() {
    if (!courseId || !assessmentDetail?.assessment_id) return
    setAnswerSheetDialogOpen(true)
    setAnswerSheetLoading(true)
    setActionError('')
    try {
      const r = await api.get(`/grading/bubble/templates/?course_id=${courseId}`)
      const templates = r?.data?.templates || []
      const linked = templates.find(t => t.assessment_id === assessmentDetail.assessment_id) || null
      setAnswerSheetTemplate(linked)
      setAnswerSheetForm({
        name: linked?.name || `${assessmentDetail.title || 'Assessment'} Answer Sheet`,
        num_choices: Number(linked?.num_choices || 4),
        num_id_columns: Number(linked?.layout_metadata?.num_id_columns || 8),
      })
    } catch (err) {
      setActionError(extractApiError(err) || 'Failed to load answer sheet template.')
    } finally {
      setAnswerSheetLoading(false)
    }
  }

  function handleModifyBubbleSheet(template) {
    setAnswerSheetTemplate(template)
    setAnswerSheetForm({
      name: template?.name || 'Answer Sheet',
      num_choices: Number(template?.num_choices || 4),
      num_id_columns: Number(template?.layout_metadata?.num_id_columns || 8),
    })
    setAnswerSheetDialogOpen(true)
  }

  async function handleSaveAnswerSheet() {
    if (!courseId || !assessmentDetail?.assessment_id) return
    setAnswerSheetSaving(true)
    setActionError('')
    try {
      const payload = {
        name: answerSheetForm.name,
        total_items: Number(assessmentDetail.target_total_items || 0),
        num_choices: Number(answerSheetForm.num_choices),
        has_essay: false,
        essay_lines: 0,
        layout_metadata: {
          num_id_columns: Number(answerSheetForm.num_id_columns),
        },
      }
      if (answerSheetTemplate?.template_id) {
        // Update existing template
        const r = await api.patch(
          `/grading/bubble/templates/${answerSheetTemplate.template_id}/`,
          payload
        )
        setAnswerSheetTemplate(r?.data?.template || null)
      } else {
        // Create new template
        const r = await api.post('/grading/bubble/templates/', {
          ...payload,
          course_id: courseId,
          assessment_id: assessmentDetail.assessment_id,
        })
        setAnswerSheetTemplate(r?.data?.template || null)
      }
      setAnswerSheetDialogOpen(false)
    } catch (err) {
      setActionError(extractApiError(err) || 'Failed to save answer sheet.')
    } finally {
      setAnswerSheetSaving(false)
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
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300000,
      })
      setUploadProgress(100)
      setUploadStatus('Uploaded. Indexing runs in the background — the file shows COMPLETED below when it is ready.')
      setUploadSuccess(data?.message || 'File uploaded successfully.')
      setUploadFile(null)
      docsApi.execute()
    } catch (err) {
      setUploadProgress(0); setUploadStatus(''); setUploadError(extractApiError(err))
    } finally { setUploading(false) }
  }

  function updateConfiguredTable(sectionKey, fieldKey, updateRows) {
    setIsDirty(true)
    setSaveSuccess(false)
    setSyllabusData(current => {
      const tableRows = current.custom_tables?.[sectionKey]?.[fieldKey] || []
      return {
        ...current,
        custom_tables: {
          ...(current.custom_tables || {}),
          [sectionKey]: {
            ...(current.custom_tables?.[sectionKey] || {}),
            [fieldKey]: updateRows(tableRows),
          },
        },
      }
    })
  }

  function renderConfiguredTable(sectionKey, fieldKey, title, columns, columnGroups = [], readOnly = false) {
    const storedRows = syllabusData.custom_tables?.[sectionKey]?.[fieldKey]
    const tableRows = Array.isArray(storedRows) ? storedRows : []
    const groupHeaders = []
    for (let index = 0; index < columns.length;) {
      const label = String(columnGroups[index] || '').trim()
      let end = index + 1
      if (label) {
        while (end < columns.length && String(columnGroups[end] || '').trim() === label) end++
      }
      groupHeaders.push({ label, span: end - index })
      index = end
    }
    const hasGroupHeaders = groupHeaders.some(group => group.label)
    return (
      <SectionCard title={title}>
        <Stack spacing={1}>
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={`${title} table`}>
              <TableHead>
                {hasGroupHeaders && (
                  <TableRow>
                    {groupHeaders.map((group, index) => (
                      <TableCell
                        key={index}
                        colSpan={group.span}
                        sx={{ fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}
                      >
                        {group.label}
                      </TableCell>
                    ))}
                    <TableCell aria-label="Row actions" />
                  </TableRow>
                )}
                <TableRow>
                  {columns.map((column, index) => (
                    <TableCell key={index} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {column}
                    </TableCell>
                  ))}
                  <TableCell aria-label="Row actions" />
                </TableRow>
              </TableHead>
              <TableBody>
                {!tableRows.length && (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1} sx={{ color: 'text.secondary', textAlign: 'center' }}>
                      No rows yet. Add a row to start.
                    </TableCell>
                  </TableRow>
                )}
                {tableRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {columns.map((_, columnIndex) => (
                      <TableCell key={columnIndex} sx={{ minWidth: 160 }}>
                        {readOnly ? (
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{row[columnIndex] || ' '}</Typography>
                        ) : (
                          <TextField
                            size="small"
                            fullWidth
                            value={row[columnIndex] || ''}
                            inputProps={{ 'aria-label': `${columns[columnIndex]}, row ${rowIndex + 1}` }}
                            onChange={event => updateConfiguredTable(sectionKey, fieldKey, currentRows => {
                              const nextRows = currentRows.map(cells => [...cells])
                              nextRows[rowIndex][columnIndex] = event.target.value
                              return nextRows
                            })}
                          />
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      {!readOnly && (
                        <IconButton
                          size="small"
                          aria-label={`Remove row ${rowIndex + 1}`}
                          onClick={() => updateConfiguredTable(sectionKey, fieldKey, currentRows => currentRows.filter((_, index) => index !== rowIndex))}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!readOnly && (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => updateConfiguredTable(sectionKey, fieldKey, currentRows => [
                ...currentRows,
                Array(columns.length).fill(''),
              ])}
              sx={{ alignSelf: 'flex-start', textTransform: 'none', color: MAROON }}
            >
              Add row
            </Button>
          )}
          {readOnly && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Fixed by your institution
            </Typography>
          )}
        </Stack>
      </SectionCard>
    )
  }

  function renderConfiguredSubsections() {
    if (!activeConfiguredSection) return null
    const subsections = Array.isArray(activeConfiguredSection.subsections)
      ? activeConfiguredSection.subsections
      : []
    const sectionLocked = Boolean(activeConfiguredSection.is_static)
    if (!activeConfiguredSection.table_enabled && !subsections.length) return null

    return (
      <>
        {activeConfiguredSection.table_enabled
          && Array.isArray(activeConfiguredSection.table_columns)
          && activeConfiguredSection.table_columns.length > 0
          && renderConfiguredTable(
            activeConfiguredSection.key,
            '__section__',
            `${activeConfiguredSection.label} table`,
            activeConfiguredSection.table_columns,
            activeConfiguredSection.table_column_groups,
            sectionLocked,
          )}
        {subsections.map((subsection, index) => {
          const locked = sectionLocked || Boolean(subsection.is_static)
          return subsection.table_enabled
            ? Array.isArray(subsection.table_columns) && subsection.table_columns.length > 0
              && renderConfiguredTable(
                activeConfiguredSection.key,
                subsection.key,
                subsection.label || `Subsection ${index + 1}`,
                subsection.table_columns,
                subsection.table_column_groups,
                locked,
              )
            : <SectionCard key={subsection.key || index} title={subsection.label || `Subsection ${index + 1}`}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label={subsection.label || `Subsection ${index + 1}`}
                  required={Boolean(subsection.required) && !locked}
                  disabled={locked}
                  helperText={locked ? 'Fixed by your institution' : undefined}
                  value={locked
                    ? (subsection.static_content || syllabusData.custom_subsections?.[activeConfiguredSection.key]?.[subsection.key] || '')
                    : (syllabusData.custom_subsections?.[activeConfiguredSection.key]?.[subsection.key] || '')}
                  onChange={locked ? undefined : event => {
                    setIsDirty(true)
                    setSaveSuccess(false)
                    setSyllabusData(current => ({
                      ...current,
                      custom_subsections: {
                        ...(current.custom_subsections || {}),
                        [activeConfiguredSection.key]: {
                          ...(current.custom_subsections?.[activeConfiguredSection.key] || {}),
                          [subsection.key]: event.target.value,
                        },
                      },
                    }))
                  }}
                  sx={{ '& .MuiOutlinedInput-root': { backgroundColor: '#fff' } }}
                />
              </SectionCard>
        })}
      </>
    )
  }

  // ── Syllabus section renderer (all editable) ─────────────────────────────
  function renderSyllabusSection(sectionKey = activeSyllabusSectionKey) {
    if (!courseId) return null
    if (workspaceApi.loading && !workspaceApi.data) {
      return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress sx={{ color: MAROON }} /></Box>
    }
    if (workspaceApi.error && !workspaceApi.data) return <AutoAlert message={workspaceApi.error} onClose={() => {}} />
    if (!activeConfiguredSection) {
      return (
        <Paper elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 2.5, p: 3 }}>
          <Typography variant="body2" sx={{ color: '#666' }}>
            Your institution has not configured any syllabus sections yet.
          </Typography>
        </Paper>
      )
    }
    if (sectionKey === 'university-information') {
      return (
        <>
          <SectionCard title="University Direction">
            <SylField rules={fixedFieldRules} fieldKey="vision" label={labelFor('vision', 'Vision')} multiline minRows={3}
              value={syllabusData.vision || ''} onChange={e => setSyl('vision', e.target.value)}
              onFocus={() => setAiField({ section: 'university-information', label: 'Vision', fieldType: 'simple', field: 'vision' })} />
            <Box sx={{ mt: 2 }}>
              <SylField rules={fixedFieldRules} fieldKey="mission" label={labelFor('mission', 'Mission')} multiline minRows={4}
                value={syllabusData.mission || ''} onChange={e => setSyl('mission', e.target.value)}
                onFocus={() => setAiField({ section: 'university-information', label: 'Mission', fieldType: 'simple', field: 'mission' })} />
            </Box>
          </SectionCard>
        </>
      )
    }

    // ── 2. Course Information ────────────────────────────────────────────────
    if (sectionKey === 'course-information') {
      const setRationaleDescription = e => {
        const value = e.target.value
        setSyl('rationale', value)
        setSyl('description', value)
      }
      return (
        <>
          <SectionCard title="Course Identification">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <SylField rules={fixedFieldRules} fieldKey="course-title"    label={labelFor('course-title', 'Course Title')}    value={syllabusData.course_title    || ''} onChange={e => setSyl('course_title',    e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="course-code"     label={labelFor('course-code', 'Course Code')}     value={syllabusData.course_code     || ''} onChange={e => setSyl('course_code',     e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="course-category" label={labelFor('course-category', 'Course Category')} value={syllabusData.course_category || ''} onChange={e => setSyl('course_category', e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="prerequisites"   label={labelFor('prerequisites', 'Pre-requisite(s)')} value={syllabusData.prerequisites  || ''} onChange={e => setSyl('prerequisites',   e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="semester-year"   label={labelFor('semester-year', 'Semester / Year')} value={syllabusData.semester_year   || ''} onChange={e => setSyl('semester_year',   e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="credit-hours"    label={labelFor('credit-hours', 'Credit Hours')}    value={syllabusData.credit_hours    || ''} onChange={e => setSyl('credit_hours',    e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="reference-cmo"   label={labelFor('reference-cmo', 'Reference CMO')}   value={syllabusData.reference_cmo   || ''} onChange={e => setSyl('reference_cmo',   e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="date-prepared"   label={labelFor('date-prepared', 'Date Prepared')}   value={syllabusData.date_prepared   || ''} onChange={e => setSyl('date_prepared',   e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="revision-no"     label={labelFor('revision-no', 'Revision No.')}    value={syllabusData.revision_no     || ''} onChange={e => setSyl('revision_no',     e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="revision-date"   label={labelFor('revision-date', 'Revision Date')}   value={syllabusData.revision_date   || ''} onChange={e => setSyl('revision_date',   e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="period-of-study" label={labelFor('period-of-study', 'Period of Study')} value={syllabusData.period_of_study || ''} onChange={e => setSyl('period_of_study', e.target.value)}
                sx={{ gridColumn: 'span 2' }} />
            </Box>
          </SectionCard>

          <SectionCard title="Course Instructor">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.75 }}>
              <SylField rules={fixedFieldRules} fieldKey="instructor-code"          label={labelFor('instructor-code', '7.1 Code')}                 value={syllabusData.employee_id      || ''} onChange={e => setSyl('employee_id',      e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="instructor-email"         label={labelFor('instructor-email', '7.3 Email')}                value={syllabusData.instructor_email || ''} onChange={e => setSyl('instructor_email', e.target.value)} />
              <SylField rules={fixedFieldRules} fieldKey="instructor-qualification" label={labelFor('instructor-qualification', '7.2 Title / Qualification')} value={syllabusData.education       || ''} onChange={e => setSyl('education',        e.target.value)}
                multiline minRows={2} sx={{ gridColumn: 'span 2' }} />
            </Box>
          </SectionCard>

          <SectionCard title="Course Details">
            <SylField rules={fixedFieldRules} fieldKey="course-rationale-description" label={labelFor('course-rationale-description', 'Course Rationale and Description')} multiline minRows={5}
              value={syllabusData.rationale || ''} onChange={setRationaleDescription}
              onFocus={() => setAiField({ section: 'course-information', label: 'Course Rationale and Description', fieldType: 'simple', field: 'rationale' })} />
            <Box sx={{ mt: 2, maxWidth: 340 }}>
              <SylField rules={fixedFieldRules} fieldKey="contact-hours" label={labelFor('contact-hours', 'Contact Hours')}
                value={syllabusData.contact_hours || ''} onChange={e => setSyl('contact_hours', e.target.value)} />
            </Box>
            <Box sx={{ mt: 2 }}>
              <SylField rules={fixedFieldRules} fieldKey="criteria-for-assessment" label={labelFor('criteria-for-assessment', 'Criteria for Assessment')} multiline minRows={3}
                value={syllabusData.assessment_criteria || ''} onChange={e => setSyl('assessment_criteria', e.target.value)}
                onFocus={() => setAiField({ section: 'course-information', label: 'Criteria for Assessment', fieldType: 'simple', field: 'assessment_criteria' })} />
            </Box>
            <Box sx={{ mt: 2 }}>
              <SylField rules={fixedFieldRules} fieldKey="tla-strategies" label={labelFor('tla-strategies', 'Teaching, Learning, and Assessment Strategies')} multiline minRows={5}
                value={syllabusData.tlas || ''} onChange={e => setSyl('tlas', e.target.value)}
                onFocus={() => setAiField({ section: 'course-information', label: 'Teaching, Learning, and Assessment Strategies', fieldType: 'simple', field: 'tlas' })} />
            </Box>
          </SectionCard>
        </>
      )
    }

    // ── 3. ILO, AT, and References ───────────────────────────────────────────
    if (sectionKey === 'iloat-references') {
      const fixedIloTable = fixedTableFor('iloat-references', 'ilo-table')
      const fixedAtTable = fixedTableFor('iloat-references', 'at-distribution-map')
      const fixedReferenceTable = fixedTableFor('iloat-references', 'books-references')
      const setAssessmentTasks = updater => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => {
          const ats = typeof updater === 'function' ? updater(s.ats || []) : updater
          let next = { ...s, ats }
          if (anyTaskIloChecked(ats) || anyTaskIloChecked(s.ats)) next = withMappedAssessmentCodes(next)
          return syncScheduleMethodsFromTasks(next)
        })
      }
      return (
        <>
          <SectionCard title={titleForTable('iloat-references', 'ilo-table', 'Table 1: Intended Learning Outcomes (ILO)')}
            action={fixedIloTable ? undefined : <AddRowBtn label="Add ILO" onClick={addIlo} />}>
            {fixedIloTable ? <FixedBlueprintTable table={fixedIloTable} /> : (
            <Stack spacing={1.5}>
              {syllabusData.ilos.map((ilo, i) => (
                <Box key={i} sx={{ border: '1px solid rgba(0,0,0,0.07)', borderRadius: 1.5, p: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                    <Chip label={'ILO' + (i + 1)} size="small"
                      sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, flexShrink: 0, height: 22, fontSize: '0.7rem', mt: 0.8 }} />
                    <LField label={`ILO ${i + 1}`} multiline minRows={2}
                      value={ilo} onChange={e => setSylArr('ilos', i, e.target.value)}
                      onFocus={() => setAiField({ section: 'iloat-references', label: `ILO ${i + 1}`, fieldType: 'array', arrField: 'ilos', arrIndex: i })} />
                    <RemoveBtn onClick={() => removeIlo(i)} disabled={syllabusData.ilos.length <= 1} />
                  </Box>
                </Box>
              ))}
            </Stack>
            )}
          </SectionCard>

          {fixedAtTable ? (
            <SectionCard title={titleForTable('iloat-references', 'at-distribution-map', 'Table 2: Assessment Method and Distribution Map')}>
              <FixedBlueprintTable table={fixedAtTable} />
            </SectionCard>
          ) : (
          <>
          <PEAAssessmentCard
            ilos={syllabusData.ilos.map((_, idx) => ({ id: `ILO${idx + 1}` }))}
            ats={syllabusData.ats || []}
            setAts={setAssessmentTasks}
          />
          <AssessmentDistributionMap
            title={titleForTable('iloat-references', 'at-distribution-map', 'Table 2: Assessment Method and Distribution Map')}
            ilos={syllabusData.ilos.map((_, idx) => ({ id: `ILO${idx + 1}` }))}
            ats={syllabusData.ats || []}
            setAts={setAssessmentTasks}
          />
          </>
          )}

          <SectionCard title={titleForTable('iloat-references', 'books-references', 'Table 3: Books and Other References')}
            action={fixedReferenceTable ? undefined : <AddRowBtn label="Add Reference" onClick={() => addSylItem('references', '')} />}>
            {fixedReferenceTable ? <FixedBlueprintTable table={fixedReferenceTable} /> : (
            <Stack spacing={1.25}>
              {syllabusData.references.map((ref, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ color: MAROON, fontWeight: 700, minWidth: 22, flexShrink: 0 }}>{i + 1}.</Typography>
                  <LField label={`Reference ${i + 1}`} value={ref}
                    onChange={e => setSylArr('references', i, e.target.value)}
                    onFocus={() => setAiField({ section: 'iloat-references', label: `Reference ${i + 1}`, fieldType: 'array', arrField: 'references', arrIndex: i })} />
                  <RemoveBtn onClick={() => removeSylItem('references', i)} disabled={syllabusData.references.length <= 1} />
                </Box>
              ))}
            </Stack>
            )}
          </SectionCard>
        </>
      )
    }


    // ── 5. Framework Mapping ─────────────────────────────────────────────────
    if (sectionKey === 'framework-mapping') {
      const fwTabs = [
        { key: 'IGA',  label: 'IGA',  itemsField: 'igas',             codePrefix: 'IGA',  tableKey: 'iga-table',  statementCol: 'Institutional Graduate Attributes (IGA) Statements' },
        { key: 'SO',   label: 'SO',   itemsField: 'student_outcomes', codePrefix: 'SO',   tableKey: 'so-table',   statementCol: 'Student Outcomes (SO) Statements' },
        { key: 'CDIO', label: 'CDIO', itemsField: 'cdio_skills',      codePrefix: 'CDIO', tableKey: 'cdio-table', statementCol: 'CDIO Skills' },
        { key: 'SDG',  label: 'SDG',  itemsField: 'sdg_skills',       codePrefix: 'SDG',  tableKey: 'sdg-table',  statementCol: 'SDG Skills' },
      ]
      const activeFw = fwTabs.find(f => f.key === activeFwKey) || fwTabs[0]
      const fwItems = syllabusData[activeFw.itemsField] || []
      const fixedFwTable = fixedTableFor('framework-mapping', activeFw.tableKey)
      return (
        <SectionCard title="Framework Mapping"
          action={fixedFwTable
            ? <Chip size="small" label="Fixed by institution" sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700 }} />
            : <AddRowBtn label={`Add ${activeFw.key}`} onClick={() => addSylItem(activeFw.itemsField, { ...EMPTY_ATTR, code: `${activeFw.codePrefix}${fwItems.length + 1}` })} />}>
          {/* Tab strip */}
          <Box sx={{ display: 'flex', gap: 0.5, mb: 2, flexWrap: 'wrap', borderBottom: '1px solid rgba(0,0,0,0.07)', pb: 1 }}>
            {fwTabs.map(fw => (
              <Button key={fw.key} size="small" onClick={() => setActiveFwKey(fw.key)}
                variant={fw.key === activeFwKey ? 'contained' : 'outlined'}
                sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25, minWidth: 0,
                  ...(fw.key === activeFwKey
                    ? { bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' } }
                    : { borderColor: MAROON + '55', color: MAROON, '&:hover': { borderColor: MAROON, bgcolor: MAROON_LIGHT } }) }}>
                {fw.key}
              </Button>
            ))}
          </Box>

          {/* Two-column statement table */}
          {fixedFwTable ? <FixedBlueprintTable table={fixedFwTable} /> : (
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...TABLE_TH, minWidth: 90, width: 90 }}>{activeFw.key}</th>
                  <th style={TABLE_TH}>{activeFw.statementCol}</th>
                  <th style={{ ...TABLE_TH, borderRight: 'none', width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {fwItems.map((item, i) => (
                  <tr key={i}>
                    <td style={{ ...TABLE_TD, textAlign: 'center', fontWeight: 700, color: MAROON }}>
                      {inlineInput(item.code, e => setSylArrObj(activeFw.itemsField, i, 'code', e.target.value), 72)}
                    </td>
                    <td style={TABLE_TD}>
                      <textarea
                        value={item.description || ''}
                        onChange={e => setSylArrObj(activeFw.itemsField, i, 'description', e.target.value)}
                        onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.max(e.target.scrollHeight, 34) + 'px' }}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 34) + 'px'; } }}
                        onFocus={() => setAiField({ section: 'framework-mapping', label: `${activeFw.label} ${item.code || i + 1} Statement`, fieldType: 'arrayObj', arrField: activeFw.itemsField, arrIndex: i, arrObjKey: 'description' })}
                        style={{ width: '100%', fontSize: '0.82rem', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, padding: '4px 6px', resize: 'none', overflow: 'visible', outline: 'none', fontFamily: 'inherit', color: '#F0F0F2', background: '#1A1A1F', boxSizing: 'border-box', lineHeight: 1.4, minHeight: '34px' }}
                      />
                    </td>
                    <td style={{ ...TABLE_TD, borderRight: 'none' }}>
                      <RemoveBtn onClick={() => removeSylItem(activeFw.itemsField, i)} disabled={fwItems.length <= 1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          )}
        </SectionCard>
      )
    }

    // ── 7. Mapping of AT ─────────────────────────────────────────────────────
    if (sectionKey === 'mapping-of-at') {
      const iloCount = Math.max(syllabusData.ilos.length, 1)
      const mappedHeaders = frameworkHeaders(syllabusData)
      const soHeaders   = mappedHeaders.so
      const igaHeaders  = mappedHeaders.iga
      const cdioHeaders = mappedHeaders.cdio
      const sdgHeaders  = mappedHeaders.sdg
      const mapRows = (rows, blank) => {
        const out = (rows || []).slice(0, iloCount)
        while (out.length < iloCount) out.push(blank())
        return out
      }
      const soCpaRows   = mapRows(syllabusData.so_cpa_rows, blankSoCpaRow).map(row => ({
        ...row,
        so_vals: valuesForHeaders(syllabusData.so_headers, row.so_vals, soHeaders),
      }))
      const igaRows     = mapRows(syllabusData.iga_rows, blankIgaRow).map(row => ({
        vals: valuesForHeaders(syllabusData.iga_headers, row.vals, igaHeaders),
      }))
      const cdioSdgRows = mapRows(syllabusData.cdio_sdg_rows, blankCdioSdgRow).map(row => ({
        cdio_vals: valuesForHeaders(syllabusData.cdio_headers, row.cdio_vals, cdioHeaders),
        sdg_vals: valuesForHeaders(syllabusData.sdg_headers, row.sdg_vals, sdgHeaders),
      }))
      const updSoCpa = (ri, key, ci, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({
          ...s,
          so_cpa_rows: soCpaRows.map((r, i) => {
            if (i !== ri) return r
            if (key === 'so_vals') { const vals = [...(r.so_vals || [])]; vals[ci] = val; return { ...r, so_vals: vals } }
            return { ...r, [key]: val }
          }),
        }))
      }
      const updIga = (ri, ci, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({
          ...s,
          iga_rows: igaRows.map((r, i) => {
            if (i !== ri) return r
            const vals = [...(r.vals || [])]; vals[ci] = val
            return { ...r, vals }
          }),
        }))
      }
      const updCdioSdg = (ri, key, ci, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({
          ...s,
          cdio_sdg_rows: cdioSdgRows.map((r, i) => {
            if (i !== ri) return r
            const vals = [...(r[key] || [])]; vals[ci] = val
            return { ...r, [key]: vals }
          }),
        }))
      }
      const iloLabelCell = (ri) => (
        <td style={{ ...TABLE_TD, textAlign: 'center', fontWeight: 700, color: MAROON, whiteSpace: 'nowrap' }}>
          ILO{ri + 1}
        </td>
      )
      const fixedSoCpaTable = fixedTableFor('mapping-of-at', 'ilo-so-cpa-map')
      const fixedIgaMapTable = fixedTableFor('mapping-of-at', 'ilo-iga-map')
      const fixedCdioSdgTable = fixedTableFor('mapping-of-at', 'ilo-cdio-sdg-map')
      return (
        <Stack spacing={2}>
          {frameworkAssigning ? (
            <Box sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>
              Ollama is matching the framework columns to the ILOs and topics.
            </Box>
          ) : null}
          {frameworkAssignError ? (
            <Box sx={{ fontSize: '0.82rem', color: '#FCA5A5' }}>{frameworkAssignError}</Box>
          ) : null}
          <SectionCard title={titleForTable('mapping-of-at', 'ilo-so-cpa-map', 'Table 1. STUDENT OUTCOMES (SO): Mapping of Assessment Tasks (AT)')}>
            {fixedSoCpaTable ? <FixedBlueprintTable table={fixedSoCpaTable} /> : (
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    <th style={{ ...TABLE_TH, minWidth: 60 }}>ILOs</th>
                    <th colSpan={soHeaders.length + 3} style={{ ...TABLE_TH, textAlign: 'center' }}>Student Outcomes (SO)</th>
                  </tr>
                  <tr style={{ backgroundColor: BG }}>
                    <th style={TABLE_TH} />
                    {soHeaders.map((h, ci) => (
                      <th key={ci} style={{ ...TABLE_TH, minWidth: 96, textAlign: 'center' }}>
                        {inlineInput(h, e => {
                          setIsDirty(true); setSaveSuccess(false)
                          setSyllabusData(s => {
                            const headers = fitMapHeaders(s.so_headers, DEFAULT_SO_HEADERS, SO_PLACEHOLDERS, s.framework_column_source)
                            headers[ci] = e.target.value
                            return { ...s, so_headers: headers, framework_column_source: 'faculty' }
                          })
                        }, 56, undefined, { numeric: true })}
                      </th>
                    ))}
                    <th style={{ ...TABLE_TH, minWidth: 60, textAlign: 'center' }}>C</th>
                    <th style={{ ...TABLE_TH, minWidth: 60, textAlign: 'center' }}>P</th>
                    <th style={{ ...TABLE_TH, minWidth: 60, textAlign: 'center' }}>A</th>
                  </tr>
                </thead>
                <tbody>
                  {soCpaRows.map((row, ri) => (
                    <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? '#1A1A1F' : BG }}>
                      {iloLabelCell(ri)}
                      {soHeaders.map((_, ci) => (
                        <td key={ci} style={{ ...TABLE_TD, textAlign: 'center' }}>
                          {inlineInput((row.so_vals || [])[ci] || '', e => updSoCpa(ri, 'so_vals', ci, e.target.value), 84)}
                        </td>
                      ))}
                      <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                        {inlineInput(row.c || '', e => updSoCpa(ri, 'c', 0, e.target.value), 56)}
                      </td>
                      <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                        {inlineInput(row.p || '', e => updSoCpa(ri, 'p', 0, e.target.value), 56)}
                      </td>
                      <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                        {inlineInput(row.a || '', e => updSoCpa(ri, 'a', 0, e.target.value), 56)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            )}
          </SectionCard>

          <SectionCard title={titleForTable('mapping-of-at', 'ilo-iga-map', 'Table 2. INSTITUTIONAL GRADUATE ATTRIBUTES (IGA): Mapping of Assessment Tasks (AT)')}>
            {fixedIgaMapTable ? <FixedBlueprintTable table={fixedIgaMapTable} /> : (
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    <th style={{ ...TABLE_TH, minWidth: 60 }}>ILOs</th>
                    <th colSpan={igaHeaders.length} style={{ ...TABLE_TH, textAlign: 'center' }}>Institutional Graduate Attributes (IGA)</th>
                  </tr>
                  <tr style={{ backgroundColor: BG }}>
                    <th style={TABLE_TH} />
                    {igaHeaders.map((h, ci) => (
                      <th key={ci} style={{ ...TABLE_TH, minWidth: 96, textAlign: 'center' }}>
                        {inlineInput(h, e => {
                          setIsDirty(true); setSaveSuccess(false)
                          setSyllabusData(s => {
                            const headers = fitMapHeaders(s.iga_headers, DEFAULT_IGA_HEADERS, IGA_PLACEHOLDERS, s.framework_column_source)
                            headers[ci] = e.target.value
                            return { ...s, iga_headers: headers, framework_column_source: 'faculty' }
                          })
                        }, 56, undefined, { numeric: true })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {igaRows.map((row, ri) => (
                    <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? '#1A1A1F' : BG }}>
                      {iloLabelCell(ri)}
                      {igaHeaders.map((_, ci) => (
                        <td key={ci} style={{ ...TABLE_TD, textAlign: 'center' }}>
                          {inlineInput((row.vals || [])[ci] || '', e => updIga(ri, ci, e.target.value), 84)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            )}
          </SectionCard>

          <SectionCard title={titleForTable('mapping-of-at', 'ilo-cdio-sdg-map', 'Table 3. CDIO and SDG Skills: Mapping of Assessment Tasks (AT)')}>
            {fixedCdioSdgTable ? <FixedBlueprintTable table={fixedCdioSdgTable} /> : (
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    <th style={{ ...TABLE_TH, minWidth: 60 }}>ILOs</th>
                    <th colSpan={cdioHeaders.length} style={{ ...TABLE_TH, textAlign: 'center' }}>CDIO SKILLS</th>
                    <th colSpan={sdgHeaders.length} style={{ ...TABLE_TH, textAlign: 'center' }}>SDG Skills</th>
                  </tr>
                  <tr style={{ backgroundColor: BG }}>
                    <th style={TABLE_TH} />
                    {cdioHeaders.map((h, ci) => (
                      <th key={`c${ci}`} style={{ ...TABLE_TH, minWidth: 96, textAlign: 'center' }}>
                        {inlineInput(h, e => {
                          setIsDirty(true); setSaveSuccess(false)
                          setSyllabusData(s => {
                            const headers = fitMapHeaders(s.cdio_headers, DEFAULT_CDIO_HEADERS, CDIO_PLACEHOLDERS, s.framework_column_source)
                            headers[ci] = e.target.value
                            return { ...s, cdio_headers: headers, framework_column_source: 'faculty' }
                          })
                        }, 56, undefined, { numeric: true })}
                      </th>
                    ))}
                    {sdgHeaders.map((h, ci) => (
                      <th key={`s${ci}`} style={{ ...TABLE_TH, minWidth: 96, textAlign: 'center' }}>
                        {inlineInput(h, e => {
                          setIsDirty(true); setSaveSuccess(false)
                          setSyllabusData(s => {
                            const headers = fitMapHeaders(s.sdg_headers, DEFAULT_SDG_HEADERS, SDG_PLACEHOLDERS, s.framework_column_source)
                            headers[ci] = e.target.value
                            return { ...s, sdg_headers: headers, framework_column_source: 'faculty' }
                          })
                        }, 56, undefined, { numeric: true })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cdioSdgRows.map((row, ri) => (
                    <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? '#1A1A1F' : BG }}>
                      {iloLabelCell(ri)}
                      {cdioHeaders.map((_, ci) => (
                        <td key={`c${ci}`} style={{ ...TABLE_TD, textAlign: 'center' }}>
                          {inlineInput((row.cdio_vals || [])[ci] || '', e => updCdioSdg(ri, 'cdio_vals', ci, e.target.value), 84)}
                        </td>
                      ))}
                      {sdgHeaders.map((_, ci) => (
                        <td key={`s${ci}`} style={{ ...TABLE_TD, textAlign: 'center' }}>
                          {inlineInput((row.sdg_vals || [])[ci] || '', e => updCdioSdg(ri, 'sdg_vals', ci, e.target.value), 84)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            )}
          </SectionCard>
        </Stack>
      )
    }

    // ── 8. TLA Activities ────────────────────────────────────────────────────
    if (sectionKey === 'tla-activities') {
      const chapters = syllabusData.tla_chapters?.length ? syllabusData.tla_chapters : [{ ...EMPTY_CHAPTER }]
      const fixedTlaTable = fixedTableFor('tla-activities', 'tla-table')
      const fixedScheduleTable = fixedTableFor('tla-activities', 'assessment-schedule')
      const SELECT_STYLE = { fontSize: '0.82rem', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 4, padding: '3px 5px', background: '#1A1A1F', color: '#F0F0F2' }
      const scheduleMethods = syllabusData.schedule_methods || []
      const updScheduleMethod = (i, key, ci, val) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => {
          const current = s.schedule_methods?.length
            ? s.schedule_methods
            : [{ name: '', values: Array(TLA_WEEK_COUNT).fill('') }]
          const previousNames = current.map(method => method.name)
          const schedule_methods = current.map((method, methodIndex) => {
            if (methodIndex !== i) return method
            if (key === 'name') return { ...method, name: val }
            const values = Array.from(
              { length: Math.max(TLA_WEEK_COUNT, (method.values || []).length, ci + 1) },
              (_, index) => (method.values || [])[index] || '',
            )
            values[ci] = val
            return { ...method, values }
          })
          return applyScheduleMethodsToTopics({ ...s, schedule_methods }, previousNames)
        })
      }
      return (
        <>
        <SectionCard title={titleForTable('tla-activities', 'tla-table', 'Table 1. Teaching, Learning, and Assessment (TLA) Activities')}
          action={fixedTlaTable ? undefined : <AddRowBtn label="Add Week" onClick={() => addSylItem('tla_chapters', { ...EMPTY_CHAPTER })} />}>
          {fixedTlaTable ? <FixedBlueprintTable table={fixedTlaTable} /> : (
          <Box sx={{ overflowX: 'auto', minWidth: '100%' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.82rem', minWidth: '100%', tableLayout: 'auto' }}>
              <thead>
                <tr>
                  <th style={{ ...TABLE_TH, minWidth: 44, width: 44 }}>Ch.</th>
                  <th style={{ ...TABLE_TH, minWidth: 380 }}>Topics / Reading List</th>
                  <th style={{ ...TABLE_TH, minWidth: 70, width: 70 }}>Wks</th>
                  <th style={{ ...TABLE_TH, minWidth: 300 }}>Topic Outcomes</th>
                  <th style={{ ...TABLE_TH, minWidth: 70, width: 70 }}>ILO</th>
                  <th style={{ ...TABLE_TH, minWidth: 70, width: 70 }}>SO</th>
                  <th style={{ ...TABLE_TH, minWidth: 210 }}>Delivery Method</th>
                  <th style={{ ...TABLE_TH, minWidth: 44, width: 44, textAlign: 'center' }}>Action</th>
                  <th style={{ ...TABLE_TH, borderRight: 'none' }} />
                </tr>
              </thead>
              <tbody>
                {chapters.map((ch, i) => {
                  const _weekNum = parseInt(ch.chapter || ch.weeks, 10) || null
                  const _lectureTopic = isLectureDiscussionDelivery(ch.delivery)
                    ? lectureTopicLines(ch.topics).join('; ')
                    : ''
                  const _existingMod = _lectureTopic && _weekNum
                    ? (workspaceApi.data?.modules || []).find(m => m.week_number === _weekNum)
                    : null
                  const _btnLabel = _existingMod ? 'View Module' : 'Generate Module'
                  const _btnColor = _existingMod ? '#1565c0' : MAROON
                  const _btnHover = _existingMod ? '#e3f2fd' : MAROON_LIGHT
                  const coveredWeeks = weeksForChapter(ch)
                  return (
                  <tr key={i} data-tla-weeks={coveredWeeks.join(' ')}>
                    <td style={{ ...TABLE_TD, textAlign: 'center' }}>{inlineInput(ch.chapter, e => setSylArrObj('tla_chapters', i, 'chapter', e.target.value), 40, undefined, { numeric: true })}</td>
                    <td style={{ ...TABLE_TD, minWidth: 380, verticalAlign: 'top' }}>
                      <TopicsCell
                        value={ch.topics || ''}
                        selected={sameAiField(aiField, { fieldType: 'arrayObj', arrField: 'tla_chapters', arrIndex: i, arrObjKey: 'topics' })}
                        onFocus={() => setAiField({ section: 'topics', label: `Topics / Reading List ${i + 1}`, fieldType: 'arrayObj', arrField: 'tla_chapters', arrIndex: i, arrObjKey: 'topics' })}
                        onChange={e => setSylArrObj('tla_chapters', i, 'topics', e.target.value)}
                      />
                    </td>
                    <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                      {inlineInput(ch.weeks, e => setSylArrObj('tla_chapters', i, 'weeks', e.target.value), 60, undefined, { numeric: true, allowRange: true })}
                    </td>
                    <td style={{ ...TABLE_TD, minWidth: 300, verticalAlign: 'top' }}>
                      <textarea
                        value={ch.outcomes || ''}
                        onFocus={() => setAiField({ section: 'topic_outcome', label: `Topic Outcomes ${i + 1}`, fieldType: 'arrayObj', arrField: 'tla_chapters', arrIndex: i, arrObjKey: 'outcomes' })}
                        onChange={e => setSylArrObj('tla_chapters', i, 'outcomes', e.target.value)}
                        onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.max(e.target.scrollHeight, 44) + 'px' }}
                        ref={el => { if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 44) + 'px'; } }}
                        style={{ width: '100%', fontSize: '0.82rem', border: sameAiField(aiField, { fieldType: 'arrayObj', arrField: 'tla_chapters', arrIndex: i, arrObjKey: 'outcomes' }) ? '1px solid #86EFAC' : '1px solid rgba(255,255,255,0.14)', borderRadius: 4, padding: '4px 6px', resize: 'none', overflow: 'visible', outline: 'none', fontFamily: 'inherit', color: '#F0F0F2', background: '#1A1A1F', boxSizing: 'border-box', lineHeight: 1.4, minHeight: '44px' }}
                      />
                    </td>
                    <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                      {inlineInput(ch.ilo, e => setSylArrObj('tla_chapters', i, 'ilo', e.target.value), 60, undefined, { numeric: true })}
                    </td>
                    <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                      {inlineInput(ch.so, e => setSylArrObj('tla_chapters', i, 'so', e.target.value), 60, undefined, { numeric: true })}
                    </td>
                    <td style={TABLE_TD}>
                      <DeliveryMethodField
                        value={ch.delivery}
                        onChange={next => setSylArrObj('tla_chapters', i, 'delivery', next)}
                      />
                    </td>
                    <td style={{ ...TABLE_TD, textAlign: 'center', width: 44, minWidth: 44 }}>
                      {_lectureTopic ? (
                      <button
                        type="button"
                        title={_btnLabel}
                        onClick={() => {
                          if (!_existingMod) {
                            setPendingGenerate({
                              topic: _lectureTopic,
                              week: _weekNum || 1,
                              topic_id: `tla-${i}`,
                            })
                            setModuleParams(p => ({ ...p, week_number: _weekNum || 1, module_title: _lectureTopic, topic_id: `tla-${i}` }))
                          } else {
                            setSelectedModule(null); setModuleContent(null); setChatOpen(false)
                          }
                          setResultText('')
                          setActiveTab('module')
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: `1.5px solid ${_btnColor}`, borderRadius: 6, background: 'transparent', color: _btnColor, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = _btnHover }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        {_existingMod ? <BookOpen size={14} /> : <Zap size={14} />}
                      </button>
                      ) : null}
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
          )}
        </SectionCard>

        <SectionCard title={titleForTable('tla-activities', 'assessment-schedule', 'Table 2. Assessment Method')}>
          {fixedScheduleTable ? <FixedBlueprintTable table={fixedScheduleTable} /> : (
          <Box sx={{ overflowX: 'auto' }}>
            {scheduleMethods.length ? (
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...TABLE_TH, minWidth: 180 }}>Distribution</th>
                  <th colSpan={TLA_WEEK_COUNT} style={{ ...TABLE_TH, textAlign: 'center' }}>Week No.</th>
                </tr>
                <tr>
                  {Array.from({ length: TLA_WEEK_COUNT }, (_, w) => (
                    <th key={w} style={{ ...TABLE_TH, minWidth: 36, width: 36, textAlign: 'center' }}>{w + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scheduleMethods.map((m, i) => (
                  <tr key={m.taskId || i}>
                    <td style={{ ...TABLE_TD, fontWeight: 600, whiteSpace: 'nowrap' }}>{m.name}</td>
                    {Array.from({ length: TLA_WEEK_COUNT }, (_, w) => {
                      const plotted = scheduleMarkIsPlotted((m.values || [])[w])
                      return (
                        <td key={w} style={{ ...TABLE_TD, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={plotted}
                            aria-label={`${m.name || 'Assessment method'} week ${w + 1}`}
                            onChange={e => {
                              const week = w + 1
                              updScheduleMethod(i, 'values', w, e.target.checked ? 'x' : '')
                              requestAnimationFrame(() => {
                                document.querySelector(`[data-tla-weeks~="${week}"]`)
                                  ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                              })
                            }}
                            style={{ width: 16, height: 16, accentColor: '#86EFAC', cursor: 'pointer' }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            ) : (
              <Box sx={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)' }}>
                Add an assessment task and it will be listed here.
              </Box>
            )}
          </Box>
          )}
        </SectionCard>
        </>
      )
    }

    if (sectionKey === 'tos') {
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
        const next = { id: `tos-${Date.now()}`, examCode: `EXAM${tosExams.length + 1}`, examLabel: `Examination ${tosExams.length + 1}`, semester: '', preparedBy: '', checkedBy: '', approvedBy: '', totalTestItems: 0, totalExamMinutes: 0, topics: [newTopicRow()] }
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
      const bloomPctForIlos = (ilos, iloBloom) => {
        const levels = []
        for (const key of ilos || []) {
          const idx = parseInt(String(key).replace(/\D/g, ''), 10) - 1
          const level = String(iloBloom?.[idx]?.level || '').trim().toLowerCase()
          if (BLOOM_KEYS.includes(level) && !levels.includes(level)) levels.push(level)
        }
        const pct = {}
        BLOOM_KEYS.forEach(k => { pct[k] = '' })
        if (!levels.length) return pct
        const each = Math.floor(100 / levels.length)
        let remainder = 100 - each * levels.length
        levels.forEach(level => {
          const extra = remainder > 0 ? 1 : 0
          if (remainder > 0) remainder -= 1
          pct[level] = String(each + extra)
        })
        return pct
      }
      const rowHasIlo = (ilos, number) => (ilos || []).some(key => parseInt(String(key).replace(/\D/g, ''), 10) === number)
      const togIlo = (examId, rowId, iloNumber, checked) => {
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({
          ...s,
          tos: s.tos.map(t => t.id !== examId ? t : {
            ...t,
            topics: t.topics.map(r => {
              if (r.id !== rowId) return r
              const kept = (r.ilos || []).filter(key => parseInt(String(key).replace(/\D/g, ''), 10) !== iloNumber)
              const ilos = checked ? [...kept, `ILO${iloNumber}`] : kept
              const bloom_pct = bloomPctForIlos(ilos, s.ilo_bloom)
              const hasLevel = BLOOM_KEYS.some(k => Number(bloom_pct[k]) > 0)
              const clearedItems = Object.fromEntries(BLOOM_KEYS.map(k => [k, '']))
              return { ...r, ilos, bloom_pct, bloom_items: hasLevel ? r.bloom_items : clearedItems }
            }),
          }),
        }))
      }
      const selectTosTopic = (examId, rowId, topicText) => {
        const choice = collectScheduleTopics().find(item => item.topic === topicText)
        setIsDirty(true); setSaveSuccess(false)
        setSyllabusData(s => ({
          ...s,
          tos: s.tos.map(t => t.id !== examId ? t : {
            ...t,
            topics: t.topics.map(r => {
              if (r.id !== rowId) return r
              const ilos = choice?.ilos?.length ? choice.ilos : (r.ilos || [])
              const bloom_pct = bloomPctForIlos(ilos, s.ilo_bloom)
              const hasLevel = BLOOM_KEYS.some(k => Number(bloom_pct[k]) > 0)
              const clearedItems = Object.fromEntries(BLOOM_KEYS.map(k => [k, '']))
              return {
                ...r,
                topic: topicText,
                ilos,
                bloom_pct,
                bloom_items: hasLevel ? r.bloom_items : clearedItems,
              }
            }),
          }),
        }))
      }

      const solvedTos = activeTos ? materializeTosExam(activeTos) : null
      const solvedTopics = solvedTos?.topics || []
      const lectureChoices = collectScheduleTopics()
      const totalHrs = solvedTopics.reduce((s, r) => s + (Number(r.hours_class) || 0), 0)
      const minuteValues = solvedTopics.map(row => displayedTopicMinutes(row))
      const totalMins = minuteValues.every(value => value == null)
        ? null
        : minuteValues.reduce((sum, value) => sum + (value || 0), 0)
      const totalPts = solvedTopics.reduce((s, r) => s + (Number(r.total_points) || 0), 0)

      // ── ILO-Bloom alignment helpers ────────────────────────────────────────
      const BLOOM_LEVEL_NUM = { remember: 1, understand: 2, apply: 3, analyze: 4, evaluate: 5, create: 6 }

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
        if (ceiling === 0) return 'rgba(21,128,61,0.03)'
        const level = BLOOM_LEVEL_NUM[k]
        if (level > ceiling) return 'rgba(0,0,0,0.045)' // above ceiling — gray (out of scope)
        if (level === ceiling) return 'rgba(34,197,94,0.11)' // at ceiling — green (target)
        return 'rgba(21,128,61,0.03)' // below ceiling — normal (prerequisite)
      }

      // 'aligned' | 'mismatch' | 'over' | null
      const checkAlignment = (row) => {
        const ceiling = rowIloCeiling(row)
        if (ceiling === 0) return null
        const totalPct = BLOOM_KEYS.reduce((s, k) => s + (parseFloat((row.bloom_pct || {})[k]) || 0), 0)
        if (totalPct === 0) return null
        const hasAbove = BLOOM_KEYS.slice(ceiling).some(k => (parseFloat((row.bloom_pct || {})[k]) || 0) > 0)
        if (hasAbove) return 'over'
        const checkedLevels = (row.ilos || []).map(key => {
          const idx = parseInt(String(key).replace(/\D/g, ''), 10) - 1
          return (syllabusData.ilo_bloom[idx]?.level || '').toLowerCase()
        }).filter(level => BLOOM_KEYS.includes(level))
        const usedLevels = BLOOM_KEYS.filter(k => (parseFloat((row.bloom_pct || {})[k]) || 0) > 0)
        if (checkedLevels.length && usedLevels.every(level => checkedLevels.includes(level))) return 'aligned'
        const topK = BLOOM_KEYS.reduce((best, k) =>
          (parseFloat((row.bloom_pct || {})[k] || 0) >= parseFloat((row.bloom_pct || {})[best] || 0)) ? k : best
        , BLOOM_KEYS[0])
        return BLOOM_KEYS.indexOf(topK) + 1 === ceiling ? 'aligned' : 'mismatch'
      }

      // Split this row evenly across the Bloom levels of the ILOs the faculty checked.
      const applyBloomSuggestion = (examId, rowId, row) => {
        const levels = []
        for (const key of (row.ilos || [])) {
          const idx = parseInt(String(key).replace(/\D/g, ''), 10) - 1
          const level = (syllabusData.ilo_bloom[idx]?.level || '').toLowerCase()
          if (BLOOM_KEYS.includes(level) && !levels.includes(level)) levels.push(level)
        }
        if (levels.length === 0) return
        const each = Math.floor(100 / levels.length)
        let remainder = 100 - each * levels.length
        const pct = {}
        BLOOM_KEYS.forEach(k => { pct[k] = '0' })
        levels.forEach(level => {
          const extra = remainder > 0 ? 1 : 0
          if (remainder > 0) remainder -= 1
          pct[level] = String(each + extra)
        })
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
                sx={{ fontSize: '0.68rem', height: 18, bgcolor: 'rgba(21,128,61,0.08)', color: MAROON, mr: 1, fontWeight: 600 }} />
              <Box onClick={e => e.stopPropagation()} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Tooltip title="Download every examination as a landscape DOCX">
                  <span>
                    <Button
                      onClick={handleExportTos}
                      disabled={tosExporting || tosExams.length === 0}
                      startIcon={tosExporting ? <CircularProgress size={13} sx={{ color: MAROON }} /> : <DownloadIcon fontSize="small" />}
                      size="small"
                      sx={{
                        textTransform: 'none', fontSize: '0.74rem', fontWeight: 600,
                        color: MAROON, border: `1px solid ${MAROON}`, borderRadius: 1.5,
                        minWidth: 0, px: 1.25, py: 0.4,
                        '&:hover': { bgcolor: MAROON_LIGHT },
                        '&.Mui-disabled': { color: 'var(--text-tertiary)', borderColor: 'var(--border-color)' },
                      }}>
                      {tosExporting ? 'Preparing…' : 'Download ToS'}
                    </Button>
                  </span>
                </Tooltip>
                <AddRowBtn label="Add TOS" onClick={addTosExam} />
              </Box>
            </Box>
            {tosExportError && (
              <Box sx={{ px: 2.5, py: 1.25, bgcolor: 'rgba(231,76,60,0.06)', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
                <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 600 }}>{tosExportError}</Typography>
              </Box>
            )}
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
                    <LField label="Total exam minutes" type="number" value={activeTos.totalExamMinutes || ''} onChange={e => updTosExam(activeTos.id, 'totalExamMinutes', Number(e.target.value) || 0)} />
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
                                <th style={{ ...TABLE_TH, minWidth: 54, textAlign: 'center', fontSize: '0.68rem', backgroundColor: 'rgba(21,128,61,0.05)' }}>Items</th>
                                <th style={{ ...TABLE_TH, minWidth: 54, textAlign: 'center', fontSize: '0.68rem', backgroundColor: 'rgba(21,128,61,0.05)' }}>%</th>
                              </React.Fragment>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                           {solvedTopics.map(row => {
                             const matchedModule = findMatchingModuleForTopic(row.topic)
                             const pctSum = BLOOM_KEYS.reduce((sum, key) => sum + (parseFloat((row.bloom_pct || {})[key]) || 0), 0)
                             const pctOff = pctSum > 0 && Math.abs(pctSum - 100) > 0.5
                             return (
                            <tr key={row.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ ...TABLE_TD, textAlign: 'left' }}>
                                <Select
                                  size="small"
                                  displayEmpty
                                  value={lectureChoices.some(item => item.topic === row.topic) ? row.topic : (row.topic || '')}
                                  onChange={e => selectTosTopic(activeTos.id, row.id, e.target.value)}
                                  sx={{ minWidth: 180, maxWidth: 280, fontSize: '0.8rem', '& .MuiSelect-select': { py: '5px', fontSize: '0.8rem' } }}
                                >
                                  <MenuItem value=""><em>Select a lecture topic</em></MenuItem>
                                  {row.topic && !lectureChoices.some(item => item.topic === row.topic) && (
                                    <MenuItem value={row.topic}>{row.topic}</MenuItem>
                                  )}
                                  {lectureChoices.map(item => (
                                    <MenuItem key={item.id} value={item.topic}>
                                      Wk {item.week} — {item.topic}
                                    </MenuItem>
                                  ))}
                                </Select>
                                {lectureChoices.length === 0 && (
                                  <div style={{ marginTop: 4, fontSize: '0.65rem', color: '#b45309' }}>
                                    Add Lecture/Discussion rows in Teaching, Learning, and Assessment (TLA) Activities. Set Delivery Method to Lecture/Discussion. Reading lists are not topics.
                                  </div>
                                )}
                                 <div style={{ marginTop: 5, padding: '4px 6px', borderRadius: 5, background: matchedModule ? 'rgba(22,163,74,0.08)' : 'rgba(217,119,6,0.08)', color: matchedModule ? '#15803d' : '#b45309', fontSize: '0.65rem', fontWeight: 600 }}>
                                   {matchedModule ? `Mapped module: Wk ${matchedModule.week || '—'} · ${matchedModule.topic}` : 'No generated module match yet'}
                                 </div>
                              </td>
                              <td style={{ ...TABLE_TD, minWidth: 110 }}>
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                                  {syllabusData.ilos.map((_, j) => {
                                    const iloBloom = syllabusData.ilo_bloom[j]
                                    const iloLevel = iloBloom?.level ? iloBloom.level.charAt(0).toUpperCase() + iloBloom.level.slice(1).toLowerCase() : null
                                    const iloVerb  = iloBloom?.verb || null
                                    const checked = rowHasIlo(row.ilos, j + 1)
                                    return (
                                      <button
                                        key={j}
                                        type="button"
                                        onClick={() => togIlo(activeTos.id, row.id, j + 1, !checked)}
                                        title={iloLevel ? `ILO${j + 1} targets: ${iloLevel}${iloVerb ? ` (${iloVerb})` : ''}` : `ILO${j + 1}`}
                                        style={{
                                          display: 'inline-flex', alignItems: 'center', gap: 3,
                                          fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                          padding: '2px 7px', borderRadius: 99,
                                          background: checked ? MAROON_LIGHT : '#fff',
                                          border: `1px solid ${checked ? MAROON : '#d0d0d0'}`,
                                          color: checked ? MAROON : '#555',
                                          fontWeight: checked ? 700 : 500,
                                        }}
                                      >
                                        <span style={{
                                          width: 12, height: 12, borderRadius: 2, flexShrink: 0,
                                          border: `1.5px solid ${checked ? MAROON : '#999'}`,
                                          background: checked ? MAROON : '#fff',
                                          color: '#fff', fontSize: '0.62rem', lineHeight: '12px', textAlign: 'center',
                                        }}>{checked ? '✓' : ''}</span>
                                        ILO{j + 1}
                                        {iloLevel && <span style={{ fontSize: '0.6rem', color: MAROON, fontWeight: 700 }}>{iloLevel.slice(0, 3)}</span>}
                                      </button>
                                    )
                                  })}
                                </div>
                                {(() => {
                                  const ceiling = rowIloCeiling(row)
                                  const align   = checkAlignment(row)
                                  const ceilKey = ceiling > 0 ? BLOOM_KEYS[ceiling - 1] : null
                                  if (!(row.ilos || []).length) return null
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
                                        title="Split Bloom % evenly across the ILOs checked on this row">
                                        ✦ Auto
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{ marginTop: 5, fontSize: '0.62rem', color: '#b45309', textAlign: 'center' }}>
                                      Checked. Set a Bloom level on this ILO to fill the item counts.
                                    </div>
                                  )
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
                                          <span style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 99, background: 'rgba(21,128,61,0.07)', color: MAROON, fontWeight: 700 }}>
                                            {domBloom.charAt(0).toUpperCase() + domBloom.slice(1)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })()}
                              </td>
                              <td style={{ ...TABLE_TD, textAlign: 'center' }}>{inlineInput(row.hours_class ?? 0, e => updTopicRow(activeTos.id, row.id, 'hours_class', e.target.value), 52)}</td>
                              <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'inherit' }}>
                                  {displayedTopicMinutes(row) ?? '—'}
                                </Typography>
                              </td>
                              <td style={{ ...TABLE_TD, textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ fontWeight: 700, color: MAROON }}>
                                  {totalHrs > 0 ? `${Number(row.weight || 0).toFixed(1)}%` : '—'}
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
                                        {Number((row.bloom_items || {})[k] || 0) > 0 ? Number(row.bloom_items[k]) : '—'}
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
                                  {Number(row.total_points) > 0 ? row.total_points : '—'}
                                </Typography>
                                {pctOff && (
                                  <div style={{ color: '#dc2626', fontSize: '0.6rem', fontWeight: 700, marginTop: 2 }}>
                                    Bloom % is {pctSum.toFixed(0)}
                                  </div>
                                )}
                              </td>
                              <td style={{ ...TABLE_TD, borderRight: 'none' }}>
                                <RemoveBtn onClick={() => delTopicRow(activeTos.id, row.id)} disabled={activeTos.topics.length <= 1} />
                              </td>
                             </tr>
                             )
                           })}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: BG }}>
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'left' }}>Total</td>
                            <td style={TABLE_TD} />
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center' }}>{totalHrs}</td>
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center' }}>{totalMins == null ? '—' : totalMins}</td>
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center' }}>{totalHrs > 0 ? '100%' : '—'}</td>
                            {BLOOM_KEYS.map(k => {
                              const sumItems = solvedTopics.reduce((acc, r) => acc + (Number((r.bloom_items || {})[k]) || 0), 0)
                              const share = totalPts > 0 ? (sumItems / totalPts) * 100 : 0
                              return (
                                <React.Fragment key={k}>
                                  <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center', backgroundColor: 'rgba(21,128,61,0.04)' }}>
                                    {sumItems > 0 ? sumItems : ''}
                                  </td>
                                  <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center', backgroundColor: 'rgba(21,128,61,0.04)' }}>
                                    {share > 0 ? `${share.toFixed(1)}%` : ''}
                                  </td>
                                </React.Fragment>
                              )
                            })}
                            <td style={{ ...TABLE_TD, fontWeight: 700, textAlign: 'center', backgroundColor: MAROON_LIGHT, color: MAROON }}>
                              {totalPts > 0 ? totalPts : '—'}
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
                      Weight, minutes, points, and Bloom item counts are computed for you. The Min column converts Class hours to minutes as you type: 1 class hour is 60 minutes. Class hours also set the weight, and that weight splits Total test items. Each topic's Bloom percentages should total 100%, and those percentages set the item count for that Bloom level. Assessments use those exact counts.
                    </Typography>
                  </Box>
                </>
              )}
            </Paper>
          )}
        </Box>
      )
    }

    // ── 10. Course Policies ──────────────────────────────────────────────────
    if (sectionKey === 'course-policies') {
      const gradingRows = (syllabusData.grading_rows || []).length ? syllabusData.grading_rows : DEFAULT_GRADING_ROWS.map(row => ({ ...row }))
      const fixedGradingTable = fixedTableFor('course-policies', 'grading-scale')
      const policyFields = [
        { fieldKey: 'class-policy',          label: 'Class Policy',          dataKey: 'class_policy' },
        { fieldKey: 'missed-examinations',   label: 'Missed Examinations',   dataKey: 'missed_examinations' },
        { fieldKey: 'academic-dishonesty',   label: 'Academic Dishonesty',   dataKey: 'academic_dishonesty' },
        { fieldKey: 'dropping',              label: 'Dropping',              dataKey: 'dropping' },
      ]
      return (
        <Stack spacing={2}>
          <SectionCard title={titleForTable('course-policies', 'grading-scale', 'A. Grading System')}
            action={fixedGradingTable ? undefined : <AddRowBtn label="Add Grade" onClick={() => addSylItem('grading_rows', { rating: '', grade: '', range: '' })} />}>
            {fixedGradingTable ? <FixedBlueprintTable table={fixedGradingTable} /> : (
            <>
            <Typography variant="body2" sx={{ mb: 1.5, color: '#444' }}>
              The grading system adopted by this course is as follows:
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: BG }}>
                    {['Grade', 'Description', 'Range'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', borderBottom: '2px solid #e0e0e0', textAlign: 'left', color: '#555', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gradingRows.map((row, i) => {
                    const isLast = i === gradingRows.length - 1
                    return (
                      <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#1A1A1F' : BG }}>
                        <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                          {inlineInput(row.grade,  e => setSylArrObj('grading_rows', i, 'grade',  e.target.value), 60)}
                        </td>
                        {isLast ? (
                          <td colSpan={2} style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                            {inlineInput(row.rating, e => setSylArrObj('grading_rows', i, 'rating', e.target.value), 200)}
                          </td>
                        ) : (
                          <>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                              {inlineInput(row.rating, e => setSylArrObj('grading_rows', i, 'rating', e.target.value), 140)}
                            </td>
                            <td style={{ padding: '3px 6px', borderBottom: '1px solid #f0f0f0' }}>
                              {inlineInput(row.range,  e => setSylArrObj('grading_rows', i, 'range',  e.target.value), 90)}
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Box>
            <Typography variant="body2" sx={{ mt: 1.5, color: '#444', lineHeight: 1.6 }}>
              Students who got a computed grade of 70-74 will be given an appropriate remedial activity in which the final grade should be either passing (3.0) or failure (5.0). No rounding off of grades shall be allowed.
            </Typography>
            </>
            )}
          </SectionCard>

          <SectionCard title="B. Course Policies">
            <Stack spacing={2}>
              {policyFields.map(({ fieldKey, label, dataKey }) => (
                <SylField key={fieldKey} rules={fixedFieldRules} fieldKey={fieldKey}
                  label={labelFor(fieldKey, label)} multiline minRows={3}
                  value={syllabusData[dataKey] || ''}
                  onChange={e => setSyl(dataKey, e.target.value)}
                  onFocus={() => setAiField({ section: 'course-policies', label, fieldType: 'simple', field: dataKey })} />
              ))}
            </Stack>
          </SectionCard>

          <SectionCard title="C. Other Course Policies and Requirements">
            <SylField rules={fixedFieldRules} fieldKey="other-policies"
              label={labelFor('other-policies', 'Other Course Policies and Requirements')} multiline minRows={4}
              value={syllabusData.other_policies || ''}
              onChange={e => setSyl('other_policies', e.target.value)}
              onFocus={() => setAiField({ section: 'course-policies', label: 'Other Course Policies and Requirements', fieldType: 'simple', field: 'other_policies' })} />
          </SectionCard>
        </Stack>
      )
    }

    return null
  }

  function renderModuleGenFooter({ showCreate = false } = {}) {
    const topicCount = showCreate ? collectScheduleTopics().length : 0
    if (!showCreate && !moduleGenProgress) return null
    const total = Number(moduleGenProgress?.total) || 0
    const completed = Number(moduleGenProgress?.completed) || 0
    return (
      <Box sx={{
        flexShrink: 0,
        bgcolor: '#15181A',
        borderTop: '2px solid rgba(134,239,172,0.65)',
        px: 2,
        py: 1,
      }}>
        <Stack spacing={0.75}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {moduleGenProgress
              ? <CircularProgress size={16} sx={{ color: '#86EFAC', flexShrink: 0 }} />
              : <AutoAwesomeIcon sx={{ color: '#86EFAC', fontSize: '1.2rem', flexShrink: 0 }} />}
            <Box sx={{ flex: '1 1 180px', minWidth: 140 }}>
              <Typography variant="caption" sx={{ color: '#86EFAC', display: 'block', fontWeight: 800 }}>
                {moduleGenProgress?.label || 'Module generation'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#E5E7EB', display: 'block' }}>
                {moduleGenProgress?.detail || 'Create a module from a Lecture/Discussion topic. You can choose the week before generating.'}
              </Typography>
            </Box>
            {total > 0 && (
              <Typography variant="caption" sx={{ color: '#86EFAC', fontWeight: 700 }}>
                {Math.min(completed, total)}/{total}
              </Typography>
            )}
            {showCreate && (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!topicCount || actionLoading || moduleGeneratingAll}
                  startIcon={<AddIcon />}
                  onClick={() => openGenerateDialog('single', null)}
                  sx={{
                    borderColor: '#86EFAC',
                    color: '#86EFAC',
                    borderRadius: 1.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    '&:hover': { bgcolor: 'rgba(134,239,172,0.12)', borderColor: '#86EFAC' },
                    '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.38)' },
                  }}
                >
                  Create Module
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!topicCount || actionLoading || moduleGeneratingAll}
                  startIcon={moduleGeneratingAll
                    ? <CircularProgress size={15} color="inherit" />
                    : <Zap sx={{ fontSize: '1rem !important' }} />}
                  onClick={() => openGenerateDialog('all', null)}
                  sx={{
                    bgcolor: '#16A34A',
                    color: '#fff',
                    borderRadius: 1.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    '&:hover': { bgcolor: '#15803D' },
                    '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.38)' },
                  }}
                >
                  {moduleGeneratingAll ? 'Generating All…' : 'Generate All Modules'}
                </Button>
              </Box>
            )}
          </Box>
          {moduleGenProgress && (
            <LinearProgress
              variant={total > 0 ? 'determinate' : 'indeterminate'}
              value={total > 0 ? (completed / Math.max(total, 1)) * 100 : undefined}
              sx={{
                height: 4,
                borderRadius: 4,
                bgcolor: 'rgba(255,255,255,0.12)',
                '& .MuiLinearProgress-bar': { bgcolor: '#86EFAC' },
              }}
            />
          )}
        </Stack>
      </Box>
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
    if (workspaceApi.loading && !workspaceApi.data) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress sx={{ color: MAROON }} />
        </Box>
      )
    }
    if (workspaceApi.error && !workspaceApi.data) {
      return (
        <Stack spacing={2} sx={{ p: 3 }}>
          <AutoAlert
            message={`Could not load this course workspace: ${workspaceApi.error}`}
            onClose={() => {}}
          />
          <Button
            variant="outlined"
            onClick={() => navigate('/faculty/dashboard')}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            Back to courses
          </Button>
        </Stack>
      )
    }
    if (activeTab === 'analytics') {
      return <FacultyAnalyticsReports key={courseId} courseId={courseId} />
    }
    if (activeTab === 'syllabus') {
      const aiSectionFields = getAiFieldsForCurrentSection()
      const focusedAiField = aiSectionFields.find(field => sameAiField(field, aiField)) || null
      const showSaveFooter = isDirty
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* scrollable content area */}
                <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            {course && (
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                {/* hidden file input for syllabus upload */}
                <input
                  ref={syllabusUploadRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.txt"
                  style={{ display: 'none' }}
                  onChange={handleSyllabusUpload}
                />
                <Box sx={{ flex: '1 1 180px', minWidth: 0, overflow: 'hidden' }}>
                  <Typography variant="caption"
                    sx={{ color: MAROON, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    {syllabusData.course_code || course.course_code}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#1A1A1A', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {syllabusData.course_title || course.course_title}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flexShrink: 0, position: 'relative', zIndex: 2 }}>
                <Tooltip title={syllabusUploading ? (syllabusUploadProgress ? `Filling ${syllabusUploadProgress.label}` : 'Reading the syllabus…') : 'Upload existing syllabus (PDF, DOCX, XLSX, TXT) — fields will be auto-populated'}>
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
                      {syllabusUploading ? (syllabusUploadProgress ? `Step ${syllabusUploadProgress.index}/${syllabusUploadProgress.total}` : 'Reading…') : 'Upload Syllabus'}
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title={syllabusExporting === 'docx' ? 'Exporting…' : 'Export syllabus as DOCX'}>
                  <span>
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      disabled={Boolean(syllabusExporting)}
                      startIcon={syllabusExporting === 'docx' ? <CircularProgress size={14} sx={{ color: MAROON }} /> : <InsertDriveFileIcon sx={{ fontSize: '1rem !important' }} />}
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
                      {syllabusExporting === 'docx' ? 'Exporting…' : 'Export DOCX'}
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title={syllabusExporting === 'pdf' ? 'Exporting…' : 'Export PDF using university syllabus style'}>
                  <span>
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      disabled={Boolean(syllabusExporting)}
                      startIcon={syllabusExporting === 'pdf' ? <CircularProgress size={14} sx={{ color: MAROON }} /> : <PictureAsPdfIcon sx={{ fontSize: '1rem !important' }} />}
                      onClick={handleExportPdf}
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
                      {syllabusExporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
                    </Button>
                  </span>
                </Tooltip>
                </Box>
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
                {configuredSections.map(s => <Tab key={s.key} value={s.key} label={s.label} />)}
              </Tabs>
            </Box>
            {activeConfiguredSection?.is_static && (activeConfiguredSection.static_content || '').trim() && (
              <SectionCard title="Fixed by your institution">
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {activeConfiguredSection.static_content}
                </Typography>
              </SectionCard>
            )}
            {renderSyllabusSection()}
            {renderConfiguredSubsections()}
          </Box>

          {activeSyllabusSectionKey !== 'university-information' && aiPipelineDrafts && (
            <Paper
              variant="outlined"
              sx={{
                mx: 1,
                mb: 1,
                p: 1.5,
                maxHeight: 190,
                overflowY: 'auto',
                bgcolor: '#111318',
                borderColor: 'rgba(134,239,172,0.35)',
              }}
            >
              <Typography variant="subtitle2" sx={{ color: '#86EFAC', fontWeight: 700, mb: 1 }}>
                Review generated suggestions ({aiPipelineDrafts.length})
              </Typography>
              <Stack spacing={1.25}>
                {aiPipelineDrafts.map((draft, index) => (
                  <Box key={`${draft.fieldType}-${draft.field || draft.arrField}-${draft.arrIndex ?? draft.subsectionKey ?? index}`}>
                    <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700 }}>
                      {draft.label}
                    </Typography>
                    <SyllabusDraftText
                      section={draft.section}
                      text={draft.text || 'The AI returned an empty suggestion for this field.'}
                      sx={{ color: 'rgba(255,255,255,0.78)', mt: 0.25 }}
                    />
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}

          {showSaveFooter && (
            <Box sx={{
              flexShrink: 0,
              bgcolor: '#16161E', borderTop: '1.5px solid rgba(134,239,172,0.35)',
              px: 2.5, py: 1.25,
              display: 'flex', alignItems: 'center', gap: 2,
              zIndex: 30,
            }}>
              {saveError
                ? <>
                    <Typography variant="caption" sx={{ color: '#FCA5A5', flex: 1 }}>{saveError}</Typography>
                    <IconButton size="small" onClick={() => setSaveError('')} sx={{ color: '#FCA5A5', p: 0.25 }}>
                      <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>✕</span>
                    </IconButton>
                  </>
                : <Typography variant="caption" sx={{ color: '#E5E7EB', flex: 1 }}>
                    You have unsaved changes in this syllabus.
                  </Typography>
              }
              <Button variant="outlined" size="small" disabled={saveLoading}
                onClick={() => { setIsDirty(false); setSaveSuccess(false); workspaceApi.execute() }}
                sx={{ textTransform: 'none', borderColor: '#ccc', color: '#666', borderRadius: 1.5 }}>
                Discard
              </Button>
              <Button variant="contained" size="small" disabled={saveLoading} onClick={handleSaveSyllabus}
                sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontWeight: 700, borderRadius: 1.5, minWidth: 100 }}>
                {saveLoading ? 'Saving...' : 'Save Syllabus'}
              </Button>
            </Box>
          )}

          {(aiSectionFields.length > 0 || aiPipelineDrafts || aiReviewOpen) && (
          <Box sx={{
            flexShrink: 0,
            bgcolor: '#15181A',
            borderTop: '2px solid rgba(134,239,172,0.65)',
            px: 2,
            py: 1,
            zIndex: 30,
          }}>
            <Stack spacing={0.75}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <AutoAwesomeIcon sx={{ color: '#86EFAC', fontSize: '1.2rem', flexShrink: 0 }} />
                <Box sx={{ flex: '1 1 180px', minWidth: 140 }}>
                  <Typography variant="caption" sx={{ color: '#86EFAC', display: 'block', fontWeight: 800 }}>
                    Writing assistant
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#E5E7EB', display: 'block' }}>
                    {writingStillRunning(aiGenerating, frameworkAssigning, aiPipelineProgress)
                      ? `Writing ${Math.min((aiPipelineProgress?.completed || 0) + 1, aiPipelineProgress?.total || aiSectionFields.length || 1)} of ${aiPipelineProgress?.total || aiSectionFields.length}: ${aiPipelineProgress?.label || 'Getting started'}`
                      : focusedAiField
                        ? `Regenerate only ${focusedAiField.label}.`
                      : aiPipelineDrafts
                        ? 'Your drafts are ready. Review them before adding them to your syllabus.'
                        : activeSyllabusSectionKey === 'mapping-of-at'
                          ? 'Match the blank columns to the ILOs and topics from the stored SO, IGA, CDIO, and SDG statements.'
                          : activeSyllabusSectionKey === 'tla-activities'
                          ? (/\b(internship|ojt|practicum)\b/i.test(`${course?.course_title || ''} ${course?.course_code || ''}`)
                            ? 'Add one row per requirement. A heavier requirement uses one merged cell such as 1-2, not one row for every calendar week.'
                            : 'Add one row per topic, through week 18. A heavier topic uses one merged cell such as 3-4 or 5-6. A lighter topic uses a single week such as 10 or 14.')
                          : aiSectionFields.length
                          ? `Create ${aiSectionFields.length === 1 ? 'a draft' : `drafts for ${aiSectionFields.length} items`} in ${activeConfiguredSection?.label || 'this section'}. You can review ${aiSectionFields.length === 1 ? 'it' : 'them'} before adding ${aiSectionFields.length === 1 ? 'it' : 'them'}.`
                          : 'Drafting is not available for this section yet.'}
                  </Typography>
                </Box>

                {(!aiPipelineDrafts || focusedAiField) && (
                  <Button
                    size="small"
                    variant="contained"
                    disabled={writingStillRunning(aiGenerating, frameworkAssigning, aiPipelineProgress) || (!focusedAiField && !aiSectionFields.length)}
                    startIcon={writingStillRunning(aiGenerating, frameworkAssigning, aiPipelineProgress) ? <CircularProgress size={15} color="inherit" /> : <AutoAwesomeIcon />}
                    onClick={() => focusedAiField ? generateOneField(focusedAiField) : handleGenerateSection()}
                    sx={{
                      bgcolor: '#16A34A',
                      '&:hover': { bgcolor: '#15803D' },
                      '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.62)', opacity: 1 },
                      textTransform: 'none',
                      fontWeight: 800,
                      minHeight: 34,
                    }}
                  >
                    {writingStillRunning(aiGenerating, frameworkAssigning, aiPipelineProgress) ? 'Writing…' : focusedAiField ? 'Regenerate' : activeSyllabusSectionKey === 'mapping-of-at' ? 'Assign columns' : activeSyllabusSectionKey === 'tla-activities' ? 'Create weekly rows' : aiSectionFields.length === 1 ? 'Create draft' : 'Create drafts'}
                  </Button>
                )}

                {aiPipelineDrafts && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setAiReviewOpen(true)}
                    sx={{
                      color: '#BBF7D0',
                      borderColor: 'rgba(134,239,172,0.5)',
                      textTransform: 'none',
                      fontWeight: 700,
                      '&:hover': { borderColor: '#86EFAC', bgcolor: 'rgba(134,239,172,0.08)' },
                    }}
                  >
                    Review drafts
                  </Button>
                )}
              </Box>

              {writingStillRunning(aiGenerating, frameworkAssigning, aiPipelineProgress) && aiPipelineProgress && (
                <Box sx={{ height: 4, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                  <Box sx={{
                    height: '100%',
                    width: `${Math.min(92, (aiPipelineProgress.completed / Math.max(aiPipelineProgress.total, 1)) * 100)}%`,
                    bgcolor: '#86EFAC',
                    transition: 'width 0.2s linear',
                  }} />
                </Box>
              )}
              {aiError && (
                <Typography role="alert" variant="caption" sx={{ color: '#FCA5A5' }}>
                  {aiError}
                </Typography>
              )}
            </Stack>
          </Box>
          )}

          <Dialog
            open={aiReviewOpen}
            onClose={() => { if (!aiGenerating) setAiReviewOpen(false) }}
            fullWidth
            maxWidth="md"
            aria-labelledby="ai-draft-review-title"
            PaperProps={{
              sx: {
                bgcolor: '#15181A',
                color: '#F9FAFB',
                border: '1px solid rgba(134,239,172,0.35)',
                borderRadius: 2,
              },
            }}
          >
            <DialogTitle id="ai-draft-review-title" sx={{ pb: 0.75, fontWeight: 800 }}>
              {writingStillRunning(aiGenerating, false, aiPipelineProgress) ? 'Creating your drafts' : 'Review your drafts'}
            </DialogTitle>
            <DialogContent dividers sx={{ borderColor: 'rgba(255,255,255,0.12)' }}>
              <DialogContentText sx={{ color: '#D1D5DB', mb: 2 }}>
                {writingStillRunning(aiGenerating, false, aiPipelineProgress)
                  ? `Writing ${Math.min((aiPipelineProgress?.completed || 0) + 1, aiPipelineProgress?.total || aiSectionFields.length || 1)} of ${aiPipelineProgress?.total || aiSectionFields.length}: ${aiPipelineProgress?.label || 'Getting started'}`
                  : 'Check the suggestions below. You can add them to your syllabus, remove them, or try again.'}
              </DialogContentText>
              {writingStillRunning(aiGenerating, false, aiPipelineProgress) ? (
                <Box sx={{ height: 5, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                  <Box sx={{
                    height: '100%',
                    width: `${aiPipelineProgress?.total ? Math.min(92, (aiPipelineProgress.completed / aiPipelineProgress.total) * 100) : 30}%`,
                    bgcolor: '#86EFAC',
                  }} />
                </Box>
              ) : (
                <Stack spacing={1.5}>
                  {(aiPipelineDrafts || []).map((draft, index) => (
                    <Paper
                      key={`${draft.section}-${draft.label}-${index}`}
                      variant="outlined"
                      sx={{
                        p: 1.75,
                        bgcolor: '#202426',
                        color: '#F9FAFB',
                        borderColor: 'rgba(255,255,255,0.14)',
                        borderRadius: 1.5,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ color: '#BBF7D0', fontWeight: 800, mb: 0.75 }}>
                        {draft.label}
                      </Typography>
                      {draft.fieldType === 'customTable' ? (
                        <TableContainer sx={{ maxHeight: 360, overflowX: 'auto' }}>
                          <Table size="small" aria-label={`${draft.label} generated preview`}>
                            <TableHead>
                              <TableRow>
                                {draft.columns.map((column, columnIndex) => (
                                  <TableCell
                                    key={columnIndex}
                                    sx={{ color: '#BBF7D0', fontWeight: 800, borderColor: 'rgba(255,255,255,0.16)' }}
                                  >
                                    {column}
                                  </TableCell>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {draft.rows.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                  {row.map((cell, columnIndex) => (
                                    <TableCell
                                      key={columnIndex}
                                      sx={{
                                        color: '#E5E7EB',
                                        borderColor: 'rgba(255,255,255,0.12)',
                                        verticalAlign: 'top',
                                      }}
                                    >
                                      <MarkdownInline text={cell} />
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <SyllabusDraftText
                          section={draft.section}
                          text={draft.text}
                          sx={{ color: '#E5E7EB' }}
                        />
                      )}
                    </Paper>
                  ))}
                </Stack>
              )}
              {!aiGenerating && (aiPipelineDrafts || []).some(draft => (
                draft.fieldType === 'customTable'
                && (syllabusData.custom_tables?.[draft.section]?.[draft.tableKey] || []).length > 0
              )) && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Adding the table drafts will replace the existing rows in those tables.
                </Alert>
              )}
              {aiError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {aiError}
                </Alert>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                Nothing is added until you choose the check mark.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Tooltip title="Add these drafts to your syllabus and continue">
                  <span>
                    <IconButton
                      aria-label="Add drafts to syllabus and continue"
                      disabled={writingStillRunning(aiGenerating, false, aiPipelineProgress) || !aiPipelineDrafts?.length}
                      onClick={acceptAiDraftsAndContinue}
                      sx={{ color: '#86EFAC', bgcolor: 'rgba(22,163,74,0.16)', '&:hover': { bgcolor: 'rgba(22,163,74,0.3)' } }}
                    >
                      <CheckCircleOutlineIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove these drafts">
                  <span>
                    <IconButton
                      aria-label="Remove generated drafts"
                      disabled={writingStillRunning(aiGenerating, false, aiPipelineProgress) || !aiPipelineDrafts?.length}
                      onClick={discardAiDrafts}
                      sx={{ color: '#FCA5A5', bgcolor: 'rgba(239,68,68,0.12)', '&:hover': { bgcolor: 'rgba(239,68,68,0.24)' } }}
                    >
                      <CloseIcon />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Try again">
                  <span>
                    <IconButton
                      aria-label="Create drafts again"
                      disabled={writingStillRunning(aiGenerating, false, aiPipelineProgress) || !aiSectionFields.length}
                      onClick={regenerateAiDrafts}
                      sx={{ color: '#BBF7D0', bgcolor: 'rgba(134,239,172,0.12)', '&:hover': { bgcolor: 'rgba(134,239,172,0.24)' } }}
                    >
                      <ReplayIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </DialogActions>
          </Dialog>

          {/* Saved confirmation — auto-dismissed after 3 s */}
          {saveSuccess && !isDirty && (
            <Box sx={{ flexShrink: 0 }}>
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
      // Topics available for module generation, read from the selected
      // syllabus section / subsection.
      const moduleTopics = collectScheduleTopics()
      const lectureWeeks = moduleTopics.map(topic => ({
        id: topic.id,
        week: topic.week,
        topic: topic.topic,
        context: topic.context,
      }))
      const topicSection = configuredSections.find(section => section.key === moduleTopicSectionKey)
      const topicSubsections = Array.isArray(topicSection?.subsections) ? topicSection.subsections : []

      // ── DETAIL view ────────────────────────────────────────────────────
      if (selectedModule && moduleContent) {
        const mc = moduleContent
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
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
                    disabled={!moduleContent || moduleSaving}
                    onClick={handleSaveModuleContent}
                    sx={{ bgcolor: MAROON, color: '#fff', borderRadius: 1.5,
                          textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.4,
                          '&:hover': { bgcolor: '#14532D' }, '&:disabled': { bgcolor: '#ccc', color: '#fff' } }}>
                    {moduleSaving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="small" startIcon={<AssignmentIcon sx={{ fontSize: '0.85rem !important' }} />}
                    onClick={() => {
                      setAssessmentParams(p => ({
                        ...p,
                        faculty_topics: mc.module_title || selectedModule.module_title,
                        extra_instructions: `Generate assessment items based on Module "${mc.module_title || selectedModule.module_title}" (Week ${selectedModule.week_number}). Cover the subtopics and learning objectives defined in the module.`,
                      }))
                      selectWorkspaceTab('assessment')
                      openAssessmentGenDialog('single', String(selectedModule.module_title || '').trim())
                    }}
                    sx={{ bgcolor: '#1565c0', color: '#fff', borderRadius: 1.5,
                          textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.4,
                          '&:hover': { bgcolor: '#0d47a1' } }}>
                    Generate Assessment
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
                      <Box key={st.id} sx={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#16161E' }}>
                        {/* Subtopic header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.9,
                                   bgcolor: isExpanded ? 'rgba(22,163,74,0.14)' : 'rgba(255,255,255,0.04)', cursor: 'pointer',
                                   '&:hover': { bgcolor: isExpanded ? 'rgba(22,163,74,0.18)' : 'rgba(255,255,255,0.07)' } }}
                          onClick={() => setExpandedSubtopics(prev => {
                            const next = new Set(prev)
                            isExpanded ? next.delete(st.id) : next.add(st.id)
                            return next
                          })}>
                          <Typography variant="body2" sx={{ flex: 1, fontWeight: 600, color: '#F0F0F2', fontSize: '0.84rem' }}>
                            {st.title || '(Untitled)'}
                          </Typography>
                          <Tooltip title="Generate content from sources">
                            <span>
                              <IconButton size="small" disabled={isGen}
                                onClick={e => { e.stopPropagation(); handleGenerateSubtopicContent(st.id, st.title) }}
                                sx={{ color: '#86EFAC', '&:hover': { bgcolor: 'rgba(22,163,74,0.16)' }, '&.Mui-disabled': { color: 'rgba(255,255,255,0.35)' } }}>
                                {isGen
                                  ? <CircularProgress size={14} sx={{ color: MAROON }} />
                                  : <AutoAwesomeIcon sx={{ fontSize: '1rem' }} />}
                              </IconButton>
                            </span>
                          </Tooltip>
                          {isExpanded
                            ? <ExpandLessIcon sx={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.68)' }} />
                            : <ExpandMoreIcon sx={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.68)' }} />}
                        </Box>
                        {/* Subtopic content */}
                        {isExpanded && (
                          <Box sx={{ px: 1.5, py: 1, bgcolor: '#111318' }}>
                            <TextField multiline minRows={5} fullWidth
                              value={st.content || ''}
                              onChange={e => updateSubtopicField(st.id, 'content', e.target.value)}
                              onClick={() => setChatField(`subtopic:${st.id}`)}
                              placeholder="Subtopic content will appear here after generation or manual editing…"
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.83rem', color: '#F0F0F2', bgcolor: '#15181A',
                                  '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
                                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.24)' },
                                  '&.Mui-focused fieldset': { borderColor: MAROON },
                                },
                                '& .MuiInputBase-input': { color: '#F0F0F2' },
                                '& .MuiInputBase-input::placeholder': { color: 'rgba(255,255,255,0.45)', opacity: 1 },
                              }} />
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
                bgcolor: '#16161E', borderRadius: 2, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
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
                      <MarkdownInline text={msg.content} />
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
                          '&:hover': { bgcolor: '#14532D' }, '&:disabled': { bgcolor: '#ddd' } }}>
                    <SendIcon sx={{ fontSize: '1rem' }} />
                  </IconButton>
                </Box>
              </Box>
            )}
          </Box>
          </Box>
          {renderModuleGenFooter()}
          </Box>
        )
      }

      // ── LIST view ──────────────────────────────────────────────────────
      const modules = workspaceApi.data?.modules || []
      const lectureTopics = moduleTopics
      const topicSourceLabel = [
        topicSection?.label,
        (topicSubsections.find(sub => sub.key === moduleTopicSubsectionKey)?.label) || '',
      ].filter(Boolean).join(' › ')

      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <Stack spacing={2}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
          <Paper elevation={0} sx={{ border: '1px solid rgba(0,0,0,0.09)', borderRadius: 2.5, px: 1.5, py: 0.85 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2"
                sx={{ fontWeight: 700, color: '#444', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Modules
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <MenuBookIcon sx={{ fontSize: '1rem', color: MAROON }} />
                <Typography variant="caption" sx={{ color: '#666', fontWeight: 700 }}>Topics from</Typography>
                <Chip size="small" label="TLA Activities · Lecture/Discussion"
                  sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700, bgcolor: MAROON_LIGHT, color: MAROON,
                        border: '1px solid', borderColor: MAROON_LIGHT }} />
                <Chip size="small"
                  label={`${moduleTopics.length} topic${moduleTopics.length === 1 ? '' : 's'}`}
                  sx={{ height: 22, fontSize: '0.72rem', fontWeight: 700,
                        bgcolor: moduleTopics.length ? MAROON_LIGHT : 'rgba(0,0,0,0.06)',
                        color: moduleTopics.length ? MAROON : '#888',
                        border: '1px solid', borderColor: moduleTopics.length ? MAROON_LIGHT : 'rgba(0,0,0,0.08)' }} />
              </Box>
            </Box>
          </Paper>
          {lectureTopics.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <ViewModuleIcon sx={{ fontSize: 44, color: '#ddd', display: 'block', mx: 'auto', mb: 1.5 }} />
              <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>No Lecture/Discussion topics yet.</Typography>
              <Typography variant="caption" sx={{ color: '#ccc' }}>
                In Teaching, Learning, and Assessment (TLA) Activities, set Delivery Method to Lecture/Discussion and write the topic list. Reading lists are not topics, and two lists in the same week become one module.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1}>
              {lectureTopics.map(topic => {
                const existingMod = modules.find(m => !deletedModuleIds.has(String(m.module_id)) && m.week_number === topic.week)
                  || modules.find(m => !deletedModuleIds.has(String(m.module_id)) && String(m.module_title || '').trim() === topic.topic)
                const isGenerating = moduleGeneratingTopic.has(topic.week)
                return (
                  <Box key={`topic-${topic.id}`}
                    sx={{ display: 'flex', gap: 1, alignItems: 'center', px: 1.5, py: 1,
                      bgcolor: '#1A1A1F', borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.09)' }}>
                    <Chip label={'Wk ' + topic.week} size="small"
                      sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem', flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ color: '#F0F0F2', flex: 1, fontWeight: 600, minWidth: 0 }}>
                      {topic.topic}
                    </Typography>
                    <Chip label={existingMod ? 'Module Ready' : 'No Module'} size="small"
                      sx={{ height: 18, fontSize: '0.65rem', color: existingMod ? '#2e7d32' : '#F0F0F2',
                        bgcolor: existingMod ? 'rgba(46,125,50,0.12)' : 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.12)' }} />
                    {!existingMod ? (
                      <Tooltip title={`Generate AI module for Week ${topic.week}`}>
                        <IconButton size="small" disabled={isGenerating}
                          onClick={() => openGenerateDialog('single', topic)}
                          sx={{ color: '#BBF7D0', bgcolor: 'rgba(134,239,172,0.12)', '&:hover': { bgcolor: 'rgba(134,239,172,0.24)' } }}>
                          {isGenerating ? <CircularProgress size={14} /> : <Zap sx={{ fontSize: '1rem' }} />}
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <>
                        <Tooltip title="Open module">
                          <IconButton size="small"
                            onClick={() => {
                              setSelectedModule(null)
                              setModuleContent(null)
                              setChatOpen(false)
                              setActiveTab('module')
                              handleOpenModule(existingMod)
                            }}
                            sx={{ color: '#1565c0', '&:hover': { bgcolor: 'rgba(21,101,192,0.12)' } }}>
                            <BookOpen sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit module">
                          <IconButton size="small"
                            onClick={() => {
                              setModuleParams(p => ({
                                ...p,
                                module_title: existingMod.module_title,
                                week_number: existingMod.week_number,
                              }))
                              setResultText('')
                              setSelectedModule(null)
                              setModuleContent(null)
                              handleOpenModule(existingMod)
                            }}
                            sx={{ color: '#F0F0F2', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}>
                            <EditIcon sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete module">
                          <IconButton size="small"
                            onClick={() => {
                              setDeletedModuleIds(prev => new Set(prev).add(String(existingMod.module_id)))
                            }}
                            sx={{ color: '#FCA5A5', '&:hover': { bgcolor: 'rgba(239,68,68,0.12)' } }}>
                            <Trash2 sx={{ fontSize: '1rem' }} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                )
              })}
            </Stack>
          )}

          {/* ── Topic source dialog — shown once, before the first generation ── */}
          <Dialog open={topicSourceDialogOpen}
            onClose={() => {}}
            disableEscapeKeyDown
            maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: 2.5 } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
              Where do your module topics live?
            </DialogTitle>
              <DialogContent>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                  <Typography variant="body2" sx={{ color: '#555' }}>
                    Choose the syllabus section that holds the topics you need modules for. Add a
                    subsection to narrow it down to the exact part that holds them.
                  </Typography>
                  {configuredSections.length === 0 ? (
                    <Alert severity="warning" sx={{ fontSize: '0.8rem', alignItems: 'center' }}>
                      Your institution has no syllabus sections configured yet. Add one in the Syllabus tab first.
                    </Alert>
                  ) : (
                    <>
                      <LField select label="Syllabus section" value={moduleTopicSectionKey}
                        onChange={e => {
                          setModuleTopicSectionKey(e.target.value)
                          setModuleTopicSubsectionKey('')
                          setTopicSourceError('')
                        }}
                        sx={{ '& .MuiInputBase-root': { fontSize: '0.9rem' } }}>
                        {configuredSections.map(section => (
                          <MenuItem key={section.key} value={section.key}>{section.label}</MenuItem>
                        ))}
                      </LField>
                      <LField select label="Subsection" value={moduleTopicSubsectionKey}
                        onChange={e => setModuleTopicSubsectionKey(e.target.value)}
                        disabled={!topicSubsections.length}
                        helperText={topicSubsections.length
                          ? 'Keep “Whole section” to use every topic in the section.'
                          : 'This section has no subsections.'}
                        sx={{ '& .MuiInputBase-root': { fontSize: '0.9rem' } }}>
                        <MenuItem value=""><em>Whole section</em></MenuItem>
                        {topicSubsections.map(sub => (
                          <MenuItem key={sub.key} value={sub.key}>{sub.label || sub.key}</MenuItem>
                        ))}
                      </LField>
                    </>
                  )}
                  {topicSourceError && (
                    <Typography variant="caption" sx={{ color: 'error.main' }}>{topicSourceError}</Typography>
                  )}
                  <Alert severity="info" sx={{ fontSize: '0.78rem', alignItems: 'center' }}>
                    Module generation stays locked until you confirm a section.
                  </Alert>
                </Stack>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button onClick={() => { setTopicSourceDialogOpen(false); setActiveTab('syllabus') }}
                  sx={{ textTransform: 'none', fontWeight: 600, color: '#666' }}>
                  Open Syllabus tab
                </Button>
                <Button variant="contained" onClick={handleConfirmTopicSource}
                  disabled={topicSourceSaving || !moduleTopicSectionKey}
                  startIcon={topicSourceSaving
                    ? <CircularProgress size={16} sx={{ color: '#fff' }} />
                    : <LockIcon sx={{ fontSize: '1rem !important' }} />}
                  sx={{ bgcolor: MAROON, textTransform: 'none', fontWeight: 700, borderRadius: 1.5,
                        px: 2, '&:hover': { bgcolor: '#14532D' } }}>
                  {topicSourceSaving ? 'Confirming…' : 'Confirm selection'}
                </Button>
              </DialogActions>
          </Dialog>

          {/* ── Selection confirmed notice ── */}
          <Dialog open={topicSourceNoticeOpen} onClose={() => setTopicSourceNoticeOpen(false)}
            maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2.5 } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700, fontSize: '1rem' }}>
              <CheckCircleOutlineIcon sx={{ color: '#2e7d32' }} />
              Selection confirmed
            </DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ fontSize: '0.9rem' }}>
                Your module topics will come from{' '}
                <strong>{topicSourceLabel || 'the selected section'}</strong>. This choice is now locked
                and <strong>cannot be changed</strong> for this course — every module you generate will
                be based on these same topics.
              </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button variant="contained" onClick={() => setTopicSourceNoticeOpen(false)}
                sx={{ bgcolor: MAROON, textTransform: 'none', fontWeight: 700, borderRadius: 1.5,
                      px: 2, '&:hover': { bgcolor: '#14532D' } }}>
                Got it
              </Button>
            </DialogActions>
          </Dialog>

          {/* ── Generate module dialog ── */}
          <Dialog open={generateDialogOpen}
            onClose={() => setGenerateDialogOpen(false)}
            maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2.5 } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
              {generateDialogMode === 'all' ? 'Generate all modules' : 'Generate module'}
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ mt: 0.5 }}>
                {generateDialogMode === 'all' ? (
                  <Alert severity="info" sx={{ fontSize: '0.8rem', alignItems: 'center' }}>
                    One module for each of the {moduleTopics.length} Lecture/Discussion weeks. Lists in the same week are already combined. Reading lists are not included.
                  </Alert>
                ) : (
                  <LField select label="Module Topic" value={moduleParams.module_title}
                    onChange={e => {
                      const sel = lectureWeeks.find(lw => lw.topic === e.target.value)
                      setModuleParams(p => ({
                        ...p,
                        module_title: e.target.value,
                        week_number: sel ? sel.week : p.week_number,
                        topic_id: sel ? sel.id : '',
                      }))
                    }}
                    helperText={lectureWeeks.length
                      ? `${lectureWeeks.length} Lecture/Discussion week${lectureWeeks.length === 1 ? '' : 's'}. Same-week lists are one choice.`
                      : 'No Lecture/Discussion topics in TLA Activities. Set Delivery Method to Lecture/Discussion.'}
                    sx={{ '& .MuiInputBase-root': { fontSize: '0.9rem' } }}>
                    <MenuItem value=""><em>— Select a topic —</em></MenuItem>
                    {lectureWeeks.map(lw => (
                      <MenuItem key={lw.id} value={lw.topic}>
                        Wk {lw.week} — {lw.topic.length > 60 ? `${lw.topic.slice(0, 57)}…` : lw.topic}
                      </MenuItem>
                    ))}
                  </LField>
                )}

                {generateDialogMode === 'single' && (
                  <LField select label="Week Number" value={moduleParams.week_number}
                    onChange={e => {
                      const sel = lectureWeeks.find(lw => String(lw.week) === String(e.target.value))
                      setModuleParams(p => ({
                        ...p,
                        week_number: e.target.value,
                        module_title: sel ? sel.topic : p.module_title,
                        topic_id: sel ? sel.id : '',
                      }))
                    }}
                    sx={{ '& .MuiInputBase-root': { fontSize: '0.9rem' } }}>
                    <MenuItem value=""><em>— Select week —</em></MenuItem>
                    {lectureWeeks.map(lw => (
                      <MenuItem key={lw.id} value={lw.week}>
                        Week {lw.week}{lw.topic ? ` — ${lw.topic.slice(0, 40)}` : ''}
                      </MenuItem>
                    ))}
                  </LField>
                )}

                <LField select label="Structuring Level" value={moduleParams.structuring_level}
                  onChange={e => setModuleParams(p => ({ ...p, structuring_level: e.target.value }))}
                  helperText="Tells the AI how deeply to structure the module."
                  sx={{ '& .MuiInputBase-root': { fontSize: '0.9rem' } }}>
                  {STRUCTURING_LEVELS.map(level => (
                    <MenuItem key={level.value} value={level.value}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.88rem' }}>{level.label}</Typography>
                        <Typography variant="caption" sx={{ color: '#777' }}>{level.description}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </LField>

                {actionError && <AutoAlert message={actionError} onClose={() => setActionError('')} />}

                {(actionLoading || moduleGeneratingAll) && (
                  <Box sx={{ textAlign: 'center', py: 1 }}>
                    <Typography variant="caption" sx={{ color: '#888', display: 'block' }}>
                      Generation continues in the module view. You can close this card.
                    </Typography>
                  </Box>
                )}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button onClick={() => setGenerateDialogOpen(false)}
                sx={{ textTransform: 'none', fontWeight: 600, color: '#666' }}>
                Cancel
              </Button>
              <Button variant="contained"
                onClick={generateDialogMode === 'all' ? handleGenerateAllModules : handleGenerateModule}
                disabled={actionLoading || moduleGeneratingAll
                  || (generateDialogMode === 'single' && !moduleParams.module_title.toString().trim())}
                startIcon={actionLoading || moduleGeneratingAll
                  ? <CircularProgress size={16} sx={{ color: '#fff' }} />
                  : <Zap sx={{ fontSize: '1rem !important' }} />}
                sx={{ bgcolor: MAROON, color: '#fff', textTransform: 'none', fontWeight: 700, borderRadius: 1.5,
                      px: 2, '&:hover': { bgcolor: '#14532D' } }}>
                {actionLoading || moduleGeneratingAll ? 'Generating…' : 'Generate'}
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
        </Box>
        {renderModuleGenFooter({ showCreate: true })}
        </Box>
      )
    }

    if (activeTab === 'tos') {
      return (
        <Stack spacing={2} sx={{ height: '100%', overflow: 'auto' }}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#444', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Table of Specifications
              </Typography>
              <Typography variant="caption" sx={{ color: '#777' }}>
                Define assessment coverage here, then use the module matches to prepare assessments.
              </Typography>
            </Box>
            <Button size="small" variant="contained" startIcon={saveLoading ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <SaveIcon fontSize="small" />} disabled={saveLoading || !isDirty} onClick={handleSaveSyllabus} sx={{ textTransform: 'none', bgcolor: MAROON, '&:hover': { bgcolor: '#15803D' } }}>
              {saveLoading ? 'Saving…' : saveSuccess ? 'Saved' : 'Save TOS'}
            </Button>
          </Box>
          {renderSyllabusSection('tos')}
        </Stack>
      )
    }
    if (activeTab === 'assessment') {
      const majorExams = getMajorTosExams()
      const blueprint = getAssessmentBlueprint()
      const assessments = workspaceApi.data?.assessments || []
      const assessmentGenTopics = assessmentGenAvailableTopics()
      const canGenerateAssessment = majorExams.some(exam =>
        (exam.topics || []).some(row => String(row?.topic || row?.label || '').trim())
      )

      if (selectedAssessment && assessmentDetail) {
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
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
                    setAnswerSheetTemplate(null)
                  }}
                  sx={{ color: '#666', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 1 }}>
                  <ArrowBackIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: MAROON, fontSize: '0.9rem', textTransform: 'uppercase' }}>
                  {String(assessmentDetail.title || 'Assessment').toUpperCase()}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                  <Typography variant="caption" sx={{ color: '#777', fontWeight: 700 }}>
                    Assessment ID
                  </Typography>
                  <Chip
                    size="small"
                    label={formatAssessmentId(assessmentDetail.assessment_id)}
                    sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem' }}
                  />
                  <Tooltip title={copiedAssessmentId === String(assessmentDetail.assessment_id || '') ? 'Copied!' : 'Copy full UUID'}>
                    <IconButton
                      size="small"
                      onClick={() => copyAssessmentId(assessmentDetail.assessment_id)}
                      sx={{ color: MAROON, p: 0.4 }}
                    >
                      <ContentCopyIcon sx={{ fontSize: '0.9rem' }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
              {(() => {
                const returnedCount = Array.isArray(assessmentDetail.items) ? assessmentDetail.items.length : 0
                const explicitTarget = Number(assessmentDetail.target_total_items || 0)
                const totalTarget = explicitTarget > 0 ? explicitTarget : null
                return (
                  <Chip
                    size="small"
                    label={totalTarget !== null ? `${returnedCount}/${totalTarget} items` : `${returnedCount} items`}
                    sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 22, fontSize: '0.68rem' }}
                  />
                )
              })()}
              <Button
                size="small"
                startIcon={<PictureAsPdfIcon sx={{ fontSize: '0.85rem !important' }} />}
                endIcon={<ExpandMoreIcon sx={{ fontSize: '0.85rem !important' }} />}
                disabled={answerSheetLoading || bubbleSheetPreviewLoading}
                onClick={(e) => setBubbleSheetMenuAnchor(e.currentTarget)}
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
                }}
              >
                Bubble Sheet
              </Button>
              <Menu
                anchorEl={bubbleSheetMenuAnchor}
                open={Boolean(bubbleSheetMenuAnchor)}
                onClose={() => setBubbleSheetMenuAnchor(null)}
              >
                <MenuItem onClick={() => { setBubbleSheetMenuAnchor(null); handleViewBubbleSheet() }}>
                  View PDF
                </MenuItem>
                <MenuItem onClick={() => { setBubbleSheetMenuAnchor(null); handleOpenAnswerSheetDialog() }}>
                  {answerSheetTemplate ? 'Modify' : 'Create'}
                </MenuItem>
              </Menu>

              <Button size="small" startIcon={<InsertDriveFileIcon sx={{ fontSize: '0.85rem !important' }} />}
                endIcon={<ExpandMoreIcon sx={{ fontSize: '0.85rem !important' }} />}
                disabled={assessmentExporting}
                onClick={(e) => setExportMenuAnchor(e.currentTarget)}
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
              <Menu
                anchorEl={exportMenuAnchor}
                open={Boolean(exportMenuAnchor)}
                onClose={() => setExportMenuAnchor(null)}
              >
                <MenuItem onClick={() => {
                  setExportMenuAnchor(null)
                  handleExportAssessmentDocx({ includeChoices: true, includeAnswerKey: false })
                }}>
                  Questions + Choices (Exam)
                </MenuItem>
                <MenuItem onClick={() => {
                  setExportMenuAnchor(null)
                  handleExportAssessmentDocx({ includeChoices: true, includeAnswerKey: true })
                }}>
                  Questions + Choices + Answer Key
                </MenuItem>
              </Menu>
            </Box>

            {(assessmentDetail.items || []).length === 0 ? (
              <SectionCard title="Assessment Items">
                <Typography variant="body2" sx={{ color: '#999' }}>
                  No items found for this assessment.
                </Typography>
              </SectionCard>
            ) : (
              <Stack spacing={0.6}>
                {(assessmentDetail.items || []).map(item => {
                  const isEditing = editingItemId === item.item_id
                  const draft = isEditing ? editingItemDraft : null
                  return (
                    <Box
                      key={item.item_id || item.item_number}
                      sx={{ px: 1.25, py: 0.9, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 1.25, bgcolor: '#1A1A1F' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
                        <Typography variant="caption" sx={{ color: '#777', fontWeight: 700 }}>
                          Item {item.item_number}
                        </Typography>
                        {item.section_title && item.section_title !== 'General Section' && (
                          <Chip
                            size="small"
                            label={item.section_title}
                            sx={{ bgcolor: '#F3F5F8', color: '#555', fontWeight: 600, height: 20, fontSize: '0.66rem', maxWidth: 200 }}
                          />
                        )}
                        {item.bloom_level && (
                          <Chip
                            size="small"
                            label={item.bloom_level}
                            sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.66rem' }}
                          />
                        )}
                        <Box sx={{ flex: 1 }} />
                        {!isEditing ? (
                          <Stack direction="row" spacing={0.4}>
                            <Tooltip title="Regenerate choices only (keeps question text)">
                              <Button
                                size="small"
                                startIcon={<AutoAwesomeIcon sx={{ fontSize: '0.75rem !important' }} />}
                                onClick={() => handleRegenerateItemChoices(item.item_number)}
                                disabled={actionLoading}
                                sx={{ textTransform: 'none', color: '#8B4513', fontSize: '0.68rem', px: 0.8, minWidth: 0 }}
                              >
                                Choices
                              </Button>
                            </Tooltip>
                            <Button
                              size="small"
                              startIcon={<EditIcon sx={{ fontSize: '0.8rem !important' }} />}
                              onClick={() => handleStartItemEdit(item)}
                              sx={{ textTransform: 'none', color: MAROON, fontSize: '0.72rem', px: 1, minWidth: 0 }}
                            >
                              Edit
                            </Button>
                          </Stack>
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
                              sx={{ textTransform: 'none', bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, fontSize: '0.72rem', px: 1.2, minWidth: 0 }}
                            >
                              {itemSaving ? 'Saving…' : 'Save'}
                            </Button>
                          </Stack>
                        )}
                      </Box>

                      {!isEditing ? (
                        <>
                          <Typography variant="body2" sx={{ color: '#2f2f2f', fontWeight: 600 }}>
                            {item.question_text}
                          </Typography>
                          {item.bloom_verb && (
                            <Typography variant="caption" sx={{ color: '#777' }}>
                              Verb: {item.bloom_verb}
                            </Typography>
                          )}
                          {!!item.matched_module_title && (
                            <Typography variant="caption" display="block" sx={{ color: '#8a5a00', mt: 0.35 }}>
                              Grounded on module: {item.matched_module_title}{item.matched_module_week ? ` (Week ${item.matched_module_week})` : ''}
                            </Typography>
                          )}
                          {(item.choices || []).slice(0, 4).length > 0 && (
                            <Stack spacing={0.35} sx={{ mt: 0.9 }}>
                              {(item.choices || []).slice(0, 4).map((choice, choiceIndex) => (
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
                                  Correct Answer: {item.correct_answer === '*' ? 'Bonus (every paper gets the point)' : item.correct_answer}
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
                            {(draft?.choices || []).slice(0, 4).map((choice, choiceIndex) => (
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
                              <MenuItem value="*">Bonus — everyone gets the point</MenuItem>
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
            )}
          </Stack>
          </Box>
          {(actionLoading && assessmentBatchProgress) && (
            <Box sx={{
              flexShrink: 0,
              bgcolor: '#15181A',
              borderTop: '2px solid rgba(134,239,172,0.65)',
              px: 2,
              py: 1,
            }}>
              <Stack spacing={0.75}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} sx={{ color: '#86EFAC' }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: '#86EFAC', display: 'block', fontWeight: 800 }}>
                      Assessment generation
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#E5E7EB', display: 'block' }}>
                      {assessmentBatchProgress.detail
                        || `Generating ${assessmentBatchProgress.generated} of ${assessmentBatchProgress.requested} items`}
                    </Typography>
                  </Box>
                  {Number(assessmentBatchProgress.requested) > 0 && (
                    <Typography variant="caption" sx={{ color: '#86EFAC', fontWeight: 700 }}>
                      {assessmentBatchProgress.generated}/{assessmentBatchProgress.requested}
                    </Typography>
                  )}
                </Box>
                <LinearProgress
                  variant={assessmentBatchProgress.requested ? 'determinate' : 'indeterminate'}
                  value={assessmentBatchProgress.requested
                    ? (assessmentBatchProgress.generated / Math.max(assessmentBatchProgress.requested, 1)) * 100
                    : undefined}
                  sx={{
                    height: 4,
                    borderRadius: 4,
                    bgcolor: 'rgba(255,255,255,0.12)',
                    '& .MuiLinearProgress-bar': { bgcolor: '#86EFAC' },
                  }}
                />
              </Stack>
            </Box>
          )}
          </Box>
        )
      }

      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <Stack spacing={2}>
          <AutoAlert message={actionError} onClose={() => setActionError('')} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2"
                sx={{ fontWeight: 700, color: '#444', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Assessments
              </Typography>
            </Box>

            {!canGenerateAssessment && (
              <Alert severity="info" sx={{ fontSize: '0.8rem', alignItems: 'center' }}>
                 Add a major exam with TOS topics first, then map those topics to generated modules before creating an assessment.
              </Alert>
            )}

            {/* ── Assessment generation dialog ── */}
            <Dialog open={assessmentGenDialogOpen}
              onClose={() => { if (!actionLoading) setAssessmentGenDialogOpen(false) }}
              maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 2.5 } }}>
              <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
                {assessmentGenMode === 'multi' ? 'Create assessment' : 'Generate assessment'}
              </DialogTitle>
              <DialogContent>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                  <Box sx={{
                    px: 1.5, py: 1.15, borderRadius: 1.5,
                    bgcolor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.5 }}>
                      Choose an exam generated in TOS, then select the topics to cover. TOS supplies the assessment structure, Bloom distribution, and item count.
                    </Typography>
                  </Box>
                  {majorExams.length > 0 && (
                    <LField
                      select
                      label="Exam from TOS"
                      value={examSelectValue(
                        majorExams.find(exam =>
                          (exam.examCode && exam.examCode === assessmentParams.source_exam_code)
                          || (exam.examLabel && exam.examLabel === assessmentParams.source_exam_label)
                        ) || majorExams[0]
                      )}
                      onChange={e => {
                        const exam = majorExams.find(item => examSelectValue(item) === e.target.value)
                        applyAssessmentGenExam(exam)
                      }}
                    >
                      {majorExams.map(exam => (
                        <MenuItem key={examSelectValue(exam)} value={examSelectValue(exam)}>
                          {exam.examLabel}
                        </MenuItem>
                      ))}
                    </LField>
                  )}
                  <Box>
                    <LField label="Assessment Title" value={assessmentGenTitle}
                      onChange={e => setAssessmentGenTitle(e.target.value)} />
                    {majorExams.length > 0 && (
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: 'block', mt: 0.75 }}>
                        {(() => {
                          const allocated = Number(blueprint.totalItems || 0)
                          return `${allocated} item${allocated === 1 ? '' : 's'} allocated by TOS`
                        })()}
                      </Typography>
                    )}
                  </Box>
                  {!majorExams.length && (
                    <LField label="Number of Items" type="number" value={assessmentGenItemCount}
                      onChange={e => setAssessmentGenItemCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                      inputProps={{ min: 1, max: 100 }} />
                  )}
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600, display: 'block', mb: 0.5 }}>
                      Topics to cover
                    </Typography>
                    {assessmentGenTopics.length === 0 ? (
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>No topics available for this exam.</Typography>
                    ) : (
                      <Stack spacing={0.25} sx={{ maxHeight: 260, overflowY: 'auto' }}>
                        {assessmentGenTopics.map(({ topic, week, moduleTitle }) => (
                          <Box key={topic} onClick={() => toggleAssessmentGenTopic(topic)}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, borderRadius: 1,
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}>
                            <Checkbox size="small"
                              checked={assessmentGenSelectedTopics.includes(topic)}
                              sx={{ p: 0.5, color: 'rgba(255,255,255,0.45)', '&.Mui-checked': { color: MAROON } }} />
                            <Typography variant="body2" sx={{ fontSize: '0.84rem' }}>
                              {week ? `Wk ${week} — ` : ''}{topic}
                              {moduleTitle ? `  ·  Module: ${moduleTitle}` : '  ·  No matching module'}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Box>
                  {actionLoading && (
                    <Box sx={{ textAlign: 'center', py: 1 }}>
                      <CircularProgress size={22} sx={{ color: MAROON }} />
                      <Typography variant="caption" sx={{ color: '#888', display: 'block', mt: 0.75 }}>
                        Building your assessment — this can take a minute.
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                <Button onClick={() => setAssessmentGenDialogOpen(false)} disabled={actionLoading}
                  sx={{ textTransform: 'none', fontWeight: 600, color: '#666' }}>
                  Cancel
                </Button>
                <Button variant="contained" onClick={handleAssessmentGenSubmit}
                  disabled={actionLoading || assessmentGenSelectedTopics.length === 0}
                  startIcon={actionLoading
                    ? <CircularProgress size={16} sx={{ color: '#fff' }} />
                    : <Zap sx={{ fontSize: '1rem !important' }} />}
                  sx={{ bgcolor: MAROON, color: '#fff', textTransform: 'none', fontWeight: 700, borderRadius: 1.5,
                        px: 2, '&:hover': { bgcolor: '#14532D' } }}>
                  {actionLoading ? 'Generating…' : 'Generate'}
                </Button>
              </DialogActions>
            </Dialog>

            {assessments.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <AssignmentIcon sx={{ fontSize: 44, color: '#ddd', display: 'block', mx: 'auto', mb: 1.5 }} />
                <Typography variant="body2" sx={{ color: '#aaa', mb: 0.5 }}>No assessments yet.</Typography>
                <Typography variant="caption" sx={{ color: '#ccc' }}>
                  Click Create Assessment to build items from your selected module topics.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={0.75}>
                {assessments.map(a => (
                  <Box
                    key={a.assessment_id}
                    sx={{
                      display: 'flex',
                      gap: 1,
                      alignItems: 'center',
                      px: 1.75,
                      py: 1.1,
                      bgcolor: '#1A1A1F',
                      borderRadius: 1.5,
                      border: '1px solid rgba(255,255,255,0.09)',
                      cursor: 'pointer',
                      '&:hover': { borderColor: MAROON + '88', bgcolor: 'rgba(22,163,74,0.20)' },
                    }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }} onClick={() => handleOpenAssessment(a)}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexShrink: 0 }}>
                        <Typography variant="caption" sx={{ color: '#777', fontWeight: 700 }}>
                          Assessment ID
                        </Typography>
                        <Chip
                          label={formatAssessmentId(a.assessment_id)}
                          size="small"
                          sx={{ bgcolor: MAROON_LIGHT, color: MAROON, fontWeight: 700, height: 20, fontSize: '0.68rem' }}
                        />
                        <Tooltip title={copiedAssessmentId === String(a.assessment_id || '') ? 'Copied!' : 'Copy full UUID'}>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation()
                              copyAssessmentId(a.assessment_id)
                            }}
                            sx={{ color: MAROON, p: 0.4 }}
                          >
                            <ContentCopyIcon sx={{ fontSize: '0.85rem' }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Typography variant="body2" sx={{ color: '#333', flex: 1, fontWeight: 500, ml: 1, textTransform: 'uppercase' }}>{a.title}</Typography>
                    </Box>
                    <Chip label={a.status} size="small" sx={{ height: 18, fontSize: '0.65rem', color: '#F0F0F2', bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                    <IconButton
                      size="small"
                      onClick={e => {
                        e.stopPropagation()
                        setConfirmDeleteAssessmentId(a.assessment_id)
                      }}
                      sx={{ color: '#b71c1c' }}
                    >
                      <DeleteIcon sx={{ fontSize: '1rem' }} />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
          </Box>
          <Box sx={{
            flexShrink: 0,
            bgcolor: '#15181A',
            borderTop: '2px solid rgba(134,239,172,0.65)',
            px: 2,
            py: 1,
          }}>
            <Stack spacing={0.75}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <AutoAwesomeIcon sx={{ color: '#86EFAC', fontSize: '1.2rem', flexShrink: 0 }} />
                <Box sx={{ flex: '1 1 180px', minWidth: 140 }}>
                  <Typography variant="caption" sx={{ color: '#86EFAC', display: 'block', fontWeight: 800 }}>
                    Assessment generation
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#E5E7EB', display: 'block' }}>
                    {actionLoading && assessmentBatchProgress
                      ? (assessmentBatchProgress.detail
                        || (assessmentBatchProgress.requested
                          ? `Generating ${assessmentBatchProgress.generated} of ${assessmentBatchProgress.requested} items`
                          : 'Preparing the assessment items…'))
                      : 'Create an assessment from the TOS exam. You can choose the topics before generating.'}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!canGenerateAssessment || actionLoading}
                  startIcon={actionLoading ? <CircularProgress size={15} color="inherit" /> : <AutoAwesomeIcon />}
                  onClick={() => openAssessmentGenDialog('multi')}
                  sx={{
                    bgcolor: '#16A34A',
                    color: '#fff',
                    borderRadius: 1.5,
                    textTransform: 'none',
                    fontWeight: 700,
                    '&:hover': { bgcolor: '#15803D' },
                    '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.38)' },
                  }}
                >
                  {actionLoading ? 'Generating…' : 'Create Assessment'}
                </Button>
              </Box>
              {actionLoading && (
                <LinearProgress
                  variant={assessmentBatchProgress?.requested ? 'determinate' : 'indeterminate'}
                  value={assessmentBatchProgress?.requested
                    ? (assessmentBatchProgress.generated / Math.max(assessmentBatchProgress.requested, 1)) * 100
                    : undefined}
                  sx={{
                    height: 4,
                    borderRadius: 4,
                    bgcolor: 'rgba(255,255,255,0.12)',
                    '& .MuiLinearProgress-bar': { bgcolor: '#86EFAC' },
                  }}
                />
              )}
            </Stack>
          </Box>
        </Box>
        )


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
              {(() => {
                const majorExams = getMajorTosExams()
                const nameOptions = majorExams.map(exam => exam.examLabel).filter(Boolean)
                const selectedExam = majorExams.find(exam =>
                  (exam.examCode && exam.examCode === assessmentParams.source_exam_code)
                  || (exam.examLabel && exam.examLabel === assessmentParams.source_exam_label)
                ) || majorExams[0] || null

                const assessmentName = selectedExam?.examLabel || blueprint.assessmentName || ''
                const numberOfItems = selectedExam?.totalItems ?? blueprint.totalItems ?? 0
                const selectedTopics = (selectedExam?.topics || [])
                  .map(t => String(t?.topic || '').trim())
                  .filter(Boolean)

                const weeklyTopics = (syllabusData?.tla_chapters || [])
                  .map(ch => String(ch?.topics || '').trim().toLowerCase())
                  .filter(Boolean)

                const linkedTopics = selectedTopics.filter(topic => weeklyTopics.includes(topic.toLowerCase()))
                const sourceText = linkedTopics.length
                  ? `TOS Topics linked to weekly modules: ${linkedTopics.join(', ')}`
                  : (selectedTopics.length
                    ? `TOS Topics: ${selectedTopics.join(', ')}`
                    : 'TOS topics are not available for the selected exam.')

                const displayedAssessmentId = assessmentDetail?.assessment_id || assessmentSessionId || 'Not yet created'

                return (
                  <>
                    <Box sx={{ p: 1.25, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 1.5, bgcolor: '#1A1A1F' }}>
                      <Typography variant="caption" sx={{ color: '#777', display: 'block', fontSize: '0.7rem', mb: 0.35 }}>
                        Assessment ID
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#222' }}>
                        {displayedAssessmentId}
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.25 }}>
                      <Box sx={{ p: 1.25, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: BG }}>
                        <LField
                          select
                          label="Assessment Name"
                          value={assessmentName}
                          onChange={e => {
                            const selectedValue = e.target.value
                            const match = majorExams.find(exam => exam.examLabel === selectedValue)
                            setAssessmentParams(p => ({
                              ...p,
                              source_exam_label: selectedValue,
                              source_exam_code: match?.examCode || '',
                              target_total_items: match?.totalItems || 0,
                              assessment_type: 'Major Examination',
                              target_item_number: 1,
                              related_item_number: '',
                            }))
                          }}
                        >
                          {nameOptions.map(name => (
                            <MenuItem key={name} value={name}>{name}</MenuItem>
                          ))}
                        </LField>
                      </Box>

                      <Box sx={{ p: 1.25, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: BG }}>
                        <LField
                          label="Assessment Type"
                          value="Major Examination"
                          inputProps={{ readOnly: true }}
                        />
                      </Box>

                      <Box sx={{ p: 1.25, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 1.5, bgcolor: BG }}>
                        <LField
                          type="number"
                          label="Number of Items"
                          value={numberOfItems}
                          inputProps={{ readOnly: true, min: 1 }}
                        />
                      </Box>
                    </Box>

                    <Box sx={{ p: 1.25, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 1.5, bgcolor: '#1A1A1F' }}>
                      <LField
                        label="Assessment Source"
                        value={sourceText}
                        multiline
                        minRows={2}
                        inputProps={{ readOnly: true }}
                      />
                      <Typography variant="caption" sx={{ color: '#777', display: 'block', mt: 0.5 }}>
                         Topics and Bloom allocations are taken from the selected TOS exam; module matches are alignment references only.
                      </Typography>
                    </Box>
                  </>
                )
              })()}
              <Box sx={{ p: 1.25, border: '1px solid rgba(255,255,255,0.09)', borderRadius: 1.5, bgcolor: '#1A1A1F' }}>
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
                    inputProps={{ min: 1, max: (Number(assessmentParams.target_total_items || 0) || Number(blueprint.totalItems || 0) || undefined) }}
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
                {PROVIDERS.map(p => <MenuItem key={p} value={p}>{PROVIDER_LABELS[p]}</MenuItem>)}
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
        <BubbleSheetPanel
          courseId={courseId} 
          assessments={workspaceApi.data?.assessments || []}
          onModifyTemplate={handleModifyBubbleSheet}
        />
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
                    <Tooltip title={doc.rag_status === 'FAILED' ? (doc.error_message || 'Indexing failed. Upload the file again.') : ''}>
                      <Chip label={doc.rag_status === 'PROCESSING' ? 'INDEXING…' : (doc.rag_status || 'OK')} size="small"
                        sx={{ height: 16, fontSize: '0.58rem', flexShrink: 0,
                             bgcolor: doc.rag_status === 'COMPLETED' ? '#E8F5E9' : doc.rag_status === 'FAILED' ? '#FFEBEE' : '#FFF3E0',
                             color:   doc.rag_status === 'COMPLETED' ? '#2E7D32' : doc.rag_status === 'FAILED' ? '#C62828' : '#E65100' }} />
                    </Tooltip>
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

        <Dialog open={Boolean(confirmDeleteAssessmentId)} onClose={() => setConfirmDeleteAssessmentId(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: '#c62828' }}>Delete Assessment?</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ fontSize: '0.85rem' }}>
              This will permanently remove the selected assessment and its generated items.
              You cannot undo this action.
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
            <Button size="small" onClick={() => setConfirmDeleteAssessmentId(null)}
              sx={{ textTransform: 'none', color: '#666' }}>Cancel</Button>
            <Button size="small" variant="contained"
              disabled={Boolean(deletingAssessmentId)}
              onClick={() => { const id = confirmDeleteAssessmentId; setConfirmDeleteAssessmentId(null); handleDeleteAssessment(id) }}
              sx={{ bgcolor: '#c62828', '&:hover': { bgcolor: '#b71c1c' }, textTransform: 'none', fontWeight: 600 }}>
              {deletingAssessmentId ? 'Deleting…' : 'Delete'}
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
      className="faculty-workspace"
      sx={{ height: '100vh', bgcolor: BG, color: '#F0F0F2', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── ATLAS pipeline header: enriched top bar + progress stepper ── */}
      {/* Step 11 (Faculty Review & Approval) lives in WorkspacePageHeader's check. */}
      <Box component="header"
        sx={{
          px: { xs: 1.5, md: 3 }, pt: 1.5, pb: 1.25, flexShrink: 0,
          bgcolor: 'rgba(8,8,10,0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        }}>
        <WorkspacePageHeader
          course={course}
          activeLabel={(WORKSPACE_TABS.find((t) => t.key === activeTab) || {}).label || activeTab}
          done={Boolean(isStepDone && isStepDone(activeTab))}
          doneCount={workspaceProgress.doneCount}
          totalSteps={workspaceProgress.totalSteps}
          actionLoading={actionLoading}
          onBack={() => navigate('/faculty/dashboard')}
          onToggleDone={() => markStepDone(activeTab, !isStepDone(activeTab))}
        />
        <Box sx={{ mt: 1.25 }}>
          <WorkspacePipelineStepper
            activeTab={activeTab}
            isStepDone={isStepDone}
            onSelect={selectWorkspaceTab}
            doneCount={workspaceProgress.doneCount}
            totalSteps={workspaceProgress.totalSteps}
          />
        </Box>
        {isMobile && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button size="small" startIcon={<MenuIcon fontSize="small" />} onClick={() => setMobileNavOpen(true)}
              sx={{ textTransform: 'none', color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.15)' }} variant="outlined">
              Modules
            </Button>
            {activeTab !== 'analytics' && activeTab !== 'grading' && (
              <Button size="small" startIcon={<CloudUploadIcon fontSize="small" />} onClick={() => setMobileUploadOpen(true)}
                sx={{ textTransform: 'none', color: '#86EFAC', borderColor: 'rgba(22,163,74,0.4)' }} variant="outlined">
                Sources
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* Mobile nav Drawer — pipeline steps with completion checks */}
      <Drawer anchor="left" open={isMobile && mobileNavOpen} onClose={() => setMobileNavOpen(false)}
        PaperProps={{ sx: { width: 260, display: 'flex', flexDirection: 'column', bgcolor: '#101014' } }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="caption"
            sx={{ color: '#86EFAC', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.6rem', fontWeight: 700 }}>
            Course Workflow - {workspaceProgress.doneCount}/{workspaceProgress.totalSteps} done
          </Typography>
        </Box>
        <Stack sx={{ p: 1, gap: 0.25, flex: 1 }}>
          {WORKSPACE_TABS.map(({ key, label, Icon }) => {
            const on = activeTab === key
            const stepDone = Boolean(isStepDone && isStepDone(key))
            return (
              <Button key={key} onClick={() => selectWorkspaceTab(key)}
                startIcon={<Icon sx={{ fontSize: '1.05rem !important' }} />}
                endIcon={stepDone ? <CheckCircleIcon sx={{ fontSize: '1rem !important', color: '#4ADE80' }} /> : null}
                sx={{
                  justifyContent: 'flex-start', px: 1.5, py: 0.9,
                  borderRadius: 1.5, textTransform: 'none', fontSize: '0.85rem',
                  fontWeight: on ? 700 : 400, color: on ? '#86EFAC' : 'rgba(255,255,255,0.65)',
                  bgcolor: on ? 'rgba(22,163,74,0.16)' : 'transparent',
                  borderLeft: on ? '3px solid #16A34A' : '3px solid transparent',
                  minWidth: 0,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.06)', color: '#fff' },
                }}>
                {label}{stepDone ? ' - Done' : ''}
              </Button>
            )
          })}
        </Stack>
        <Divider sx={{ borderColor: 'rgba(0,0,0,0.06)' }} />
        <Button onClick={() => { logout(); navigate('/signin') }} fullWidth
          startIcon={<LogoutIcon sx={{ fontSize: '1.05rem !important' }} />}
          sx={{
            justifyContent: 'flex-start', px: 1.5, py: 0.9, borderRadius: 0,
            textTransform: 'none', fontSize: '0.85rem', fontWeight: 600, color: '#16A34A',
            '&:hover': { bgcolor: 'rgba(22,163,74,0.08)' },
          }}>
          Sign Out
        </Button>
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

      {/* Main content area — modules render below the top pipeline stepper */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', userSelect: dragging ? 'none' : 'auto', bgcolor: '#0F0F12' }}>

        {/* MIDDLE — main module content below the top pipeline stepper */}

        {/* Main module content renders below the top pipeline stepper */}

        {/* MIDDLE */}
        <Box sx={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(activeTab === 'syllabus' || activeTab === 'module' || activeTab === 'assessment' ? {} : { overflow: 'auto', p: 2.5 }),
        }}>
          {activeTab === 'syllabus' || activeTab === 'module' || activeTab === 'assessment'
            ? <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: 2.5, pb: 0 }}>{renderCenterPanel()}</Box>
            : renderCenterPanel()
          }
        </Box>

        {/* Drag — right (desktop only when expanded) */}
        {!isMobile && !rightCollapsed && activeTab !== 'analytics' && activeTab !== 'grading' && (
          <Box onMouseDown={() => setDragging('right')}
            sx={{ width: 4, flexShrink: 0, cursor: 'col-resize',
                  bgcolor: dragging === 'right' ? MAROON + '44' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(21,128,61,0.14)' }, transition: 'background-color 0.15s' }} />
        )}

        {/* RIGHT — sources panel (desktop) or compact rail when collapsed */}
        {!isMobile && !rightCollapsed && activeTab !== 'analytics' && activeTab !== 'grading' && (
          <Box sx={{ width: rightWidth, flexShrink: 0, bgcolor: 'rgba(10,10,14,0.88)', borderLeft: '1px solid rgba(255,255,255,0.08)', overflow: 'auto', p: 0 }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F0F0F2' }}>
                {activeTab === 'assessment' && selectedAssessment && assessmentDetail ? 'Assessment Tools' : 'Sources'}
              </Typography>
              <Tooltip title="Collapse panel">
                <IconButton size="small" onClick={toggleRightPanel} sx={{ color: 'rgba(255,255,255,0.55)' }}>
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

        {!isMobile && rightCollapsed && activeTab !== 'analytics' && activeTab !== 'grading' && (
          <Box sx={{ width: 68, flexShrink: 0, bgcolor: 'rgba(10,10,14,0.88)', borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'center', py: 1 }}>
            <Box sx={{ width: 44, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, py: 1 }}>
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
                  sx={{ color: '#22C55E', '&:hover': { bgcolor: '#F0FDF4' } }}>
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
      <Dialog open={answerSheetDialogOpen} onClose={() => setAnswerSheetDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON }}>Answer Sheet Configuration</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            <TextField
              size="small"
              label="Template name"
              value={answerSheetForm.name}
              onChange={e => setAnswerSheetForm(p => ({ ...p, name: e.target.value }))}
              fullWidth
            />
            <TextField
              size="small"
              label="Total items (from assessment)"
              value={Number(assessmentDetail?.target_total_items || 0)}
              disabled
              fullWidth
            />
            <Stack direction="row" spacing={1.25}>
              <TextField
                size="small"
                select
                fullWidth
                label="Choices per item"
                value={answerSheetForm.num_choices}
                onChange={e => setAnswerSheetForm(p => ({ ...p, num_choices: Number(e.target.value) }))}
              >
                {[2, 3, 4, 5].map(n => (
                  <MenuItem key={n} value={n}>{n}</MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                type="number"
                fullWidth
                label="Student ID Columns"
                value={answerSheetForm.num_id_columns}
                onChange={e => setAnswerSheetForm(p => ({ ...p, num_id_columns: Number(e.target.value) }))}
                inputProps={{ min: 4, max: 15 }}
                helperText="Allowed range: 4 to 15"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnswerSheetDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveAnswerSheet}
            disabled={answerSheetSaving}
            sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none' }}
          >
            {answerSheetSaving ? 'Saving…' : 'Save Answer Sheet'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Bubble Sheet PDF Preview ── */}
      <Dialog open={bubbleSheetPreviewOpen} onClose={() => {
        if (bubbleSheetPreviewUrl) URL.revokeObjectURL(bubbleSheetPreviewUrl)
        setBubbleSheetPreviewOpen(false)
      }} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <VisibilityIcon sx={{ fontSize: 18, opacity: 0.7 }} />
          {bubbleSheetPreviewTitle}
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0, height: 'calc(85vh - 130px)', minHeight: 400, overflow: 'hidden' }}>
          <object
            data={bubbleSheetPreviewUrl}
            type="application/pdf"
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          >
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.85rem', color: '#666', mb: 1.5 }}>
                Your browser cannot display the PDF inline.
              </Typography>
              <Button variant="outlined" startIcon={<DownloadIcon />}
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = bubbleSheetPreviewUrl
                  link.download = `bubble_sheet_${bubbleSheetPreviewTitle.replace(/\s+/g, '_')}.pdf`
                  link.click()
                }}
                sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none', fontSize: '0.82rem' }}>
                Download PDF instead
              </Button>
            </Box>
          </object>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => {
            if (bubbleSheetPreviewUrl) URL.revokeObjectURL(bubbleSheetPreviewUrl)
            setBubbleSheetPreviewOpen(false)
          }} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Close</Button>
          <Button variant="contained" startIcon={<DownloadIcon />}
            onClick={() => {
              const link = document.createElement('a')
              link.href = bubbleSheetPreviewUrl
              link.download = `bubble_sheet_${bubbleSheetPreviewTitle.replace(/\s+/g, '_')}.pdf`
              link.click()
            }}
            sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontSize: '0.82rem' }}>
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  </Box>
  )}
