// src/features/Superadmin/SystemManagement.jsx
import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Switch, FormControlLabel, Stack, Divider,
} from '@mui/material'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'
import { StatCard, GlassCard, PageHeader, StatusChip, ProgressBar, PrimaryBtn, OutlineBtn } from '../../components/ui'
import LlmHealthPanel from './LlmHealthPanel'

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
  { name: 'Server 1',        status: 'Healthy', cpu: 45, memory: 62, uptime: '99.9%', requests: 12000 },
  { name: 'Server 2',        status: 'Healthy', cpu: 38, memory: 58, uptime: '99.8%', requests: 11500 },
  { name: 'Server 3',        status: 'Warning', cpu: 78, memory: 85, uptime: '99.2%', requests: 9800  },
  { name: 'Database Server', status: 'Healthy', cpu: 32, memory: 67, uptime: '100%',  requests: 5200  },
]

const serverStatusType = s => ({ Healthy: 'success', Warning: 'warning', Critical: 'error' }[s] || 'default')

const tooltipStyle = { background: '#16161E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#F0F0F2', fontFamily: 'var(--font-sans)', fontSize: '0.82rem' }
const axisStyle = { fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'var(--font-sans)' }
const inputSx = { '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.05)', borderRadius: 2, fontSize: '0.875rem' }, '& .MuiInputLabel-root': { fontSize: '0.875rem' }, input: { color: '#F0F0F2' } }

