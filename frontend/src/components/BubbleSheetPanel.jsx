// BubbleSheetPanel.jsx — Self-contained Bubble Sheet workflow
// Tabs: Templates | Scan | Results
//
// Props:
//   courseId    – current course UUID (string)
//   assessments – array of { assessment_id, title } for the course
//
import { useCallback, useEffect, useRef, useState } from 'react'
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
import InputAdornment from '@mui/material/InputAdornment'
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
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import AddIcon from '@mui/icons-material/Add'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import VisibilityIcon from '@mui/icons-material/Visibility'
import FlagIcon from '@mui/icons-material/Flag'
import KeyIcon from '@mui/icons-material/Key'
import QrCodeIcon from '@mui/icons-material/QrCode'
import RefreshIcon from '@mui/icons-material/Refresh'
import SyncIcon from '@mui/icons-material/Sync'
import api from '../config/api'
import { extractApiError } from '../utils'

// ── Constants ──────────────────────────────────────────────────────────────
const MAROON       = '#15803D'
const MAROON_LIGHT = 'rgba(22,163,74,0.16)'
const BG           = '#0F0F12'
const SURFACE      = '#18181E'
const TEXT          = '#F0F0F2'
const MUTED         = 'rgba(255,255,255,0.58)'
const BORDER        = 'rgba(255,255,255,0.09)'
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
        '& .MuiInputLabel-root.Mui-focused': { color: '#86EFAC' },
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
export default function BubbleSheetPanel({ courseId, assessments = [], actionSheetMode, onActionSheetChange, onModifyTemplate }) {
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
          '& .Mui-selected': { color: '#86EFAC !important' },
          '& .MuiTabs-indicator': { bgcolor: MAROON },
        }}
      >
        <Tab label="Templates" />
        <Tab label="Scan Sheet" />
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
          actionSheetMode={actionSheetMode}
          onActionSheetChange={onActionSheetChange}
          onModifyTemplate={onModifyTemplate}
        />
      )}
      {tab === 1 && (
        <ScanTab
          courseId={courseId}
          templates={templates}
          onScanned={() => setTab(2)}
        />
      )}
      {tab === 2 && (
        <ResultsTab
          courseId={courseId}
          templates={templates}
        />
      )}
    </Box>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES TAB
// ─────────────────────────────────────────────────────────────────────────────
function TemplatesTab({ courseId, assessments, templates, loading, onRefresh, actionSheetMode, onActionSheetChange, onModifyTemplate }) {
  const [creating, setCreating]   = useState(false)
  const [keyDialog, setKeyDialog] = useState(null) // template obj

  return (
    <>
      <SCard
        title="Answer Sheet Templates"
        action={
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh"><IconButton size="small" onClick={onRefresh}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            <Button size="small" variant="contained" startIcon={<AddIcon />}
              sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, fontSize: '0.72rem', textTransform: 'none' }}
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
                    actionSheetMode={actionSheetMode}
                    onActionSheetChange={onActionSheetChange}
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
          onCreated={() => { setCreating(false); onRefresh() }}
        />
      )}

      {keyDialog && (
        <AnswerKeyDialog
          template={keyDialog}
          onClose={() => setKeyDialog(null)}
          onSaved={() => { setKeyDialog(null); onRefresh() }}
        />
      )}
    </>
  )
}

