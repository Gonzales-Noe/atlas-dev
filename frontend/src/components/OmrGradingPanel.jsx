// OmrGradingPanel.jsx — Vision-Based (OMR) Grading workflow panel
// Wired to /api/grading/* endpoints.
//
// Props:
//   courseId    – current course UUID (string)
//   assessments – array from workspaceApi.data?.assessments
//
import { useCallback, useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import FlagIcon from '@mui/icons-material/Flag'
import RefreshIcon from '@mui/icons-material/Refresh'
import VisibilityIcon from '@mui/icons-material/Visibility'
import api from '../config/api'
import { extractApiError } from '../utils'

// ── Constants ─────────────────────────────────────────────────────────────
const MAROON       = '#AA2423'
const MAROON_LIGHT = 'rgba(170,36,35,0.16)'
const BG           = 'var(--workspace-bg)'

const STATUS_CFG = {
  queued:          { label: 'Queued',           color: '#607D8B' },
  processing:      { label: 'Processing',        color: '#1976D2' },
  review_required: { label: 'Review Required',   color: '#E65100' },
  ready_to_import: { label: 'Ready to Import',   color: '#2E7D32' },
  imported:        { label: 'Imported',          color: '#4CAF50' },
  failed:          { label: 'Failed',            color: '#AA2423' },
  cancelled:       { label: 'Cancelled',         color: '#9E9E9E' },
}

const ACTIVE_STATUSES = new Set(['queued', 'processing'])

// ── Shared mini-components ────────────────────────────────────────────────
function SCard({ title, action, children }) {
  return (
    <Paper elevation={0}
      sx={{ border: '1px solid var(--workspace-border)', borderRadius: 2.5, mb: 2, overflow: 'hidden', bgcolor: 'var(--workspace-card)' }}>
      <Box sx={{ px: 2.5, py: 1.25, bgcolor: 'var(--workspace-card)', borderBottom: '1px solid var(--workspace-hover)', display: 'flex', alignItems: 'center' }}>
        <Typography variant="subtitle2"
          sx={{ fontWeight: 700, color: 'var(--workspace-text)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Box>
      <Box sx={{ p: 2.5 }}>{children}</Box>
    </Paper>
  )
}

function LF({ label, ...props }) {
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

function StatusChip({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, color: '#A0A0AA' }
  return (
    <Chip label={cfg.label} size="small"
      sx={{ bgcolor: cfg.color + '18', color: cfg.color, fontWeight: 700, fontSize: '0.68rem', height: 20, border: `1px solid ${cfg.color}40` }} />
  )
}

function FilePickerBtn({ label, file, accept, onChange, disabled }) {
  const ref = useRef(null)
  return (
    <>
      <input ref={ref} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { onChange(e.target.files?.[0] || null); e.target.value = '' }} />
      <Button size="small" variant="outlined" disabled={disabled}
        onClick={() => ref.current?.click()}
        startIcon={<CloudUploadIcon sx={{ fontSize: '0.9rem !important' }} />}
        sx={{
          textTransform: 'none', fontSize: '0.75rem', borderRadius: 1.5,
          borderColor: file ? MAROON : 'var(--workspace-hover)', color: file ? '#E24B4A' : 'var(--workspace-muted)',
          '&:hover': { borderColor: MAROON, bgcolor: MAROON_LIGHT },
        }}>
        {file ? file.name : label}
      </Button>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export default function OmrGradingPanel({ courseId, assessments = [] }) {
  const [omrSub, setOmrSub] = useState('templates')

  // ── Templates ─────────────────────────────────────────────────────────
  const [templates, setTemplates]             = useState([])
  const [tplLoading, setTplLoading]           = useState(false)
  const [tplForm, setTplForm]                 = useState({
    name: '', form_code: '', total_items: '', passing_score: '', confidence_threshold: '0.85',
  })
  const [tplFile, setTplFile]                 = useState(null)
  const [evalFile, setEvalFile]               = useState(null)
  const [tplSaving, setTplSaving]             = useState(false)
  const [tplError, setTplError]               = useState('')
  const [tplSuccess, setTplSuccess]           = useState('')

  // ── Jobs ──────────────────────────────────────────────────────────────
  const [jobs, setJobs]                       = useState([])
  const [jobsLoading, setJobsLoading]         = useState(false)
  const [jobForm, setJobForm]                 = useState({ assessment_id: '', template_id: '' })
  const [scanBundle, setScanBundle]           = useState(null)
  const [jobSaving, setJobSaving]             = useState(false)
  const [jobError, setJobError]               = useState('')
  const [jobSuccess, setJobSuccess]           = useState('')
  const [selectedJobId, setSelectedJobId]     = useState(null)
  const pollRef                               = useRef(null)

  // ── Results ───────────────────────────────────────────────────────────
  const [results, setResults]                 = useState([])
  const [resultsTotal, setResultsTotal]       = useState(0)
  const [resultsLoading, setResultsLoading]   = useState(false)
  const [flaggedOnly, setFlaggedOnly]         = useState(false)
  const [autoMapLoading, setAutoMapLoading]   = useState(false)
  const [autoMapMsg, setAutoMapMsg]           = useState('')

  // ── Loaders ───────────────────────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    if (!courseId) return
    setTplLoading(true)
    try {
      const { data } = await api.get(`/grading/templates/?course_id=${courseId}`)
      setTemplates(data.items || [])
    } catch {
      // silently ignore on background refresh
    } finally {
      setTplLoading(false)
    }
  }, [courseId])

  const loadJobs = useCallback(async () => {
    if (!courseId) return
    setJobsLoading(true)
    try {
      const { data } = await api.get(`/grading/jobs/?course_id=${courseId}`)
      setJobs(data.items || [])
    } catch {
      // silently ignore
    } finally {
      setJobsLoading(false)
    }
  }, [courseId])

  const loadResults = useCallback(async (jobId, onlyFlagged = false) => {
    if (!jobId) return
    setResultsLoading(true)
    try {
      const q = onlyFlagged ? '&flagged=1' : ''
      const { data } = await api.get(`/grading/jobs/${jobId}/results/?limit=200${q}`)
      setResults(data.items || [])
      setResultsTotal(data.total || 0)
    } catch {
      // silently ignore
    } finally {
      setResultsLoading(false)
    }
  }, [])

  // Initial loads
  useEffect(() => { loadTemplates() }, [loadTemplates])
  useEffect(() => { loadJobs() },      [loadJobs])

  // Poll jobs list every 5 s while any job is active
  useEffect(() => {
    const hasActive = jobs.some(j => ACTIVE_STATUSES.has(j.status))
    if (hasActive) {
      pollRef.current = setInterval(() => loadJobs(), 5000)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [jobs, loadJobs])

  // Reload results when selected job or filter changes
  useEffect(() => {
    if (selectedJobId) loadResults(selectedJobId, flaggedOnly)
  }, [selectedJobId, flaggedOnly, loadResults])

  // ── Template creation ─────────────────────────────────────────────────
  async function handleCreateTemplate(e) {
    e.preventDefault()
    setTplError(''); setTplSuccess('')
    if (!tplForm.name.trim()) { setTplError('Template name is required.'); return }
    if (!tplFile || !evalFile) { setTplError('Both template.json and evaluation.json are required.'); return }
    const fd = new FormData()
    fd.append('course_id',    courseId)
    fd.append('name',         tplForm.name.trim())
    fd.append('template_file',    tplFile)
    fd.append('evaluation_file',  evalFile)
    if (tplForm.form_code.trim())         fd.append('form_code',             tplForm.form_code.trim())
    if (tplForm.total_items)              fd.append('total_items',           tplForm.total_items)
    if (tplForm.passing_score)            fd.append('passing_score',         tplForm.passing_score)
    if (tplForm.confidence_threshold)     fd.append('confidence_threshold',  tplForm.confidence_threshold)
    setTplSaving(true)
    try {
      await api.post('/grading/templates/', fd, { headers: { 'Content-Type': undefined } })
      setTplSuccess('Template created successfully.')
      setTplForm({ name: '', form_code: '', total_items: '', passing_score: '', confidence_threshold: '0.85' })
      setTplFile(null); setEvalFile(null)
      loadTemplates()
    } catch (err) {
      setTplError(extractApiError(err))
    } finally {
      setTplSaving(false)
    }
  }

  // ── Job submission ────────────────────────────────────────────────────
  async function handleSubmitJob(e) {
    e.preventDefault()
    setJobError(''); setJobSuccess('')
    if (!jobForm.assessment_id) { setJobError('Please select an assessment.'); return }
    if (!jobForm.template_id)   { setJobError('Please select a template.'); return }
    if (!scanBundle)            { setJobError('Please upload a scan bundle.'); return }
    const fd = new FormData()
    fd.append('course_id',     courseId)
    fd.append('assessment_id', jobForm.assessment_id)
    fd.append('template_id',   jobForm.template_id)
    fd.append('scan_bundle',   scanBundle)
    setJobSaving(true)
    try {
      const { data } = await api.post('/grading/jobs/', fd, { headers: { 'Content-Type': undefined } })
      setJobSuccess('Job submitted. Processing will begin shortly.')
      setJobForm({ assessment_id: '', template_id: '' }); setScanBundle(null)
      loadJobs()
      if (data.job?.job_id) {
        setSelectedJobId(data.job.job_id)
        setOmrSub('results')
      }
    } catch (err) {
      setJobError(extractApiError(err))
    } finally {
      setJobSaving(false)
    }
  }

  // ── Auto-map ──────────────────────────────────────────────────────────
  async function handleAutoMap() {
    if (!selectedJobId) return
    setAutoMapLoading(true); setAutoMapMsg('')
    try {
      const { data } = await api.post(`/grading/jobs/${selectedJobId}/auto-map/`)
      const stats = data.mapping_stats || {}
      setAutoMapMsg(`Mapped ${stats.updated_rows ?? 0} rows, ${stats.flagged_rows ?? 0} flagged.`)
      loadJobs()
      loadResults(selectedJobId, flaggedOnly)
    } catch (err) {
      setAutoMapMsg(extractApiError(err))
    } finally {
      setAutoMapLoading(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────
  const selectedJob = jobs.find(j => j.job_id === selectedJobId)
  const fmtPct = v => { const n = parseFloat(v); return isNaN(n) ? '—' : n.toFixed(1) + '%' }

  // ─────────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Sub-section tabs */}
      <Box sx={{ borderBottom: '2px solid var(--workspace-hover)', mb: 2.5 }}>
        <Tabs value={omrSub} onChange={(_, v) => setOmrSub(v)}
          sx={{
            minHeight: 38,
            '& .MuiTab-root': { minHeight: 38, py: 0, fontSize: '0.78rem', textTransform: 'none', fontWeight: 500, color: 'var(--workspace-muted)' },
            '& .Mui-selected': { color: MAROON + ' !important', fontWeight: 700 },
            '& .MuiTabs-indicator': { bgcolor: MAROON, height: 2.5 },
          }}>
          <Tab value="templates" label="Templates" />
          <Tab value="jobs"      label="Grading Jobs" />
          <Tab value="results"
            label={selectedJob ? `Results — ${STATUS_CFG[selectedJob.status]?.label ?? selectedJob.status}` : 'Results'}
            disabled={!selectedJobId} />
        </Tabs>
      </Box>

      {/* ── Templates ────────────────────────────────────────────────── */}
      {omrSub === 'templates' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
          {/* List */}
          <SCard title="Existing Templates"
            action={
              <IconButton size="small" onClick={loadTemplates} disabled={tplLoading} sx={{ color: MAROON, p: 0.5 }}>
                <RefreshIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            }>
            {tplLoading && templates.length === 0
              ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} sx={{ color: MAROON }} /></Box>
              : templates.length === 0
                ? <Typography variant="body2" sx={{ color: 'var(--workspace-faint)', textAlign: 'center', py: 2 }}>No templates yet.</Typography>
                : <Stack spacing={1}>
                    {templates.map(t => (
                      <Box key={t.template_id}
                        sx={{ border: '1px solid var(--workspace-hover)', borderRadius: 1.5, p: 1.25, bgcolor: 'var(--workspace-card)' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--workspace-text)' }}>{t.name}</Typography>
                        <Box sx={{ display: 'flex', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                          {t.form_code && <Chip label={t.form_code} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
                          {t.total_items != null && <Chip label={`${t.total_items} items`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />}
                          {t.confidence_threshold != null && (
                            <Chip label={`Threshold: ${t.confidence_threshold}`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                          )}
                          {t.is_active === false && (
                            <Chip label="Inactive" size="small" color="default" sx={{ height: 18, fontSize: '0.65rem' }} />
                          )}
                        </Box>
                      </Box>
                    ))}
                  </Stack>
            }
          </SCard>

          {/* Create form */}
          <SCard title="New Template">
            <Stack spacing={1.5} component="form" onSubmit={handleCreateTemplate}>
              <LF label="Template Name" value={tplForm.name}
                onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} required />
              <LF label="Form Code (optional)" value={tplForm.form_code}
                onChange={e => setTplForm(f => ({ ...f, form_code: e.target.value }))} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                <LF type="number" label="Total Items" value={tplForm.total_items}
                  inputProps={{ min: 1 }}
                  onChange={e => setTplForm(f => ({ ...f, total_items: e.target.value }))} />
                <LF type="number" label="Passing Score" value={tplForm.passing_score}
                  inputProps={{ min: 0 }}
                  onChange={e => setTplForm(f => ({ ...f, passing_score: e.target.value }))} />
              </Box>
              <LF type="number" label="Confidence Threshold (0–1)" value={tplForm.confidence_threshold}
                inputProps={{ step: 0.01, min: 0, max: 1 }}
                onChange={e => setTplForm(f => ({ ...f, confidence_threshold: e.target.value }))} />
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'var(--workspace-muted)', display: 'block', mb: 0.5 }}>Template JSON *</Typography>
                  <FilePickerBtn label="Choose template.json" file={tplFile} accept=".json"
                    onChange={setTplFile} disabled={tplSaving} />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'var(--workspace-muted)', display: 'block', mb: 0.5 }}>Evaluation JSON *</Typography>
                  <FilePickerBtn label="Choose evaluation.json" file={evalFile} accept=".json"
                    onChange={setEvalFile} disabled={tplSaving} />
                </Box>
              </Box>
              {tplError   && <Alert severity="error"   onClose={() => setTplError('')}   sx={{ py: 0.25, fontSize: '0.78rem' }}>{tplError}</Alert>}
              {tplSuccess  && <Alert severity="success" onClose={() => setTplSuccess('')} sx={{ py: 0.25, fontSize: '0.78rem' }}>{tplSuccess}</Alert>}
              <Button type="submit" variant="contained" disabled={tplSaving}
                startIcon={tplSaving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <AddIcon />}
                sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6E1212' }, textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                {tplSaving ? 'Creating…' : 'Create Template'}
              </Button>
            </Stack>
          </SCard>
        </Box>
      )}

      {/* ── Jobs ─────────────────────────────────────────────────────── */}
      {omrSub === 'jobs' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
          {/* Jobs list */}
          <SCard title="Grading Jobs"
            action={
              <IconButton size="small" onClick={loadJobs} disabled={jobsLoading} sx={{ color: MAROON, p: 0.5 }}>
                <RefreshIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            }>
            {jobsLoading && jobs.length === 0
              ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} sx={{ color: MAROON }} /></Box>
              : jobs.length === 0
                ? <Typography variant="body2" sx={{ color: 'var(--workspace-faint)', textAlign: 'center', py: 2 }}>No jobs yet.</Typography>
                : <Stack spacing={1}>
                    {jobs.map(j => (
                      <Box key={j.job_id}
                        onClick={() => { setSelectedJobId(j.job_id); setOmrSub('results') }}
                        sx={{
                          border: `1px solid ${selectedJobId === j.job_id ? MAROON : 'var(--workspace-hover)'}`,
                          borderRadius: 1.5, p: 1.25, cursor: 'pointer',
                          bgcolor: selectedJobId === j.job_id ? MAROON_LIGHT : 'var(--workspace-card)',
                          '&:hover': { borderColor: MAROON, bgcolor: MAROON_LIGHT },
                          transition: 'all 0.15s',
                        }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <StatusChip status={j.status} />
                          <Typography variant="caption"
                            sx={{ color: 'var(--workspace-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {j.job_id.slice(0, 8)}…
                          </Typography>
                          <Tooltip title="View Results">
                            <VisibilityIcon sx={{ fontSize: '0.95rem', color: MAROON }} />
                          </Tooltip>
                        </Box>
                        {ACTIVE_STATUSES.has(j.status) && (
                          <LinearProgress variant="determinate" value={j.progress_pct || 0}
                            sx={{ height: 3, borderRadius: 2, bgcolor: 'var(--workspace-border)', '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />
                        )}
                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Typography variant="caption" sx={{ color: 'var(--workspace-muted)' }}>
                            {j.processed_sheets ?? 0}/{j.total_sheets ?? 0} sheets
                          </Typography>
                          {j.flagged_sheets > 0 && (
                            <Chip label={`${j.flagged_sheets} flagged`}
                              icon={<FlagIcon sx={{ fontSize: '0.7rem !important' }} />} size="small"
                              sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,159,10,0.14)', color: '#FFB74D', border: '1px solid rgba(255,183,77,0.35)' }} />
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ color: '#bbb', display: 'block', mt: 0.25 }}>
                          {new Date(j.created_at).toLocaleString()}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
            }
          </SCard>

          {/* Submit job form */}
          <SCard title="Submit New Job">
            <Stack spacing={1.5} component="form" onSubmit={handleSubmitJob}>
              <LF select label="Assessment" value={jobForm.assessment_id}
                onChange={e => setJobForm(f => ({ ...f, assessment_id: e.target.value }))} required>
                {assessments.length === 0
                  ? <MenuItem value="" disabled>No assessments found</MenuItem>
                  : assessments.map(a => (
                      <MenuItem key={a.assessment_id} value={a.assessment_id}>
                        {a.title} ({a.assessment_type})
                      </MenuItem>
                    ))
                }
              </LF>
              <LF select label="Template" value={jobForm.template_id}
                onChange={e => setJobForm(f => ({ ...f, template_id: e.target.value }))} required>
                {templates.length === 0
                  ? <MenuItem value="" disabled>No templates — create one first</MenuItem>
                  : templates.map(t => (
                      <MenuItem key={t.template_id} value={t.template_id}>{t.name}</MenuItem>
                    ))
                }
              </LF>
              <Box>
                <Typography variant="caption" sx={{ color: 'var(--workspace-muted)', display: 'block', mb: 0.5 }}>
                  Scan Bundle (ZIP, PDF, JPG, PNG) *
                </Typography>
                <FilePickerBtn label="Choose scan bundle" file={scanBundle}
                  accept=".zip,.pdf,.jpg,.jpeg,.png"
                  onChange={setScanBundle} disabled={jobSaving} />
              </Box>
              {jobError   && <Alert severity="error"   onClose={() => setJobError('')}   sx={{ py: 0.25, fontSize: '0.78rem' }}>{jobError}</Alert>}
              {jobSuccess  && <Alert severity="success" onClose={() => setJobSuccess('')} sx={{ py: 0.25, fontSize: '0.78rem' }}>{jobSuccess}</Alert>}
              <Button type="submit" variant="contained" disabled={jobSaving}
                startIcon={jobSaving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <AddIcon />}
                sx={{ bgcolor: MAROON, '&:hover': { bgcolor: '#6E1212' }, textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}>
                {jobSaving ? 'Submitting…' : 'Submit Job'}
              </Button>
            </Stack>
          </SCard>
        </Box>
      )}

      {/* ── Results ──────────────────────────────────────────────────── */}
      {omrSub === 'results' && selectedJob && (
        <Stack spacing={2}>
          {/* Job summary */}
          <SCard title="Job Summary"
            action={
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {ACTIVE_STATUSES.has(selectedJob.status) && (
                  <CircularProgress size={14} sx={{ color: MAROON }} />
                )}
                <IconButton size="small"
                  onClick={() => { loadJobs(); loadResults(selectedJobId, flaggedOnly) }}
                  sx={{ color: MAROON, p: 0.5 }}>
                  <RefreshIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </Box>
            }>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusChip status={selectedJob.status} />
              <Typography variant="caption" sx={{ color: 'var(--workspace-muted)' }}>
                {selectedJob.processed_sheets ?? 0} / {selectedJob.total_sheets ?? 0} sheets
              </Typography>
              {selectedJob.flagged_sheets > 0 && (
                  <Chip label={`${selectedJob.flagged_sheets} flagged`}
                  icon={<FlagIcon sx={{ fontSize: '0.7rem !important' }} />} size="small"
                  sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,159,10,0.14)', color: '#FFB74D' }} />
              )}
              <Typography variant="caption" sx={{ color: '#bbb' }}>
                ID: {selectedJob.job_id.slice(0, 12)}…
              </Typography>
            </Box>
            {ACTIVE_STATUSES.has(selectedJob.status) && (
              <LinearProgress variant="determinate" value={selectedJob.progress_pct || 0}
                sx={{ mt: 1.5, height: 4, borderRadius: 2, bgcolor: 'var(--workspace-border)', '& .MuiLinearProgress-bar': { bgcolor: MAROON } }} />
            )}
            {selectedJob.error_message && (
              <Alert severity="error" sx={{ mt: 1.25, py: 0.25, fontSize: '0.78rem' }}>
                {selectedJob.error_message}
              </Alert>
            )}
          </SCard>

          {/* Actions toolbar */}
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" disabled={autoMapLoading} onClick={handleAutoMap}
              sx={{ textTransform: 'none', borderColor: MAROON, color: MAROON, borderRadius: 1.5, fontSize: '0.78rem' }}>
              {autoMapLoading ? 'Mapping…' : 'Run Auto-Map'}
            </Button>
            <Button size="small"
              variant={flaggedOnly ? 'contained' : 'outlined'}
              onClick={() => setFlaggedOnly(f => !f)}
              startIcon={<FlagIcon sx={{ fontSize: '0.85rem !important' }} />}
              sx={{
                textTransform: 'none', borderRadius: 1.5, fontSize: '0.78rem',
                borderColor: '#FF9F0A', color: flaggedOnly ? '#fff' : '#FFB74D',
                bgcolor: flaggedOnly ? '#E65100' : 'transparent',
                '&:hover': { bgcolor: flaggedOnly ? '#BF360C' : 'rgba(255,159,10,0.14)' },
              }}>
              {flaggedOnly ? 'Flagged Only' : 'Show All'}
            </Button>
            {autoMapMsg && (
              <Typography variant="caption" sx={{ color: 'var(--workspace-muted)' }}>{autoMapMsg}</Typography>
            )}
            <Typography variant="caption" sx={{ color: 'var(--workspace-muted)', ml: 'auto' }}>
              {resultsTotal} result{resultsTotal !== 1 ? 's' : ''}
            </Typography>
          </Box>

          {/* Results table */}
          <SCard title="Results">
            {resultsLoading
              ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} sx={{ color: MAROON }} /></Box>
              : results.length === 0
                ? <Typography variant="body2" sx={{ color: 'var(--workspace-faint)', textAlign: 'center', py: 3 }}>
                    {selectedJob.status === 'failed'
                      ? 'Job failed — no results available.'
                      : ACTIVE_STATUSES.has(selectedJob.status)
                        ? 'Job is still processing…'
                        : 'No results found.'}
                  </Typography>
                : <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--workspace-card)' }}>
                          {['Sheet File', 'Student ID', 'Normalized', 'Score', 'Max', '%', 'Confidence', 'Flag'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', borderBottom: '2px solid var(--workspace-border)', textAlign: 'left', color: 'var(--workspace-text)', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => (
                          <tr key={r.result_id ?? i}
                            style={{ backgroundColor: r.is_flagged ? 'rgba(255,159,10,0.12)' : (i % 2 === 0 ? 'var(--workspace-card)' : 'transparent') }}>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--workspace-border)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--workspace-text)' }}>
                              <Tooltip title={r.sheet_filename || ''}><span>{r.sheet_filename}</span></Tooltip>
                            </td>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--workspace-border)', color: 'var(--workspace-text)' }}>{r.student_identifier_raw}</td>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid var(--workspace-border)', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--workspace-text)' }}>
                              {r.student_identifier_normalized || '—'}
                            </td>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{r.score_raw ?? '—'}</td>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>{r.max_score ?? '—'}</td>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontWeight: 600 }}>{fmtPct(r.score_percent)}</td>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                              {r.confidence != null ? parseFloat(r.confidence).toFixed(3) : '—'}
                            </td>
                            <td style={{ padding: '4px 10px', borderBottom: '1px solid #f0f0f0' }}>
                              {r.is_flagged
                                ? <Tooltip title={r.flag_reason || 'Flagged'}>
                                    <Chip icon={<FlagIcon sx={{ fontSize: '0.7rem !important' }} />}
                                      label={(r.flag_reason || 'flagged').split(',')[0]}
                                      size="small"
                                      sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,159,10,0.14)', color: '#FFB74D' }} />
                                  </Tooltip>
                                : <span style={{ color: '#4CAF50', fontSize: '0.8rem' }}>✓</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
            }
          </SCard>
        </Stack>
      )}

      {omrSub === 'results' && !selectedJobId && (
        <Typography variant="body2" sx={{ color: 'var(--workspace-faint)', textAlign: 'center', mt: 5 }}>
          Select a job from the Grading Jobs tab to view its results.
        </Typography>
      )}
    </Box>
  )
}
