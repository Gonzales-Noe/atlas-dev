import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Box, Card, CardActionArea, CardContent, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material'
import useMediaQuery from '@mui/material/useMediaQuery'
import BugReportIcon from '@mui/icons-material/BugReport'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import GridViewIcon from '@mui/icons-material/GridView'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import ViewColumnIcon from '@mui/icons-material/ViewColumn'
import ViewListIcon from '@mui/icons-material/ViewList'
import api from '../../config/api'
import { OutlineBtn, PrimaryBtn } from '../../components/ui'

const LAYOUT_KEY = 'atlas_issue_reports_layout'
const DESKTOP_LAYOUT_QUERY = '(min-width: 900px)'
const CARD_COLORS = [
  'var(--brand-primary-hover)',
  'var(--brand-red-core)',
  'var(--brand-deep)',
  'var(--brand-primary)',
  'var(--brand-accent)',
]

export const issueInputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
  textarea: { color: 'var(--text-primary)' },
}

export function when(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function statusLabel(row, { forFaculty = false } = {}) {
  if (row?.is_resolved) return 'RESOLVED'
  if (row?.status === 'with_superadmin') return forFaculty ? 'WITH ATLAS TEAM' : 'WITH ATLAS'
  return forFaculty ? 'WITH CAMPUS ADMIN' : 'OPEN'
}

function readLayout() {
  try {
    const value = localStorage.getItem(LAYOUT_KEY)
    if (value === 'list' || value === 'list-2') return value
  } catch {
    // Keep card grid when storage is unavailable.
  }
  return 'cards'
}

function storeLayout(layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout)
  } catch {
    // Preference still applies for this visit.
  }
}

function isImageFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (type.startsWith('image/')) return true
  const name = String(file.name || '').toLowerCase()
  return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp')
}

export function ReportImage({
  reportId,
  hasImage,
  imageBase64 = '',
  imageMime = 'image/jpeg',
  compact = false,
}) {
  const [src, setSrc] = useState('')
  const [status, setStatus] = useState(hasImage || imageBase64 ? 'loading' : 'none')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (imageBase64) {
      setSrc(`data:${imageMime || 'image/jpeg'};base64,${imageBase64}`)
      setStatus('ready')
      return undefined
    }
    if (!hasImage || !reportId) {
      setStatus('none')
      setSrc('')
      return undefined
    }
    let cancelled = false
    let objectUrl = ''
    setStatus('loading')
    ;(async () => {
      try {
        const response = await api.get(`/auth/support-reports/${reportId}/image/`, {
          responseType: 'blob',
          atlasCache: false,
          skipAtlasErrorCard: true,
          headers: { Accept: '*/*' },
          transformRequest: [(body, requestHeaders) => {
            if (requestHeaders && typeof requestHeaders.delete === 'function') {
              requestHeaders.delete('Content-Type')
              requestHeaders.delete('content-type')
            } else if (requestHeaders && typeof requestHeaders === 'object') {
              delete requestHeaders['Content-Type']
              delete requestHeaders['content-type']
            }
            return body
          }],
          validateStatus: (statusCode) => statusCode >= 200 && statusCode < 500,
        })
        const data = response?.data
        const headerType = String(response?.headers?.['content-type'] || response?.headers?.['Content-Type'] || '')
        const type = String(data?.type || headerType || '')
        if (
          response.status !== 200
          || !data
          || data.size < 32
          || type.includes('json')
          || type.includes('text/html')
        ) {
          if (!cancelled) {
            setSrc('')
            setStatus('missing')
          }
          return
        }
        objectUrl = URL.createObjectURL(data)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setSrc(objectUrl)
        setStatus('ready')
      } catch {
        if (!cancelled) {
          setSrc('')
          setStatus('missing')
        }
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [hasImage, reportId, imageBase64, imageMime])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!hasImage || status === 'none') return null
  if (status === 'loading') {
    return (
      <Box sx={{
        mt: compact ? 0 : 1.5,
        width: compact ? 72 : 160,
        height: compact ? 72 : 220,
        borderRadius: 2,
        border: '1px solid var(--border-color)',
        background: 'var(--bg-header, rgba(255,255,255,0.04))',
        display: 'grid',
        placeItems: 'center',
      }}
      >
        <CircularProgress size={18} sx={{ color: 'var(--brand-primary)' }} />
      </Box>
    )
  }
  if (status === 'missing' || !src) {
    return (
      <Typography sx={{ mt: 1, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        Screenshot unavailable
      </Typography>
    )
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        sx={{
          display: 'block',
          mt: compact ? 0 : 1.5,
          p: 0,
          border: '1px solid var(--border-color)',
          borderRadius: 2,
          overflow: 'hidden',
          background: 'var(--bg-header, rgba(255,255,255,0.04))',
          cursor: 'zoom-in',
          width: compact ? 72 : 160,
          height: compact ? 72 : 220,
          flexShrink: 0,
        }}
      >
        <Box
          component="img"
          src={src}
          alt="Issue screenshot"
          sx={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }}
        />
      </Box>
      {open && createPortal(
        <Box
          role="dialog"
          aria-modal="true"
          aria-label="Issue screenshot preview"
          onClick={() => setOpen(false)}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 2100,
            border: 'none',
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            p: 3,
          }}
        >
          <Box
            component="img"
            src={src}
            alt="Issue screenshot enlarged"
            onClick={(event) => event.stopPropagation()}
            sx={{
              maxWidth: 'min(920px, 100%)',
              maxHeight: '90vh',
              width: 'auto',
              height: 'auto',
              borderRadius: 2,
              objectFit: 'contain',
              boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
            }}
          />
        </Box>,
        document.body,
      )}
    </>
  )
}

