// src/components/FacultyAnalyticsReports.jsx
// Descriptive assessment analytics for one course — web counterpart of the
// mobile Reports tab. Data comes from GET /api/grading/reports/.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import CircularProgress from '@mui/material/CircularProgress'
import CloseIcon from '@mui/icons-material/Close'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined'
import RefreshIcon from '@mui/icons-material/Refresh'
import InsightsIcon from '@mui/icons-material/Insights'
import EditIcon from '@mui/icons-material/Edit'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PendingActionsIcon from '@mui/icons-material/PendingActions'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import api from '../config/api'
import { extractApiError } from '../utils'
import { MarkdownInline } from './MarkdownText'

// ── Palette ───────────────────────────────────────────────────────────────
const TEXT = '#F0F0F2'
const MUTED = 'rgba(255,255,255,0.55)'
const CARD = 'rgba(255,255,255,0.04)'
const CARD_MUTED = 'rgba(255,255,255,0.06)'
const BORDER = 'rgba(255,255,255,0.09)'
const PRIMARY = '#E24B4A'
const DIALOG_BG = '#16161E'

const MASTERED = '#2E9E5B'
const NEAR = '#F2A93B'
const NOT_MASTERED = '#D9534F'
const NO_DATA = '#B8C0CC'

const BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']
const BLOOM_SHORT = { Remember: 'Rem', Understand: 'Und', Apply: 'App', Analyze: 'Ana', Evaluate: 'Eva', Create: 'Cre' }
const BLOOM_COLORS = {
  Remember: '#E05A47',
  Understand: '#F08A24',
  Apply: '#E8B923',
  Analyze: '#3FA66B',
  Evaluate: '#3B7DD8',
  Create: '#8B5CC7',
}
const BLOOM_TITLE = "Bloom's Taxonomy Mastery"

// ── Helpers ───────────────────────────────────────────────────────────────
const asNum = v => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

function fmtNum(v, decimals = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return Number.isInteger(v) ? String(v) : v.toFixed(decimals)
}

function masteryColor(pct, mastered = 75, near = 50) {
  if (pct === null || pct === undefined) return NO_DATA
  if (pct >= mastered) return MASTERED
  if (pct >= near) return NEAR
  return NOT_MASTERED
}

function decisionColor(decision) {
  if (decision === 'Retain') return MASTERED
  if (decision === 'Discard') return NOT_MASTERED
  return NEAR
}

function difficultyWord(p) {
  if (p >= 0.86) return 'very easy'
  if (p >= 0.71) return 'easy'
  if (p >= 0.30) return 'moderate'
  if (p >= 0.15) return 'difficult'
  return 'very difficult'
}

/** Builds the exam's slices from `bloom.overall`; levels with no items are dropped. */
function bloomSlices(overall, masteryFrom) {
  const counts = Object.fromEntries(BLOOM_LEVELS.map(l => [l, Number(overall?.[l]?.items || 0)]))
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!total) return []
  const source = masteryFrom || overall
  return BLOOM_LEVELS.filter(l => counts[l] > 0).map(l => {
    const share = counts[l] / total
    const mastery = asNum(source?.[l]?.mastery)
    return { level: l, items: counts[l], share, mastery, earned: share * (mastery ?? 0) }
  })
}

// ── Small building blocks ─────────────────────────────────────────────────
function Txt({ children, size = 13, weight = 400, color = TEXT, sx, ...rest }) {
  return (
    <Box component="span" sx={{ display: 'block', fontSize: size, fontWeight: weight, color, lineHeight: 1.4, ...sx }} {...rest}>
      {children}
    </Box>
  )
}

function InfoButton({ onClick, title = 'Details & interpretation' }) {
  return (
    <Tooltip title={title}>
      <IconButton size="small" onClick={onClick} sx={{ color: `${MUTED} !important`, '&:hover': { color: `${PRIMARY} !important` } }}>
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  )
}

function ReportCard({ title, subtitle, trailing, children, sx }) {
  return (
    <Box sx={{ bgcolor: CARD, border: `1px solid ${BORDER}`, borderRadius: 2.5, p: 2.25, ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.75 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Txt size={16} weight={700}>{title}</Txt>
          {subtitle && <Txt size={12} color={MUTED} sx={{ mt: 0.3 }}>{subtitle}</Txt>}
        </Box>
        {trailing}
      </Box>
      {children}
    </Box>
  )
}

function PlainCard({ children, sx }) {
  return <Box sx={{ bgcolor: CARD, border: `1px solid ${BORDER}`, borderRadius: 2, p: 2, ...sx }}>{children}</Box>
}

function Heading({ title, hint }) {
  return (
    <Box sx={{ mt: 2.25, mb: 1 }}>
      <Txt size={14} weight={800}>{title}</Txt>
      {hint && <Txt size={11.5} color={MUTED}>{hint}</Txt>}
    </Box>
  )
}

function Interpretation({ lines }) {
  return (
    <PlainCard sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
        <InsightsIcon sx={{ fontSize: 18, color: PRIMARY }} />
        <Txt size={13.5} weight={800}>Interpretation</Txt>
      </Box>
      {lines.filter(Boolean).map((l, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.75 }}>
          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: PRIMARY, mt: '7px', flexShrink: 0 }} />
          <Txt size={12.5}>{l}</Txt>
        </Box>
      ))}
    </PlainCard>
  )
}

function StatTile({ label, value, hint, color, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: CARD_MUTED, border: `1px solid ${BORDER}`, borderRadius: 2, px: 1.5, py: 1.25,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { borderColor: PRIMARY } : undefined,
      }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Txt size={11} color={MUTED} sx={{ flex: 1 }}>{label}</Txt>
        {onClick && <EditIcon sx={{ fontSize: 13, color: MUTED }} />}
      </Box>
      <Txt size={18} weight={900} color={color || TEXT} sx={{ mt: 0.5 }}>{value}</Txt>
      {hint && <Txt size={10.5} color={MUTED}>{hint}</Txt>}
    </Box>
  )
}

