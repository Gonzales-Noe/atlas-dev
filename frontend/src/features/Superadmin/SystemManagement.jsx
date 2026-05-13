// src/features/Superadmin/SystemManagement.jsx
import { useState } from 'react'
import {
  Box, Card, CardContent, CardHeader, Grid, Typography, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Switch, FormControlLabel, Divider, TextField,
} from '@mui/material'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety'
import StorageIcon from '@mui/icons-material/Storage'
import CloudIcon from '@mui/icons-material/Cloud'
import WarningIcon from '@mui/icons-material/Warning'
import SuperAdminLayout from './SuperAdminLayout'

const performanceData = [
  { time: '00:00', cpu: 45, memory: 62, disk: 78 },
  { time: '04:00', cpu: 38, memory: 58, disk: 77 },
  { time: '08:00', cpu: 52, memory: 65, disk: 78 },
  { time: '12:00', cpu: 67, memory: 72, disk: 79 },
  { time: '16:00', cpu: 61, memory: 68, disk: 79 },
  { time: '20:00', cpu: 48, memory: 63, disk: 78 },
  { time: '23:59', cpu: 42, memory: 60, disk: 77 },
]

const serverData = [
  { name: 'Server 1', status: 'Healthy', cpu: 45, memory: 62, uptime: '99.9%', requests: 12000 },
  { name: 'Server 2', status: 'Healthy', cpu: 38, memory: 58, uptime: '99.8%', requests: 11500 },
  { name: 'Server 3', status: 'Warning', cpu: 78, memory: 85, uptime: '99.2%', requests: 9800 },
  { name: 'Database Server', status: 'Healthy', cpu: 32, memory: 67, uptime: '100%', requests: 5200 },
]

const getStatusColor = (status) => {
  switch (status) {
    case 'Healthy': return { bg: '#C8E6C9', color: '#2E7D32' }
    case 'Warning': return { bg: '#FFF9C4', color: '#F57F17' }
    case 'Critical': return { bg: '#FFCDD2', color: '#C62828' }
    default: return { bg: '#E3F2FD', color: '#1565C0' }
  }
}

