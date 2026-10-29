// src/features/Superadmin/AuditLogs.jsx
import { useState } from 'react'
import useDebouncedValue from '../../hooks/useDebouncedValue'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  TextField, Dialog, DialogTitle, DialogContent, Button, Divider, Stack,
} from '@mui/material'
import SuperAdminLayout from './SuperAdminLayout'
import { PageHeader, GlassCard, StatusChip, OutlineBtn } from '../../components/ui'

const mockLogs = [
  { id: 1, timestamp: '2026-05-10 14:32:15', user: 'admin@institution1.edu',  action: 'User Login',              resource: 'Auth',        institution: 'State University',    details: 'Successful login from IP 192.168.1.100',                    status: 'success' },
  { id: 2, timestamp: '2026-05-10 14:15:42', user: 'john.doe@college.edu',    action: 'Created Course',          resource: 'Courses',     institution: 'Tech College',        details: 'Created new course "Advanced Python Programming"',          status: 'success' },
  { id: 3, timestamp: '2026-05-10 13:48:20', user: 'system@atlas.local',      action: 'Database Backup',         resource: 'System',      institution: 'ATLAS',               details: 'Automated daily backup completed successfully',              status: 'success' },
  { id: 4, timestamp: '2026-05-10 13:32:10', user: 'admin@institution2.edu',  action: 'Failed Login Attempt',    resource: 'Auth',        institution: 'Modern Academy',      details: 'Invalid credentials from IP 203.0.113.45',                 status: 'error'   },
  { id: 5, timestamp: '2026-05-10 13:10:55', user: 'jane.smith@uni.edu',      action: 'Generated Assessment',    resource: 'Assessments', institution: 'National University', details: 'Generated 50-question exam for MTH-101',                    status: 'success' },
  { id: 6, timestamp: '2026-05-10 12:45:30', user: 'superadmin@atlas.local',  action: 'System Config Update',   resource: 'Settings',    institution: 'ATLAS',               details: 'Updated SMTP configuration',                                status: 'success' },
  { id: 7, timestamp: '2026-05-10 12:20:15', user: 'admin@institution3.edu',  action: 'Exported User Data',     resource: 'Users',       institution: 'Excellence School',   details: 'Exported 250 user records for compliance audit',            status: 'success' },
  { id: 8, timestamp: '2026-05-10 11:58:40', user: 'api_client_001',          action: 'API Rate Limit Exceeded', resource: 'API',         institution: 'External',            details: 'Rate limit exceeded from integration service',              status: 'warning' },
]

const statusType = s => ({ success: 'success', error: 'error', warning: 'warning' }[s] || 'default')

const inputSx = { '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.05)', borderRadius: 2, fontSize: '0.875rem' }, '& .MuiInputLabel-root': { fontSize: '0.875rem' }, input: { color: '#F0F0F2' } }

export default function AuditLogs() {
  const [page, setPage]             = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm, 250)
  const [filterAction, setFilterAction] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const filtered = mockLogs.filter(log => {
    const q = debouncedSearch.toLowerCase()
    const matchSearch = log.user.toLowerCase().includes(q) || log.action.toLowerCase().includes(q) || log.institution.toLowerCase().includes(q)
    const matchFilter = !filterAction || log.action === filterAction
    return matchSearch && matchFilter
  })

  const uniqueActions = [...new Set(mockLogs.map(l => l.action))]

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Audit Logs"
        subtitle="Complete activity history across all institutions and systems"
      />

      {/* Summary strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Events', value: mockLogs.length, color: '#60AAFF' },
          { label: 'Successful',   value: mockLogs.filter(l=>l.status==='success').length, color: '#5EDA7E' },
          { label: 'Errors',       value: mockLogs.filter(l=>l.status==='error').length,   color: '#86EFAC' },
          { label: 'Warnings',     value: mockLogs.filter(l=>l.status==='warning').length, color: '#FFB74D' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '14px 18px', backdropFilter: 'blur(16px)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', marginBottom: 4 }}>{label.toUpperCase()}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <GlassCard style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField placeholder="Search by user, action, or institution…" size="small" value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0) }} sx={{ flex: 1, minWidth: 220, ...inputSx }} />
          <TextField select size="small" label="Filter by Action" value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(0) }} SelectProps={{ native: true }} sx={{ minWidth: 200, ...inputSx }}>
            <option value="">All Actions</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
          </TextField>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard style={{ padding: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Timestamp', 'User', 'Action', 'Institution', 'Resource', 'Status', ''].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4) !important', textTransform: 'uppercase', py: 1.5 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(log => (
                <TableRow key={log.id} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell sx={{ fontFamily: 'var(--font-mono) !important', fontSize: '0.8rem !important', color: 'rgba(255,255,255,0.45) !important' }}>{log.timestamp}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem !important', fontWeight: '600 !important' }}>{log.user}</TableCell>
                  <TableCell sx={{ fontSize: '0.85rem !important' }}>{log.action}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.5) !important', fontSize: '0.85rem !important' }}>{log.institution}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.4) !important', fontSize: '0.82rem !important' }}>{log.resource}</TableCell>
                  <TableCell><StatusChip label={log.status} type={statusType(log.status)} /></TableCell>
                  <TableCell>
                    <button onClick={() => { setSelectedLog(log); setDetailsOpen(true) }}
                      style={{ background: 'rgba(21,128,61,0.15)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 7, color: '#86EFAC', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: '4px 10px', fontFamily: 'var(--font-sans)', transition: 'all 200ms' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(21,128,61,0.28)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(21,128,61,0.15)'}
                    >View</button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination rowsPerPageOptions={[5,10,25,50]} component="div"
          count={filtered.length} rowsPerPage={rowsPerPage} page={page}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value,10)); setPage(0) }}
          sx={{ borderTop: '1px solid rgba(255,255,255,0.07) !important' }} />
      </GlassCard>

      {/* Details dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log Details</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          {selectedLog && (
            <Stack spacing={2.5}>
              {[
                { label: 'TIMESTAMP',   value: selectedLog.timestamp },
                { label: 'USER',        value: selectedLog.user },
                { label: 'ACTION',      value: selectedLog.action },
                { label: 'RESOURCE',    value: selectedLog.resource },
                { label: 'INSTITUTION', value: selectedLog.institution },
                { label: 'STATUS',      value: <StatusChip label={selectedLog.status} type={statusType(selectedLog.status)} /> },
                { label: 'DETAILS',     value: selectedLog.details },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </SuperAdminLayout>
  )
}