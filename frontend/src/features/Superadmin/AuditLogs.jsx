// src/features/Superadmin/AuditLogs.jsx
import { useState } from 'react'
import {
  Box, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TextField, Stack, Chip, Button, Dialog, DialogTitle, DialogContent, Typography, Divider,
} from '@mui/material'
import FilterListIcon from '@mui/icons-material/FilterList'
import SuperAdminLayout from './SuperAdminLayout'

const mockAuditLogs = [
  { id: 1, timestamp: '2026-05-10 14:32:15', user: 'admin@institution1.edu', action: 'User Login', resource: 'Auth', institution: 'State University', details: 'Successful login from IP 192.168.1.100', status: 'success' },
  { id: 2, timestamp: '2026-05-10 14:15:42', user: 'john.doe@college.edu', action: 'Created Course', resource: 'Courses', institution: 'Tech College', details: 'Created new course "Advanced Python Programming"', status: 'success' },
  { id: 3, timestamp: '2026-05-10 13:48:20', user: 'system@atlas.local', action: 'Database Backup', resource: 'System', institution: 'ATLAS', details: 'Automated daily backup completed successfully', status: 'success' },
  { id: 4, timestamp: '2026-05-10 13:32:10', user: 'admin@institution2.edu', action: 'Failed Login Attempt', resource: 'Auth', institution: 'Modern Academy', details: 'Invalid credentials from IP 203.0.113.45', status: 'error' },
  { id: 5, timestamp: '2026-05-10 13:10:55', user: 'jane.smith@uni.edu', action: 'Generated Assessment', resource: 'Assessments', institution: 'National University', details: 'Generated 50-question exam for MTH-101', status: 'success' },
  { id: 6, timestamp: '2026-05-10 12:45:30', user: 'superadmin@atlas.local', action: 'System Configuration Update', resource: 'Settings', institution: 'ATLAS', details: 'Updated SMTP configuration', status: 'success' },
  { id: 7, timestamp: '2026-05-10 12:20:15', user: 'admin@institution3.edu', action: 'Exported User Data', resource: 'Users', institution: 'Excellence School', details: 'Exported 250 user records for compliance audit', status: 'success' },
  { id: 8, timestamp: '2026-05-10 11:58:40', user: 'api_client_001', action: 'API Rate Limit Exceeded', resource: 'API', institution: 'External Integration', details: 'Rate limit exceeded from integration service', status: 'warning' },
]

const getStatusColor = (status) => {
  switch (status) {
    case 'success': return { bg: '#C8E6C9', color: '#2E7D32' }
    case 'error': return { bg: '#FFCDD2', color: '#C62828' }
    case 'warning': return { bg: '#FFF9C4', color: '#F57F17' }
    default: return { bg: '#E3F2FD', color: '#1565C0' }
  }
}

export default function AuditLogs() {
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const filteredLogs = mockAuditLogs.filter((log) => {
    const matchesSearch = log.user.toLowerCase().includes(searchTerm.toLowerCase()) || log.action.toLowerCase().includes(searchTerm.toLowerCase()) || log.institution.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = !filterAction || log.action === filterAction
    return matchesSearch && matchesFilter
  })

  const handleChangePage = (event, newPage) => setPage(newPage)
  const handleChangeRowsPerPage = (event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0) }
  const handleViewDetails = (log) => { setSelectedLog(log); setDetailsOpen(true) }
  const uniqueActions = [...new Set(mockAuditLogs.map((log) => log.action))]

  // Mockup Styles
  const cardStyles = { borderRadius: 4, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };

  return (
    <SuperAdminLayout>
      <Box>
        {/* Page Title */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1A1A', mb: 1 }}>
            Audit Logs
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Complete activity history across all institutions and systems
          </Typography>
        </Box>

        {/* Filters */}
        <Card sx={{ ...cardStyles, mb: 3 }}>
          <CardContent>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
              <TextField placeholder="Search by user, action, or institution..." variant="outlined" size="small" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }} sx={{ flex: 1, minWidth: 250 }} />
              <TextField select label="Filter by Action" variant="outlined" size="small" value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(0) }} SelectProps={{ native: true }} sx={{ minWidth: 200 }}>
                <option value="">All Actions</option>
                {uniqueActions.map((action) => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </TextField>
              <Button variant="outlined" startIcon={<FilterListIcon />} sx={{ color: '#8B0000', borderColor: '#8B0000' }}>
                More Filters
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Audit Logs Table */}
        <Card sx={cardStyles}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ background: '#FAFAFA', borderBottom: '2px solid #EEE' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Timestamp</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Action</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Institution</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'center' }}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLogs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((log) => {
                  const statusColor = getStatusColor(log.status)
                  return (
                    <TableRow key={log.id} sx={{ '&:hover': { background: '#FAFAFA' } }}>
                      <TableCell sx={{ fontSize: '0.9rem', color: '#666' }}>{log.timestamp}</TableCell>
                      <TableCell sx={{ fontSize: '0.9rem', fontWeight: 600 }}>{log.user}</TableCell>
                      <TableCell sx={{ fontSize: '0.9rem', color: '#1A1A1A' }}>{log.action}</TableCell>
                      <TableCell sx={{ fontSize: '0.9rem', color: '#666' }}>{log.institution}</TableCell>
                      <TableCell>
                        <Chip label={log.status.toUpperCase()} size="small" sx={{ background: statusColor.bg, color: statusColor.color, fontWeight: 600, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <Button size="small" variant="text" onClick={() => handleViewDetails(log)} sx={{ color: '#8B0000' }}>View</Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination rowsPerPageOptions={[5, 10, 25, 50]} component="div" count={filteredLogs.length} rowsPerPage={rowsPerPage} page={page} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} sx={{ borderTop: '1px solid #EEE', '& .MuiTablePagination-root': { p: 2 } }} />
        </Card>

        {/* Details Dialog */}
        <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Audit Log Details</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 3 }}>
            {selectedLog && (
              <Stack spacing={2}>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>TIMESTAMP</Typography><Typography>{selectedLog.timestamp}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>USER</Typography><Typography>{selectedLog.user}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>ACTION</Typography><Typography>{selectedLog.action}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>RESOURCE</Typography><Typography>{selectedLog.resource}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>INSTITUTION</Typography><Typography>{selectedLog.institution}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>STATUS</Typography>
                  <Chip label={selectedLog.status.toUpperCase()} size="small" sx={{ background: getStatusColor(selectedLog.status).bg, color: getStatusColor(selectedLog.status).color, fontWeight: 600 }} />
                </Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>DETAILS</Typography><Typography sx={{ whiteSpace: 'pre-wrap', color: '#666' }}>{selectedLog.details}</Typography></Box>
              </Stack>
            )}
          </DialogContent>
        </Dialog>
      </Box>
    </SuperAdminLayout>
  )
}