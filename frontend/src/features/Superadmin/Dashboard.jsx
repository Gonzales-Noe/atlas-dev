// src/features/Superadmin/Dashboard.jsx
import { useState } from 'react'
import {
  Box, Grid, Card, CardContent, CardHeader, Typography, Divider, Chip, Stack, IconButton
} from '@mui/material'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'

// Mock data for stats remains UNCHANGED
const systemStatsData = [
  { name: 'Jan', traffic: 4000, usage: 2400, uptime: 99.8 },
  { name: 'Feb', traffic: 3000, usage: 1398, uptime: 99.9 },
  { name: 'Mar', traffic: 2000, usage: 9800, uptime: 99.2 },
  { name: 'Apr', traffic: 2780, usage: 3908, uptime: 99.7 },
  { name: 'May', traffic: 1890, usage: 4800, uptime: 99.5 },
  { name: 'Jun', traffic: 2390, usage: 3800, uptime: 99.9 },
]

const userTypeData = [
  { name: 'Faculty', value: 1250 },
  { name: 'Students', value: 8500 },
  { name: 'Admins', value: 150 },
]

const COLORS = ['#8B0000', '#E57373', '#FFCDD2']

// Styled to match the mockup cards (white bg, rounded, red title)
const StatCard = ({ title, value, change, color = '#1A1A1A' }) => (
  <Card sx={{ borderRadius: 4, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', height: '100%', position: 'relative' }}>
    <IconButton sx={{ position: 'absolute', top: 12, right: 12, color: '#888' }} size="small">
      <MoreHorizIcon />
    </IconButton>
    <CardContent sx={{ p: 3 }}>
      <Typography sx={{ color: '#922724', fontSize: '1.2rem', mb: 2, fontWeight: 800 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: color, mb: 1 }}>
        {value}
      </Typography>
      <Chip
        label={change}
        size="small"
        sx={{
          background: change.includes('+') ? '#C8E6C9' : '#FFCDD2',
          color: change.includes('+') ? '#2E7D32' : '#C62828',
          fontWeight: 600,
          fontSize: '0.75rem',
        }}
      />
    </CardContent>
  </Card>
)

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState({
    totalTraffic: 15540,
    activeUsers: 10000,
    systemHealth: 99.7,
    institutionCount: 12,
  })

  // Shared styles for the layout cards
  const cardStyles = { borderRadius: 4, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
  const cardHeaderProps = { fontSize: '1.2rem', fontWeight: 800, color: '#922724' };

  return (
    <SuperAdminLayout>
      <Box>
        {/* Page Title - Now White to contrast deep red background */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#FFFFFF', mb: 1 }}>
            Super Admin Dashboard
          </Typography>
          <Typography sx={{ color: '#FFCDD2', fontSize: '0.95rem' }}>
            System-wide metrics, performance, and management
          </Typography>
        </Box>

        {/* Key Stats Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Total Institutions" value={stats.institutionCount} change="+2 this month" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Active Users" value={stats.activeUsers} change="+5.2%" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="System Uptime" value={`${stats.systemHealth}%`} change="Excellent" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="API Traffic" value={stats.totalTraffic} change="+12.5%" />
          </Grid>
        </Grid>

        {/* User Distribution & Traffic */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={4}>
            <Card sx={cardStyles}>
              <CardHeader title="User Type Distribution" titleTypographyProps={cardHeaderProps} />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={userTypeData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                      {userTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={8}>
            <Card sx={cardStyles}>
              <CardHeader title="Statistics (Last 6 Months)" titleTypographyProps={cardHeaderProps} />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={systemStatsData}>
                    <defs>
                      <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B0000" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#8B0000" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="traffic" stroke="#8B0000" fillOpacity={1} fill="url(#colorTraffic)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* System Health & Uptime */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="System Health Over Time" titleTypographyProps={cardHeaderProps} />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={systemStatsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[98, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="uptime" stroke="#2E7D32" strokeWidth={2} dot={{ fill: '#2E7D32', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Performance Metrics" titleTypographyProps={cardHeaderProps} />
              <CardContent>
                <Stack spacing={2}>
                  {[
                    { label: 'API Response Time', value: '145ms', status: 'Excellent', color: '#2E7D32' },
                    { label: 'Database Query Time', value: '23ms', status: 'Good', color: '#1976D2' },
                    { label: 'Server CPU Usage', value: '34%', status: 'Normal', color: '#F57C00' },
                    { label: 'Memory Usage', value: '62%', status: 'Acceptable', color: '#F57C00' },
                    { label: 'Network Bandwidth', value: '2.3 Gbps', status: 'Good', color: '#1976D2' },
                  ].map((metric, idx) => (
                    <Box key={idx}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{metric.label}</Typography>
                        <Chip label={metric.status} size="small" sx={{ background: metric.color + '22', color: metric.color, fontWeight: 600, fontSize: '0.7rem' }} />
                      </Box>
                      <Typography sx={{ color: '#1A1A1A', fontWeight: 700, fontSize: '1.1rem' }}>{metric.value}</Typography>
                      <Divider sx={{ mt: 1 }} />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        {/* Content preserved below... */}
        
      </Box>
    </SuperAdminLayout>
  )
}