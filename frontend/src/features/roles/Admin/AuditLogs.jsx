// src/features/roles/Admin/AuditLogs.jsx
import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions, Divider, Stack, Alert,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import { PageHeader, GlassCard, OutlineBtn } from '../../../components/ui'

const actionIcon = a => {
  const action = (a || '').toLowerCase()
  if (action.includes('login'))    return '🔐'
  if (action.includes('syllabus')) return '📋'
  if (action.includes('assess'))   return '📝'
  if (action.includes('module'))   return '🧩'
  if (action.includes('grade'))    return '⭐'
  if (action.includes('upload'))   return '📁'
  if (action.includes('export'))   return '⬇️'
  if (action.includes('backup'))   return '☁️'
  if (action.includes('ai'))       return '🤖'
  if (action.includes('faculty_account_created')) return '👤'
  if (action.includes('course_assigned'))         return '📚'
  if (action.includes('account_deactivated'))     return '⏸️'
  if (action.includes('account_reactivated'))     return '▶️'
  if (action.includes('account_deleted'))         return '🗑️'
  if (action.includes('institution_deactivated')) return '⏸️'
  if (action.includes('institution_reactivated')) return '▶️'
  if (action.includes('institution_deleted'))     return '🗑️'
  if (action.includes('admin_document_upload'))   return '📄'
  return '📌'
}

const actionLabel = a => {
  const action = (a || '').toLowerCase()
  const labels = {
    'faculty_account_created': 'Faculty Account Created',
    'course_assigned': 'Course Assigned',
    'account_deactivated': 'Account Deactivated',
    'account_reactivated': 'Account Reactivated',
    'account_deleted': 'Account Deleted',
    'institution_deactivated': 'Institution Deactivated',
    'institution_reactivated': 'Institution Reactivated',
    'institution_deleted': 'Institution Deleted',
    'admin_document_upload': 'Admin Document Upload',
    'course_request_approved': 'Course Request Approved',
    'course_request_submitted': 'Course Request Submitted',
  }
  if (labels[action]) return labels[action]
  return action
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const detailText = details => (
  typeof details === 'string' ? details : JSON.stringify(details || {})
)

function detailEntries(details) {
  if (!details) return []
  let parsed = details
  if (typeof details === 'string') {
    try {
      parsed = JSON.parse(details)
    } catch {
      return []
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  return Object.entries(parsed).filter(([, value]) => value !== null && value !== '')
}

function detailLabel(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

export default function AdminAuditLogs() {
  const [logs, setLogs]               = useState([])
  const [searchTerm, setSearchTerm]   = useState('')
  const [page, setPage]               = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [selectedLog, setSelectedLog] = useState(null)
  const [detailOpen, setDetailOpen]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  useEffect(() => {
    let mounted = true
    api.get('/integrations/audit-logs/')
      .then(({ data }) => {
        if (mounted) setLogs(data.logs || [])
      })
      .catch(err => {
        if (mounted) setError(err.response?.data?.detail || 'Failed to load audit records.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    setPage(0)
  }, [searchTerm])

  const filtered = logs.filter(log => {
    const searchable = [
      log.user,
      log.action,
      log.resource_type,
      log.resource_id,
    ].join(' ').toLowerCase()
    return searchable.includes(searchTerm.toLowerCase())
  })

  return (
    <AdminLayout>
      <PageHeader
        title="Audit Logs"
        subtitle="Review recorded activity for your institution"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField placeholder="Search recorded events…" size="small" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} sx={{ flex: 1, minWidth: 220, ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }} />
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard style={{ padding: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Timestamp', 'User', 'Action', 'Resource', ''].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', color: 'var(--text-secondary) !important', textTransform: 'uppercase', py: 1.5, borderBottom: '1px solid var(--border-color)' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={5} align="center">Loading audit records…</TableCell></TableRow>
              )}
              {!loading && filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(log => (
                <TableRow key={log.log_id} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell sx={{ fontFamily: 'var(--font-mono) !important', fontSize: '0.78rem !important', color: 'var(--text-secondary) !important', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)' }}>
                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.83rem !important', fontWeight: '600 !important', whiteSpace: 'nowrap', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
                    {log.user || 'Unknown user'}
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{actionLabel(log.action) || '—'}</span>
                  </TableCell>
                  <TableCell sx={{ color: 'var(--text-secondary) !important', fontSize: '0.82rem !important', borderBottom: '1px solid var(--border-color)' }}>
                    {log.resource_type || '—'}
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => { setSelectedLog(log); setDetailOpen(true) }}
                      style={{ background: 'var(--active-bg)', border: '1px solid var(--active-color)', borderRadius: 7, color: 'var(--active-color)', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-sans)', transition: 'all 200ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--active-color-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--active-bg)'}
                    >View</button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            {error && !logs.length
              ? 'Audit records could not be loaded.'
              : logs.length
                ? 'No audit records match your search.'
                : 'No audit events have been recorded for this institution.'}
          </div>
        )}
        <TablePagination
          rowsPerPageOptions={[5,10,25,50]} component="div"
          count={filtered.length} rowsPerPage={rowsPerPage} page={page}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value,10)); setPage(0) }}
          sx={{ borderTop: '1px solid rgba(255,255,255,0.07) !important' }}
        />
      </GlassCard>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'var(--bg-card)', color: 'var(--text-primary)' }}>Log Details</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
          {selectedLog && (() => {
            const entries = detailEntries(selectedLog.details)
            return (
              <Stack spacing={2}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  {[
                    { label: 'TIMESTAMP', value: selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : '—' },
                    { label: 'USER',      value: selectedLog.user || 'Unknown user' },
                    { label: 'ACTION',    value: `${actionIcon(selectedLog.action)} ${actionLabel(selectedLog.action) || '—'}` },
                    { label: 'RESOURCE',  value: selectedLog.resource_type ? detailLabel(selectedLog.resource_type) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</div>
                    </div>
                  ))}
                </div>
                {selectedLog.resource_id && (
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>RESOURCE ID</div>
                    <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.76rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {selectedLog.resource_id}
                    </div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 6 }}>DETAILS</div>
                  {entries.length ? (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
                      {entries.map(([key, value], index) => (
                        <div key={key} style={{
                          display: 'grid', gridTemplateColumns: 'minmax(110px, 0.8fr) 1.6fr', gap: 12,
                          padding: '8px 12px', fontSize: '0.82rem',
                          borderTop: index ? '1px solid var(--border-color)' : 'none',
                        }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>{detailLabel(key)}</span>
                          <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {detailText(selectedLog.details) || '—'}
                    </div>
                  )}
                </div>
              </Stack>
            )
          })()}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setDetailOpen(false)}>Close</OutlineBtn>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  )
}