import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import { TextField } from '@mui/material'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'
import { StatusNotice } from '../../../components/StatusNotice'
import { PageHeader, GlassCard, PrimaryBtn, OutlineBtn } from '../../../components/ui'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  textarea: { color: 'var(--text-primary)' },
}

function when(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function statusLabel(row) {
  if (row.is_resolved) return 'RESOLVED'
  if (row.status === 'with_superadmin') return 'WITH ATLAS TEAM'
  return 'WITH CAMPUS ADMIN'
}

function ReportImage({ reportId, hasImage }) {
  const [src, setSrc] = useState('')
  const [status, setStatus] = useState(hasImage ? 'loading' : 'none')
  const [open, setOpen] = useState(false)

  useEffect(() => {
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
        const { data, headers } = await api.get(`/auth/support-reports/${reportId}/image/`, {
          responseType: 'blob',
          atlasCache: false,
          skipAtlasErrorCard: true,
          headers: { Accept: 'image/*,application/octet-stream' },
          transformRequest: [(body, requestHeaders) => {
            if (requestHeaders && typeof requestHeaders === 'object') {
              delete requestHeaders['Content-Type']
              delete requestHeaders['content-type']
            }
            return body
          }],
        })
        const type = String(data?.type || headers?.['content-type'] || '')
        if (!data || data.size < 32 || type.includes('json') || type.includes('text/html')) {
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
  }, [hasImage, reportId])

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
      <div style={{
        marginTop: 12, width: 160, height: 220, borderRadius: 12,
        border: '1px solid var(--border-color)', background: 'var(--bg-header, rgba(255,255,255,0.04))',
        display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem',
      }}
      >
        Loading…
      </div>
    )
  }
  if (status === 'missing' || !src) {
    return (
      <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        Screenshot unavailable
      </p>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'block', marginTop: 12, padding: 0, border: '1px solid var(--border-color)',
          borderRadius: 12, overflow: 'hidden', background: 'var(--bg-header, rgba(255,255,255,0.04))',
          cursor: 'zoom-in', width: 160, height: 220, flexShrink: 0,
        }}
      >
        <img
          src={src}
          alt="Issue screenshot"
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }}
        />
      </button>
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Issue screenshot preview"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, border: 'none', background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24,
          }}
        >
          <img
            src={src}
            alt="Issue screenshot enlarged"
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: 'min(920px, 100%)', maxHeight: '90vh', width: 'auto', height: 'auto',
              borderRadius: 12, objectFit: 'contain', boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

