// BubbleSheetPanel.jsx — Self-contained Bubble Sheet workflow
// Tabs: Templates | Results
//
// Props:
//   courseId    – current course UUID (string)
//   assessments – array of { assessment_id, title } for the course
//
import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import VisibilityIcon from '@mui/icons-material/Visibility'
import FlagIcon from '@mui/icons-material/Flag'
import StarIcon from '@mui/icons-material/Star'
import KeyIcon from '@mui/icons-material/Key'
import RefreshIcon from '@mui/icons-material/Refresh'
import SyncIcon from '@mui/icons-material/Sync'
import api from '../config/api'
import { extractApiError } from '../utils'

// ── Constants ──────────────────────────────────────────────────────────────
const MAROON       = '#8E1C1B'
const MAROON_LIGHT = 'rgba(170,36,35,0.16)'
const BG           = 'var(--workspace-bg)'
const SURFACE      = 'var(--workspace-panel)'
const TEXT          = 'var(--workspace-text)'
const MUTED         = 'var(--workspace-muted)'
const BORDER        = 'var(--workspace-border)'
const DIALOG_PAPER_SX = {
  bgcolor: SURFACE,
  color: TEXT,
  backgroundImage: 'none',
  border: `1px solid ${BORDER}`,
  '& .MuiDialogContent-root': { borderColor: BORDER },
}