function StatGrid({ children, cols = 3 }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${cols}, 1fr)` }, gap: 1 }}>
      {children}
    </Box>
  )
}

function Pill({ label, color }) {
  return (
    <Box component="span" sx={{ px: 1, py: 0.25, borderRadius: 2, bgcolor: `${color}24`, color, fontSize: 10.5, fontWeight: 800 }}>
      {label}
    </Box>
  )
}

function LegendLine({ color, text }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
      <Txt size={13} weight={700}>{text}</Txt>
    </Box>
  )
}

function DataTable({ head, rows, alignLeft = [0] }) {
  const cellSx = i => ({
    py: 0.9, px: 0.75, fontSize: 12.5, textAlign: alignLeft.includes(i) ? 'left' : 'right',
    borderBottom: `1px solid ${BORDER}`, color: TEXT,
  })
  return (
    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <Box component="th" key={i} sx={{ ...cellSx(i), fontSize: 11, fontWeight: 700, color: MUTED, background: 'transparent !important' }}>
              {h}
            </Box>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.map((c, i) => <Box component="td" key={i} sx={cellSx(i)}>{c}</Box>)}
          </tr>
        ))}
      </tbody>
    </Box>
  )
}

function DetailDialog({ open, onClose, title, subtitle, action, children, maxWidth = 'md' }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth={maxWidth} fullWidth
      slotProps={{ paper: { sx: { bgcolor: DIALOG_BG, color: TEXT, backgroundImage: 'none', border: `1px solid ${BORDER}`, borderRadius: 3 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', px: 2.5, pt: 2, pb: 1, borderBottom: `1px solid ${BORDER}` }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Txt size={18} weight={800}>{title}</Txt>
          {subtitle && <Txt size={12} color={MUTED}>{subtitle}</Txt>}
        </Box>
        {action}
        <IconButton onClick={onClose} sx={{ color: MUTED }}><CloseIcon /></IconButton>
      </Box>
      <Box sx={{ px: 2.5, py: 2, overflowY: 'auto' }}>{children}</Box>
    </Dialog>
  )
}

// ── Charts ────────────────────────────────────────────────────────────────
function RingGauge({ percent, color, caption, size = 116 }) {
  const stroke = size * 0.1
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const frac = Math.max(0, Math.min(1, (percent ?? 0) / 100))
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={BORDER} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${circ * frac} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Txt size={size * 0.22} weight={900} color={color}>{percent == null ? '—' : `${percent.toFixed(0)}%`}</Txt>
        <Txt size={10.5} color={MUTED}>{caption}</Txt>
      </Box>
    </Box>
  )
}

function PassRateBars({ groups, onSelect }) {
  if (!groups.length) return <Txt color={MUTED}>No scanned papers for this filter.</Txt>
  return (
    <Box>
      {groups.map(g => {
        const count = Number(g.count || 0)
        const passed = Number(g.passed || 0)
        const rate = asNum(g.pass_rate) ?? 0
        const mean = asNum(g.mean_percent)
        const sub = [g.course_title, g.course_code, g.grade_level && g.grade_level !== 'Unassigned' ? g.grade_level : null]
          .filter(Boolean).join(' · ')
        return (
          <Box key={g.key ?? g.label} onClick={onSelect ? () => onSelect(g) : undefined}
            sx={{ py: 0.9, cursor: onSelect ? 'pointer' : 'default', borderRadius: 1, '&:hover': onSelect ? { bgcolor: CARD_MUTED } : undefined, px: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Txt weight={700}>{g.label}</Txt>
                {sub && <Txt size={11} color={MUTED} sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</Txt>}
              </Box>
              <Txt size={15} weight={900} color={rate >= 50 ? MASTERED : NOT_MASTERED}>{rate.toFixed(0)}%</Txt>
            </Box>
            <Box sx={{ display: 'flex', height: 12, borderRadius: 1.5, overflow: 'hidden', mt: 0.75, bgcolor: BORDER }}>
              {passed > 0 && <Box sx={{ flex: passed, bgcolor: MASTERED }} />}
              {count - passed > 0 && <Box sx={{ flex: count - passed, bgcolor: NOT_MASTERED, opacity: 0.75 }} />}
            </Box>
            <Txt size={11} color={MUTED} sx={{ mt: 0.5 }}>
              {passed} passed · {count - passed} failed · n={count}{mean != null ? ` · mean ${mean.toFixed(1)}%` : ''}
            </Txt>
          </Box>
        )
      })}
    </Box>
  )
}

function ScoreHistogram({ buckets, passingPercent }) {
  const maxCount = buckets.reduce((m, b) => Math.max(m, Number(b.count || 0)), 0)
  const chartHeight = 150
  return (
    <Box>
      <Box sx={{ position: 'relative', height: chartHeight + 18, display: 'flex', alignItems: 'flex-end' }}>
        {buckets.map(b => {
          const count = Number(b.count || 0)
          const h = maxCount ? (count / maxCount) * chartHeight : 0
          const passingBucket = passingPercent != null && Number(b.from) >= passingPercent - 0.001
          return (
            <Tooltip key={b.from} title={`${fmtNum(b.from)}–${fmtNum(b.to)}%: ${count} paper${count === 1 ? '' : 's'}`}>
              <Box sx={{ flex: 1, px: '2px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <Txt size={10} weight={700} sx={{ textAlign: 'center' }}>{count || ''}</Txt>
                <Box sx={{
                  height: Math.max(h, count > 0 ? 3 : 0), mt: '2px', borderRadius: '4px 4px 0 0',
                  bgcolor: passingBucket ? MASTERED : PRIMARY, opacity: passingBucket ? 1 : 0.75,
                }} />
              </Box>
            </Tooltip>
          )
        })}
        {passingPercent != null && (
          <Box sx={{
            position: 'absolute', top: 0, bottom: 0, width: 2, bgcolor: 'rgba(240,240,242,0.55)', pointerEvents: 'none',
            left: `calc(${Math.min(Math.max(passingPercent, 0), 100)}% - 1px)`,
          }} />
        )}
      </Box>
      <Box sx={{ display: 'flex', mt: 0.5 }}>
        {buckets.map(b => <Txt key={b.from} size={9.5} color={MUTED} sx={{ flex: 1 }}>{fmtNum(b.from)}</Txt>)}
      </Box>
      {passingPercent != null && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
          <Box sx={{ width: 12, height: 2, bgcolor: 'rgba(240,240,242,0.55)' }} />
          <Txt size={11} color={MUTED}>Passing mark {fmtNum(passingPercent)}%</Txt>
          <Box sx={{ width: 10, height: 10, bgcolor: MASTERED, ml: 1.5 }} />
          <Txt size={11} color={MUTED}>At/above passing</Txt>
        </Box>
      )}
    </Box>
  )
}

const Q = { left: 40, bottom: 34, top: 10, right: 10, dMin: -0.4, dMax: 1.0, w: 500, h: 400 }
function qPos(p, d) {
  const w = Q.w - Q.left - Q.right
  const h = Q.h - Q.top - Q.bottom
  const cp = Math.max(0, Math.min(1, p))
  const cd = Math.max(Q.dMin, Math.min(Q.dMax, d))
  return [Q.left + cp * w, Q.top + (1 - (cd - Q.dMin) / (Q.dMax - Q.dMin)) * h]
}

/** Difficulty (x) vs discrimination (y) map; the green zone is the "retain" region. */
function ItemQuadrantChart({ items, onSelectItem, maxHeight = 420 }) {
  const [zx1, zy1] = qPos(0.30, Q.dMax)
  const [zx2, zy2] = qPos(0.70, 0.30)
  return (
    <Box sx={{ width: '100%', maxHeight, aspectRatio: '1.25' }}>
      <svg viewBox={`0 0 ${Q.w} ${Q.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <rect x={zx1} y={zy1} width={zx2 - zx1} height={zy2 - zy1} fill={MASTERED} fillOpacity={0.14} />
        <text x={zx1 + 5} y={zy1 + 13} fontSize={11} fill={MASTERED}>Ideal zone</text>
        {[0, 0.3, 0.7, 1].map(p => {
          const [x, y1] = qPos(p, Q.dMin)
          const [, y2] = qPos(p, Q.dMax)
          return (
            <g key={`p${p}`}>
              <line x1={x} y1={y1} x2={x} y2={y2} stroke={BORDER} />
              <text x={x} y={y1 + 14} fontSize={11} fill={MUTED} textAnchor="middle">{p.toFixed(1)}</text>
            </g>
          )
        })}
        {[-0.4, 0, 0.2, 0.3, 0.4, 1].map(d => {
          const [x1, y] = qPos(0, d)
          const [x2] = qPos(1, d)
          return (
            <g key={`d${d}`}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke={d === 0 ? MUTED : BORDER} strokeWidth={d === 0 ? 1.3 : 1} />
              <text x={x1 - 6} y={y + 4} fontSize={11} fill={MUTED} textAnchor="end">{d.toFixed(1)}</text>
            </g>
          )
        })}
        <text x={Q.left + (Q.w - Q.left - Q.right) / 2} y={Q.h - 4} fontSize={12} fill={TEXT} textAnchor="middle">
          Difficulty index P  (harder ← → easier)
        </text>
        <text x={12} y={Q.top + (Q.h - Q.top - Q.bottom) / 2} fontSize={12} fill={TEXT} textAnchor="middle"
          transform={`rotate(-90 12 ${Q.top + (Q.h - Q.top - Q.bottom) / 2})`}>
          Discrimination D
        </text>
        {items.map(it => {
          const [x, y] = qPos(asNum(it.difficulty) ?? 0, asNum(it.discrimination) ?? 0)
          const color = decisionColor(it.decision)
          return (
            <g key={it.item_number} style={{ cursor: onSelectItem ? 'pointer' : 'default' }}
              onClick={onSelectItem ? () => onSelectItem(it) : undefined}>
              <title>{`Item ${it.item_number} · P ${fmtNum(asNum(it.difficulty), 2)} · D ${fmtNum(asNum(it.discrimination), 2)} · ${it.decision}`}</title>
              <circle cx={x} cy={y} r={10} fill={color} fillOpacity={0.88} stroke="#fff" strokeWidth={1.3} />
              <text x={x} y={y + 3.5} fontSize={10} fill="#fff" textAnchor="middle" fontWeight={700}>{it.item_number}</text>
            </g>
          )
        })}
      </svg>
    </Box>
  )
}

