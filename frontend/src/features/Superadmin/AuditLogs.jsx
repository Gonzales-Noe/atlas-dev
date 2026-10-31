import { useEffect, useState } from 'react'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, Dialog, DialogTitle, DialogContent, Divider, Stack, Alert,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'
import api from '../../config/api'
import { PageHeader, GlassCard, OutlineBtn } from '../../components/ui'
import { cssColor } from '../../utils/brandTheme'
import RouteSkeleton from '../../components/RouteSkeleton'

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

function actionLabel(action) {
  return String(action || 'Unknown')
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function detailEntries(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return []
  return Object.entries(details).filter(([, value]) => value !== null && value !== '')
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

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
            placeholder="Search user, action, institution…"
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
                {['Timestamp', 'User', 'Institution', 'Action', 'Resource', ''].map(header => (
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
                  <TableCell>{log.institution}</TableCell>
                  <TableCell>{actionLabel(log.action)}</TableCell>
                  <TableCell>{log.resource_type || '—'}</TableCell>
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
            <Stack spacing={1.5}>
              <div><strong>When.</strong> {selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : '—'}</div>
              <div><strong>Who.</strong> {selectedLog.user}{selectedLog.email ? ` (${selectedLog.email})` : ''}</div>
              <div><strong>Institution.</strong> {selectedLog.institution}</div>
              <div><strong>Action.</strong> {actionLabel(selectedLog.action)}</div>
              <div><strong>Resource.</strong> {selectedLog.resource_type || '—'} {selectedLog.resource_id || ''}</div>
              {detailEntries(selectedLog.details).map(([key, value]) => (
                <div key={key}>
                  <strong>{key.replace(/_/g, ' ')}.</strong> {typeof value === 'string' ? value : JSON.stringify(value)}
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