export default function FacultyIssueReports() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [keepExistingImage, setKeepExistingImage] = useState(false)
  const fileInputRef = useRef(null)
  const hasLoadedRef = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent || !hasLoadedRef.current) setLoading(true)
    try {
      const { data } = await api.get('/auth/support-reports/', { atlasCache: false })
      setReports(Array.isArray(data?.reports) ? data.reports : [])
      hasLoadedRef.current = true
      if (!silent) setError('')
    } catch (err) {
      if (!silent || !hasLoadedRef.current) {
        setError(err?.response?.data?.detail || 'Could not load your reports. Try again in a moment.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const soft = () => load({ silent: true })
    const timer = window.setInterval(soft, 30000)
    const onFocus = () => soft()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  function resetForm() {
    setMessage('')
    setFile(null)
    setEditingId('')
    setKeepExistingImage(false)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function startEdit(row) {
    setEditingId(row.id)
    setMessage(row.message || '')
    setFile(null)
    setKeepExistingImage(Boolean(row.has_image))
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setError('')
    setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function onPickFile(event) {
    const next = event.target.files?.[0] || null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(next)
    setPreviewUrl(next ? URL.createObjectURL(next) : '')
    if (next) setKeepExistingImage(false)
  }

  async function submitReport() {
    const text = message.trim()
    if (!text) {
      setError('Please tell us what happened.')
      setSuccess('')
      return
    }
    if (!editingId && !file) {
      setError('Add a screenshot of the issue.')
      setSuccess('')
      return
    }
    if (editingId && !file && !keepExistingImage) {
      setError('Add a screenshot of the issue.')
      setSuccess('')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const form = new FormData()
      form.append('message', text)
      if (file) form.append('image', file)

      if (editingId) {
        const { data } = await api.patch(`/auth/support-reports/${editingId}/`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          skipAtlasErrorCard: true,
        })
        setReports((rows) => rows.map((row) => (row.id === editingId ? { ...row, ...data } : row)))
        setSuccess('Your report was updated.')
      } else {
        const { data } = await api.post('/auth/support-reports/', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          skipAtlasErrorCard: true,
        })
        setReports((rows) => [data, ...rows.filter((row) => row.id !== data.id)])
        setSuccess(
          data?.delivered_to === 'superadmin'
            ? 'Your message was sent to the ATLAS team.'
            : 'Your message was sent to your campus admin.',
        )
      }
      resetForm()
      load({ silent: true })
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send this report. Try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FacultyLayout>
      <StatusNotice message={error} severity="error" />
      <StatusNotice message={success} severity="success" />

      <PageHeader
        title="Issue reports"
        subtitle="Tell your campus admin what went wrong. They can send it to the ATLAS team if more help is needed."
      />

      <GlassCard style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontWeight: 800, marginBottom: 12, color: 'var(--text-primary)' }}>
          {editingId ? 'Edit report' : 'Send a new report'}
        </div>
        <TextField
          label="What happened"
          size="small"
          fullWidth
          multiline
          minRows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          sx={{ ...inputSx, mb: 2 }}
          placeholder="Tell us what you were trying to do and what happened instead."
        />
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Screenshot {editingId ? '(optional if you keep the current one)' : '(required)'}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onPickFile}
          />
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Selected screenshot"
              style={{
                display: 'block', marginTop: 12, maxWidth: 220, maxHeight: 280,
                borderRadius: 12, border: '1px solid var(--border-color)', objectFit: 'contain',
              }}
            />
          ) : null}
          {editingId && keepExistingImage && !previewUrl ? (
            <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              Keeping the current screenshot. Choose a new file to replace it.
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <PrimaryBtn onClick={submitReport} disabled={submitting}>
            {submitting ? (editingId ? 'Saving…' : 'Sending…') : (editingId ? 'Save changes' : 'Send report')}
          </PrimaryBtn>
          {editingId ? (
            <OutlineBtn onClick={resetForm} disabled={submitting}>
              Cancel edit
            </OutlineBtn>
          ) : null}
        </div>
      </GlassCard>

      {loading && reports.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading your reports…</p>
      ) : reports.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>You have not sent any issue reports yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {reports.map((row) => {
            const resolved = Boolean(row.is_resolved)
            const statusColor = resolved ? '#15803d' : 'var(--brand-primary, #AA2423)'
            return (
              <GlassCard key={row.id} style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em',
                        color: statusColor,
                        background: resolved ? 'rgba(34,197,94,0.12)' : 'rgba(170,36,35,0.1)',
                        borderRadius: 999, padding: '3px 9px',
                      }}
                      >
                        {resolved ? <DoneAllIcon sx={{ fontSize: 15 }} /> : null}
                        {statusLabel(row)}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {when(row.created_at)}
                      </span>
                    </div>
                    <p style={{ margin: '10px 0 0', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {row.message}
                    </p>
                    <ReportImage reportId={row.id} hasImage={row.has_image} />
                    {resolved ? (
                      <div style={{
                        marginTop: 12, padding: 12, borderRadius: 12,
                        border: '1px solid rgba(34,197,94,0.28)', background: 'rgba(34,197,94,0.08)',
                      }}
                      >
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          {row.resolution_category_label || 'Resolved'}
                          {row.resolved_at ? ` · ${when(row.resolved_at)}` : ''}
                        </div>
                        {row.resolution_summary ? (
                          <p style={{ margin: '6px 0 0', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                            {row.resolution_summary}
                          </p>
                        ) : null}
                        {row.resolution_details ? (
                          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {row.resolution_details}
                          </p>
                        ) : null}
                        {row.resolution_follow_up ? (
                          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                            Follow-up: {row.resolution_follow_up}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {row.can_edit ? (
                    <OutlineBtn small onClick={() => startEdit(row)}>
                      Edit
                    </OutlineBtn>
                  ) : null}
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}
    </FacultyLayout>
  )
}
