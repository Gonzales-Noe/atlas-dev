import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import AdminLayout from '../roles/Admin/AdminLayout'
import SuperAdminLayout from '../Superadmin/SuperAdminLayout'
import api from '../../config/api'
import { PageHeader, GlassCard, PrimaryBtn, OutlineBtn } from '../../components/ui'

function when(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function ReportImage({ reportId, hasImage }) {
  const [src, setSrc] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!hasImage || !reportId) return undefined
    let cancelled = false
    let objectUrl = ''
    ;(async () => {
      try {
        const { data, headers } = await api.get(`/auth/support-reports/${reportId}/image/`, {
          responseType: 'blob',
          atlasCache: false,
          skipAtlasErrorCard: true,
          headers: {
            Accept: 'image/*,application/octet-stream',
          },
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
          if (!cancelled) setSrc('')
          return
        }
        objectUrl = URL.createObjectURL(data)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setSrc(objectUrl)
      } catch {
        if (!cancelled) setSrc('')
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

  if (!hasImage || !src) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'block',
          marginTop: 12,
          padding: 0,
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--bg-header, rgba(255,255,255,0.04))',
          cursor: 'zoom-in',
          width: 160,
          height: 220,
          flexShrink: 0,
        }}
      >
        <img
          src={src}
          alt="Issue screenshot"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
          }}
        />
      </button>
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Issue screenshot preview"
          onClick={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            border: 'none',
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            padding: 24,
          }}
        >
          <img
            src={src}
            alt="Issue screenshot enlarged"
            onClick={(event) => event.stopPropagation()}
            style={{
              maxWidth: 'min(920px, 100%)',
              maxHeight: '90vh',
              width: 'auto',
              height: 'auto',
              borderRadius: 12,
              objectFit: 'contain',
              boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

function StatusTag({ resolved }) {
  if (resolved) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: '0.72rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#15803d',
        background: 'rgba(34,197,94,0.12)',
        borderRadius: 999,
        padding: '3px 9px 3px 7px',
      }}>
        <DoneAllIcon sx={{ fontSize: 15, color: '#15803d' }} />
        RESOLVED
      </span>
    )
  }
  return (
    <span style={{
      fontSize: '0.72rem',
      fontWeight: 800,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--brand-primary, #AA2423)',
      background: 'rgba(170,36,35,0.1)',
      borderRadius: 999,
      padding: '3px 8px',
    }}>
      OPEN
    </span>
  )
}