function TemplateRow({ template: t, onRefresh, onSetKey, actionSheetMode, onActionSheetChange, onModifyTemplate }) {
  const [pdfLoading,     setPdfLoading]     = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUrl,     setPreviewUrl]     = useState(null)
  const [qrOpen,         setQrOpen]         = useState(false)
  const [deleting,       setDeleting]       = useState(false)
  const [err,            setErr]            = useState('')
  const [syncingKey,     setSyncingKey]     = useState(false)

  async function fetchPdfBlob() {
    const r = await api.post(
      `/grading/bubble/templates/${t.template_id}/generate-pdf/`,
      {},
      { responseType: 'blob' }
    )
    return URL.createObjectURL(r.data)
  }

  async function handleGeneratePdf() {
    setPdfLoading(true)
    setErr('')
    try {
      const url  = await fetchPdfBlob()
      const link = document.createElement('a')
      link.href  = url
      link.download = `bubble_sheet_${t.name.replace(/\s+/g, '_')}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setPdfLoading(false)
    }
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
            <Chip label={`${t.total_items} items`} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.08)', color: TEXT, border: `1px solid ${BORDER}` }} />
            <Chip label={`${t.num_choices} choices`} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.08)', color: TEXT, border: `1px solid ${BORDER}` }} />
            {t.has_essay && <Chip label="Essay" size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(10,132,255,0.16)', color: '#93C5FD', border: '1px solid rgba(10,132,255,0.28)' }} />}
            <Chip
              label={t.has_answer_key ? 'Key set' : 'No key'}
              size="small"
              sx={{
                height: 18, fontSize: '0.65rem',
                bgcolor: t.has_answer_key ? 'rgba(22,163,74,0.18)' : 'rgba(255,255,255,0.08)',
                color: t.has_answer_key ? '#86EFAC' : MUTED,
                border: `1px solid ${t.has_answer_key ? 'rgba(134,239,172,0.28)' : BORDER}`,
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
          <Tooltip title="Answer Sheet Actions">
            <Select
              labelId="action-sheet-select"
              id="action-sheet-select"
              value={actionSheetMode}
              onChange={(e) => {
                const mode = e.target.value
                onActionSheetChange(mode)
                if (mode === 'view') handlePreview()
                if (mode === 'modify' && onModifyTemplate) onModifyTemplate(t)
              }}
              disabled={previewLoading || pdfLoading}
              sx={{
                minWidth: 80,
                color: TEXT,
                bgcolor: SURFACE,
                '& .MuiSelect-icon': { color: MUTED },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: BORDER },
                  '&:hover fieldset': { borderColor: MAROON },
                  '&.Mui-focused fieldset': { borderColor: MAROON },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: MAROON },
              }}
              SelectProps={{
                MenuProps: { PaperProps: { elevation: 2 } },
              }}
            >
              <MenuItem value="view">View</MenuItem>
              <MenuItem value="modify">Modify</MenuItem>
            </Select>
          </Tooltip>
          <Tooltip title="Generate Student QR">
            <IconButton size="small" onClick={() => setQrOpen(true)}><QrCodeIcon sx={{ fontSize: 16 }} /></IconButton>
          </Tooltip>
          <Tooltip title="Delete template">
            <span>
              <IconButton size="small" color="error" onClick={handleDelete} disabled={deleting}>
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {qrOpen && (
        <StudentQrDialog
          template={t}
          onClose={() => setQrOpen(false)}
        />
      )}

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
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontSize: '0.82rem' }}>
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
    has_essay: false,
    essay_lines: 10,
    parts: [{ label: 'Part I', start_item: 1, end_item: 30 }],
  })
  const [saving,  setSaving]  = useState(false)
  const [errors,  setErrors]  = useState({})
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
        has_essay: form.has_essay,
        essay_lines: Number(form.essay_lines),
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
                <MenuItem key={n} value={n}>{n} ({['A–B','A–C','A–D','A–E'][n-2]})</MenuItem>
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

          {/* Essay */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <LF select label="Essay / open-ended section" value={form.has_essay ? '1' : '0'}
              onChange={e => setField('has_essay', e.target.value === '1')} sx={{ flex: 2 }}>
              <MenuItem value="0">No essay section</MenuItem>
              <MenuItem value="1">Include essay lines</MenuItem>
            </LF>
            {form.has_essay && (
              <LF label="Lines" type="number" value={form.essay_lines}
                onChange={e => setField('essay_lines', e.target.value)}
                inputProps={{ min: 2, max: 50 }} sx={{ flex: 1 }} />
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving && <CircularProgress size={14} sx={{ color: '#fff' }} />}
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Create Template
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Answer Key Dialog ──────────────────────────────────────────────────────
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
  const [err, setErr]       = useState('')

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
                        '&:hover': { borderColor: '#86EFAC', bgcolor: key[String(itemNo)] === ch ? '#14532D' : MAROON_LIGHT },
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
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}
          startIcon={saving && <CircularProgress size={14} sx={{ color: '#fff' }} />}
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Save Answer Key
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Student QR Dialog ──────────────────────────────────────────────────────
function StudentQrDialog({ template, onClose }) {
  const [studentId, setStudentId] = useState('')
  const [qrSrc,     setQrSrc]    = useState(null)
  const [loading,   setLoading]  = useState(false)
  const [err,       setErr]      = useState('')

  async function fetchQr() {
    if (!studentId.trim()) return
    setLoading(true)
    setErr('')
    try {
      const r = await api.get(
        `/grading/bubble/templates/${template.template_id}/student-qr/?student_id=${encodeURIComponent(studentId.trim())}`,
        { responseType: 'blob' }
      )
      const url = URL.createObjectURL(r.data)
      setQrSrc(url)
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!qrSrc) return
    const a = document.createElement('a')
    a.href = qrSrc
    a.download = `qr_${studentId}.png`
    a.click()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: DIALOG_PAPER_SX }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON }}>
        Student QR Code
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="caption" sx={{ color: MUTED, fontSize: '0.78rem' }}>
            Enter the student's preset identification number to generate a QR sticker.
            No personal information is encoded — only the numeric ID.
          </Typography>
          <LF
            label="Student ID number"
            value={studentId}
            onChange={e => setStudentId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && fetchQr()}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Button size="small" onClick={fetchQr} disabled={loading || !studentId.trim()}
                    sx={{ minWidth: 0, color: MAROON, textTransform: 'none', fontSize: '0.78rem' }}>
                    Generate
                  </Button>
                </InputAdornment>
              )
            }}
          />
          {err && <Alert severity="error" sx={{ fontSize: '0.78rem' }}>{err}</Alert>}
          {loading && <LinearProgress sx={{ height: 3, '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />}
          {qrSrc && (
            <Box sx={{ textAlign: 'center' }}>
              <img src={qrSrc} alt={`QR for ${studentId}`} style={{ width: 160, height: 160, border: `1px solid ${BORDER}`, borderRadius: 6 }} />
              <Typography variant="caption" display="block" sx={{ mt: 0.5, color: MUTED, fontSize: '0.72rem' }}>
                ID: <strong>{studentId}</strong>
              </Typography>
              <Button size="small" startIcon={<DownloadIcon />} onClick={handleDownload}
                sx={{ mt: 1, color: MAROON, textTransform: 'none', fontSize: '0.78rem' }}>
                Download PNG
              </Button>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SCAN TAB
// ─────────────────────────────────────────────────────────────────────────────
function ScanTab({ courseId, templates, onScanned }) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [file,    setFile]    = useState(null)
  const [preview, setPreview] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [result,   setResult]   = useState(null)
  const [err,      setErr]      = useState('')
  const fileRef = useRef()

  const readyTemplates = templates.filter(t => t.has_answer_key)

  function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setErr('')
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(f)
  }

  async function handleScan() {
    if (!selectedTemplate || !file) return
    setScanning(true)
    setErr('')
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('template_id', selectedTemplate)
      fd.append('image', file)
      const r = await api.post('/grading/bubble/scans/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(r.data.scan)
    } catch (e) {
      setErr(extractApiError(e))
    } finally {
      setScanning(false)
    }
  }

  function handleAnother() {
    setFile(null)
    setPreview(null)
    setResult(null)
    setErr('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <SCard title="Scan Answered Sheet">
      <Stack spacing={2}>
        {readyTemplates.length === 0
          ? <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
              No templates with an answer key yet. Go to the Templates tab to create one and set its key.
            </Alert>
          : null
        }

        <LF select label="Select template" value={selectedTemplate}
          onChange={e => { setSelectedTemplate(e.target.value); setResult(null) }}
          disabled={readyTemplates.length === 0}>
          <MenuItem value="">— Choose a template —</MenuItem>
          {readyTemplates.map(t => (
            <MenuItem key={t.template_id} value={t.template_id}>
              {t.name} ({t.total_items} items, {t.num_choices} choices)
            </MenuItem>
          ))}
        </LF>

        {/* Upload zone */}
        <Box
          onClick={() => fileRef.current?.click()}
          sx={{
            border: `2px dashed ${file ? '#86EFAC' : 'rgba(255,255,255,0.24)'}`,
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            bgcolor: file ? MAROON_LIGHT : 'rgba(255,255,255,0.04)',
            color: TEXT,
            transition: 'all 0.15s',
            '&:hover': { borderColor: '#86EFAC', bgcolor: 'rgba(22,163,74,0.12)' },
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {preview
            ? <img src={preview} alt="Preview" style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }} />
            : (
              <>
                <CloudUploadIcon sx={{ fontSize: 36, color: MUTED, mb: 0.5 }} />
                <Typography sx={{ fontSize: '0.8rem', color: TEXT }}>
                  Click or drag to upload a scanned sheet image
                </Typography>
                <Typography sx={{ fontSize: '0.7rem', color: MUTED, mt: 0.5 }}>
                  JPEG · PNG · WebP
                </Typography>
              </>
            )
          }
        </Box>

        {err && <Alert severity="error" sx={{ fontSize: '0.8rem' }}>{err}</Alert>}

        {/* Scan result */}
        {result && (
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: SURFACE, color: TEXT, borderColor: BORDER }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>Scan Result</Typography>
              {result.is_flagged && (
                <Chip icon={<FlagIcon />} label="Flagged" size="small" color="error" sx={{ fontSize: '0.68rem' }} />
              )}
            </Stack>
            <Stack spacing={0.5}>
              <Row label="Student ID" value={result.student_identifier || '(not decoded)'} />
              <Row label="Score" value={`${result.score_raw} / ${result.max_score}`} />
              <Row label="Percentage" value={`${result.score_percent}%`} />
              {result.flag_reason && <Row label="Flag reason" value={result.flag_reason} warn />}
            </Stack>
          </Paper>
        )}

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={scanning ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <CloudUploadIcon />}
            disabled={!selectedTemplate || !file || scanning}
            onClick={handleScan}
            sx={{
              bgcolor: MAROON,
              '&:hover': { bgcolor: '#14532D' },
              '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.08)', color: MUTED },
              '&.Mui-disabled .MuiButton-startIcon': { color: MUTED },
              textTransform: 'none', fontSize: '0.82rem',
            }}
          >
            {scanning ? 'Scanning…' : 'Scan Sheet'}
          </Button>
          {result && (
            <>
              <Button variant="outlined" onClick={handleAnother}
                sx={{ borderColor: MAROON, color: MAROON, textTransform: 'none', fontSize: '0.82rem' }}>
                Scan Another
              </Button>
              <Button variant="text" onClick={onScanned}
                sx={{ color: MAROON, textTransform: 'none', fontSize: '0.82rem' }}>
                View All Results →
              </Button>
            </>
          )}
        </Stack>
      </Stack>
    </SCard>
  )
}

function Row({ label, value, warn = false }) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography sx={{ fontSize: '0.78rem', color: MUTED, minWidth: 110 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: warn ? '#FCA5A5' : TEXT }}>{value}</Typography>
    </Stack>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS TAB
// ─────────────────────────────────────────────────────────────────────────────
function ResultsTab({ courseId, templates }) {
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [scans,   setScans]   = useState([])
  const [loading, setLoading] = useState(false)
  const [flagOnly, setFlagOnly] = useState(false)
  const [err,     setErr]     = useState('')
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
                  '& .MuiTableRow-root:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
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
          onSaved={() => { setEditScan(null); loadScans(selectedTemplate, flagOnly) }}
        />
      )}
    </Stack>
  )
}

function StatCard({ label, value, warn = false }) {
  return (
    <Paper elevation={0} sx={{ bgcolor: SURFACE, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 2, px: 2, py: 1 }}>
      <Typography sx={{ fontSize: '0.68rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: warn ? '#FCA5A5' : '#86EFAC' }}>{value}</Typography>
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
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#14532D' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Save Changes
        </Button>
      </DialogActions>
    </Dialog>
  )
}