/** 100% segmented bar: width = share of exam items, solid fill height = % correct. */
function BloomSegmentedBar({ slices, height = 72, showLabels = true, onSelectLevel }) {
  return (
    <Box sx={{ display: 'flex', height, borderRadius: 2, overflow: 'hidden', gap: '2px' }}>
      {slices.map(s => (
        <Tooltip key={s.level} title={`${s.level}: ${s.items} items (${(s.share * 100).toFixed(0)}%) · ${s.mastery == null ? 'no answers' : `${s.mastery.toFixed(0)}% correct`}`}>
          <Box onClick={onSelectLevel ? () => onSelectLevel(s.level) : undefined}
            sx={{
              flex: s.items, position: 'relative', bgcolor: `${BLOOM_COLORS[s.level]}2E`,
              cursor: onSelectLevel ? 'pointer' : 'default', minWidth: 0,
            }}>
            <Box sx={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              height: `${Math.max(0, Math.min(100, s.mastery ?? 0))}%`, bgcolor: BLOOM_COLORS[s.level],
            }} />
            {showLabels && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Txt size={11} weight={800} sx={{ lineHeight: 1.15, textShadow: '0 0 4px rgba(0,0,0,0.9)', overflow: 'hidden' }}>
                  {BLOOM_SHORT[s.level]}<br />{(s.share * 100).toFixed(0)}%
                </Txt>
              </Box>
            )}
          </Box>
        </Tooltip>
      ))}
    </Box>
  )
}

function MasteryLegend({ mastered, near }) {
  const chip = (color, label) => (
    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
      <Box sx={{ width: 12, height: 12, borderRadius: 0.75, bgcolor: color }} />
      <Txt size={11} color={MUTED}>{label}</Txt>
    </Box>
  )
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.75, mt: 1 }}>
      {chip(MASTERED, `Mastered ≥ ${fmtNum(mastered)}%`)}
      {chip(NEAR, `Nearly ${fmtNum(near)}–${fmtNum(mastered - 1)}%`)}
      {chip(NOT_MASTERED, `Not mastered < ${fmtNum(near)}%`)}
      {chip(NO_DATA, 'No items')}
    </Box>
  )
}

function IndexBar({ label, value, min = 0, max = 1, color, caption }) {
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return (
    <Box>
      <Box sx={{ display: 'flex' }}>
        <Txt size={11} color={MUTED} sx={{ flex: 1 }}>{label}</Txt>
        <Txt size={11} weight={700} color={color}>{value.toFixed(2)} · {caption}</Txt>
      </Box>
      <Box sx={{ height: 7, borderRadius: 1, bgcolor: BORDER, overflow: 'hidden', mt: 0.4 }}>
        <Box sx={{ width: `${frac * 100}%`, height: '100%', bgcolor: color }} />
      </Box>
    </Box>
  )
}

