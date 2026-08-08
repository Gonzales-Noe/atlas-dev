import { useEffect, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
} from '@mui/material'
import AdminLayout from './AdminLayout'

const mockLogs = [
  { id: 1, timestamp: '2026-05-10 10:30:00', user: 'faculty@atlas.local', action: 'Created syllabus', details: 'Course: CS101' },
  { id: 2, timestamp: '2026-05-10 09:15:00', user: 'faculty@atlas.local', action: 'Generated assessment', details: 'Module: Week 1' },
  { id: 3, timestamp: '2026-05-09 14:45:00', user: 'admin@atlas.local', action: 'Updated faculty account', details: 'User: prof.john' },
  { id: 4, timestamp: '2026-05-09 11:20:00', user: 'faculty@atlas.local', action: 'Added module', details: 'Course: MATH201' },
  { id: 5, timestamp: '2026-05-08 16:00:00', user: 'faculty@atlas.local', action: 'Graded submission', details: 'Assessment: Quiz 1' },
]

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([])

  useEffect(() => {
    // Mock data - in real app, fetch from API
    setLogs(mockLogs)
  }, [])

  return (
    <AdminLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            Institution Audit Logs
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Track all activities and changes within your institution.
          </Typography>
        </Box>

        <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
          <CardHeader title="Recent Activity" titleTypographyProps={{ fontWeight: 700 }} />
          <CardContent>
            <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Timestamp</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.timestamp}</TableCell>
                      <TableCell>{log.user}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell>{log.details}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>
    </AdminLayout>
  )
}