const StatBox = ({ title, value, unit, icon: Icon }) => (
  <Card sx={{ borderRadius: 4, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
    <CardContent sx={{ textAlign: 'center', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <Icon sx={{ fontSize: '2rem', color: '#922724' }} />
      </Box>
      <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#1A1A1A' }}>
        {value}
        {unit && <span style={{ fontSize: '1rem', marginLeft: 4 }}>{unit}</span>}
      </Typography>
    </CardContent>
  </Card>
)

export default function SystemManagement() {
  const [maintenanceOpen, setMaintenanceOpen] = useState(false)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [backupSchedule, setBackupSchedule] = useState(true)

  // Mockup Styles
  const cardStyles = { borderRadius: 4, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
  const cardHeaderProps = { fontSize: '1.2rem', fontWeight: 800, color: '#922724' };

  return (
    <SuperAdminLayout>
      <Box>
        {/* Page Title */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1A1A', mb: 1 }}>
            System Management
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Monitor system health, manage resources, and perform maintenance
          </Typography>
        </Box>

        {/* System Status Overview */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatBox title="Overall System Health" value="99.7" unit="%" icon={HealthAndSafetyIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatBox title="Disk Usage" value="78" unit="%" icon={StorageIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatBox title="Cloud Services" value="12" unit="Active" icon={CloudIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatBox title="Critical Alerts" value="0" unit="Issues" icon={() => <WarningIcon sx={{ fontSize: '2rem', color: '#2E7D32' }} />} />
          </Grid>
        </Grid>

        {/* Performance Monitoring */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12}>
            <Card sx={cardStyles}>
              <CardHeader title="System Resources Over Time" titleTypographyProps={cardHeaderProps} />
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <AreaChart data={performanceData}>
                    <defs>
                      <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B0000" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#8B0000" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1976D2" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#1976D2" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorDisk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F57C00" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#F57C00" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                    <XAxis dataKey="time" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="cpu" stroke="#8B0000" fillOpacity={1} fill="url(#colorCpu)" name="CPU %" />
                    <Area type="monotone" dataKey="memory" stroke="#1976D2" fillOpacity={1} fill="url(#colorMemory)" name="Memory %" />
                    <Area type="monotone" dataKey="disk" stroke="#F57C00" fillOpacity={1} fill="url(#colorDisk)" name="Disk %" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Server Status */}
        <Card sx={{ ...cardStyles, mb: 4 }}>
          <CardHeader title="Server Status" titleTypographyProps={cardHeaderProps} />
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ background: '#FAFAFA', borderBottom: '2px solid #EEE' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Server</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'right' }}>CPU Usage</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'right' }}>Memory Usage</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'right' }}>Uptime</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'right' }}>Requests/min</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {serverData.map((server, idx) => {
                  const statusColor = getStatusColor(server.status)
                  return (
                    <TableRow key={idx} sx={{ '&:hover': { background: '#FAFAFA' } }}>
                      <TableCell sx={{ fontWeight: 600, color: '#1A1A1A' }}>{server.name}</TableCell>
                      <TableCell>
                        <Chip label={server.status} size="small" sx={{ background: statusColor.bg, color: statusColor.color, fontWeight: 600, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', color: '#666' }}>{server.cpu}%</TableCell>
                      <TableCell sx={{ textAlign: 'right', color: '#666' }}>{server.memory}%</TableCell>
                      <TableCell sx={{ textAlign: 'right', color: '#666' }}>{server.uptime}</TableCell>
                      <TableCell sx={{ textAlign: 'right', color: '#666' }}>{server.requests.toLocaleString()}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        {/* System Maintenance & Backups */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Maintenance Mode" titleTypographyProps={cardHeaderProps} />
              <CardContent>
                <Stack spacing={2}>
                  <Typography sx={{ color: '#666', fontSize: '0.9rem' }}>
                    Enable maintenance mode to perform system updates and maintenance without affecting users.
                  </Typography>
                  <FormControlLabel
                    control={<Switch checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />}
                    label="Enable Maintenance Mode"
                  />
                  <Typography sx={{ color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    When enabled: Users will see a maintenance page. API requests will be queued.
                  </Typography>
                  <Button variant="contained" disabled={!maintenanceMode} sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }} onClick={() => setMaintenanceOpen(true)}>
                    Configure Maintenance
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Database & Backups" titleTypographyProps={cardHeaderProps} />
              <CardContent>
                <Stack spacing={2}>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 1 }}>Last Backup</Typography>
                    <Typography sx={{ color: '#666', fontSize: '0.9rem' }}>2026-05-10 at 02:00 AM (12 hours ago)</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 1 }}>Backup Schedule</Typography>
                    <FormControlLabel control={<Switch checked={backupSchedule} onChange={(e) => setBackupSchedule(e.target.checked)} />} label="Daily Automatic Backups (2 AM UTC)" />
                  </Box>
                  <Divider />
                  <Button variant="outlined" sx={{ borderColor: '#922724', color: '#922724' }} onClick={() => setBackupDialogOpen(true)}>
                    Trigger Manual Backup
                  </Button>
                  <Button variant="outlined" sx={{ borderColor: '#666', color: '#666' }}>
                    View Backup History
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Dialogs */}
        <Dialog open={maintenanceOpen} onClose={() => setMaintenanceOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Configure Maintenance Mode</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={2}>
              <Typography sx={{ color: '#666', fontSize: '0.9rem' }}>Maintenance mode will display a custom message to users and queue API requests.</Typography>
              <TextField multiline rows={4} label="Maintenance Message" variant="outlined" fullWidth defaultValue="We are currently performing system maintenance. We'll be back online shortly." />
              <Typography sx={{ color: '#666', fontSize: '0.9rem' }}>Estimated duration:</Typography>
              <TextField type="number" label="Duration (hours)" variant="outlined" defaultValue={2} inputProps={{ min: 1, max: 24 }} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setMaintenanceOpen(false)}>Cancel</Button>
            <Button variant="contained" sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }} onClick={() => setMaintenanceOpen(false)}>Enable Maintenance Mode</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={backupDialogOpen} onClose={() => setBackupDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Trigger Manual Backup</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 3 }}>
            <Typography sx={{ color: '#666', fontSize: '0.9rem', mb: 2 }}>This will create a full backup of all databases and user files. This process may take 10-15 minutes and will not affect user access.</Typography>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Backup Size Estimate:</Typography>
            <Typography sx={{ color: '#922724', fontSize: '1.2rem', fontWeight: 700 }}>~2.4 GB</Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setBackupDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }} onClick={() => setBackupDialogOpen(false)}>Start Backup</Button>
          </DialogActions>
        </Dialog>

      </Box>
    </SuperAdminLayout>
  )
}