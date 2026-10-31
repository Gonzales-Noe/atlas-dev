// src/features/roles/Admin/AuditLogs.jsx
import { useEffect, useState } from 'react'
import useDebouncedValue from '../../../hooks/useDebouncedValue'
import RouteSkeleton from '../../../components/RouteSkeleton'
import { StatusNotice } from '../../../components/StatusNotice'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions, Divider, Stack,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import {
  BookOpen, Bot, ClipboardList, Cloud, Download, FilePen, FileText,
  FolderUp, LayoutGrid, Lock, Pause, Pin, Play, Star, Trash2, UserPlus,
} from 'lucide-react'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import { PageHeader, GlassCard, OutlineBtn } from '../../../components/ui'

function ActionIcon({ action }) {
  const key = (action || '').toLowerCase()
  const pairs = [
    ['faculty_account_created', UserPlus],
    ['course_assigned', BookOpen],
    ['account_deactivated', Pause],
    ['account_reactivated', Play],
    ['account_deleted', Trash2],
    ['institution_deactivated', Pause],
    ['institution_reactivated', Play],
    ['institution_deleted', Trash2],
    ['admin_document_upload', FileText],
    ['login', Lock],
    ['syllabus', ClipboardList],
    ['assess', FilePen],
    ['module', LayoutGrid],
    ['grade', Star],
    ['upload', FolderUp],
    ['export', Download],
    ['backup', Cloud],
    ['ai', Bot],
  ]
  const match = pairs.find(([token]) => key.includes(token))
  const Icon = match ? match[1] : Pin
  return <Icon size={16} strokeWidth={2.25} aria-hidden="true" style={{ flexShrink: 0 }} />
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

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

export default function AdminAuditLogs() {
  const [logs, setLogs]               = useState([])
  const [total, setTotal]             = useState(0)
  const [searchTerm, setSearchTerm]   = useState('')
  const [page, setPage]               = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [selectedLog, setSelectedLog] = useState(null)
  const [detailOpen, setDetailOpen]   = useState(false)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm, 250)

  useEffect(() => {
    let mounted = true
    const params = new URLSearchParams({
      page: String(page + 1),
      page_size: String(rowsPerPage),
    })
    const query = debouncedSearch.trim()
    if (query) params.set('q', query)
    api.get(`/integrations/audit-logs/?${params.toString()}`)
      .then(({ data }) => {
        if (!mounted) return
        const nextLogs = data.logs || []
        setLogs(nextLogs)
        setTotal(typeof data.count === 'number' ? data.count : nextLogs.length)
      })
      .catch(err => {
        if (!mounted) return
        setLogs([])
        setTotal(0)
        setError(err.response?.data?.detail || 'Failed to load audit records.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [page, rowsPerPage, debouncedSearch])

  return (
    <AdminLayout>
      <PageHeader
        title="Audit Logs"
        subtitle="Review recorded activity for your institution"
      />

      <StatusNotice message={error} severity="error" />

      {/* Filters */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField placeholder="Search recorded events…" size="small" value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0) }} sx={{ flex: 1, minWidth: 220, ...inputSx }}
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
                <TableRow>
                  <TableCell colSpan={5} sx={{ borderBottom: 'none', p: 0 }}>
                    <RouteSkeleton compact />
                  </TableCell>
                </TableRow>
              )}
              {!loading && logs.map(log => (
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
                    {log.summary_resource || actionLabel(log.resource_type) || '—'}
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
        {!loading && logs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            {error
              ? 'Audit records could not be loaded.'
              : debouncedSearch.trim()
                ? 'No audit records match your search.'
                : 'No audit events have been recorded for this institution.'}
          </div>
        )}
        <TablePagination
          rowsPerPageOptions={[5,10,25,50]} component="div"
          count={total} rowsPerPage={rowsPerPage} page={page}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value,10)); setPage(0) }}
          sx={{ borderTop: '1px solid var(--border-color) !important' }}
        />
      </GlassCard>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: 'var(--bg-card)', color: 'var(--text-primary)' }}>Log Details</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
          {selectedLog && (
            <Stack spacing={2}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                {[
                  { label: 'TIMESTAMP', value: selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : '—' },
                  { label: 'USER', value: selectedLog.user || 'Unknown user' },
                  { label: 'ACTION', value: (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ActionIcon action={selectedLog.action} />
                      {actionLabel(selectedLog.action) || '—'}
                    </span>
                  ) },
                  { label: 'ABOUT', value: selectedLog.summary_resource || actionLabel(selectedLog.resource_type) || '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {selectedLog.summary || `${actionLabel(selectedLog.action)}.`}
              </div>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setDetailOpen(false)}>Close</OutlineBtn>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  )
}