// ── Shared mini-components ─────────────────────────────────────────────────
function SCard({ title, action, children }) {
  return (
    <Paper elevation={0}
      sx={{ bgcolor: SURFACE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 2.5, mb: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, py: 1.25, bgcolor: BG, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center' }}>
        <Typography variant="subtitle2"
          sx={{ fontWeight: 700, color: TEXT, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      <Box sx={{ p: 2.5, color: TEXT }}>{children}</Box>
    </Paper>
  )
}

function LF({ label, ...props }) {
  return (
    <TextField size="small" fullWidth label={label} {...props}
      sx={{
        '& .MuiOutlinedInput-root': {
          color: TEXT,
          bgcolor: SURFACE,
          '& fieldset': { borderColor: BORDER },
          '&:hover fieldset': { borderColor: MAROON },
          '&.Mui-focused fieldset': { borderColor: MAROON },
        },
        '& .MuiInputLabel-root': { color: MUTED },
        '& .MuiInputLabel-root.Mui-focused': { color: '#E24B4A' },
        '& .MuiFormHelperText-root': { color: MUTED },
        '& .MuiSelect-icon': { color: MUTED },
        ...props.sx,
      }}
      SelectProps={{
        MenuProps: { PaperProps: { elevation: 2, sx: { bgcolor: SURFACE, color: TEXT, border: `1px solid ${BORDER}` } } },
        ...props.SelectProps,
      }}
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function BubbleSheetPanel({ courseId, assessments = [], onModifyTemplate, onNotice }) {
  const [tab, setTab] = useState(0)

  // shared across sub-panels
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [error, setError] = useState('')

  const loadTemplates = useCallback(async () => {
    if (!courseId) return
    setTemplatesLoading(true)
    setError('')
    try {
      const r = await api.get(`/grading/bubble/templates/?course_id=${courseId}`)
      setTemplates(r.data.templates || [])
    } catch (e) {
      setError(extractApiError(e))
    } finally {
      setTemplatesLoading(false)
    }
  }, [courseId])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          borderBottom: `1px solid ${BORDER}`,
          '& .MuiTab-root': { color: MUTED, fontSize: '0.78rem', fontWeight: 600, textTransform: 'none', minHeight: 38 },
          '& .Mui-selected': { color: '#E24B4A !important' },
          '& .MuiTabs-indicator': { bgcolor: MAROON },
        }}
      >
        <Tab label="Templates" />
        <Tab label="Results" />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>{error}</Alert>}

      {tab === 0 && (
        <TemplatesTab
          courseId={courseId}
          assessments={assessments}
          templates={templates}
          loading={templatesLoading}
          onRefresh={loadTemplates}
          onModifyTemplate={onModifyTemplate}
          onNotice={onNotice}
        />
      )}
      {tab === 1 && (
        <ResultsTab
          courseId={courseId}
          templates={templates}
          onNotice={onNotice}
        />
      )}
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES TAB
// ─────────────────────────────────────────────────────────────────────────────
function TemplatesTab({ courseId, assessments, templates, loading, onRefresh, onModifyTemplate, onNotice }) {
  const [creating, setCreating] = useState(false)
  const [keyDialog, setKeyDialog] = useState(null) // template obj

  return (
    <>
      <SCard
        title="Answer Sheet Templates"
        action={
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh"><IconButton size="small" onClick={onRefresh}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            <Button size="small" variant="contained" startIcon={<AddIcon />}
              sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6E1212' }, fontSize: '0.72rem', textTransform: 'none' }}
              onClick={() => setCreating(true)}>
              New Template
            </Button>
          </Stack>
        }
      >
        {loading
          ? <LinearProgress sx={{ height: 3, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />
          : templates.length === 0
            ? <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.82rem' }}>
              No templates yet. Create one to generate a printable bubble sheet.
            </Typography>
            : (
              <Stack spacing={1.5}>
                {templates.map(t => (
                  <TemplateRow
                    key={t.template_id}
                    template={t}
                    onRefresh={onRefresh}
                    onSetKey={() => setKeyDialog(t)}
                    onModifyTemplate={onModifyTemplate}
                  />
                ))}
              </Stack>
            )
        }
      </SCard>

      {creating && (
        <CreateTemplateDialog
          courseId={courseId}
          assessments={assessments}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); onRefresh(); onNotice?.('Answer sheet template saved.') }}
        />
      )}

      {keyDialog && (
        <AnswerKeyDialog
          template={keyDialog}
          onClose={() => setKeyDialog(null)}
          onSaved={() => { setKeyDialog(null); onRefresh(); onNotice?.('Answer key saved.') }}
        />
      )}
    </>
  )
}

function TemplateRow({ template: t, onRefresh, onSetKey, onModifyTemplate }) {
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState('')
  const [syncingKey, setSyncingKey] = useState(false)

  async function fetchPdfBlob() {
    const r = await api.post(
      `/grading/bubble/templates/${t.template_id}/generate-pdf/`,
      {},
      { responseType: 'blob' }
    )
    return URL.createObjectURL(r.data)
  }

  async function handlePreview() {
    setPreviewLoading(true)
    setErr('')
    try {
      const url = await fetchPdfBlob()
      setPreviewUrl(url)
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setPreviewLoading(false)
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }

  async function handleDelete() {
    if (!window.confirm(`Delete template "${t.name}"? All scans for this template will also be deleted.`)) return
    setDeleting(true)
    try {
      await api.delete(`/grading/bubble/templates/${t.template_id}/`)
      onRefresh()
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setDeleting(false)
    }
  }

  async function handleSyncKey() {
    setSyncingKey(true)
    setErr('')
    try {
      const r = await api.post(`/grading/bubble/templates/${t.template_id}/sync-key/`)
      const detail = r?.data?.detail || 'Key synced.'
      setErr(detail)
      setTimeout(() => setErr(''), 3000)
      onRefresh()
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setSyncingKey(false)
    }
  }

  return (
    <Box sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2, p: 1.5 }}>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>{t.name}</Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <Chip label={`${t.total_items} items`} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'var(--workspace-hover)', color: TEXT, border: `1px solid ${BORDER}` }} />
            <Chip label={`${t.num_choices} choices`} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'var(--workspace-hover)', color: TEXT, border: `1px solid ${BORDER}` }} />
            <Chip
              label={t.has_answer_key ? 'Key set' : 'No key'}
              size="small"
              sx={{
                height: 18, fontSize: '0.65rem',
                bgcolor: t.has_answer_key ? 'rgba(170,36,35,0.18)' : 'var(--workspace-hover)',
                color: t.has_answer_key ? '#E24B4A' : MUTED,
                border: `1px solid ${t.has_answer_key ? 'rgba(226,75,74,0.28)' : BORDER}`,
              }}
            />
          </Stack>
          {err && <Typography sx={{ color: err.startsWith('Answer key synced') ? 'success.main' : 'error.main', fontSize: '0.75rem', mt: 0.5 }}>{err}</Typography>}
        </Box>

        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Set Answer Key">
            <IconButton size="small" onClick={onSetKey} sx={{ color: MUTED }}><KeyIcon sx={{ fontSize: 16 }} /></IconButton>
          </Tooltip>
          {t.assessment_id && (
            <Tooltip title="Sync Key from Assessment">
              <span>
                <IconButton size="small" onClick={handleSyncKey} disabled={syncingKey} sx={{ color: MUTED }}>
                  <RefreshIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Button
            size="small"
            variant="outlined"
            disabled={previewLoading}
            onClick={handlePreview}
            sx={{
              minWidth: 64,
              height: 30,
              px: 1.25,
              color: TEXT,
              borderColor: BORDER,
              textTransform: 'none',
              fontSize: '0.75rem',
              '&:hover': { borderColor: MAROON, bgcolor: 'rgba(170,36,35,0.08)' },
            }}
          >
            {previewLoading ? 'Opening…' : 'View'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onModifyTemplate?.(t)}
            sx={{
              minWidth: 72,
              height: 30,
              px: 1.25,
              color: TEXT,
              borderColor: BORDER,
              textTransform: 'none',
              fontSize: '0.75rem',
              '&:hover': { borderColor: MAROON, bgcolor: 'rgba(170,36,35,0.08)' },
            }}
          >
            Modify
          </Button>
          <Tooltip title="Delete template">
            <span>
              <IconButton size="small" color="error" onClick={handleDelete} disabled={deleting}>
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {previewUrl && (
        <PdfPreviewDialog
          title={t.name}
          url={previewUrl}
          onClose={closePreview}
          onDownload={() => {
            const link = document.createElement('a')
            link.href = previewUrl
            link.download = `bubble_sheet_${t.name.replace(/\s+/g, '_')}.pdf`
            link.click()
          }}
        />
      )}
    </Box>
  )
}

