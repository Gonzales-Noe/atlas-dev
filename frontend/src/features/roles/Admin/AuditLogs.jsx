// src/features/Admin/AuditLogs.jsx
import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions, Divider, Stack,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AdminLayout from './AdminLayout'
import { PageHeader, GlassCard, StatusChip, OutlineBtn } from '../../../components/ui'

const mockLogs = [
  { id: 1,  timestamp: '2026-05-10 10:30:00', user: 'faculty.smoke@example.com', action: 'Created syllabus',        details: 'Course: CS101 — Intro to Programming',   status: 'success' },
  { id: 2,  timestamp: '2026-05-10 09:15:00', user: 'faculty.smoke@example.com', action: 'Generated assessment',    details: 'Module: Week 1 — Variables & Data Types', status: 'success' },
  { id: 3,  timestamp: '2026-05-09 14:45:00', user: 'admin.smoke@example.com',   action: 'Updated faculty account', details: 'User: dr.alice.johnson — status changed', status: 'success' },
  { id: 4,  timestamp: '2026-05-09 11:20:00', user: 'faculty.smoke@example.com', action: 'Added module',            details: 'Course: MATH201 — Module 3 added',        status: 'success' },
  { id: 5,  timestamp: '2026-05-09 08:05:00', user: 'admin.smoke@example.com',   action: 'Failed Login Attempt',    details: 'Invalid credentials — IP 192.168.2.45',   status: 'error'   },
  { id: 6,  timestamp: '2026-05-08 16:00:00', user: 'faculty.smoke@example.com', action: 'Graded submission',       details: 'Assessment: Quiz 1 — 28 submissions',     status: 'success' },
  { id: 7,  timestamp: '2026-05-08 13:30:00', user: 'admin.smoke@example.com',   action: 'Exported audit log',      details: 'Date range: May 1–7 2026',                status: 'success' },
  { id: 8,  timestamp: '2026-05-07 10:10:00', user: 'faculty.smoke@example.com', action: 'Uploaded knowledge file', details: 'File: syllabus_ref_CS101.pdf (2.1MB)',    status: 'success' },
  { id: 9,  timestamp: '2026-05-07 09:00:00', user: 'system',                    action: 'Auto-backup triggered',   details: 'Scheduled backup completed',              status: 'success' },
  { id: 10, timestamp: '2026-05-06 15:55:00', user: 'faculty.smoke@example.com', action: 'AI rate limit warning',   details: 'Usage at 90% of monthly AI call quota',   status: 'warning' },
]

const statusType = s => ({ success: 'success', error: 'error', warning: 'warning' }[s] || 'default')
const actionIcon = a => {
  if (a.toLowerCase().includes('login'))    return '🔐'
  if (a.toLowerCase().includes('syllabus')) return '📋'
  if (a.toLowerCase().includes('assess'))   return '📝'
  if (a.toLowerCase().includes('module'))   return '🧩'
  if (a.toLowerCase().includes('grade'))    return '⭐'
  if (a.toLowerCase().includes('upload'))   return '📁'
  if (a.toLowerCase().includes('export'))   return '⬇️'
  if (a.toLowerCase().includes('backup'))   return '☁️'
  if (a.toLowerCase().includes('ai'))       return '🤖'
  return '📌'
}

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' }
}

export default function AdminAuditLogs() {
  const [logs, setLogs]               = useState([])
  const [filtered, setFiltered]       = useState([])
  const [searchTerm, setSearchTerm]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage]               = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [selectedLog, setSelectedLog] = useState(null)
  const [detailOpen, setDetailOpen]   = useState(false)

  useEffect(() => { setLogs(mockLogs); setFiltered(mockLogs) }, [])

  useEffect(() => {
    const q = searchTerm.toLowerCase()
    setFiltered(logs.filter(l => {
      const matchSearch = l.user.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.details.toLowerCase().includes(q)
      const matchStatus = !filterStatus || l.status === filterStatus
      return matchSearch && matchStatus
    }))
    setPage(0)
  }, [searchTerm, filterStatus, logs])

  return (
    <AdminLayout>
      <PageHeader
        title="Audit Logs"
        subtitle="Track all activities and changes within your institution"
      />

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Events', value: logs.length,                               color: '#60AAFF' },
          { label: 'Success',      value: logs.filter(l=>l.status==='success').length, color: '#5EDA7E' },
          { label: 'Errors',       value: logs.filter(l=>l.status==='error').length,   color: '#FF6B6B' },
          { label: 'Warnings',     value: logs.filter(l=>l.status==='warning').length, color: '#FFB74D' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 18px', backdropFilter: 'blur(16px)' }}>
            <div style={{ fontSize: '0.69rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.07em', marginBottom: 4 }}>{label.toUpperCase()}</div>
            <div style={{ fontSize: '1.9rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField placeholder="Search by user, action, or details…" size="small" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} sx={{ flex: 1, minWidth: 220, ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }} />
          <TextField select size="small" label="Status" value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)} SelectProps={{ native: true }} sx={{ minWidth: 140, ...inputSx }}>
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
          </TextField>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard style={{ padding: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Timestamp', 'User', 'Action', 'Details', 'Status', ''].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', color: 'var(--text-secondary) !important', textTransform: 'uppercase', py: 1.5, borderBottom: '1px solid var(--border-color)' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(log => (
                <TableRow key={log.id} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell sx={{ fontFamily: 'var(--font-mono) !important', fontSize: '0.78rem !important', color: 'var(--text-secondary) !important', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-color)' }}>
                    {log.timestamp}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.83rem !important', fontWeight: '600 !important', whiteSpace: 'nowrap', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)' }}>
                    {log.user}
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: '0.9rem' }}>{actionIcon(log.action)}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{log.action}</span>
                    </div>
                  </TableCell>
                  <TableCell sx={{ color: 'var(--text-secondary) !important', fontSize: '0.82rem !important', maxWidth: 280, borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.details}
                    </div>
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}><StatusChip label={log.status} type={statusType(log.status)} /></TableCell>
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
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            No logs match your filters.
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
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          {selectedLog && (
            <Stack spacing={2.5}>
              {[
                { label: 'TIMESTAMP', value: selectedLog.timestamp },
                { label: 'USER',      value: selectedLog.user },
                { label: 'ACTION',    value: `${actionIcon(selectedLog.action)} ${selectedLog.action}` },
                { label: 'DETAILS',   value: selectedLog.details },
                { label: 'STATUS',    value: <StatusChip label={selectedLog.status} type={statusType(selectedLog.status)} /> },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
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