import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  MenuItem, TextField, Typography,
} from '@mui/material'
import AdminLayout from '../roles/Admin/AdminLayout'
import SuperAdminLayout from '../Superadmin/SuperAdminLayout'
import api from '../../config/api'
import { StatusNotice } from '../../components/StatusNotice'
import { PageHeader, PrimaryBtn, OutlineBtn } from '../../components/ui'
import {
  IssueReportsBoard,
  ReportDetailDialog,
  issueInputSx,
  when,
} from './issueReportUi'

const RESOLUTION_CATEGORIES = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'workaround', label: 'Workaround provided' },
  { value: 'maintenance_planned', label: 'Maintenance update planned' },
  { value: 'cannot_reproduce', label: 'Could not reproduce' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'by_design', label: 'Working as designed' },
  { value: 'other', label: 'Other' },
]

const emptyResolutionForm = () => ({
  resolution_category: 'fixed',
  resolution_summary: '',
  resolution_details: '',
  resolution_follow_up: '',
})

export default function IssueReports({ audience = 'admin' }) {
  const isAdmin = audience === 'admin'
  const isSuperadmin = audience === 'superadmin'
  const Layout = isAdmin ? AdminLayout : SuperAdminLayout
  const location = useLocation()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sendingId, setSendingId] = useState('')
  const [resolvingId, setResolvingId] = useState('')
  const [selected, setSelected] = useState(null)
  const [resolveTarget, setResolveTarget] = useState(null)
  const [resolutionForm, setResolutionForm] = useState(emptyResolutionForm)
  const hasLoadedRef = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent || !hasLoadedRef.current) setLoading(true)
    if (!silent) setError('')
    try {
      const { data } = await api.get('/auth/support-reports/', {
        atlasCache: false,
        params: { include_images: 1 },
      })
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
    setSuccess('')
    try {
      const { data } = await api.post(`/auth/support-reports/${id}/forward/`)
      setReports((rows) => rows.map((row) => (row.id === id ? { ...row, ...data } : row)))
      setSelected((current) => (current?.id === id ? { ...current, ...data } : current))
      setSuccess('Report sent to the ATLAS team.')
      window.dispatchEvent(new CustomEvent('atlas-issue-reports-refresh'))
    } catch (err) {
      setError(err?.response?.data?.detail || 'This report could not be sent. Try again in a moment.')
    } finally {
      setSendingId('')
    }
  }

  function openResolveForm(row) {
    setResolveTarget(row)
    setResolutionForm(emptyResolutionForm())
    setError('')
    setSuccess('')
  }

  async function submitResolve() {
    if (!resolveTarget) return
    if (!resolutionForm.resolution_category) {
      setError('Choose how this issue was resolved.')
      return
    }
    if (!resolutionForm.resolution_summary.trim()) {
      setError('Add a short resolution summary.')
      return
    }
    setResolvingId(resolveTarget.id)
    setError('')
    setSuccess('')
    try {
      const { data } = await api.post(`/auth/support-reports/${resolveTarget.id}/resolve/`, {
        resolved: true,
        resolution_category: resolutionForm.resolution_category,
        resolution_summary: resolutionForm.resolution_summary.trim(),
        resolution_details: resolutionForm.resolution_details.trim(),
        resolution_follow_up: resolutionForm.resolution_follow_up.trim(),
      })
      setReports((rows) => rows.map((row) => (row.id === resolveTarget.id ? { ...row, ...data } : row)))
      setSelected((current) => (current?.id === resolveTarget.id ? { ...current, ...data } : current))
      setResolveTarget(null)
      setResolutionForm(emptyResolutionForm())
      setSuccess('Report marked as resolved.')
      window.dispatchEvent(new CustomEvent('atlas-issue-reports-refresh'))
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not update that report. Try again in a moment.')
    } finally {
      setResolvingId('')
    }
  }

  async function reopenReport(id) {
    setResolvingId(id)
    setError('')
    setSuccess('')
    try {
      const { data } = await api.post(`/auth/support-reports/${id}/resolve/`, { resolved: false })
      setReports((rows) => rows.map((row) => (row.id === id ? { ...row, ...data } : row)))
      setSelected((current) => (current?.id === id ? { ...current, ...data } : current))
      setSuccess('Report marked as open.')
      window.dispatchEvent(new CustomEvent('atlas-issue-reports-refresh'))
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not update that report. Try again in a moment.')
    } finally {
      setResolvingId('')
    }
  }

  const selectedSent = selected?.status === 'with_superadmin'
  const selectedResolved = Boolean(selected?.is_resolved)

  return (
    <Layout>
      <StatusNotice message={error} severity="error" />
      <StatusNotice message={success} severity="success" />

      <PageHeader
        title="Issue reports"
        subtitle={isAdmin
          ? 'Messages faculty sent from ATLAS (app or web). Open one to review details, then send it to the ATLAS team when needed.'
          : 'Messages a campus admin has passed on from faculty. Open one to review details and resolve it.'}
      />

      <IssueReportsBoard
        reports={reports}
        loading={loading}
        emptyText={isAdmin
          ? 'No messages yet. When a faculty member reports a problem, it will show up here.'
          : 'Nothing has been sent up yet. A campus admin sends a report here when they want the ATLAS team to look at it.'}
        onOpen={setSelected}
      />

      <ReportDetailDialog
        open={Boolean(selected)}
        report={selected}
        onClose={() => setSelected(null)}
        footer={(
          <>
            {isAdmin ? (
              selectedSent ? (
                <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, mr: 'auto' }}>
                  Sent to the ATLAS team{selected?.forwarded_at ? ` · ${when(selected.forwarded_at)}` : ''}
                </Typography>
              ) : (
                <PrimaryBtn
                  small
                  disabled={sendingId === selected?.id || selectedResolved}
                  onClick={() => sendUp(selected.id)}
                >
                  {sendingId === selected?.id ? 'Sending…' : 'Send to the ATLAS team'}
                </PrimaryBtn>
              )
            ) : (
              <Typography sx={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, mr: 'auto' }}>
                From a campus admin{selected?.forwarded_at ? ` · ${when(selected.forwarded_at)}` : ''}
              </Typography>
            )}
            {isSuperadmin ? (
              selectedResolved ? (
                <OutlineBtn
                  small
                  disabled={resolvingId === selected?.id}
                  onClick={() => reopenReport(selected.id)}
                >
                  {resolvingId === selected?.id ? 'Updating…' : 'Mark as open'}
                </OutlineBtn>
              ) : (
                <PrimaryBtn
                  small
                  disabled={resolvingId === selected?.id}
                  onClick={() => openResolveForm(selected)}
                >
                  Mark as resolved
                </PrimaryBtn>
              )
            ) : null}
          </>
        )}
      />

      <Dialog
        open={Boolean(resolveTarget)}
        onClose={() => { if (!resolvingId) setResolveTarget(null) }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Resolve issue report</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
            Record how this was resolved. Faculty will see this on their report.
          </Typography>
          <TextField
            select
            label="Resolution type"
            size="small"
            value={resolutionForm.resolution_category}
            onChange={(event) => setResolutionForm((current) => ({ ...current, resolution_category: event.target.value }))}
            sx={issueInputSx}
          >
            {RESOLUTION_CATEGORIES.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Resolution summary"
            size="small"
            value={resolutionForm.resolution_summary}
            onChange={(event) => setResolutionForm((current) => ({ ...current, resolution_summary: event.target.value }))}
            sx={issueInputSx}
            inputProps={{ maxLength: 300 }}
            placeholder="e.g. Fixed text-size scaling on Appearance"
          />
          <TextField
            label="Details (optional)"
            size="small"
            multiline
            minRows={3}
            value={resolutionForm.resolution_details}
            onChange={(event) => setResolutionForm((current) => ({ ...current, resolution_details: event.target.value }))}
            sx={issueInputSx}
            placeholder="Root cause, what changed, verification steps…"
          />
          <TextField
            label="Follow-up / maintenance note (optional)"
            size="small"
            value={resolutionForm.resolution_follow_up}
            onChange={(event) => setResolutionForm((current) => ({ ...current, resolution_follow_up: event.target.value }))}
            sx={issueInputSx}
            inputProps={{ maxLength: 300 }}
            placeholder="e.g. Maintenance window Friday 10pm–11pm"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setResolveTarget(null)} disabled={Boolean(resolvingId)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={submitResolve} disabled={Boolean(resolvingId)}>
            {resolvingId ? 'Saving…' : 'Mark as resolved'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    </Layout>
  )
}
