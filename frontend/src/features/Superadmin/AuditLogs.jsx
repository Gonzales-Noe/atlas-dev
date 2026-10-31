import { useEffect, useState } from 'react'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, Dialog, DialogTitle, DialogContent, Divider, Stack,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'
import api from '../../config/api'
import { PageHeader, GlassCard, OutlineBtn } from '../../components/ui'
import { cssColor } from '../../utils/brandTheme'
import RouteSkeleton from '../../components/RouteSkeleton'
import { StatusNotice } from '../../components/StatusNotice'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}
const tooltipStyle = {
  background: 'var(--shell-menu-bg, #16161E)',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
}
const axisStyle = { fill: 'var(--text-tertiary)', fontSize: 11 }

const ACTION_LABELS = {
  platform_theme_updated: 'Brand color updated',
  platform_settings_updated: 'Platform settings updated',
  maintenance_mode_changed: 'Maintenance mode changed',
  faculty_account_created: 'Faculty account created',
  course_assigned: 'Course assigned',
  syllabus_owner_assigned: 'Syllabus owner assigned',
  account_deactivated: 'Account suspended',
  account_reactivated: 'Account reactivated',
  account_deleted: 'Account deleted',
  institution_deactivated: 'Institution suspended',
  institution_reactivated: 'Institution reactivated',
  institution_deleted: 'Institution deleted',
  assessment_approved: 'Assessment approved',
  course_request_approved: 'Course request approved',
  course_request_submitted: 'Course request submitted',
  admin_document_upload: 'Document uploaded',
}

const RESOURCE_LABELS = {
  userprofile: 'User profile',
  courseload: 'Course load',
  courserequest: 'Course request',
  course_request: 'Course request',
}

function actionLabel(action) {
  const key = String(action || '').toLowerCase()
  if (ACTION_LABELS[key]) return ACTION_LABELS[key]
  return key
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'Unknown'
}

function resourceLabel(type) {
  const raw = String(type || '').trim()
  if (!raw) return '—'
  const compact = raw.replace(/[\s_]/g, '').toLowerCase()
  if (RESOURCE_LABELS[compact] || RESOURCE_LABELS[raw.toLowerCase()]) {
    return RESOURCE_LABELS[compact] || RESOURCE_LABELS[raw.toLowerCase()]
  }
  const spaced = raw
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function asDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {}
  return details
}

