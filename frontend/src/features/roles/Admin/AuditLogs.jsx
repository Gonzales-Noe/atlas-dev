import { useEffect, useState } from 'react'
import {
  Box, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Paper, CircularProgress
} from '@mui/material'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        // NOTE: You will need to create this endpoint in Django!
        const { data } = await api.get('/auth/audit-logs/')
        setLogs(data)
      } catch (err) {
        console.error("Failed to fetch audit logs:", err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()
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
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ textAlign: 'center', py: 5 }}>
                        <CircularProgress sx={{ color: '#8B0000' }} />
                      </TableCell>
                    </TableRow>
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ textAlign: 'center', py: 5, color: '#888' }}>
                        The Audit Logs API endpoint has not been created in Django yet! 
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ textAlign: 'center', py: 5, color: '#888' }}>
                        No recent activity found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{log.user}</TableCell>
                        <TableCell>{log.action}</TableCell>
                        <TableCell sx={{ color: '#666' }}>{log.details}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>
    </AdminLayout>
  )
}