// ── PDF Preview Dialog ────────────────────────────────────────────────────
function PdfPreviewDialog({ title, url, onClose, onDownload }) {
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <VisibilityIcon sx={{ fontSize: 18, opacity: 0.7 }} />
        {title}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, height: 'calc(85vh - 130px)', minHeight: 400, overflow: 'hidden' }}>
        <object
          data={url}
          type="application/pdf"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        >
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.85rem', color: MUTED, mb: 1.5 }}>
              Your browser cannot display the PDF inline.
            </Typography>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onDownload}
              sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none', fontSize: '0.82rem' }}>
              Download PDF instead
            </Button>
          </Box>
        </object>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Close</Button>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={onDownload}
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6E1212' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Download PDF
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Create Template Dialog ─────────────────────────────────────────────────
function CreateTemplateDialog({ courseId, assessments, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    assessment_id: '',
    total_items: 30,
    num_choices: 4,
    num_id_columns: 8,
    parts: [{ label: 'Part I', start_item: 1, end_item: 30 }],
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [fetchingItems, setFetchingItems] = useState(false)
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('')
  const [keyCountPreview, setKeyCountPreview] = useState(null) // { count: N, total: M }

  // Auto-populate total_items from target_total_items when assessment changes
  async function handleAssessmentChange(assessmentId) {
    setField('assessment_id', assessmentId)
    setSelectedAssessmentId(assessmentId)
    setKeyCountPreview(null)
    if (!assessmentId) return
    setFetchingItems(true)
    try {
      const r = await api.get(`/curriculum/assessment/${assessmentId}/`)
      const target = r?.data?.assessment?.target_total_items
      const items = r?.data?.items || []
      const correctCount = items.filter(it => {
        const ca = String(it.correct_answer || '').trim().toUpperCase()
        return ca && 'ABCDE'.includes(ca)
      }).length
      if (target != null) {
        const n = Number(target)
        setField('total_items', n)
        setForm(p => ({ ...p, total_items: n, parts: [{ label: 'Part I', start_item: 1, end_item: n }] }))
        setKeyCountPreview({ count: correctCount, total: n })
        return
      }
    } catch { /* ignore — user can still type manually */ }
    finally { setFetchingItems(false) }
  }

  function setField(key, val) {
    setForm(p => ({ ...p, [key]: val }))
  }

  function updatePart(idx, key, val) {
    setForm(p => {
      const parts = [...p.parts]
      parts[idx] = { ...parts[idx], [key]: val }
      return { ...p, parts }
    })
  }

  function addPart() {
    const lastEnd = form.parts[form.parts.length - 1]?.end_item ?? 0
    setForm(p => ({
      ...p,
      parts: [...p.parts, { label: `Part ${p.parts.length + 1}`, start_item: lastEnd + 1, end_item: lastEnd + 10 }],
    }))
  }

  function removePart(idx) {
    setForm(p => ({ ...p, parts: p.parts.filter((_, i) => i !== idx) }))
  }

  async function handleSave() {
    setSaving(true)
    setErrors({})
    try {
      await api.post('/grading/bubble/templates/', {
        course_id: courseId,
        assessment_id: form.assessment_id || null,
        name: form.name,
        total_items: Number(form.total_items),
        num_choices: Number(form.num_choices),
        parts: form.parts.map(p => ({
          label: p.label,
          start_item: Number(p.start_item),
          end_item: Number(p.end_item),
        })),
        has_essay: false,
        essay_lines: 0,
        layout_metadata: { num_id_columns: Number(form.num_id_columns) },
      })
      onCreated()
    } catch (e) {
      const errs = e?.response?.data?.errors
      if (errs) setErrors(errs)
      else setErrors({ _: extractApiError(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON }}>New Bubble Sheet Template</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {errors._ && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{errors._}</Alert>}

          <LF label="Template name" value={form.name} onChange={e => setField('name', e.target.value)}
            error={!!errors.name} helperText={errors.name} />

          <LF select label="Linked assessment (optional)" value={form.assessment_id}
            onChange={e => handleAssessmentChange(e.target.value)}>
            <MenuItem value="">— None —</MenuItem>
            {assessments.map(a => (
              <MenuItem key={a.assessment_id} value={a.assessment_id}>{a.title}</MenuItem>
            ))}
          </LF>

          {keyCountPreview && (
            <Alert severity={keyCountPreview.count > 0 ? 'success' : 'info'} sx={{ fontSize: '0.8rem', py: 0.5 }}>
              {keyCountPreview.count > 0
                ? `${keyCountPreview.count} of ${keyCountPreview.total} items have correct answers — answer key will be auto-populated.`
                : `No correct answers found in assessment items. Answer key must be set manually.`}
            </Alert>
          )}

          <Stack direction="row" spacing={1.5}>
            <LF label="Total items" type="number" value={form.total_items}
              onChange={e => setField('total_items', e.target.value)}
              disabled={!!selectedAssessmentId}
              helperText={selectedAssessmentId ? 'Auto-populated from assessment TOS' : ''}
              inputProps={{ min: 1, max: 100 }} error={!!errors.total_items} />
            <LF select label="Choices per item" value={form.num_choices}
              onChange={e => setField('num_choices', Number(e.target.value))}>
              {[2, 3, 4, 5].map(n => (
                <MenuItem key={n} value={n}>{n} ({['A–B', 'A–C', 'A–D', 'A–E'][n - 2]})</MenuItem>
              ))}
            </LF>
          </Stack>

          {/* Parts */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem' }}>
                Parts
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addPart}
                sx={{ fontSize: '0.72rem', color: MAROON, textTransform: 'none' }}>
                Add Part
              </Button>
            </Stack>
            {errors.non_field_errors && (
              <Alert severity="error" sx={{ mb: 1, fontSize: '0.78rem' }}>{errors.non_field_errors}</Alert>
            )}
            <Stack spacing={1}>
              {form.parts.map((p, idx) => (
                <Stack key={idx} direction="row" spacing={1} alignItems="center">
                  <LF label="Label" value={p.label} onChange={e => updatePart(idx, 'label', e.target.value)} sx={{ flex: 2 }} />
                  <LF label="From" type="number" value={p.start_item}
                    onChange={e => updatePart(idx, 'start_item', e.target.value)}
                    inputProps={{ min: 1 }} sx={{ flex: 1 }} />
                  <LF label="To" type="number" value={p.end_item}
                    onChange={e => updatePart(idx, 'end_item', e.target.value)}
                    inputProps={{ min: 1 }} sx={{ flex: 1 }} />
                  {form.parts.length > 1 && (
                    <IconButton size="small" color="error" onClick={() => removePart(idx)}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </Stack>
              ))}
            </Stack>
          </Box>

          {/* Student ID Columns */}
          <LF label="Student ID Columns" type="number" value={form.num_id_columns}
            onChange={e => setField('num_id_columns', Number(e.target.value))}
            inputProps={{ min: 4, max: 15 }}
            helperText="Number of digit columns for the Student ID shading matrix (4–15)" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving && <CircularProgress size={14} sx={{ color: '#fff' }} />}
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6E1212' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Create Template
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Answer Key Dialog ──────────────────────────────────────────────────────
// Answer-key value for a bonus item (matches the backend's omr_core.BONUS_KEY).
const BONUS_KEY = '*'

function AnswerKeyDialog({ template, onClose, onSaved }) {
  // initialise from existing key
  const initKey = () => {
    const k = {}
    for (let i = 1; i <= template.total_items; i++) {
      k[String(i)] = template.answer_key?.[String(i)] || ''
    }
    return k
  }
  const [key, setKey] = useState(initKey)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const choices = Array.from({ length: template.num_choices }, (_, i) => String.fromCharCode(65 + i))

  function setAnswer(itemNo, val) {
    setKey(p => ({ ...p, [String(itemNo)]: val }))
  }

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await api.post(
        `/grading/bubble/templates/${template.template_id}/answer-key/`,
        { answer_key: key }
      )
      onSaved()
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setSaving(false)
    }
  }

  // Items in chunks of 10 for the grid
  const rows = []
  for (let i = 1; i <= template.total_items; i += 10) {
    rows.push(Array.from({ length: Math.min(10, template.total_items - i + 1) }, (_, j) => i + j))
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON }}>
        Answer Key — {template.name}
      </DialogTitle>
      <DialogContent dividers>
        {err && <Alert severity="error" sx={{ mb: 2, fontSize: '0.8rem' }}>{err}</Alert>}
        <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.75rem', display: 'block', mb: 1.5 }}>
          Click the correct answer for each item. Items with no selection will be excluded from grading.
          The star marks a bonus item — every paper gets the point, even blank or multi-shaded answers.
          Saving re-scores sheets that were already scanned.
        </Typography>
        <Stack spacing={0.75}>
          {rows.map((rowItems, rIdx) => (
            <Stack key={rIdx} direction="row" spacing={0.5} flexWrap="wrap">
              {rowItems.map(itemNo => (
                <Box key={itemNo} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1.5 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, minWidth: 24, color: MUTED }}>
                    {itemNo}.
                  </Typography>
                  {choices.map(ch => (
                    <Box
                      key={ch}
                      onClick={() => setAnswer(itemNo, ch)}
                      sx={{
                        width: 24, height: 24, borderRadius: '50%',
                        border: `1.5px solid ${key[String(itemNo)] === ch ? MAROON : BORDER}`,
                        bgcolor: key[String(itemNo)] === ch ? MAROON : 'transparent',
                        color: key[String(itemNo)] === ch ? '#fff' : TEXT,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                        transition: 'all 0.12s',
                        '&:hover': { borderColor: '#E24B4A', bgcolor: key[String(itemNo)] === ch ? '#6E1212' : MAROON_LIGHT },
                      }}
                    >
                      {ch}
                    </Box>
                  ))}
                  <Box
                    title="Bonus — every paper gets the point"
                    onClick={() => setAnswer(itemNo, key[String(itemNo)] === BONUS_KEY ? '' : BONUS_KEY)}
                    sx={{
                      width: 24, height: 24, borderRadius: '50%',
                      border: `1.5px solid ${key[String(itemNo)] === BONUS_KEY ? MAROON : BORDER}`,
                      bgcolor: key[String(itemNo)] === BONUS_KEY ? MAROON : 'transparent',
                      color: key[String(itemNo)] === BONUS_KEY ? '#fff' : MUTED,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.12s',
                      '&:hover': { borderColor: '#E24B4A', bgcolor: key[String(itemNo)] === BONUS_KEY ? '#6E1212' : MAROON_LIGHT },
                    }}
                  >
                    <StarIcon sx={{ fontSize: 14 }} />
                  </Box>
                </Box>
              ))}
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving && <CircularProgress size={14} sx={{ color: '#fff' }} />}
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6E1212' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Save Answer Key
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ResultsTab({ courseId, templates, onNotice }) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(false)
  const [flagOnly, setFlagOnly] = useState(false)
  const [err, setErr] = useState('')
  const [editScan, setEditScan] = useState(null)

  async function loadScans(tmplId, fo) {
    if (!tmplId) return
    setLoading(true)
    setErr('')
    try {
      const params = fo ? '?flagged=1' : ''
      const r = await api.get(`/grading/bubble/templates/${tmplId}/scans/${params}`)
      setScans(r.data.scans || [])
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedTemplate) loadScans(selectedTemplate, flagOnly)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, flagOnly])

  async function handleDelete(scanId) {
    if (!window.confirm('Delete this scan result?')) return
    try {
      await api.delete(`/grading/bubble/scans/${scanId}/`)
      setScans(p => p.filter(s => s.scan_id !== scanId))
    } catch (e) {
      setErr(extractApiError(e))
    }
  }

  const avg = scans.length
    ? (scans.reduce((s, r) => s + Number(r.score_percent), 0) / scans.length).toFixed(1)
    : null

  return (
    <Stack spacing={2}>
      <SCard title="Filter">
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <LF select label="Template" value={selectedTemplate}
            onChange={e => setSelectedTemplate(e.target.value)}
            sx={{ maxWidth: 260 }}>
            <MenuItem value="">— Choose template —</MenuItem>
            {templates.map(t => (
              <MenuItem key={t.template_id} value={t.template_id}>{t.name}</MenuItem>
            ))}
          </LF>
          <LF select label="Show" value={flagOnly ? '1' : '0'}
            onChange={e => setFlagOnly(e.target.value === '1')}
            sx={{ maxWidth: 160 }}>
            <MenuItem value="0">All scans</MenuItem>
            <MenuItem value="1">Flagged only</MenuItem>
          </LF>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => loadScans(selectedTemplate, flagOnly)} sx={{ color: MUTED }}>
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </SCard>

      {err && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{err}</Alert>}

      {loading
        ? <LinearProgress sx={{ height: 3, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />
        : selectedTemplate && scans.length === 0
          ? <Typography variant="body2" sx={{ fontSize: '0.82rem', pl: 0.5, color: MUTED }}>
              No scan results yet for this template.
            </Typography>
          : scans.length > 0 && (
            <>
              {avg !== null && (
                <Stack direction="row" spacing={2} sx={{ mb: 0.5 }}>
                  <StatCard label="Total Scans" value={scans.length} />
                  <StatCard label="Class Average" value={`${avg}%`} />
                  <StatCard label="Flagged" value={scans.filter(s => s.is_flagged).length} warn />
                </Stack>
              )}
              <Paper elevation={0} sx={{ bgcolor: SURFACE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 2, overflow: 'hidden' }}>
                <Table size="small" sx={{
                  '& .MuiTableCell-root': { color: TEXT, borderColor: BORDER },
                  '& .MuiTableRow-root:hover': { bgcolor: 'var(--workspace-card)' },
                }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: BG }}>
                      {['Student ID', 'Score', '%', 'Flag', 'Date', ''].map(h => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', py: 1 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {scans.map(s => (
                      <TableRow key={s.scan_id} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ fontSize: '0.78rem' }}>{s.student_identifier || '—'}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem' }}>{s.score_raw} / {s.max_score}</TableCell>
                        <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700 }}>{s.score_percent}%</TableCell>
                        <TableCell>
                          {s.is_flagged
                            ? <Tooltip title={s.flag_reason || 'Flagged'}><FlagIcon sx={{ fontSize: 15, color: 'error.main' }} /></Tooltip>
                            : null}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.72rem', color: MUTED }}>
                          {new Date(s.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.25}>
                            <Tooltip title="Edit"><IconButton size="small" onClick={() => setEditScan(s)}><EditIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                            <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDelete(s.scan_id)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </>
          )
      }

      {editScan && (
        <EditScanDialog
          scan={editScan}
          templates={templates}
          onClose={() => setEditScan(null)}
          onSaved={() => { setEditScan(null); loadScans(selectedTemplate, flagOnly); onNotice?.('Scan saved.') }}
        />
      )}
    </Stack>
  )
}

function StatCard({ label, value, warn = false }) {
  return (
    <Paper elevation={0} sx={{ bgcolor: SURFACE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 2, px: 2, py: 1 }}>
      <Typography sx={{ fontSize: '0.68rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: warn ? '#FCA5A5' : '#E24B4A' }}>{value}</Typography>
    </Paper>
  )
}

// ── Edit Scan Dialog ───────────────────────────────────────────────────────
function EditScanDialog({ scan, templates, onClose, onSaved }) {
  const tmpl = templates.find(t => t.template_id === scan.template_id)
  const choices = tmpl
    ? Array.from({ length: tmpl.num_choices }, (_, i) => String.fromCharCode(65 + i))
    : ['A', 'B', 'C', 'D']

  const [studentId, setStudentId] = useState(scan.student_identifier || '')
  const [responses, setResponses] = useState({ ...scan.responses })
  const [isFlagged, setIsFlagged] = useState(scan.is_flagged)
  const [flagReason, setFlagReason] = useState(scan.flag_reason || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function setResponse(itemNo, val) {
    setResponses(p => ({ ...p, [String(itemNo)]: val }))
  }

  async function handleSave() {
    setSaving(true)
    setErr('')
    try {
      await api.patch(`/grading/bubble/scans/${scan.scan_id}/`, {
        student_identifier: studentId,
        responses,
        is_flagged: isFlagged,
        flag_reason: flagReason,
      })
      onSaved()
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setSaving(false)
    }
  }

  const itemNums = Object.keys(responses).map(Number).sort((a, b) => a - b)
  const rows = []
  for (let i = 0; i < itemNums.length; i += 10) {
    rows.push(itemNums.slice(i, i + 10))
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON }}>Edit Scan Result</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {err && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{err}</Alert>}
          <LF label="Student ID number" value={studentId} onChange={e => setStudentId(e.target.value)} />

          <Typography variant="caption" sx={{ fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem' }}>
            Detected Responses — click to correct
          </Typography>
          <Stack spacing={0.75}>
            {rows.map((rowItems, rIdx) => (
              <Stack key={rIdx} direction="row" spacing={0.5} flexWrap="wrap">
                {rowItems.map(itemNo => (
                  <Box key={itemNo} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mr: 1.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, minWidth: 24, color: MUTED }}>
                      {itemNo}.
                    </Typography>
                    {choices.map(ch => (
                      <Box
                        key={ch}
                        onClick={() => setResponse(itemNo, ch)}
                        sx={{
                          width: 22, height: 22, borderRadius: '50%',
                          border: `1.5px solid ${responses[String(itemNo)] === ch ? MAROON : BORDER}`,
                          bgcolor: responses[String(itemNo)] === ch ? MAROON : 'transparent',
                          color: responses[String(itemNo)] === ch ? '#fff' : TEXT,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer',
                          transition: 'all 0.12s',
                          '&:hover': { borderColor: MAROON },
                        }}
                      >
                        {ch}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Stack>
            ))}
          </Stack>

          <Divider />
          <Stack direction="row" spacing={1.5} alignItems="center">
            <LF select label="Flagged?" value={isFlagged ? '1' : '0'}
              onChange={e => setIsFlagged(e.target.value === '1')} sx={{ maxWidth: 160 }}>
              <MenuItem value="0">No</MenuItem>
              <MenuItem value="1">Yes</MenuItem>
            </LF>
            {isFlagged && (
              <LF label="Flag reason" value={flagReason} onChange={e => setFlagReason(e.target.value)} />
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving && <CircularProgress size={14} sx={{ color: '#fff' }} />}
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6E1212' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  )
}