export default function IssueReports({ audience = 'admin' }) {
  const isAdmin = audience === 'admin'
  const isSuperadmin = audience === 'superadmin'
  const Layout = isAdmin ? AdminLayout : SuperAdminLayout
  const location = useLocation()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sendingId, setSendingId] = useState('')
  const [resolvingId, setResolvingId] = useState('')
  const hasLoadedRef = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent || !hasLoadedRef.current) setLoading(true)
    if (!silent) setError('')
    try {
      const { data } = await api.get('/auth/support-reports/', { atlasCache: false })
      setReports(Array.isArray(data?.reports) ? data.reports : [])
      hasLoadedRef.current = true
    } catch (err) {
      setError(err?.response?.data?.detail || 'These reports could not be loaded. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, location.search])

  useEffect(() => {
    const soft = () => load({ silent: true })
    const timer = window.setInterval(soft, 30000)
    const onFocus = () => soft()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') soft()
    }
    const onRefresh = () => soft()
    const onMessage = (event) => {
      const type = event?.data?.type
      if (type === 'atlas-notification' || type === 'atlas-notification-open') soft()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('atlas-issue-reports-refresh', onRefresh)
    navigator.serviceWorker?.addEventListener?.('message', onMessage)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('atlas-issue-reports-refresh', onRefresh)
      navigator.serviceWorker?.removeEventListener?.('message', onMessage)
    }
  }, [load])

  async function sendUp(id) {
    setSendingId(id)
    setError('')
    try {
      const { data } = await api.post(`/auth/support-reports/${id}/forward/`)
      setReports((rows) => rows.map((row) => (row.id === id ? { ...row, ...data } : row)))
      window.dispatchEvent(new CustomEvent('atlas-issue-reports-refresh'))
    } catch (err) {
      setError(err?.response?.data?.detail || 'This report could not be sent. Try again in a moment.')
    } finally {
      setSendingId('')
    }
  }

  async function setResolved(id, resolved) {
    setResolvingId(id)
    setError('')
    try {
      const { data } = await api.post(`/auth/support-reports/${id}/resolve/`, { resolved })
      setReports((rows) => rows.map((row) => (row.id === id ? { ...row, ...data } : row)))
      window.dispatchEvent(new CustomEvent('atlas-issue-reports-refresh'))
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not update that report. Try again in a moment.')
    } finally {
      setResolvingId('')
    }
  }

  return (
    <Layout>
      <PageHeader
        title="Issue reports"
        subtitle={isAdmin
          ? 'Messages faculty sent from the ATLAS app. Send one to the ATLAS team when the campus needs more help.'
          : 'Messages a campus admin has passed on from faculty in the ATLAS app.'}
      />
      {error && (
        <p style={{ color: 'var(--brand-primary)', margin: '0 0 16px', fontSize: '0.9rem' }}>{error}</p>
      )}
      {loading ? (
        <GlassCard>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading reports…</p>
        </GlassCard>
      ) : reports.length === 0 ? (
        <GlassCard>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {isAdmin
              ? 'No messages yet. When a faculty member reports a problem in the app, it will show up here.'
              : 'Nothing has been sent up yet. A campus admin sends a report here when they want the ATLAS team to look at it.'}
          </p>
        </GlassCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {reports.map((row) => {
            const sent = row.status === 'with_superadmin'
            const resolved = Boolean(row.is_resolved)
            return (
              <GlassCard key={row.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                        {row.faculty_name || 'A faculty member'}
                      </div>
                      <StatusTag resolved={resolved} />
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 2 }}>
                      {[row.faculty_email, row.campus, when(row.created_at)].filter(Boolean).join(' · ')}
                    </div>
                    <p style={{ margin: '12px 0 0', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {row.message}
                    </p>
                    <ReportImage reportId={row.id} hasImage={Boolean(row.has_image)} />
                    {row.phone_note ? (
                      <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        Phone details: {row.phone_note}
                      </p>
                    ) : null}
                    {resolved && row.resolved_at ? (
                      <p style={{ margin: '10px 0 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        Resolved {when(row.resolved_at)}
                      </p>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    {isAdmin ? (
                      sent ? (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>
                          Sent to the ATLAS team{row.forwarded_at ? ` · ${when(row.forwarded_at)}` : ''}
                        </span>
                      ) : (
                        <PrimaryBtn
                          small
                          disabled={sendingId === row.id || resolved}
                          onClick={() => sendUp(row.id)}
                        >
                          {sendingId === row.id ? 'Sending…' : 'Send to the ATLAS team'}
                        </PrimaryBtn>
                      )
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700 }}>
                        From a campus admin{row.forwarded_at ? ` · ${when(row.forwarded_at)}` : ''}
                      </span>
                    )}
                    {isSuperadmin && (
                      resolved ? (
                        <OutlineBtn
                          small
                          disabled={resolvingId === row.id}
                          onClick={() => setResolved(row.id, false)}
                        >
                          {resolvingId === row.id ? 'Updating…' : 'Mark as open'}
                        </OutlineBtn>
                      ) : (
                        <PrimaryBtn
                          small
                          disabled={resolvingId === row.id}
                          onClick={() => setResolved(row.id, true)}
                        >
                          {resolvingId === row.id ? 'Updating…' : 'Mark as resolved'}
                        </PrimaryBtn>
                      )
                    )}
                  </div>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
