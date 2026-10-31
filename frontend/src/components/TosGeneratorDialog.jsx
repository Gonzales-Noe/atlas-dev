// AI Table of Specifications builder.
// The course year level sets the Bloom target; the TLA chapters set coverage.

import React, { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import api from '../config/api'
import { extractApiError } from '../utils'
import { materializeTosExam } from '../utils/tosFormula'
import { collectLectureDiscussionTopics } from '../utils/lectureTopics'

const MAROON = 'var(--brand-primary)'
const BLOOM_KEYS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']
const BLOOM_LABELS = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
}

const YEAR_POLICIES = [
  { levels: ['remember', 'understand'], weights: [50, 50], summary: 'Remember and Understand' },
  { levels: ['apply'], weights: [100], summary: 'Apply' },
  { levels: ['analyze'], weights: [100], summary: 'Analyze' },
  { levels: ['evaluate', 'create'], weights: [50, 50], summary: 'Evaluate and Create' },
]

const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year']

function yearNumber(yearLevel) {
  const text = String(yearLevel || '').toLowerCase()
  const digits = text.match(/\d+/)
  if (digits) return parseInt(digits[0], 10)
  if (/\bfirst|freshman\b/.test(text)) return 1
  if (/\bsecond|sophomore\b/.test(text)) return 2
  if (/\bthird|junior\b/.test(text)) return 3
  if (/\bfourth|senior\b/.test(text)) return 4
  if (/\bfifth\b/.test(text)) return 5
  return 0
}

function policyForYear(yearLevel) {
  const number = yearNumber(yearLevel)
  const index = number >= 4 ? 3 : (number >= 1 ? number - 1 : 0)
  return YEAR_POLICIES[index]
}

function defaultWeightsFor(yearLevel) {
  return policyForYear(yearLevel).weights.map(String)
}

function weeklyHoursFromSyllabus(syllabusData) {
  const match = String(syllabusData?.contact_hours || '').match(/\d+(?:\.\d+)?/)
  const value = match ? Number(match[0]) : 3
  return Number.isFinite(value) && value > 0 ? value : 3
}

function emptyBloomCells() {
  return Object.fromEntries(BLOOM_KEYS.map(key => [key, '']))
}

function previewRows(topics) {
  return (topics || []).map((row, index) => ({
    id: `tos-preview-${index}`,
    topic: row.topic || '',
    ilos: row.ilos || [],
    hours_class: row.hours_class || 0,
    hours_min: 0,
    weight: '',
    bloom_pct: row.bloom_pct || emptyBloomCells(),
    bloom_items: emptyBloomCells(),
    total_points: '',
  }))
}