export function ImageDropZone({
  file,
  previewUrl,
  keepExisting = false,
  onPick,
  onClear,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const takeFile = useCallback((next) => {
    if (!next || !isImageFile(next)) return
    onPick?.(next)
  }, [onPick])

  useEffect(() => {
    const onPaste = (event) => {
      if (disabled) return
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          const pasted = item.getAsFile()
          if (pasted) {
            event.preventDefault()
            takeFile(pasted)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [disabled, takeFile])

  if (previewUrl || (keepExisting && !file)) {
    return (
      <Box sx={{
        border: '1px solid var(--border-color)',
        borderRadius: 2,
        overflow: 'hidden',
        background: 'var(--bg-header)',
      }}
      >
        {previewUrl ? (
          <Box
            component="img"
            src={previewUrl}
            alt="Selected screenshot"
            sx={{ display: 'block', width: '100%', maxHeight: 240, objectFit: 'contain', bgcolor: 'rgba(0,0,0,0.04)' }}
          />
        ) : (
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, color: 'var(--text-secondary)' }}>
            <ImageOutlinedIcon />
            Keeping the current screenshot
          </Box>
        )}
        <Box sx={{ display: 'flex', gap: 1, p: 1 }}>
          <OutlineBtn small disabled={disabled} onClick={() => inputRef.current?.click()}>Replace</OutlineBtn>
          {previewUrl ? (
            <OutlineBtn small disabled={disabled} onClick={onClear}>Remove</OutlineBtn>
          ) : null}
        </Box>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => takeFile(event.target.files?.[0])}
        />
      </Box>
    )
  }

  return (
    <Box
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        if (disabled) return
        takeFile(event.dataTransfer?.files?.[0])
      }}
      onClick={() => { if (!disabled) inputRef.current?.click() }}
      sx={{
        border: `2px dashed ${dragOver ? 'rgba(226,75,74,0.65)' : 'var(--border-color)'}`,
        borderRadius: 2,
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: dragOver ? 'rgba(226,75,74,0.06)' : 'var(--bg-header)',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 200ms',
      }}
    >
      <ImageOutlinedIcon sx={{ fontSize: 32, color: dragOver ? 'var(--brand-primary)' : 'var(--text-tertiary)' }} />
      <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: dragOver ? 'var(--brand-primary)' : 'var(--text-secondary)', textAlign: 'center' }}>
        Drop a screenshot, click to browse, or paste (Ctrl+V)
      </Typography>
      <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
        JPEG, PNG, or WebP · under 5 MB
      </Typography>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => takeFile(event.target.files?.[0])}
      />
    </Box>
  )
}