function FilterSelect({ label, value, onChange, allLabel, options }) {
  return (
    <TextField select size="small" label={label} value={value ?? ''} onChange={e => onChange(e.target.value || null)}
      sx={{ minWidth: 170, flex: '1 1 170px' }}>
      <MenuItem value="">{allLabel}</MenuItem>
      {options.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function FacultyAnalyticsReports({ courseId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [assessmentId, setAssessmentId] = useState(null)
  const [gradeLevel, setGradeLevel] = useState(null)
  const [section, setSection] = useState(null)

  const [detail, setDetail] = useState(null)
  const [decisionFilter, setDecisionFilter] = useState(null)
  const [expandedItems, setExpandedItems] = useState(() => new Set())
  const [itemPopup, setItemPopup] = useState(null)
  const [methodOpen, setMethodOpen] = useState(false)
  const [bloomLevelPopup, setBloomLevelPopup] = useState(null)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [passingDialog, setPassingDialog] = useState(null)
  const [savingPassing, setSavingPassing] = useState(false)
  const [passingMessage, setPassingMessage] = useState('')

  const requestId = useRef(0)
  const hasData = useRef(false)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setError('')
    if (hasData.current) setRefreshing(true)
    else setLoading(true)
    try {
      const params = { course_id: courseId }
      if (assessmentId) params.assessment_id = assessmentId
      if (gradeLevel) params.grade_level = gradeLevel
      if (section) params.section = section
      const { data: res } = await api.get('/grading/reports/', { params })
      if (id !== requestId.current) return
      if (!res?.success) throw new Error(res?.detail || 'Failed to load reports.')
      hasData.current = true
      setData(res)
      setDecisionFilter(null)
      setExpandedItems(new Set())
    } catch (err) {
      if (id !== requestId.current) return
      setError(err?.response ? extractApiError(err) : (err?.message || 'Could not load reports. Please try again.'))
    } finally {
      if (id === requestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [courseId, assessmentId, gradeLevel, section])

  useEffect(() => { load() }, [load])

  const options = data?.options || {}
  const assessments = useMemo(
    () => (options.assessments || []).filter(a => !courseId || a.course_id === courseId),
    [options.assessments, courseId],
  )
  const selectedAssessment = assessments.find(a => a.assessment_id === assessmentId) || null
  const scopeLabel = [
    selectedAssessment?.title || 'All exams',
    gradeLevel,
    section || 'all sections',
  ].filter(Boolean).join(' · ')

  const pickAssessment = v => { setAssessmentId(v); setGradeLevel(null); setSection(null) }
  const pickGrade = v => { setGradeLevel(v); setSection(null) }
  const clearFilters = () => { setAssessmentId(null); setGradeLevel(null); setSection(null) }
  const activeFilters = [assessmentId, gradeLevel, section].filter(Boolean).length

  const coverage = data?.coverage
  const coverageIncomplete = coverage && coverage.complete === false && (coverage.pending || []).length > 0

  // ── Loading / error states ──
  if (loading && !data) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12, gap: 2 }}>
        <CircularProgress sx={{ color: PRIMARY }} />
        <Txt color={MUTED}>Loading analytics…</Txt>
      </Box>
    )
  }
  if (!data) {
    return (
      <Box sx={{ textAlign: 'center', py: 12 }}>
        <Txt color={PRIMARY} sx={{ mb: 2 }}>{error || 'No data'}</Txt>
        <Button variant="outlined" onClick={load} sx={{ textTransform: 'none' }}>Retry</Button>
      </Box>
    )
  }

  const s = data.summary || {}
  const count = Number(s.count || 0)
  const passing = asNum(data.passing_percent)

  // ── Class performance ──
  const performanceIllustration = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
      <RingGauge percent={asNum(s.pass_rate)} caption="pass rate"
        color={(asNum(s.pass_rate) ?? 0) >= 50 ? MASTERED : NOT_MASTERED} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <LegendLine color={MASTERED} text={`${s.passed} passed`} />
        <LegendLine color={NOT_MASTERED} text={`${s.failed} failed`} />
        <Txt size={12} color={MUTED} sx={{ mt: 0.75 }}>
          Mean {fmtNum(asNum(s.mean_score))} / {fmtNum(asNum(s.mean_max_score))} · passing {passing == null ? 'varies' : `${fmtNum(passing)}%`}
        </Txt>
      </Box>
    </Box>
  )

  function performanceDetail() {
    const passRate = asNum(s.pass_rate) ?? 0
    const mean = asNum(s.mean_percent) ?? 0
    const median = asNum(s.median_percent) ?? 0
    const sd = asNum(s.sd_percent) ?? 0
    const meanMax = asNum(s.mean_max_score)
    const lines = [
      `${s.passed} of ${s.count} papers passed (${fmtNum(passRate)}%) — ${passRate >= 75 ? 'a high' : passRate >= 50 ? 'a moderate' : 'a low'} passing rate.`,
      passing != null && `The class mean of ${fmtNum(mean)}% is ${mean >= passing ? `${fmtNum(mean - passing)} points above` : `${fmtNum(passing - mean)} points below`} the ${fmtNum(passing)}% passing mark.`,
      `Half of the class scored ${fmtNum(median)}% or higher (median).`,
      `Standard deviation of ${fmtNum(sd)} points means scores are ${sd < 10 ? 'closely grouped (homogeneous class)' : sd <= 20 ? 'moderately spread' : 'widely spread (heterogeneous class)'}.`,
      `Scores ranged from ${fmtNum(asNum(s.min_percent))}% to ${fmtNum(asNum(s.max_percent))}%.`,
      Number(s.unidentified_papers || 0) > 0 && `${s.unidentified_papers} papers without a valid SR code are excluded.`,
    ]
    return (
      <>
        <PlainCard>{performanceIllustration}</PlainCard>
        <Heading title="Summary statistics" />
        <StatGrid>
          <StatTile label="Mean" value={`${fmtNum(mean)}%`} hint={meanMax == null ? null : `${fmtNum(asNum(s.mean_score))} / ${fmtNum(meanMax)}`} />
          <StatTile label="Median" value={`${fmtNum(median)}%`} />
          <StatTile label="Std. dev." value={fmtNum(sd)} hint="points" />
          <StatTile label="Highest" value={`${fmtNum(asNum(s.max_percent))}%`} color={MASTERED} />
          <StatTile label="Lowest" value={`${fmtNum(asNum(s.min_percent))}%`} color={NOT_MASTERED} />
          <StatTile label="Passing" value={passing == null ? '—' : `${fmtNum(passing)}%`}
            hint={selectedAssessment ? 'click to edit' : 'select an exam'}
            onClick={selectedAssessment && !savingPassing ? () => { setDetail(null); setPassingDialog(passing ?? 50) } : undefined} />
        </StatGrid>
        <Interpretation lines={lines} />
      </>
    )
  }

  // ── Passing rate ──
  const passBySection = Boolean(assessmentId)
  const passDimLabel = passBySection ? 'Section' : 'Exam'
  const passGroups = (passBySection ? data.by_section : data.by_assessment) || []
  const drillInto = g => {
    if (passBySection) {
      if (g.label && g.label !== section) setSection(g.label)
    } else if (g.key && g.key !== assessmentId) {
      pickAssessment(g.key)
    }
  }
  const drillHint = passBySection ? 'Click a section to filter the report to it.' : 'Click an exam to filter to it and see its sections.'

  function passRateDetail() {
    const ranked = passGroups.filter(g => g.pass_rate != null)
      .sort((a, b) => (asNum(b.pass_rate) ?? 0) - (asNum(a.pass_rate) ?? 0))
    const below = ranked.filter(g => (asNum(g.pass_rate) ?? 0) < 50)
    const first = ranked[0]
    const last = ranked[ranked.length - 1]
    const lines = [
      passing != null && `A paper passes at ${fmtNum(passing)}% or higher.`,
      ...(ranked.length >= 2 ? [
        `Highest: ${first.label} at ${fmtNum(asNum(first.pass_rate))}% (${first.passed} of ${first.count}).`,
        `Lowest: ${last.label} at ${fmtNum(asNum(last.pass_rate))}% (${last.passed} of ${last.count}).`,
        `Gap between highest and lowest: ${fmtNum((asNum(first.pass_rate) ?? 0) - (asNum(last.pass_rate) ?? 0))} points.`,
      ] : []),
      ranked.length === 1 && `${first.label}: ${first.passed} of ${first.count} passed (${fmtNum(asNum(first.pass_rate))}%).`,
      below.length > 0
        ? `${below.length === 1 ? 'This group is' : 'These groups are'} below a 50% passing rate and may need remediation: ${below.map(g => g.label).join(', ')}.`
        : ranked.length > 0 && `Every ${passDimLabel.toLowerCase()} has at least half of its students passing.`,
    ]
    return (
      <>
        <PlainCard>
          <PassRateBars groups={passGroups} onSelect={passGroups.length > 1 ? g => { setDetail(null); drillInto(g) } : null} />
        </PlainCard>
        {passGroups.length > 1 && <Txt size={11} color={MUTED} sx={{ mt: 0.75 }}>{drillHint}</Txt>}
        <Heading title="Breakdown" />
        <PlainCard>
          <DataTable
            head={[passDimLabel, 'n', 'Passed', 'Rate', 'Mean']}
            rows={passGroups.map(g => [
              <Box component="span" sx={{ fontWeight: 800 }}>{g.label}</Box>,
              g.count, g.passed,
              <Box component="span" sx={{ fontWeight: 800, color: (asNum(g.pass_rate) ?? 0) >= 50 ? MASTERED : NOT_MASTERED }}>
                {fmtNum(asNum(g.pass_rate))}%
              </Box>,
              `${fmtNum(asNum(g.mean_percent))}%`,
            ])}
          />
        </PlainCard>
        <Interpretation lines={lines} />
      </>
    )
  }

  // ── Score distribution ──
  const buckets = data.distribution || []
  function distributionDetail() {
    const mean = asNum(s.mean_percent) ?? 0
    const median = asNum(s.median_percent) ?? 0
    const mode = buckets.reduce((m, b) => (!m || b.count > m.count ? b : m), null)
    const skew = mean - median
    const lines = [
      mode && mode.count > 0 && `Most papers (${mode.count} of ${count}) fall in the ${fmtNum(mode.from)}–${fmtNum(mode.to)}% band.`,
      skew < -2
        ? `Mean (${fmtNum(mean)}%) is below the median (${fmtNum(median)}%): the distribution is negatively skewed — most students scored high and a few low scores pull the mean down. The exam may have been easy for this group.`
        : skew > 2
          ? `Mean (${fmtNum(mean)}%) is above the median (${fmtNum(median)}%): the distribution is positively skewed — most students scored low. The exam may have been difficult, or the topic needs reteaching.`
          : `Mean and median are close (${fmtNum(mean)}% vs ${fmtNum(median)}%): scores are roughly symmetric.`,
      passing != null && `Bars at or above the ${fmtNum(passing)}% passing mark are shown in green.`,
    ]
    return (
      <>
        <PlainCard><ScoreHistogram buckets={buckets} passingPercent={passing} /></PlainCard>
        <Interpretation lines={lines} />
      </>
    )
  }

  // ── Item analysis ──
  const ia = data.item_analysis
  const iaSummary = ia?.summary || {}
  const iaItems = ia?.items || []
  const iaDecisions = iaSummary.decisions || {}

  const decisionCounts = interactive => (
    <Box sx={{ display: 'flex', gap: 0.75 }}>
      {['Retain', 'Revise', 'Discard'].map(d => {
        const color = decisionColor(d)
        const on = interactive && decisionFilter === d
        return (
          <Box key={d} onClick={interactive ? () => setDecisionFilter(on ? null : d) : undefined}
            sx={{
              flex: 1, textAlign: 'center', py: 1, borderRadius: 2,
              bgcolor: `${color}${on ? '40' : '1A'}`, border: `1px solid ${color}${on ? 'FF' : '4D'}`,
              cursor: interactive ? 'pointer' : 'default',
            }}>
            <Txt size={18} weight={900} color={color}>{iaDecisions[d] ?? 0}</Txt>
            <Txt size={11} weight={700} color={color}>{d}</Txt>
          </Box>
        )
      })}
    </Box>
  )

  function itemDetails(item) {
    const n = iaSummary.group_size
    const issues = item.distractor_issues || []
    return (
      <Box>
        {item.question && <Txt size={12} sx={{ mb: 1 }}><MarkdownInline text={item.question} /></Txt>}
        <Txt size={11.5} color={MUTED}>
          U = {item.upper_correct}/{n} correct in upper group · L = {item.lower_correct}/{n} in lower group · {item.total_correct}/{iaSummary.examinees} overall
          {item.point_biserial != null ? ` · r_pb = ${item.point_biserial}` : ''}
        </Txt>
        <Txt size={11.5} color={MUTED} sx={{ mt: 0.5 }}>
          P = ({item.upper_correct} + {item.lower_correct}) ÷ (2×{n}) = {fmtNum(asNum(item.difficulty), 2)}{'   '}
          D = ({item.upper_correct} − {item.lower_correct}) ÷ {n} = {fmtNum(asNum(item.discrimination), 2)}
        </Txt>
        <Txt size={11.5} weight={700} sx={{ mt: 1, mb: 0.5 }}>Distractor analysis</Txt>
        <DataTable
          head={['Option', 'Upper', 'Lower', 'All %', 'Verdict']}
          rows={(item.options || []).map(o => {
            const verdict = o.is_key ? 'Key' : o.functional == null ? '—' : o.functional ? 'Working' : 'Weak'
            const vColor = o.is_key || o.functional === true ? MASTERED : o.functional === false ? NEAR : TEXT
            return [
              <Box component="span" sx={{ fontWeight: o.is_key ? 700 : 400, color: o.is_key ? MASTERED : TEXT }}>
                <MarkdownInline text={`${o.option || ''}${o.is_key ? ' ✓' : ''}`} />
              </Box>,
              o.upper, o.lower, `${fmtNum(asNum(o.percent))}%`,
              <Box component="span" sx={{ color: vColor }}>{verdict}</Box>,
            ]
          })}
        />
        {issues.map((iss, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            <WarningAmberIcon sx={{ fontSize: 14, color: NEAR, mt: '2px' }} />
            <Txt size={11} color={MUTED}>{iss}</Txt>
          </Box>
        ))}
      </Box>
    )
  }

  function itemRow(item) {
    const n = item.item_number
    const p = asNum(item.difficulty) ?? 0
    const d = asNum(item.discrimination) ?? 0
    const expanded = expandedItems.has(n)
    const toggle = () => setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
    return (
      <Box key={n} sx={{ mb: 1, bgcolor: CARD, borderRadius: 1.5, borderLeft: `4px solid ${decisionColor(item.decision)}` }}>
        <Box onClick={toggle} sx={{ px: 1.5, py: 1.25, cursor: 'pointer' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Txt size={13.5} weight={800}>Item {n}</Txt>
            <Txt size={11} color={MUTED}>Key {item.correct_answer}</Txt>
            {item.bloom_level && (
              <Box component="span" sx={{ px: 0.75, borderRadius: 1, bgcolor: 'rgba(226,75,74,0.12)', color: PRIMARY, fontSize: 10 }}>
                {item.bloom_level}
              </Box>
            )}
            <Box sx={{ flex: 1 }} />
            <Pill label={item.decision} color={decisionColor(item.decision)} />
            {expanded ? <ExpandLessIcon sx={{ fontSize: 18, color: MUTED }} /> : <ExpandMoreIcon sx={{ fontSize: 18, color: MUTED }} />}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <IndexBar label="Difficulty P" value={p} caption={item.difficulty_label}
              color={p >= 0.30 && p <= 0.70 ? MASTERED : NEAR} />
            <IndexBar label="Discrimination D" value={d} min={-1} caption={item.discrimination_label}
              color={d >= 0.30 ? MASTERED : d >= 0.20 ? NEAR : NOT_MASTERED} />
          </Box>
        </Box>
        {expanded && <Box sx={{ px: 1.5, pb: 1.5 }}>{itemDetails(item)}</Box>}
      </Box>
    )
  }

  function itemAnalysisDetail() {
    const kr20 = asNum(iaSummary.kr20)
    const meanP = asNum(iaSummary.mean_difficulty) ?? 0
    const meanD = asNum(iaSummary.mean_discrimination) ?? 0
    const flagged = iaItems.filter(i => (i.distractor_issues || []).length > 0).length
    const lines = [
      kr20 != null && `Reliability (KR-20) is ${kr20.toFixed(2)} — ${iaSummary.reliability}. ${kr20 >= 0.7 ? 'Scores are consistent enough for classroom decisions.' : 'Scores are not very consistent; revise weak items before reusing the test.'}`,
      `Average difficulty P = ${meanP.toFixed(2)} (${difficultyWord(meanP)}); the ideal range is 0.30–0.70.`,
      `Average discrimination D = ${meanD.toFixed(2)} (${meanD >= 0.4 ? 'very good' : meanD >= 0.3 ? 'good' : meanD >= 0.2 ? 'marginal' : 'poor'}) — how well items separate high and low scorers.`,
      `${iaDecisions.Retain ?? 0} items can be kept as is, ${iaDecisions.Revise ?? 0} should be revised, and ${iaDecisions.Discard ?? 0} should be discarded or rewritten.`,
      flagged > 0 && `${flagged} items have weak or misleading distractors — open an item to see which options.`,
    ]
    const visible = decisionFilter ? iaItems.filter(i => i.decision === decisionFilter) : iaItems
    return (
      <>
        <PlainCard>
          <ItemQuadrantChart items={iaItems} onSelectItem={setItemPopup} />
          <Txt size={11} color={MUTED} sx={{ mt: 0.75 }}>
            Each dot is an item. Items in the green zone (P 0.30–0.70, D ≥ 0.30) work well.
          </Txt>
        </PlainCard>
        <Heading title="Test summary" />
        <StatGrid>
          <StatTile label="Reliability KR-20" value={kr20 == null ? '—' : kr20.toFixed(2)} hint={iaSummary.reliability}
            color={kr20 == null ? undefined : kr20 >= 0.7 ? MASTERED : kr20 >= 0.5 ? NEAR : NOT_MASTERED} />
          <StatTile label="Mean difficulty P" value={meanP.toFixed(2)} hint={difficultyWord(meanP)} />
          <StatTile label="Mean discrim. D" value={meanD.toFixed(2)} hint="upper vs lower" />
        </StatGrid>
        <Interpretation lines={lines} />
        <Heading title={decisionFilter ? `${decisionFilter} items` : 'All items'} hint="Click a count to filter · click an item to expand" />
        {decisionCounts(true)}
        <Box sx={{ mt: 1.25 }}>{visible.map(itemRow)}</Box>
      </>
    )
  }

  const methodSteps = [
    ['1. Score and rank', `All ${iaSummary.examinees} papers were scored against the answer key and ranked from highest to lowest total score.`],
    ['2. Form upper and lower groups', `The top 27% (${iaSummary.group_size} papers) form the Upper group and the bottom 27% (${iaSummary.group_size} papers) form the Lower group. The middle 46% is set aside.`],
    ['3. Tally correct answers per item', 'U = number correct in the Upper group, L = number correct in the Lower group.'],
    ['4. Difficulty index', 'P = (U + L) ÷ 2n.  0.86+ very easy · 0.71–0.85 easy · 0.30–0.70 moderate (ideal) · 0.15–0.29 difficult · below 0.15 very difficult.'],
    ['5. Discrimination index', 'D = (U − L) ÷ n.  0.40+ very good · 0.30–0.39 good · 0.20–0.29 marginal (revise) · below 0.20 poor · negative = more low scorers got it right (discard).'],
    ['6. Distractor analysis', 'Every wrong option should be chosen by at least 5% of students, and by more Lower- than Upper-group students. Options that fail are flagged.'],
    ['7. Decision', 'Retain: moderate difficulty and D ≥ 0.30 (or D ≥ 0.40 when difficulty is 0.15–0.85). Discard: negative D, or very easy/very difficult with D < 0.20. Otherwise Revise.'],
    ['8. Test reliability (KR-20)', 'KR-20 = k/(k−1) × (1 − Σpq ÷ σ²), where k = number of items, p = proportion correct, q = 1 − p, σ² = variance of total scores. 0.70+ is acceptable for classroom tests.'],
  ]

  let itemAnalysisCard
  if (!ia) {
    itemAnalysisCard = (
      <ReportCard title="Item Analysis" subtitle="Upper/lower 27% method">
        <Txt color={MUTED}>Choose one exam in the Exam filter to run item analysis.</Txt>
      </ReportCard>
    )
  } else if (ia.available !== true) {
    itemAnalysisCard = (
      <ReportCard title="Item Analysis" subtitle={ia.template_name}>
        <Txt color={MUTED}>{ia.reason || 'Not enough data.'}</Txt>
      </ReportCard>
    )
  } else {
    itemAnalysisCard = (
      <ReportCard title="Item Analysis" subtitle={`Difficulty × discrimination · ${iaSummary.items} items`}
        trailing={<InfoButton onClick={() => setDetail('items')} />}>
        <ItemQuadrantChart items={iaItems} onSelectItem={setItemPopup} maxHeight={360} />
        <Box sx={{ mt: 1.25 }}>{decisionCounts(false)}</Box>
      </ReportCard>
    )
  }

  // ── Bloom mastery ──
  const bloom = data.bloom || {}
  const bloomMastered = asNum(bloom.mastery_threshold) ?? 75
  const bloomNear = asNum(bloom.near_mastery_threshold) ?? 50
  const slices = bloomSlices(bloom.overall || {})
  const bloomEarned = slices.reduce((a, x) => a + x.earned, 0)

  const bloomIllustration = (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <Txt size={28} weight={900} color={masteryColor(bloomEarned, bloomMastered, bloomNear)}>{bloomEarned.toFixed(1)}%</Txt>
        <Txt size={12} color={MUTED} sx={{ pb: 0.75 }}>of the exam earned, built from each level</Txt>
      </Box>
      <Box sx={{ mt: 1.25 }}>
        <BloomSegmentedBar slices={slices} onSelectLevel={setBloomLevelPopup} />
      </Box>
      <Box sx={{ display: 'flex', mt: 0.5 }}>
        <Txt size={10} color={MUTED} sx={{ flex: 1 }}>0%</Txt>
        <Txt size={10} color={MUTED}>100% of exam items</Txt>
      </Box>
    </Box>
  )

  function bloomDetail() {
    const untagged = Number(bloom.untagged_items || 0)
    const tagged = slices.reduce((a, x) => a + x.items, 0)
    const sections = section ? [] : (bloom.by_section || [])
    const band = levels => {
      const part = slices.filter(x => levels.includes(x.level))
      return { share: part.reduce((a, x) => a + x.share, 0) * 100, earned: part.reduce((a, x) => a + x.earned, 0) }
    }
    const lower = band(['Remember', 'Understand'])
    const higher = band(['Apply', 'Analyze', 'Evaluate', 'Create'])
    const withMastery = slices.filter(x => x.mastery != null).sort((a, b) => b.mastery - a.mastery)
    const biggest = [...slices].sort((a, b) => b.items - a.items)[0]
    const lines = [
      `The class earned ${bloomEarned.toFixed(1)}% of the ${tagged} Bloom-tagged items.`,
      `The exam leans most on ${biggest.level} (${biggest.items} items, ${(biggest.share * 100).toFixed(0)}% of the test).`,
      ...(withMastery.length >= 2 ? [
        `Strongest level: ${withMastery[0].level} at ${withMastery[0].mastery.toFixed(0)}% correct.`,
        `Weakest level: ${withMastery[withMastery.length - 1].level} at ${withMastery[withMastery.length - 1].mastery.toFixed(0)}% correct${withMastery[withMastery.length - 1].mastery < bloomNear ? ' — not yet mastered; consider reteaching.' : '.'}`,
      ] : []),
      lower.share > 0 && higher.share > 0
        ? `Lower-order items: ${(lower.earned / lower.share * 100).toFixed(0)}% correct; higher-order items: ${(higher.earned / higher.share * 100).toFixed(0)}% correct.`
        : higher.share === 0
          ? 'This exam has no higher-order (Apply to Create) items.'
          : 'This exam has no lower-order (Remember, Understand) items.',
      untagged > 0 && `${untagged} items without a Bloom level are excluded.`,
    ]
    return (
      <>
        <PlainCard>{bloomIllustration}</PlainCard>
        <Heading title="Breakdown by level" hint="Earned = Share × Correct · click a level for per-student results" />
        <PlainCard>
          <DataTable
            head={['Level', 'Items', 'Share', 'Correct', 'Earned']}
            rows={[
              ...slices.map(x => [
                <Box component="span" onClick={() => setBloomLevelPopup(x.level)}
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', fontWeight: 800, '&:hover': { textDecoration: 'underline' } }}>
                  <Box component="span" sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: BLOOM_COLORS[x.level] }} />
                  {x.level}
                </Box>,
                x.items,
                `${(x.share * 100).toFixed(0)}%`,
                <Box component="span" sx={{ fontWeight: 800, color: masteryColor(x.mastery, bloomMastered, bloomNear) }}>
                  {x.mastery == null ? '—' : `${x.mastery.toFixed(0)}%`}
                </Box>,
                x.earned.toFixed(1),
              ]),
              [
                <Box component="span" sx={{ fontWeight: 800 }}>Total</Box>,
                <Box component="span" sx={{ fontWeight: 800 }}>{tagged}</Box>,
                <Box component="span" sx={{ fontWeight: 800 }}>100%</Box>,
                '',
                <Box component="span" sx={{ fontWeight: 800 }}>{bloomEarned.toFixed(1)}</Box>,
              ],
            ]}
          />
        </PlainCard>
        <MasteryLegend mastered={bloomMastered} near={bloomNear} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.5 }}>
          <StatTile label="Lower-order (Rem + Und)"
            value={lower.share === 0 ? '—' : `${lower.earned.toFixed(1)} / ${lower.share.toFixed(0)}`}
            hint={lower.share === 0 ? 'not assessed' : 'earned / share of exam'} />
          <StatTile label="Higher-order (App → Cre)"
            value={higher.share === 0 ? '—' : `${higher.earned.toFixed(1)} / ${higher.share.toFixed(0)}`}
            hint={higher.share === 0 ? 'not assessed' : 'earned / share of exam'} />
        </Box>
        <Interpretation lines={lines} />
        {sections.length > 0 && (
          <>
            <Heading title="By section" hint="Same item split for every section; compare how much of each segment is solid." />
            <PlainCard>
              {sections.map(row => {
                const rowSlices = bloomSlices(bloom.overall || {}, row.levels)
                const rowEarned = rowSlices.reduce((a, x) => a + x.earned, 0)
                return (
                  <Box key={row.key ?? row.label} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', mb: 0.5 }}>
                      <Txt size={12.5} weight={800} sx={{ flex: 1 }}>{row.label}</Txt>
                      <Txt size={12.5} weight={800} color={masteryColor(rowEarned, bloomMastered, bloomNear)}>{rowEarned.toFixed(1)}%</Txt>
                    </Box>
                    <BloomSegmentedBar slices={rowSlices} height={28} showLabels={false} />
                  </Box>
                )
              })}
            </PlainCard>
          </>
        )}
      </>
    )
  }

  let bloomCard
  if (!assessmentId) {
    bloomCard = (
      <ReportCard title={BLOOM_TITLE} subtitle="How the exam is split across Bloom levels">
        <Txt color={MUTED}>Choose one exam in the Exam filter to see its Bloom breakdown.</Txt>
      </ReportCard>
    )
  } else if (!slices.length) {
    bloomCard = (
      <ReportCard title={BLOOM_TITLE}>
        <Txt color={MUTED}>None of this exam&apos;s items have a Bloom level yet.</Txt>
      </ReportCard>
    )
  } else {
    bloomCard = (
      <ReportCard title={BLOOM_TITLE} subtitle="Width = share of items · solid = answered correctly"
        trailing={<InfoButton onClick={() => setDetail('bloom')} />}>
        {bloomIllustration}
      </ReportCard>
    )
  }

  const bloomStudents = bloomLevelPopup
    ? (bloom.students || [])
      .map(st => ({ id: String(st.student_id), v: asNum(st.levels?.[bloomLevelPopup]) }))
      .filter(st => st.v != null)
      .sort((a, b) => b.v - a.v)
    : []

  async function savePassingScore(value) {
    if (!selectedAssessment) return
    setSavingPassing(true)
    setPassingMessage('')
    try {
      await api.patch(`/grading/bubble/templates/${selectedAssessment.template_id}/`, {
        passing_score: Math.round(value * 100) / 100,
        course_id: selectedAssessment.course_id,
      })
      setPassingDialog(null)
      setPassingMessage(`Passing score saved: ${value.toFixed(0)}%`)
      await load()
    } catch (err) {
      setPassingMessage(extractApiError(err) || 'Could not save the passing score. Please try again.')
    } finally {
      setSavingPassing(false)
    }
  }

  const detailViews = {
    performance: { title: 'Class Performance', render: performanceDetail },
    passrate: { title: `Passing Rate by ${passDimLabel}`, render: passRateDetail },
    distribution: { title: 'Score Distribution', render: distributionDetail },
    items: {
      title: 'Item Analysis',
      subtitle: ia ? `${ia.template_name} · ${iaSummary.examinees} papers · upper/lower groups of ${iaSummary.group_size}` : '',
      action: (
        <Tooltip title="How this is computed">
          <IconButton onClick={() => setMethodOpen(true)} sx={{ color: PRIMARY }}><HelpOutlineIcon /></IconButton>
        </Tooltip>
      ),
      render: itemAnalysisDetail,
    },
    bloom: { title: BLOOM_TITLE, render: bloomDetail },
  }
  const activeDetail = detail ? detailViews[detail] : null

  // ── Layout ──
  return (
    <Box sx={{ color: TEXT, maxWidth: 1280, mx: 'auto', width: '100%' }}>
      {/* Header + filters */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Txt size={20} weight={800}>Descriptive Assessment Analytics</Txt>
            <Txt size={12} color={MUTED}>{scopeLabel}</Txt>
          </Box>
          <Tooltip title="Refresh">
            <span>
              <IconButton onClick={load} disabled={refreshing}><RefreshIcon /></IconButton>
            </span>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterSelect label="Exam" value={assessmentId} onChange={pickAssessment} allLabel="All exams"
            options={assessments.map(a => ({ value: a.assessment_id, label: a.title }))} />
          <FilterSelect label="Grade level" value={gradeLevel} onChange={pickGrade} allLabel="All levels"
            options={(options.grade_levels || []).map(g => ({ value: g, label: g }))} />
          <FilterSelect label="Section" value={section} onChange={setSection} allLabel="All sections"
            options={(options.sections || []).map(x => ({ value: x, label: x }))} />
          {activeFilters > 0 && (
            <Button onClick={clearFilters} sx={{ textTransform: 'none', color: PRIMARY }}>Clear filters</Button>
          )}
        </Box>
        {!assessmentId && (
          <Txt size={11.5} color={MUTED} sx={{ mt: 0.75 }}>Pick one exam to unlock item analysis and Bloom mastery.</Txt>
        )}
        <Box sx={{ height: 2, mt: 1 }}>{refreshing && <LinearProgress sx={{ height: 2 }} />}</Box>
      </Box>

      {error && <Txt color={PRIMARY} sx={{ mb: 1.5 }}>{error}</Txt>}
      {passingMessage && <Txt color={MASTERED} sx={{ mb: 1.5 }}>{passingMessage}</Txt>}

      {coverageIncomplete && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, border: `1px solid ${NEAR}66`, bgcolor: `${NEAR}14` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PendingActionsIcon sx={{ color: NEAR, fontSize: 20 }} />
            <Txt size={13} weight={700} sx={{ flex: 1 }}>
              Scanning not complete — {coverage.scanned} of {coverage.expected} papers are scanned for this filter. These reports may change once the rest are scanned.
            </Txt>
            <Button size="small" onClick={() => setCoverageOpen(o => !o)} sx={{ textTransform: 'none', color: NEAR }}>
              {coverageOpen ? 'Hide' : 'Show missing'}
            </Button>
          </Box>
          {coverageOpen && (
            <Box sx={{ mt: 1.25, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
              {coverage.pending.map((p, i) => (
                <Box key={i} sx={{ p: 1.25, borderRadius: 1.5, bgcolor: CARD_MUTED, border: `1px solid ${BORDER}` }}>
                  <Box sx={{ display: 'flex' }}>
                    <Txt size={13} weight={800} sx={{ flex: 1 }}>{p.course_code} · {p.section}</Txt>
                    <Txt size={12} weight={700} color={NEAR}>{p.scanned}/{p.total} scanned</Txt>
                  </Box>
                  <Txt size={12} color={MUTED}>{p.assessment_title}</Txt>
                  <Txt size={11} weight={700} color={MUTED} sx={{ mt: 0.75, mb: 0.5 }}>Not yet scanned</Txt>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {(p.missing || []).map(id => (
                      <Box key={id} component="span" sx={{ px: 1, py: 0.25, borderRadius: 1.5, bgcolor: `${NEAR}24`, color: NEAR, fontSize: 11, fontWeight: 700 }}>
                        {id}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        {count === 0 ? (
          <ReportCard title="Class Performance" sx={{ gridColumn: '1 / -1' }}>
            <Txt color={MUTED}>No scanned papers match these filters yet. Only students on a section are counted.</Txt>
          </ReportCard>
        ) : (
          <>
            <ReportCard title="Class Performance" subtitle={`${s.identified_students} students · ${count} papers`}
              trailing={<InfoButton onClick={() => setDetail('performance')} />}>
              {performanceIllustration}
            </ReportCard>
            <ReportCard title={`Passing Rate by ${passDimLabel}`} subtitle="Follows the filters above"
              trailing={<InfoButton onClick={() => setDetail('passrate')} />}>
              <PassRateBars groups={passGroups} onSelect={passGroups.length > 1 ? drillInto : null} />
            </ReportCard>
            <ReportCard title="Score Distribution" subtitle="Papers per 10% score band"
              trailing={<InfoButton onClick={() => setDetail('distribution')} />}>
              <ScoreHistogram buckets={buckets} passingPercent={passing} />
            </ReportCard>
          </>
        )}
        <Box sx={count === 0 ? { gridColumn: '1 / -1' } : undefined}>{itemAnalysisCard}</Box>
        {count > 0 && <Box sx={{ gridColumn: '1 / -1' }}>{bloomCard}</Box>}
      </Box>

      {/* Detail dialog */}
      <DetailDialog open={Boolean(activeDetail)} onClose={() => setDetail(null)}
        title={activeDetail?.title} subtitle={activeDetail?.subtitle || scopeLabel} action={activeDetail?.action}>
        {activeDetail?.render()}
      </DetailDialog>

      {/* Single item popup */}
      <DetailDialog open={Boolean(itemPopup)} onClose={() => setItemPopup(null)} maxWidth="sm"
        title={itemPopup ? `Item ${itemPopup.item_number}` : ''}
        action={itemPopup ? <Box sx={{ alignSelf: 'center', mr: 1 }}><Pill label={itemPopup.decision} color={decisionColor(itemPopup.decision)} /></Box> : null}>
        {itemPopup && itemDetails(itemPopup)}
      </DetailDialog>

      {/* Method explanation */}
      <DetailDialog open={methodOpen} onClose={() => setMethodOpen(false)} maxWidth="sm"
        title="How item analysis is computed"
        subtitle="The manual upper–lower 27% procedure, automated from the recorded bubble-sheet answers.">
        {methodSteps.map(([title, body]) => (
          <Box key={title} sx={{ mb: 1.5 }}>
            <Txt size={13.5} weight={700}>{title}</Txt>
            <Txt size={12.5} color={MUTED} sx={{ mt: 0.3 }}>{body}</Txt>
          </Box>
        ))}
      </DetailDialog>

      {/* Per-student Bloom mastery */}
      <DetailDialog open={Boolean(bloomLevelPopup)} onClose={() => setBloomLevelPopup(null)} maxWidth="sm"
        title={bloomLevelPopup ? `${bloomLevelPopup} — per-student mastery` : ''}
        subtitle={bloomStudents.length === 0
          ? 'No students answered items at this level.'
          : `${bloomStudents.filter(st => st.v >= bloomMastered).length} of ${bloomStudents.length} students mastered (≥ ${fmtNum(bloomMastered)}%)`}>
        {bloomStudents.map(st => {
          const color = masteryColor(st.v, bloomMastered, bloomNear)
          return (
            <Box key={st.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, borderBottom: `1px solid ${BORDER}` }}>
              <Txt weight={600} sx={{ width: 110, flexShrink: 0 }}>{st.id}</Txt>
              <Box sx={{ flex: 1, height: 8, borderRadius: 1, bgcolor: BORDER, overflow: 'hidden' }}>
                <Box sx={{ width: `${Math.min(100, st.v)}%`, height: '100%', bgcolor: color }} />
              </Box>
              <Txt weight={800} color={color} sx={{ width: 44, textAlign: 'right' }}>{st.v.toFixed(0)}%</Txt>
            </Box>
          )
        })}
      </DetailDialog>

      {/* Passing score editor */}
      <DetailDialog open={passingDialog != null} onClose={() => setPassingDialog(null)} maxWidth="xs"
        title={`Passing Score — ${selectedAssessment?.title || ''}`}>
        <Box sx={{ textAlign: 'center' }}>
          <Txt size={44} weight={900} color={PRIMARY}>{(passingDialog ?? 0).toFixed(0)}%</Txt>
          <Slider value={passingDialog ?? 50} min={0} max={100} step={1}
            onChange={(_, v) => setPassingDialog(v)} sx={{ color: PRIMARY, mt: 1 }} />
          <Button fullWidth variant="contained" disabled={savingPassing} onClick={() => savePassingScore(passingDialog ?? 50)}
            sx={{ mt: 1.5, bgcolor: PRIMARY, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#6E1212' } }}>
            {savingPassing ? 'Saving…' : 'Save Passing Score'}
          </Button>
        </Box>
      </DetailDialog>
    </Box>
  )
}