export default function SystemManagement() {
  const [maintenanceOpen, setMaintenanceOpen]   = useState(false)
  const [backupOpen, setBackupOpen]             = useState(false)
  const [maintenanceMode, setMaintenanceMode]   = useState(false)
  const [backupSchedule, setBackupSchedule]     = useState(true)

  return (
    <SuperAdminLayout>
      <PageHeader
        title="System Management"
        subtitle="Monitor system health, manage resources, and perform maintenance"
      />

      <LlmHealthPanel />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard title="System Health"    value="99.7%" icon="⚡" trend="Excellent" accent="#5EDA7E" />
        <StatCard title="Disk Usage"       value="78%"   icon="💾" accent="#FFB74D" />
        <StatCard title="Active Cloud Svc" value="12"    icon="☁️" accent="#60AAFF" />
        <StatCard title="Critical Alerts"  value="0"     icon="🛡️" trend="All Clear" accent="#5EDA7E" />
      </div>

      {/* Resource usage chart */}
      <GlassCard title="System Resources (24h)" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={performanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gCpu"    x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#16A34A" stopOpacity={0.45}/><stop offset="95%" stopColor="#16A34A" stopOpacity={0}/></linearGradient>
              <linearGradient id="gMemory" x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#0A84FF" stopOpacity={0.45}/><stop offset="95%" stopColor="#0A84FF" stopOpacity={0}/></linearGradient>
              <linearGradient id="gDisk"   x1="0" y1="0" x2="0" y2="1"><stop offset="5%"  stopColor="#FF9F0A" stopOpacity={0.4}/><stop offset="95%" stopColor="#FF9F0A" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="time" tick={axisStyle} axisLine={false} tickLine={false} />
            <YAxis domain={[0,100]} tick={axisStyle} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend formatter={v => <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{v}</span>} />
            <Area type="monotone" dataKey="cpu"    name="CPU %"    stroke="#16A34A" strokeWidth={2} fill="url(#gCpu)"    dot={false} />
            <Area type="monotone" dataKey="memory" name="Memory %" stroke="#0A84FF" strokeWidth={2} fill="url(#gMemory)" dot={false} />
            <Area type="monotone" dataKey="disk"   name="Disk %"   stroke="#FF9F0A" strokeWidth={2} fill="url(#gDisk)"   dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </GlassCard>

      {/* Resource gauges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'CPU Usage',    value: 52, color: '#16A34A' },
          { label: 'Memory Usage', value: 65, color: '#0A84FF' },
          { label: 'Disk Usage',   value: 78, color: '#FF9F0A' },
        ].map(({ label, value, color }) => (
          <GlassCard key={label}>
            <ProgressBar label={label} value={value} color={color} />
          </GlassCard>
        ))}
      </div>

      {/* Server status table */}
      <GlassCard title="Server Status" style={{ marginBottom: 16, padding: 0 }}>
        <div style={{ padding: '18px 22px 0' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Server Status</h3>
        </div>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Server', 'Status', 'CPU', 'Memory', 'Uptime', 'Requests/min'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4) !important', textTransform: 'uppercase', py: 1.5 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {serverData.map((srv, i) => (
                <TableRow key={i} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell sx={{ fontWeight: '700 !important' }}>{srv.name}</TableCell>
                  <TableCell><StatusChip label={srv.status} type={serverStatusType(srv.status)} /></TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', minWidth: 50 }}>
                        <div style={{ height: '100%', width: `${srv.cpu}%`, background: srv.cpu > 70 ? '#FF453A' : '#16A34A', borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: 30 }}>{srv.cpu}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', minWidth: 50 }}>
                        <div style={{ height: '100%', width: `${srv.memory}%`, background: srv.memory > 80 ? '#FF9F0A' : '#0A84FF', borderRadius: 99 }} />
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', minWidth: 30 }}>{srv.memory}%</span>
                    </div>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'var(--font-mono) !important', fontSize: '0.82rem !important', color: 'var(--green) !important' }}>{srv.uptime}</TableCell>
                  <TableCell sx={{ fontFamily: 'var(--font-mono) !important', fontSize: '0.82rem !important' }}>{srv.requests.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </GlassCard>

      {/* Maintenance + Backup */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GlassCard title="Maintenance Mode">
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: 0 }}>
            Enable maintenance mode to perform system updates without affecting users.
          </p>
          <FormControlLabel
            control={<Switch checked={maintenanceMode} onChange={e => setMaintenanceMode(e.target.checked)} />}
            label={<span style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Enable Maintenance Mode</span>}
          />
          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', fontStyle: 'italic' }}>
            When enabled: users see a maintenance page, API requests are queued.
          </p>
          <PrimaryBtn onClick={() => setMaintenanceOpen(true)} disabled={!maintenanceMode} style={{ marginTop: 8 }}>
            Configure Maintenance
          </PrimaryBtn>
        </GlassCard>

        <GlassCard title="Database & Backups">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.07em', marginBottom: 4 }}>LAST BACKUP</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>2026-05-10 at 02:00 AM</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2 }}>12 hours ago</div>
            </div>
            <FormControlLabel
              control={<Switch checked={backupSchedule} onChange={e => setBackupSchedule(e.target.checked)} />}
              label={<span style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Daily Automatic Backups (2 AM UTC)</span>}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <PrimaryBtn onClick={() => setBackupOpen(true)}>Trigger Backup</PrimaryBtn>
              <OutlineBtn>View History</OutlineBtn>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Maintenance dialog */}
      <Dialog open={maintenanceOpen} onClose={() => setMaintenanceOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configure Maintenance Mode</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2.5}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: 0 }}>Maintenance mode displays a custom message and queues API requests.</p>
            <TextField multiline rows={4} label="Maintenance Message" fullWidth defaultValue="We are currently performing system maintenance. We'll be back shortly." sx={inputSx} />
            <TextField type="number" label="Duration (hours)" fullWidth defaultValue={2} inputProps={{ min: 1, max: 24 }} sx={inputSx} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => setMaintenanceOpen(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={() => setMaintenanceOpen(false)}>Enable Maintenance</PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Backup dialog */}
      <Dialog open={backupOpen} onClose={() => setBackupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Trigger Manual Backup</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>This will create a full backup of all databases and user files. This may take 10–15 minutes and will not affect user access.</p>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.07em', marginBottom: 4 }}>ESTIMATED SIZE</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#86EFAC' }}>~2.4 GB</div>
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => setBackupOpen(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={() => setBackupOpen(false)}>Start Backup</PrimaryBtn>
        </DialogActions>
      </Dialog>
    </SuperAdminLayout>
  )
}