export default function TosGeneratorDialog({ open, onClose, course, syllabusData, activeExam, onApply }) {
  const chapters = useMemo(
    () => collectLectureDiscussionTopics(syllabusData?.tla_chapters),
    [syllabusData?.tla_chapters],
  )
  const courseYear = course?.year_level || syllabusData?.year_level || ''
  const yearChoices = useMemo(() => {
    const values = new Set(YEAR_OPTIONS)
    ;(course?.year_levels || []).forEach(item => {
      const value = typeof item === 'string' ? item : item?.value
      if (value) values.add(value)
    })
    if (courseYear) values.add(courseYear)
    return [...values]
  }, [course?.year_levels, courseYear])

  const [yearLevel, setYearLevel] = useState('')
  const [weights, setWeights] = useState([])
  const [examLabel, setExamLabel] = useState('')
  const [totalItems, setTotalItems] = useState(60)
  const [totalMinutes, setTotalMinutes] = useState(120)
  const [weeklyHours, setWeeklyHours] = useState(3)
  const [selectedTitles, setSelectedTitles] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Re-seed the form every time the dialog opens so it reflects the active exam.
  useEffect(() => {
    if (!open) return
    const covered = Array.isArray(activeExam?.coveredChapters) ? activeExam.coveredChapters : []
    const titles = chapters.map(chapter => chapter.title)
    const preselected = covered.length
      ? titles.filter(title => covered.some(item => String(item).toLowerCase() === title.toLowerCase()))
      : titles
    const seedYear = activeExam?.yearLevel || courseYear || '1st Year'
    const seedPolicy = policyForYear(seedYear)
    const stored = activeExam?.bloomPolicy
    const storedMatches = stored
      && Array.isArray(stored.levels)
      && stored.levels.length === seedPolicy.levels.length
      && stored.levels.every((key, index) => key === seedPolicy.levels[index])
      && Array.isArray(stored.weights)
    setYearLevel(seedYear)
    setWeights(storedMatches ? stored.weights.map(String) : seedPolicy.weights.map(String))
    setExamLabel(activeExam?.examLabel || 'Preliminary Examination')
    setTotalItems(Number(activeExam?.totalTestItems) || 60)
    setTotalMinutes(Number(activeExam?.totalExamMinutes) || 120)
    setWeeklyHours(weeklyHoursFromSyllabus(syllabusData))
    setSelectedTitles(preselected.length ? preselected : titles)
    setPreview(null)
    setError('')
    setLoading(false)
    // Chapters change only when the syllabus changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeExam?.id, chapters.length])

  const selectedChapters = chapters.filter(chapter => selectedTitles.includes(chapter.title))
  const policy = policyForYear(yearLevel)
  const weightValues = policy.levels.map((_, index) => {
    const raw = weights[index] ?? policy.weights[index]
    const number = Number(raw)
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0
  })
  const weightTotal = weightValues.reduce((sum, value) => sum + value, 0)
  const weightsValid = Math.abs(weightTotal - 100) < 0.01

  function changeYear(value) {
    setYearLevel(value)
    setWeights(defaultWeightsFor(value))
    invalidatePreview()
  }

  function updateWeight(index, value) {
    setWeights(policy.levels.map((_, position) => (
      position === index ? value : (weights[position] ?? String(policy.weights[position]))
    )))
    invalidatePreview()
  }

  function resetWeights() {
    setWeights(defaultWeightsFor(yearLevel))
    invalidatePreview()
  }

  const previewExam = useMemo(() => {
    if (!preview) return null
    return materializeTosExam({
      id: 'tos-preview',
      totalTestItems: preview.total_test_items,
      totalExamMinutes: preview.total_exam_minutes,
      topics: previewRows(preview.topics),
    })
  }, [preview])

  function invalidatePreview() {
    if (preview) setPreview(null)
  }

  function toggleChapter(title) {
    invalidatePreview()
    setSelectedTitles(prev => (
      prev.includes(title) ? prev.filter(item => item !== title) : [...prev, title]
    ))
  }

  function toggleAll() {
    invalidatePreview()
    setSelectedTitles(prev => (prev.length === chapters.length ? [] : chapters.map(chapter => chapter.title)))
  }

  async function handleGenerate() {
    if (!course?.course_id) return
    if (selectedChapters.length === 0) {
      setError('Select at least one chapter to cover.')
      return
    }
    if (!weightsValid) {
      setError('Bloom percentages must add up to 100%.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/curriculum/generate-tos/', {
        course_id: course.course_id,
        exam_label: examLabel,
        total_test_items: Number(totalItems) || 60,
        total_exam_minutes: Number(totalMinutes) || 120,
        year_level: yearLevel,
        bloom_weights: Object.fromEntries(
          policy.levels.map((key, index) => [key, weightValues[index]]),
        ),
        weekly_hours: Number(weeklyHours) || 3,
        provider: 'auto',
        chapters: selectedChapters.map(chapter => ({
          title: chapter.title,
          week: chapter.week,
          span: chapter.span || 1,
          ilos: chapter.ilos || [],
          outcomes: chapter.outcomes || '',
        })),
      }, { timeout: 180000 })
      if (!data?.success || !Array.isArray(data.topics) || data.topics.length === 0) {
        throw new Error(data?.detail || 'The generator did not return any TOS rows.')
      }
      setPreview(data)
    } catch (err) {
      setError(extractApiError(err) || err?.message || 'Could not generate the TOS. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (!previewExam || !preview) return
    onApply({
      examLabel: examLabel.trim() || 'Examination',
      yearLevel,
      bloomPolicy: preview.bloom_policy,
      coveredChapters: selectedChapters.map(chapter => chapter.title),
      totalTestItems: preview.total_test_items,
      totalExamMinutes: preview.total_exam_minutes,
      topics: previewExam.topics.map(row => ({
        ...row,
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      })),
    })
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, fontSize: '1.02rem', color: MAROON, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeIcon sx={{ fontSize: 20 }} />
        Generate Table of Specifications
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ color: 'var(--workspace-muted)', mb: 2 }}>
          Pick the chapters to cover. The assigned college year level decides the Bloom target,
          and the TLA chapter ILOs carry over to each TOS row.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1.5 }}>
          <TextField
            size="small"
            label="Exam label"
            value={examLabel}
            onChange={event => { setExamLabel(event.target.value); invalidatePreview() }}
          />
          <TextField
            size="small"
            select
            label="College year level"
            value={yearLevel}
            onChange={event => changeYear(event.target.value)}
            helperText={courseYear ? `Assigned course year: ${courseYear}` : 'Set from the course assignment'}
          >
            {yearChoices.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </TextField>
          <TextField
            size="small"
            type="number"
            label="Weekly class hours"
            value={weeklyHours}
            onChange={event => { setWeeklyHours(event.target.value); invalidatePreview() }}
            inputProps={{ min: 0.5, max: 12, step: 0.5 }}
          />
          <TextField
            size="small"
            type="number"
            label="Total test items"
            value={totalItems}
            onChange={event => { setTotalItems(event.target.value); invalidatePreview() }}
            inputProps={{ min: 1, max: 500 }}
          />
          <TextField
            size="small"
            type="number"
            label="Total exam minutes"
            value={totalMinutes}
            onChange={event => { setTotalMinutes(event.target.value); invalidatePreview() }}
            inputProps={{ min: 1, max: 1200 }}
          />
        </Box>

        <Box sx={{
          mt: 1.5, px: 1.5, py: 1.1, borderRadius: 1.5,
          bgcolor: 'rgba(170,36,35,0.06)', border: '1px solid rgba(170,36,35,0.18)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: MAROON, textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>
              Year-level Bloom target
            </Typography>
            <Button size="small" onClick={resetWeights}
              sx={{ textTransform: 'none', fontSize: '0.68rem', color: MAROON, minWidth: 0, py: 0 }}>
              Reset
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mt: 0.75 }}>
            <Chip size="small" label={policy.summary}
              sx={{ height: 24, fontSize: '0.68rem', fontWeight: 700, bgcolor: MAROON, color: '#fff' }} />
            {policy.levels.map((key, index) => (
              <TextField
                key={key}
                size="small"
                type="number"
                label={BLOOM_LABELS[key]}
                value={weights[index] ?? String(policy.weights[index])}
                onChange={event => updateWeight(index, event.target.value)}
                inputProps={{ min: 0, max: 100, step: 1 }}
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                sx={{
                  width: 138,
                  bgcolor: 'var(--workspace-panel)',
                  '& .MuiInputBase-root': { fontSize: '0.78rem' },
                  '& .MuiInputLabel-root': { fontSize: '0.74rem' },
                }}
              />
            ))}
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: weightsValid ? 'var(--workspace-muted)' : '#b91c1c' }}>
              Total {Number(weightTotal.toFixed(1))}%{weightsValid ? '' : ' — must total 100%'}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--workspace-text)', flex: 1 }}>
            Chapters to cover ({selectedTitles.length}/{chapters.length})
          </Typography>
          <Button size="small" onClick={toggleAll}
            sx={{ textTransform: 'none', fontSize: '0.72rem', color: MAROON, minWidth: 0 }}>
            {selectedTitles.length === chapters.length ? 'Clear all' : 'Select all'}
          </Button>
        </Box>

        <Box sx={{
          mt: 0.75, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--workspace-border)',
          borderRadius: 1.5, bgcolor: 'var(--workspace-panel)',
        }}>
          {chapters.length === 0 ? (
            <Box sx={{ p: 2 }}>
              <Typography variant="caption" sx={{ color: '#b45309', fontWeight: 600 }}>
                No teaching chapters yet. Add Topics / Reading List rows in the TLA Activities section first.
              </Typography>
            </Box>
          ) : chapters.map(chapter => {
            const checked = selectedTitles.includes(chapter.title)
            return (
              <Box key={chapter.title}
                onClick={() => toggleChapter(chapter.title)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.85,
                  borderBottom: '1px solid var(--workspace-border)', cursor: 'pointer',
                  bgcolor: checked ? 'rgba(170,36,35,0.05)' : 'transparent',
                  '&:last-of-type': { borderBottom: 'none' },
                }}>
                <Checkbox size="small" checked={checked} onChange={() => toggleChapter(chapter.title)}
                  onClick={event => event.stopPropagation()} sx={{ p: 0.35, color: MAROON, '&.Mui-checked': { color: MAROON } }} />
                <Chip size="small" label={`Wk ${chapter.week}`}
                  sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, bgcolor: 'var(--workspace-hover)' }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--workspace-text)' }} noWrap>
                    {chapter.title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.64rem', color: 'var(--workspace-muted)' }}>
                    {chapter.span > 1 ? `${chapter.span} weeks` : '1 week'}
                    {chapter.ilos?.length ? ` · ${chapter.ilos.join(', ')}` : ' · no ILO linked'}
                  </Typography>
                </Box>
              </Box>
            )
          })}
        </Box>

        {error && <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.78rem' }}>{error}</Alert>}

        {preview && previewExam && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--workspace-text)', flex: 1 }}>
                Preview
              </Typography>
              <Chip size="small"
                label={preview.used_ai ? 'AI draft' : 'Formula draft'}
                sx={{ height: 20, fontSize: '0.64rem', fontWeight: 700, bgcolor: preview.used_ai ? 'rgba(22,163,74,0.14)' : 'rgba(217,119,6,0.14)', color: preview.used_ai ? '#166534' : '#b45309' }} />
              <Typography sx={{ fontSize: '0.68rem', color: 'var(--workspace-muted)' }}>
                {preview.total_test_items} items · {preview.total_exam_minutes} min
              </Typography>
            </Box>
            <Box sx={{ overflowX: 'auto', border: '1px solid var(--workspace-border)', borderRadius: 1.5 }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: 620, width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--workspace-bg)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--workspace-border)' }}>Topic</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--workspace-border)' }}>ILOs</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--workspace-border)' }}>Hrs</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--workspace-border)' }}>Wt %</th>
                    {policy.levels.map(key => (
                      <th key={key} style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--workspace-border)', color: MAROON }}>
                        {BLOOM_LABELS[key]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewExam.topics.map(row => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--workspace-border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--workspace-text)' }}>{row.topic}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--workspace-muted)' }}>
                        {(row.ilos || []).join(', ') || '—'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{row.hours_class}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: MAROON }}>
                        {Number(row.weight || 0).toFixed(1)}%
                      </td>
                      {policy.levels.map(key => (
                        <td key={key} style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {Number(row.bloom_pct?.[key] || 0)}% · {Number(row.bloom_items?.[key] || 0)} items
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'var(--workspace-muted)' }}>
              Hours drive weight, points, and minutes. Bloom percentages drive the item counts.
              Applying replaces the topic rows for this examination; Save TOS persists them.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} sx={{ textTransform: 'none', color: 'var(--workspace-muted)' }}>
          Cancel
        </Button>
        <Button
          variant="outlined"
          onClick={handleGenerate}
          disabled={loading || chapters.length === 0 || !weightsValid}
          startIcon={loading ? <CircularProgress size={14} /> : <AutoAwesomeIcon />}
          sx={{ textTransform: 'none', borderColor: MAROON, color: MAROON }}
        >
          {loading ? 'Generating…' : preview ? 'Generate again' : 'Generate TOS'}
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={!preview || loading}
          sx={{ textTransform: 'none', bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-red-core)' } }}
        >
          Apply to TOS
        </Button>
      </DialogActions>
    </Dialog>
  )
}
