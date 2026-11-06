// BubbleSheetPanel.jsx — Self-contained Bubble Sheet workflow
// Tabs: Templates | Results | Sections
//
// Props:
//   courseId    – current course UUID (string)
//   assessments – array of { assessment_id, title } for the course
//
import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import { showStatusNotice, StatusNotice } from './StatusNotice'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Menu from '@mui/material/Menu'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
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
import VisibilityIcon from '@mui/icons-material/Visibility'
import FlagIcon from '@mui/icons-material/Flag'
import StarIcon from '@mui/icons-material/Star'
import KeyIcon from '@mui/icons-material/Key'
import RefreshIcon from '@mui/icons-material/Refresh'
import SyncIcon from '@mui/icons-material/Sync'
import api from '../config/api'
import { extractApiError } from '../utils'

// ── Constants ──────────────────────────────────────────────────────────────
const MAROON       = 'var(--brand-primary)'
const MAROON_LIGHT = 'var(--brand-soft)'
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
        '& .MuiInputLabel-root.Mui-focused': { color: 'var(--brand-accent)' },
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

function parseStudentIds(text) {
  return [...new Set(
    String(text || '')
      .split(/[\s,;]+/)
      .map(part => part.trim())
      .filter(Boolean),
  )]
}

function SectionsTab({ courseId, reloadToken = 0 }) {
  const [sections, setSections] = useState([])
  const [blocks, setBlocks] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState('one')
  const [oneId, setOneId] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeSeverity, setNoticeSeverity] = useState('success')

  const load = useCallback(async (silent = false) => {
    if (!courseId) return
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const r = await api.get(`/grading/blocks/?course_id=${courseId}`, { atlasCache: false })
      const nextSections = r.data.sections || []
      setSections(nextSections)
      setBlocks(r.data.blocks || [])
      setSelectedId(current => (
        nextSections.some(section => section.section_id === current)
          ? current
          : (nextSections[0]?.section_id || '')
      ))
      if (!silent) setError('')
    } catch (e) {
      if (!silent) setError(extractApiError(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [courseId])

  useEffect(() => { load(reloadToken > 0) }, [load, reloadToken])

  const students = blocks.filter(block => block.section_id === selectedId)

  async function addIds(ids) {
    const unique = [...new Set(ids.map(id => String(id).trim()).filter(Boolean))]
    if (!selectedId) {
      setError('Choose a section first.')
      return
    }
    if (!unique.length) {
      setError('Enter at least one student ID.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const r = await api.post('/grading/blocks/', {
        course_id: courseId,
        section_id: selectedId,
        student_ids: unique,
      })
      const added = r.data.added?.length || (r.data.block ? 1 : 0)
      const already = r.data.already_in_section || []
      const other = r.data.in_other_section || []
      const invalid = r.data.invalid || []
      const sectionName = sections.find(section => section.section_id === selectedId)?.section_name || 'this section'
      const parts = []
      if (added) parts.push(`Added ${added} student_id on ${sectionName}.`)
      if (already.length) parts.push(`${already.length} already in this section.`)
      if (other.length) parts.push(other.map(item => item.detail).join(' '))
      if (invalid.length) parts.push(`${invalid.length} could not be read.`)
      setNoticeSeverity(other.length || invalid.length ? 'warning' : 'success')
      setNotice(parts.join(' ') || 'Nothing new to add.')
      setOneId('')
      setPasted('')
      if (added && !other.length && !invalid.length) setAddOpen(false)
      await load()
    } catch (e) {
      setError(extractApiError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SCard
      title="Sections you handle"
      action={
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton>
        </Tooltip>
      }
    >
      {!addOpen && <StatusNotice message={error} severity="error" />}
      {!addOpen && <StatusNotice message={notice} severity={noticeSeverity || 'success'} />}
      {loading ? (
        <LinearProgress sx={{ height: 3, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />
      ) : sections.length === 0 ? (
        <Typography variant="body2" sx={{ fontSize: '0.82rem', color: MUTED }}>
          No section is assigned to you for this course yet.
        </Typography>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {sections.map(section => {
              const on = section.section_id === selectedId
              return (
                <Button
                  key={section.section_id}
                  size="small"
                  variant={on ? 'contained' : 'outlined'}
                  onClick={() => { setSelectedId(section.section_id); setNotice(''); setError('') }}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 700,
                    bgcolor: on ? MAROON : 'transparent',
                    color: on ? '#fff' : TEXT,
                    borderColor: on ? MAROON : BORDER,
                    '&:hover': { bgcolor: on ? 'var(--brand-primary-hover)' : 'rgba(170,36,35,0.08)', borderColor: MAROON },
                  }}
                >
                  {section.section_name} ({section.student_count})
                </Button>
              )
            })}
          </Stack>

          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
              <Typography variant="caption" sx={{ color: MUTED, flex: 1 }}>
                {students.length} student {students.length === 1 ? 'ID' : 'IDs'}
              </Typography>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => { setAddMode('one'); setOneId(''); setPasted(''); setError(''); setNotice(''); setAddOpen(true) }}
                sx={{ bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-primary-hover)' }, textTransform: 'none', fontWeight: 700 }}
              >
                Add student/s
              </Button>
            </Stack>
            {students.length === 0 ? (
              <Typography variant="body2" sx={{ fontSize: '0.82rem', color: MUTED }}>
                No student IDs in this section yet.
              </Typography>
            ) : (
              <Box sx={{
                display: 'grid',
                gridAutoFlow: 'column',
                gridTemplateRows: `repeat(${Math.min(12, students.length)}, auto)`,
                gridAutoColumns: 'minmax(132px, 168px)',
                justifyContent: 'start',
                columnGap: 2.5,
                overflowX: 'auto',
                pb: 0.5,
              }}>
                {students.map(student => (
                  <Box
                    key={student.block_id}
                    sx={{
                      py: 0.6,
                      px: 0.75,
                      borderBottom: `1px solid ${BORDER}`,
                      color: TEXT,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: '0.84rem',
                      letterSpacing: '0.01em',
                      lineHeight: 1.3,
                    }}
                  >
                    {student.student_id}
                  </Box>
                ))}
              </Box>
            )}
          </Box>

        </Stack>
      )}

      <Dialog
        open={addOpen}
        onClose={() => { if (!saving) setAddOpen(false) }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: DIALOG_PAPER_SX }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', color: MAROON }}>Add student/s</DialogTitle>
        <DialogContent>
          <StatusNotice message={error} severity="error" />
          <StatusNotice message={notice} severity={noticeSeverity || 'success'} />
          <RadioGroup
            value={addMode}
            onChange={e => setAddMode(e.target.value)}
            sx={{ mb: 1.5 }}
          >
            <FormControlLabel
              value="one"
              control={<Radio size="small" sx={{ color: MUTED, '&.Mui-checked': { color: MAROON } }} />}
              label="One student ID"
              sx={{ color: TEXT, '& .MuiFormControlLabel-label': { fontSize: '0.86rem' } }}
            />
            <FormControlLabel
              value="paste"
              control={<Radio size="small" sx={{ color: MUTED, '&.Mui-checked': { color: MAROON } }} />}
              label="Paste several IDs"
              sx={{ color: TEXT, '& .MuiFormControlLabel-label': { fontSize: '0.86rem' } }}
            />
          </RadioGroup>
          {addMode === 'one' ? (
            <LF
              label="Student ID"
              value={oneId}
              placeholder="23-35007"
              autoFocus
              onChange={e => setOneId(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addIds([oneId])
                }
              }}
              disabled={saving}
            />
          ) : (
            <TextField
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              placeholder={'23-35007\n23-35018'}
              label="Student IDs, one per line"
              multiline
              minRows={5}
              fullWidth
              size="small"
              autoFocus
              disabled={saving}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: TEXT,
                  bgcolor: SURFACE,
                  '& fieldset': { borderColor: BORDER },
                  '&:hover fieldset': { borderColor: MAROON },
                  '&.Mui-focused fieldset': { borderColor: MAROON },
                },
                '& .MuiInputLabel-root': { color: MUTED },
                '& .MuiInputLabel-root.Mui-focused': { color: 'var(--brand-accent)' },
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setAddOpen(false)} disabled={saving} sx={{ textTransform: 'none', fontSize: '0.82rem', color: MUTED }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={saving || (addMode === 'one' ? !oneId.trim() : !pasted.trim())}
            onClick={() => addIds(addMode === 'one' ? [oneId] : parseStudentIds(pasted))}
            sx={{ bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-primary-hover)' }, textTransform: 'none', fontSize: '0.82rem' }}
          >
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </SCard>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function BubbleSheetPanel({ courseId, assessments = [], onModifyTemplate, onNotice }) {
  const [tab, setTab] = useState(0)

  // shared across sub-panels
  const [templates, setTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [error, setError] = useState('')
  // Bumped when scorebook/mobile sync lands so Templates + Sections refetch too
  const [dataEpoch, setDataEpoch] = useState(0)

  const loadTemplates = useCallback(async (silent = false) => {
    if (!courseId) return
    if (!silent) {
      setTemplatesLoading(true)
      setError('')
    }
    try {
      const r = await api.get(`/grading/bubble/templates/?course_id=${courseId}`, { atlasCache: false })
      setTemplates(r.data.templates || [])
      if (!silent) setError('')
    } catch (e) {
      if (!silent) setError(extractApiError(e))
    } finally {
      if (!silent) setTemplatesLoading(false)
    }
  }, [courseId])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  useEffect(() => {
    setDataEpoch(0)
  }, [courseId])

  useEffect(() => {
    if (dataEpoch > 0) loadTemplates(true)
  }, [dataEpoch, loadTemplates])

  const onDataSynced = useCallback(() => {
    setDataEpoch(n => n + 1)
  }, [])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          flexShrink: 0,
          mb: 0,
          borderBottom: `1px solid ${BORDER}`,
          '& .MuiTab-root': { color: MUTED, fontSize: '0.78rem', fontWeight: 600, textTransform: 'none', minHeight: 38 },
          '& .Mui-selected': { color: 'var(--brand-accent) !important' },
          '& .MuiTabs-indicator': { bgcolor: MAROON },
        }}
      >
        <Tab label="Templates" />
        <Tab label="Results" />
        <Tab label="Sections" />
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: tab === 1 ? 'hidden' : 'auto', pt: 2 }}>
      <StatusNotice message={error} severity="error" />

      {/* Keep all tabs mounted so Results keeps polling and can refresh the others after sync */}
      <Box sx={{ display: tab === 0 ? 'block' : 'none' }}>
        <TemplatesTab
          courseId={courseId}
          assessments={assessments}
          templates={templates}
          loading={templatesLoading}
          onRefresh={loadTemplates}
          onModifyTemplate={onModifyTemplate}
          onNotice={onNotice}
        />
      </Box>
      <Box
        sx={{
          display: tab === 1 ? 'flex' : 'none',
          flex: 1,
          minHeight: 0,
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <ResultsTab courseId={courseId} onDataSynced={onDataSynced} />
      </Box>
      <Box sx={{ display: tab === 2 ? 'block' : 'none' }}>
        <SectionsTab courseId={courseId} reloadToken={dataEpoch} />
      </Box>
      </Box>
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
              sx={{ bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-primary-hover)' }, fontSize: '0.72rem', textTransform: 'none' }}
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
                color: t.has_answer_key ? 'var(--brand-accent)' : MUTED,
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
      <DialogContent dividers sx={{ p: 0, height: 'calc(85vh - 130px)', minHeight: 400, overflow: 'hidden', bgcolor: '#fff' }}>
        <iframe
          title={title || 'Answer sheet'}
          src={url}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block', background: '#fff' }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: '0.82rem' }}>Close</Button>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={onDownload}
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-primary-hover)' }, textTransform: 'none', fontSize: '0.82rem' }}>
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
          <StatusNotice message={errors._} severity="error" />

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
              <StatusNotice message={errors.non_field_errors} severity="error" />
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
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-primary-hover)' }, textTransform: 'none', fontSize: '0.82rem' }}>
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
        <StatusNotice message={err} severity="error" />
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
                        '&:hover': { borderColor: 'var(--brand-accent)', bgcolor: key[String(itemNo)] === ch ? 'var(--brand-primary-hover)' : MAROON_LIGHT },
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
                      '&:hover': { borderColor: 'var(--brand-accent)', bgcolor: key[String(itemNo)] === BONUS_KEY ? 'var(--brand-primary-hover)' : MAROON_LIGHT },
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
          sx={{ bgcolor: MAROON, '&:hover': { bgcolor: 'var(--brand-primary-hover)' }, textTransform: 'none', fontSize: '0.82rem' }}>
          Save Answer Key
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS TAB — section scorebook of major examinations
// ─────────────────────────────────────────────────────────────────────────────
const SCORE_POLL_MS = 1000
const SCORE_ID_WIDTH = 148
const SCORE_EXAM_WIDTH = 176

const scoreTableSx = {
  tableLayout: 'fixed',
  borderCollapse: 'separate',
  borderSpacing: 0,
  '& .MuiTableCell-root': { color: TEXT, borderColor: BORDER, boxSizing: 'border-box' },
  '& .MuiTableRow-root:hover': { bgcolor: 'var(--workspace-card)' },
  '& .MuiTableRow-root:hover .score-id': { bgcolor: 'var(--workspace-card)' },
}

function ScoreColGroup({ exams }) {
  const columns = exams.length ? exams : [null]
  return (
    <colgroup>
      <col style={{ width: SCORE_ID_WIDTH }} />
      {columns.map((exam, index) => (
        <col key={exam?.exam_id || `empty-${index}`} style={{ width: SCORE_EXAM_WIDTH }} />
      ))}
    </colgroup>
  )
}

function ScoreColumns({ exams, children }) {
  const width = SCORE_ID_WIDTH + Math.max(exams.length, 1) * SCORE_EXAM_WIDTH
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', '& table': { width, minWidth: '100%' } }}>
      {children}
    </Box>
  )
}

const EXPORT_FORMATS = [
  { id: 'docx', label: 'Word' },
  { id: 'pdf', label: 'PDF' },
  { id: 'xlsx', label: 'Excel' },
]

function downloadName(header, fallback) {
  const match = /filename="?([^";]+)"?/i.exec(header || '')
  return match ? match[1] : fallback
}

async function blobMessage(data) {
  if (!(data instanceof Blob)) return ''
  try {
    const text = await data.text()
    const parsed = JSON.parse(text)
    return parsed.detail || parsed.message || ''
  } catch {
    return ''
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function ResultsTab({ courseId, onDataSynced }) {
  const [sectionId, setSectionId] = useState('')
  const [forCourse, setForCourse] = useState(courseId)
  const [sections, setSections] = useState([])
  const [book, setBook] = useState(null)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState({})
  const [exportAnchor, setExportAnchor] = useState(null)
  const [exporting, setExporting] = useState('')
  const bookRef = useRef(null)
  const flashTimer = useRef(null)
  const headScrollRef = useRef(null)
  const bodyScrollRef = useRef(null)
  const onDataSyncedRef = useRef(onDataSynced)
  onDataSyncedRef.current = onDataSynced

  if (forCourse !== courseId) {
    setForCourse(courseId)
    setSectionId('')
    setBook(null)
    bookRef.current = null
  }

  const load = useCallback(async (silent, activeSectionId, token) => {
    if (!courseId) return
    try {
      const r = await api.get('/grading/scorebook/', {
        params: {
          course_id: courseId,
          ...(activeSectionId ? { section_id: activeSectionId } : {}),
        },
        atlasCache: false,
      })
      if (token.cancelled) return
      const data = r.data || {}
      setSections(data.sections || [])
      if (!activeSectionId && data.section?.section_id) {
        setSectionId(data.section.section_id)
      }
      const prev = bookRef.current
      const sectionsSig = (data.sections || [])
        .map(section => `${section.section_id}:${section.student_count}`)
        .join('|')
      const sameBook = prev
        && prev.revision === data.revision
        && prev.section?.section_id === data.section?.section_id
      const sameRoster = prev && prev._sectionsSig === sectionsSig
      if (!sameBook) {
        const flashes = {}
        if (prev && prev.section?.section_id && prev.section.section_id === data.section?.section_id) {
          const oldRows = new Map((prev.students || []).map(student => [student.student_id, student]))
          for (const student of data.students || []) {
            const old = oldRows.get(student.student_id)
            for (const [examId, cell] of Object.entries(student.scores || {})) {
              if (cell?.score != null && cell.score !== old?.scores?.[examId]?.score) {
                flashes[`${student.student_id}:${examId}`] = true
              }
            }
          }
        }
        bookRef.current = { ...data, _sectionsSig: sectionsSig }
        setBook(data)
        if (Object.keys(flashes).length) {
          setFlash(flashes)
          clearTimeout(flashTimer.current)
          flashTimer.current = setTimeout(() => setFlash({}), 1800)
        }
        // Notify sibling tabs after a live sync (not the first paint)
        if (prev) onDataSyncedRef.current?.()
      } else if (!sameRoster) {
        bookRef.current = { ...prev, _sectionsSig: sectionsSig }
        if (prev) onDataSyncedRef.current?.()
      }
      if (!silent) setErr('')
    } catch (e) {
      if (!token.cancelled && !silent) setErr(extractApiError(e))
    }
  }, [courseId])

  useEffect(() => {
    const token = { cancelled: false }
    bookRef.current = null
    load(false, sectionId, token)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load(true, sectionId, token)
    }, SCORE_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(true, sectionId, token)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      token.cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, sectionId])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  async function exportBook(format) {
    const choice = EXPORT_FORMATS.find(item => item.id === format)
    const activeSection = sectionId || book?.section?.section_id
    if (!activeSection) {
      showStatusNotice('Choose a section first.', 'error')
      return
    }
    setExporting(format)
    try {
      const r = await api.get('/grading/scorebook/export/', {
        params: { course_id: courseId, section_id: activeSection, file_type: format },
        responseType: 'blob',
        atlasCache: false,
      })
      const blob = r.data
      const type = blob?.type || ''
      if (type.includes('json') || type.includes('text/html') || type.includes('text/plain')) {
        showStatusNotice(await blobMessage(blob) || 'That file could not be created.', 'error')
        return
      }
      const filename = downloadName(r.headers?.['content-disposition'], `scores.${format}`)
      saveBlob(blob, filename)
      showStatusNotice(`${choice?.label || 'Score'} file downloaded.`, 'success')
    } catch (e) {
      const detail = await blobMessage(e?.response?.data)
      showStatusNotice(detail || extractApiError(e) || 'That file could not be created.', 'error')
    } finally {
      setExporting('')
    }
  }

  const waiting = !book || (sectionId && book.section?.section_id !== sectionId)
  const exams = waiting ? [] : (book.exams || [])
  const students = waiting ? [] : (book.students || [])
  const sectionName = waiting ? '' : (book.section?.section_name || '')

  const canExport = Boolean(sectionId || book?.section?.section_id) && !waiting

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', gap: 1.5 }}>
      <Paper
        elevation={0}
        sx={{
          flexShrink: 0,
          bgcolor: SURFACE,
          color: TEXT,
          border: `1px solid ${BORDER}`,
          borderRadius: 2.5,
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
          Scorebook
        </Typography>
        <Box sx={{ flex: 1, minWidth: 8 }} />
        <LF
          select
          label="Section"
          value={sectionId}
          onChange={e => setSectionId(e.target.value)}
          sx={{ width: { xs: '100%', sm: 220 }, maxWidth: '100%' }}
          disabled={!sections.length}
        >
          {sections.length === 0 && <MenuItem value="">No section</MenuItem>}
          {sections.map(section => (
            <MenuItem key={section.section_id} value={section.section_id}>
              {section.section_name} ({section.student_count})
            </MenuItem>
          ))}
        </LF>
        <Button
          size="small"
          variant="outlined"
          disabled={!canExport || !!exporting}
          startIcon={exporting
            ? <CircularProgress size={14} sx={{ color: MAROON }} />
            : <DownloadIcon sx={{ fontSize: 16 }} />}
          onClick={event => setExportAnchor(event.currentTarget)}
          sx={{ color: MAROON, borderColor: MAROON, textTransform: 'none', fontWeight: 700, '&:hover': { borderColor: 'var(--brand-primary-hover)', bgcolor: 'rgba(170,36,35,0.08)' } }}
        >
          Export
        </Button>
        <Menu
          anchorEl={exportAnchor}
          open={Boolean(exportAnchor)}
          onClose={() => setExportAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              elevation: 2,
              sx: { bgcolor: SURFACE, color: TEXT, border: `1px solid ${BORDER}`, mt: 0.5, minWidth: 160 },
            },
          }}
        >
          {EXPORT_FORMATS.map(format => (
            <MenuItem
              key={format.id}
              disabled={!!exporting}
              onClick={() => { setExportAnchor(null); exportBook(format.id) }}
              sx={{ fontSize: '0.86rem' }}
            >
              {format.label} (.{format.id})
            </MenuItem>
          ))}
        </Menu>
      </Paper>

      <StatusNotice message={err} severity="error" />

      {waiting ? (
        <LinearProgress sx={{ flexShrink: 0, height: 3, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />
      ) : !sections.length ? (
        <Typography variant="body2" sx={{ fontSize: '0.82rem', color: MUTED }}>
          No section is assigned to you for this course yet.
        </Typography>
      ) : students.length === 0 ? (
        <Typography variant="body2" sx={{ fontSize: '0.82rem', color: MUTED }}>
          No student IDs in {sectionName || 'this section'} yet. Add them on the Sections tab.
        </Typography>
      ) : (
        <Paper
          elevation={0}
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: SURFACE,
            color: TEXT,
            border: `1px solid ${BORDER}`,
            borderRadius: 2,
          }}
        >
          <ScoreColumns exams={exams}>
            <Box ref={headScrollRef} sx={{ overflow: 'hidden', flexShrink: 0, bgcolor: BG, borderBottom: `1px solid ${BORDER}` }}>
              <Table size="small" sx={scoreTableSx}>
                <ScoreColGroup exams={exams} />
                <TableHead>
                  <TableRow>
                    <TableCell className="score-id" sx={{ bgcolor: BG, fontWeight: 700, fontSize: '0.72rem', py: 1 }}>
                      Student ID
                    </TableCell>
                    {exams.map(exam => (
                      <TableCell key={exam.exam_id} align="center" sx={{ bgcolor: BG, fontWeight: 700, fontSize: '0.72rem', py: 1 }}>
                        <Box sx={{ lineHeight: 1.25 }}>{exam.name}</Box>
                        <Box sx={{ fontWeight: 500, fontSize: '0.62rem', color: MUTED, mt: 0.25 }}>
                          {exam.source === 'mobile' ? 'Mobile' : 'Web'}
                          {exam.max_score ? ` · ${exam.max_score}` : ''}
                        </Box>
                      </TableCell>
                    ))}
                    {exams.length === 0 && (
                      <TableCell sx={{ fontSize: '0.72rem', color: MUTED, bgcolor: BG }}>
                        Major examination scores appear here after an answer sheet is created.
                      </TableCell>
                    )}
                  </TableRow>
                </TableHead>
              </Table>
            </Box>
            <TableContainer
              ref={bodyScrollRef}
              sx={{ flex: 1, minHeight: 0, overflow: 'auto', bgcolor: SURFACE }}
              onScroll={event => {
                if (headScrollRef.current) headScrollRef.current.scrollLeft = event.currentTarget.scrollLeft
              }}
            >
              <Table size="small" sx={scoreTableSx}>
                <ScoreColGroup exams={exams} />
                <TableBody>
                  {students.map(student => (
                    <TableRow key={student.student_id} hover sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell className="score-id" sx={{
                        bgcolor: SURFACE,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}>
                        {student.student_id}
                      </TableCell>
                      {exams.length === 0 && <TableCell />}
                      {exams.map(exam => {
                        const cell = student.scores?.[exam.exam_id]
                        const key = `${student.student_id}:${exam.exam_id}`
                        const lit = Boolean(flash[key])
                        return (
                          <TableCell
                            key={exam.exam_id}
                            align="center"
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              bgcolor: lit ? 'rgba(94, 218, 126, 0.28)' : SURFACE,
                              transition: 'background-color 0.7s ease',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4 }}>
                              <span>{cell?.score == null ? '—' : cell.score}</span>
                              {cell?.flagged && (
                                <Tooltip title="Flagged for review">
                                  <FlagIcon sx={{ fontSize: 13, color: '#FCA5A5' }} />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </ScoreColumns>
        </Paper>
      )}
    </Box>
  )
}