function isOn(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function changedSet(log) {
  const listed = asDetails(log.details).changes
  if (Array.isArray(listed) && listed.length) return new Set(listed)
  if (log.action === 'maintenance_mode_changed') return new Set(['maintenance'])
  if (log.action === 'platform_theme_updated') return new Set(['brand'])
  return null
}

function describeLog(log) {
  const details = asDetails(log.details)
  const scope = changedSet(log)
  const lines = []
  const show = kind => !scope || scope.has(kind)

  if (show('brand') && details.brand_primary) {
    lines.push(`The brand color is now ${details.brand_primary}.`)
  }
  if (show('maintenance') && 'maintenance_enabled' in details) {
    lines.push(isOn(details.maintenance_enabled)
      ? 'Maintenance is on. Faculty and admins are paused.'
      : 'Maintenance is off. Faculty and admins can sign in.')
  }
  if (show('maintenance') && isOn(details.maintenance_notice_enabled) && details.maintenance_scheduled_for) {
    const when = new Date(details.maintenance_scheduled_for)
    const until = details.maintenance_scheduled_until ? new Date(details.maintenance_scheduled_until) : null
    const startLabel = Number.isNaN(when.getTime()) ? details.maintenance_scheduled_for : when.toLocaleString()
    const endLabel = until && !Number.isNaN(until.getTime()) ? until.toLocaleString() : ''
    lines.push(endLabel
      ? `A coming-soon banner is set from ${startLabel} until ${endLabel}.`
      : `A coming-soon banner is set for ${startLabel}.`)
  }

  if (log.action === 'faculty_account_created') {
    const who = details.faculty_name || details.faculty_email
    lines.push(who ? `${who} was added as faculty.` : 'A faculty account was created.')
  } else if (log.action === 'course_assigned') {
    const course = [details.course_code, details.course_title].filter(Boolean).join(' — ')
    const section = details.section ? ` in ${details.section}` : ''
    const who = details.faculty_email ? ` to ${details.faculty_email}` : ''
    lines.push(course ? `${course} was assigned${who}${section}.` : 'A course was assigned.')
  } else if (log.action === 'syllabus_owner_assigned') {
    lines.push(details.course_code
      ? `${details.course_code} now has ${details.faculty_email || 'a faculty member'} as syllabus owner.`
      : 'A syllabus owner was assigned.')
  } else if (log.action === 'assessment_approved') {
    const note = details.allocation_note ? ` Note: ${details.allocation_note}` : ''
    lines.push(`The assessment was approved.${note}`)
  } else if (log.action === 'course_request_submitted' || log.action === 'course_request_approved') {
    const course = [details.course_code, details.course_title].filter(Boolean).join(' — ')
    lines.push(course
      ? `${course} ${log.action.endsWith('approved') ? 'was approved.' : 'was submitted for review.'}`
      : actionLabel(log.action) + '.')
  } else if (log.action === 'account_deleted') {
    const who = details.deleted_name || details.deleted_email || 'The account'
    lines.push(`${who} was deleted.`)
  } else if (log.action === 'account_deactivated' || log.action === 'account_reactivated') {
    const who = details.account_name || details.account_email || 'The account'
    lines.push(`${who} was ${log.action.endsWith('reactivated') ? 'reactivated' : 'suspended'}.`)
  } else if (log.action === 'institution_deleted') {
    lines.push(details.deleted_institution_name
      ? `${details.deleted_institution_name} and its data were deleted.`
      : 'An institution was deleted.')
  } else if (log.action === 'institution_deactivated' || log.action === 'institution_reactivated') {
    const name = details.institution_name || 'The institution'
    lines.push(`${name} was ${log.action.endsWith('reactivated') ? 'reactivated' : 'suspended'}.`)
  }

  if (!lines.length) {
    const skip = new Set(['changes', 'faculty_id', 'course_id', 'section_id', 'institution_id', 'request_id', 'brand_primary', 'maintenance_enabled'])
    Object.entries(details).forEach(([key, value]) => {
      if (skip.has(key) || value === null || value === '' || key.endsWith('_id')) return
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
      const text = typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value)
      lines.push(`${label}: ${text}.`)
    })
  }
  if (!lines.length) lines.push(`${actionLabel(log.action)}.`)
  return lines
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({ total: 0, last_24h: 0 })
  const [actions, setActions] = useState([])
  const [daily, setDaily] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [selectedLog, setSelectedLog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm, 250)
  const primary = cssColor('--brand-primary', '#AA2423')

  useEffect(() => {
    let mounted = true
    const params = new URLSearchParams({
      page: String(page + 1),
      page_size: String(rowsPerPage),
    })
    const query = debouncedSearch.trim()
    if (query) params.set('q', query)
    if (action) params.set('action', action)
    setLoading(true)
    api.get(`/auth/platform-audit/?${params.toString()}`)
      .then(({ data }) => {
        if (!mounted) return
        setLogs(data.logs || [])
        setTotal(typeof data.count === 'number' ? data.count : 0)
        setSummary(data.summary || { total: 0, last_24h: 0 })
        setActions(data.actions || [])
        setDaily(data.daily || [])
        setError('')
      })
      .catch(err => {
        if (!mounted) return
        setLogs([])
        setTotal(0)
        setError(err.response?.data?.detail || 'Audit records could not be loaded.')
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [page, rowsPerPage, debouncedSearch, action])

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Audit Logs"
        subtitle="Recorded actions across every institution on this deployment"
      />

      <StatusNotice message={error} severity="error" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Stored events', value: summary.total },
          { label: 'Last 24 hours', value: summary.last_24h },
          { label: 'Matching this view', value: total },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>{item.label.toUpperCase()}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: primary, lineHeight: 1.1 }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(260px, 0.8fr)', gap: 16, marginBottom: 16 }} className="atlas-audit-split">
        <GlassCard title="Events by day">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="events" name="Events" fill={primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
        <GlassCard title="Most common actions">
          {actions.length === 0 && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No actions recorded yet.</p>}
          {actions.map(item => (
            <button
              key={item.action}
              type="button"
              onClick={() => { setAction(item.action); setPage(0) }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                gap: 12,
                background: action === item.action ? 'var(--active-bg)' : 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                borderTop: '1px solid var(--border-color)',
                padding: '10px 4px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <span>{actionLabel(item.action)}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </GlassCard>
      </div>

      <GlassCard style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search name, email, or action…"
            size="small"
            value={searchTerm}
            onChange={event => { setSearchTerm(event.target.value); setPage(0) }}
            sx={{ flex: 1, minWidth: 220, ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }}
          />
          <TextField
            select
            size="small"
            label="Action"
            value={action}
            onChange={event => { setAction(event.target.value); setPage(0) }}
            SelectProps={{ native: true }}
            sx={{ minWidth: 220, ...inputSx }}
          >
            <option value="">All actions</option>
            {actions.map(item => <option key={item.action} value={item.action}>{actionLabel(item.action)}</option>)}
          </TextField>
        </div>
      </GlassCard>

      <GlassCard style={{ padding: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Timestamp', 'User', 'Role', 'Action', 'Resource', ''].map(header => (
                  <TableCell key={header} sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', color: 'var(--text-secondary) !important', textTransform: 'uppercase', py: 1.5 }}>
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ borderBottom: 'none', p: 0 }}><RouteSkeleton compact /></TableCell>
                </TableRow>
              )}
              {!loading && logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ color: 'var(--text-secondary)', py: 4 }}>No matching audit records.</TableCell>
                </TableRow>
              )}
              {!loading && logs.map(log => (
                <TableRow key={log.log_id}>
                  <TableCell sx={{ fontFamily: 'var(--font-mono) !important', fontSize: '0.78rem !important', whiteSpace: 'nowrap' }}>
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell sx={{ fontWeight: '700 !important' }}>{log.user}</TableCell>
                  <TableCell>{log.role || '—'}</TableCell>
                  <TableCell>{actionLabel(log.action)}</TableCell>
                  <TableCell>{resourceLabel(log.resource_type)}</TableCell>
                  <TableCell>
                    <OutlineBtn small onClick={() => setSelectedLog(log)}>View</OutlineBtn>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50]}
          component="div"
          count={total}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, next) => setPage(next)}
          onRowsPerPageChange={event => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0) }}
        />
      </GlassCard>

      <Dialog open={Boolean(selectedLog)} onClose={() => setSelectedLog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Log details</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {selectedLog && (
            <Stack spacing={1.75}>
              {describeLog(selectedLog).map((line, index) => (
                <div key={`${index}-${line}`} style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>{line}</div>
              ))}
              <Divider />
              {[
                ['When', selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : '—'],
                ['Who', selectedLog.email ? `${selectedLog.user} · ${selectedLog.email}` : selectedLog.user],
                ['Role', selectedLog.role || '—'],
                ['Record', `${actionLabel(selectedLog.action)} · ${resourceLabel(selectedLog.resource_type)}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ marginTop: 2, color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
      <style>{`
        @media (max-width: 900px) {
          .atlas-audit-split { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperAdminLayout>
  )
}