export function SubmitIssueDialog({
  open,
  onClose,
  onSubmitted,
  existing = null,
}) {
  const editing = Boolean(existing?.id)
  const [message, setMessage] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [keepExisting, setKeepExisting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (!open) return undefined
    setMessage(existing?.message || '')
    setFile(null)
    setKeepExisting(Boolean(existing?.has_image))
    setLocalError('')
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return ''
    })
    return undefined
  }, [open, existing])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function pickFile(next) {
    setFile(next || null)
    setKeepExisting(false)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return next ? URL.createObjectURL(next) : ''
    })
    setLocalError('')
  }

  function clearFile() {
    setFile(null)
    setKeepExisting(false)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return ''
    })
  }

  async function submit() {
    const text = message.trim()
    if (!text) {
      setLocalError('Please tell us what happened.')
      return
    }
    if (!editing && !file) {
      setLocalError('Add a screenshot of the issue.')
      return
    }
    if (editing && !file && !keepExisting) {
      setLocalError('Add a screenshot of the issue.')
      return
    }

    setSubmitting(true)
    setLocalError('')
    try {
      const form = new FormData()
      form.append('message', text)
      form.append('source', 'web')
      if (file) form.append('image', file)
      let data
      if (editing) {
        ;({ data } = await api.patch(`/auth/support-reports/${existing.id}/`, form, {
          headers: { 'Content-Type': undefined },
          skipAtlasErrorCard: true,
        }))
      } else {
        ;({ data } = await api.post('/auth/support-reports/', form, {
          headers: { 'Content-Type': undefined },
          skipAtlasErrorCard: true,
        }))
      }
      onSubmitted?.(data, editing)
      onClose?.()
    } catch (err) {
      setLocalError(err?.response?.data?.detail || 'Could not send this report. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { if (!submitting) onClose?.() }}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ color: 'var(--text-primary)' }}>
        {editing ? 'Edit issue report' : 'Report an issue'}
      </DialogTitle>
      <Divider sx={{ borderColor: 'var(--border-color)' }} />
      <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
          Your campus admin will read this. They can send it to the ATLAS team if more help is needed.
        </Typography>
        <TextField
          label="What happened"
          size="small"
          fullWidth
          multiline
          minRows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          sx={issueInputSx}
          placeholder="Tell us what you were trying to do and what happened instead."
        />
        <Box>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', mb: 1 }}>
            Screenshot {editing ? '(optional if you keep the current one)' : '(required)'}
          </Typography>
          <ImageDropZone
            file={file}
            previewUrl={previewUrl}
            keepExisting={keepExisting}
            onPick={pickFile}
            onClear={clearFile}
            disabled={submitting}
          />
        </Box>
        {localError ? (
          <Typography sx={{ color: 'var(--brand-primary)', fontSize: '0.85rem' }}>{localError}</Typography>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
        <OutlineBtn onClick={onClose} disabled={submitting}>Cancel</OutlineBtn>
        <PrimaryBtn onClick={submit} disabled={submitting}>
          {submitting ? (editing ? 'Saving…' : 'Sending…') : (editing ? 'Save changes' : 'Send report')}
        </PrimaryBtn>
      </DialogActions>
    </Dialog>
  )
}

export function ReportDetailDialog({
  open,
  report,
  onClose,
  forFaculty = false,
  footer = null,
}) {
  if (!report) return null
  const resolved = Boolean(report.is_resolved)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ color: 'var(--text-primary)', pr: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <span>Issue report</span>
          <Box
            component="span"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: resolved ? '#15803d' : 'var(--brand-primary, #AA2423)',
              background: resolved ? 'rgba(34,197,94,0.12)' : 'rgba(170,36,35,0.1)',
              borderRadius: 999,
              px: 1,
              py: 0.35,
            }}
          >
            {resolved ? <DoneAllIcon sx={{ fontSize: 15 }} /> : null}
            {statusLabel(report, { forFaculty })}
          </Box>
        </Box>
      </DialogTitle>
      <Divider sx={{ borderColor: 'var(--border-color)' }} />
      <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
        {!forFaculty ? (
          <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.82rem', mb: 1 }}>
            {[
              report.faculty_name,
              report.faculty_email,
              report.campus,
              report.source_label || null,
              when(report.created_at),
            ].filter(Boolean).join(' · ')}
          </Typography>
        ) : (
          <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.82rem', mb: 1 }}>
            {[report.source_label || null, when(report.created_at)].filter(Boolean).join(' · ')}
          </Typography>
        )}
        <Typography sx={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
          {report.message}
        </Typography>
        {report.phone_note ? (
          <Typography sx={{ mt: 1.25, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            Phone details: {report.phone_note}
          </Typography>
        ) : null}
        <ReportImage
          reportId={report.id}
          hasImage={Boolean(report.has_image)}
          imageBase64={report.image_base64 || ''}
          imageMime={report.image_mime || 'image/jpeg'}
        />
        {resolved ? (
          <Box sx={{
            mt: 2,
            p: 1.5,
            borderRadius: 2,
            border: '1px solid rgba(34,197,94,0.28)',
            background: 'rgba(34,197,94,0.08)',
          }}
          >
            <Typography sx={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
              {report.resolution_category_label || 'Resolved'}
              {report.resolved_at ? ` · ${when(report.resolved_at)}` : ''}
            </Typography>
            {report.resolution_summary ? (
              <Typography sx={{ mt: 0.75, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {report.resolution_summary}
              </Typography>
            ) : null}
            {report.resolution_details ? (
              <Typography sx={{ mt: 0.75, color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {report.resolution_details}
              </Typography>
            ) : null}
            {report.resolution_follow_up ? (
              <Typography sx={{ mt: 0.75, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                Follow-up: {report.resolution_follow_up}
              </Typography>
            ) : null}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {footer}
        <OutlineBtn onClick={onClose}>Close</OutlineBtn>
      </DialogActions>
    </Dialog>
  )
}

function ReportCard({ row, index, layout, forFaculty, onOpen }) {
  const accent = CARD_COLORS[index % CARD_COLORS.length]
  const resolved = Boolean(row.is_resolved)
  const title = forFaculty
    ? (row.message || 'Issue report')
    : (row.faculty_name || 'A faculty member')
  const subtitle = forFaculty
    ? [row.source_label || null, when(row.created_at)].filter(Boolean).join(' · ')
    : [row.campus, row.source_label || null, when(row.created_at)].filter(Boolean).join(' · ')
  const meta = statusLabel(row, { forFaculty })

  if (layout !== 'cards') {
    return (
      <Card
        elevation={0}
        sx={{
          color: 'var(--text-primary)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 3,
          boxShadow: 'var(--shadow-card)',
          transition: 'border-color 250ms, box-shadow 250ms',
          '&:hover': {
            borderColor: 'rgba(226,75,74,0.4)',
            boxShadow: 'var(--shadow-lg)',
          },
        }}
      >
        <CardActionArea onClick={() => onOpen(row)} sx={{ borderRadius: 3, color: 'inherit' }}>
          <CardContent sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            px: 2,
            py: 1.25,
            '&:last-child': { pb: 1.25 },
          }}
          >
            <BugReportIcon sx={{ fontSize: 18, color: accent, flexShrink: 0 }} />
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flex: 1, minWidth: 0 }}>
              <Typography component="span" noWrap sx={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.84rem', lineHeight: 1 }}>
                {title.length > 72 ? `${title.slice(0, 69)}…` : title}
              </Typography>
            </Box>
            <Typography component="span" sx={{
              color: resolved ? '#15803d' : 'var(--brand-primary)',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
            >
              {meta}
            </Typography>
            <Typography component="span" sx={{
              width: 140,
              textAlign: 'right',
              color: 'var(--text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 500,
              lineHeight: 1,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
            >
              {subtitle}
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
    )
  }

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        color: 'var(--text-primary)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 3,
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--shadow-card)',
        transition: 'transform 250ms, box-shadow 250ms, border-color 250ms',
        '&:hover': {
          transform: 'translateY(-3px)',
          borderColor: 'rgba(226,75,74,0.4)',
          boxShadow: 'var(--shadow-lg)',
        },
      }}
    >
      <CardActionArea onClick={() => onOpen(row)} sx={{ height: '100%', borderRadius: 3, color: 'inherit' }}>
        <CardContent sx={{
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          '&:last-child': { pb: 3 },
        }}
        >
          <Box sx={{
            mb: 2,
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 3,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(226,75,74,0.1)',
          }}
          >
            <BugReportIcon sx={{ color: accent }} />
          </Box>
          <Typography sx={{
            color: resolved ? '#15803d' : '#E24B4A',
            fontWeight: 800,
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            mb: 0.75,
          }}
          >
            {meta}
          </Typography>
          <Typography sx={{
            color: 'var(--text-primary)',
            fontWeight: 700,
            fontSize: '0.95rem',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flex: 1,
          }}
          >
            {title}
          </Typography>
          <Typography sx={{ mt: 2, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            {subtitle}
            {row.has_image ? ' · Screenshot attached' : ''}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}

export function IssueReportsBoard({
  reports,
  loading,
  emptyText,
  forFaculty = false,
  onOpen,
  toolbarEnd = null,
}) {
  const [courseLayout, setCourseLayout] = useState(readLayout)
  const isDesktop = useMediaQuery(DESKTOP_LAYOUT_QUERY, { noSsr: true })
  const layout = courseLayout === 'list-2' && !isDesktop ? 'list' : courseLayout

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={layout}
          aria-label="Issue report layout"
          onChange={(_, value) => {
            if (!value) return
            setCourseLayout(value)
            storeLayout(value)
          }}
          sx={{
            '& .MuiToggleButton-root': {
              borderColor: 'var(--border-color)',
              color: 'var(--text-secondary)',
              '&.Mui-selected': {
                color: '#fff',
                background: 'var(--brand-primary)',
                '&:hover': { background: 'var(--brand-primary-hover)' },
              },
            },
          }}
        >
          <ToggleButton value="cards" aria-label="Card grid"><GridViewIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="list" aria-label="Single list"><ViewListIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="list-2" aria-label="Two-column list"><ViewColumnIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
        {toolbarEnd}
      </Box>

      {loading && reports.length === 0 ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress sx={{ color: '#8E1C1B' }} />
        </Box>
      ) : reports.length === 0 ? (
        <Typography sx={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{emptyText}</Typography>
      ) : (
        <Box
          sx={layout === 'cards' ? {
            display: 'grid',
            gap: 2.5,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
          } : {
            display: 'grid',
            gap: '4px',
            gridTemplateColumns: layout === 'list-2' ? 'repeat(2, minmax(0, 1fr))' : '1fr',
          }}
        >
          {reports.map((row, index) => (
            <ReportCard
              key={row.id}
              row={row}
              index={index}
              layout={layout}
              forFaculty={forFaculty}
              onOpen={onOpen}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
