// src/features/Superadmin/Dashboard.jsx
import { useState } from 'react'
import {
  Box, Grid, Card, CardContent, CardHeader, Typography, Divider, Chip, Stack,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import GroupIcon from '@mui/icons-material/Group'
import SpeedIcon from '@mui/icons-material/Speed'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar
} from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'

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

const StatCard = ({ title, value, change, icon: Icon }) => (
  <Card sx={{ 
    borderRadius: '24px', 
    border: 'none', 
    boxShadow: '0 8px 32px rgba(0,0,0,0.08)', 
    height: '100%', 
    background: '#FFFFFF' 
  }}>
    <CardContent sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '8px', backgroundColor: '#FFF5F5', color: '#8B0000' }}>
          <Icon fontSize="small" />
        </Box>
        <Typography sx={{ color: '#1A1A1A', fontSize: '1rem', fontWeight: 700 }}>
          {title}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: '#1A1A1A', mb: 1.5, lineHeight: 1 }}>
        {value}
      </Typography>
      <Chip
        label={change}
        size="small"
        sx={{
          background: change.includes('+') || change === 'Excellent' ? '#E8F5E9' : '#FFCDD2',
          color: change.includes('+') || change === 'Excellent' ? '#2E7D32' : '#C62828',
          fontWeight: 700,
          fontSize: '0.75rem',
        }}
      />
    </CardContent>
  </Card>
)

export default function SuperAdminDashboard() {
  const [stats] = useState({
    totalTraffic: 15540,
    activeUsers: 10000,
    systemHealth: 99.7,
    institutionCount: 12,
  })

  const mainCardStyles = { 
    borderRadius: '24px', 
    border: 'none', 
    boxShadow: '0 8px 32px rgba(0,0,0,0.08)', 
    background: '#FFFFFF',
    p: 1
  };
  const mainCardHeaderProps = { fontSize: '1.1rem', fontWeight: 700, color: '#1A1A1A' };

  return (
    <SuperAdminLayout>
      <Box>
        {/* Page Title */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#FFFFFF', mb: 1 }}>
            Super Admin Dashboard
          </Typography>
          <Typography sx={{ color: '#FFCDD2', fontSize: '0.95rem' }}>
            System-wide metrics, performance, and management
          </Typography>
        </Box>

        {/* Key Stats Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Total Institutions" value={stats.institutionCount} change="+2 this month" icon={AccountBalanceIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Active Users" value={stats.activeUsers} change="+5.2%" icon={GroupIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="System Uptime" value={`${stats.systemHealth}%`} change="Excellent" icon={SpeedIcon} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="API Traffic" value={stats.totalTraffic} change="+12.5%" icon={SwapHorizIcon} />
          </Grid>
        </Grid>

        {/* User Distribution & Traffic */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={4}>
            <Card sx={mainCardStyles}>
              <CardHeader title="User Type Distribution" titleTypographyProps={mainCardHeaderProps} />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={userTypeData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                      {userTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={8}>
            <Card sx={mainCardStyles}>
              <CardHeader title="User Traffic & System Usage (Last 6 Months)" titleTypographyProps={mainCardHeaderProps} />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={systemStatsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8B0000" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#8B0000" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Area type="monotone" dataKey="traffic" stroke="#8B0000" strokeWidth={3} fillOpacity={1} fill="url(#colorTraffic)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* System Health & Performance */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <Card sx={mainCardStyles}>
              <CardHeader title="System Health Over Time" titleTypographyProps={mainCardHeaderProps} />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={systemStatsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} dy={10} />
                    <YAxis domain={[98, 100]} axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Line type="monotone" dataKey="uptime" stroke="#2E7D32" strokeWidth={3} dot={{ fill: '#2E7D32', strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={mainCardStyles}>
              <CardHeader title="Performance Metrics" titleTypographyProps={mainCardHeaderProps} />
              <CardContent>
                <Stack spacing={2.5}>
                  {[
                    { label: 'API Response Time', value: '145ms', status: 'Excellent', color: '#2E7D32' },
                    { label: 'Database Query Time', value: '23ms', status: 'Good', color: '#1976D2' },
                    { label: 'Server CPU Usage', value: '34%', status: 'Normal', color: '#F57C00' },
                    { label: 'Memory Usage', value: '62%', status: 'Acceptable', color: '#F57C00' },
                    { label: 'Network Bandwidth', value: '2.3 Gbps', status: 'Good', color: '#1976D2' },
                  ].map((metric, idx) => (
                    <Box key={idx}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#64748B' }}>
                          {metric.label}
                        </Typography>
                        <Chip label={metric.status} size="small" sx={{ background: metric.color + '22', color: metric.color, fontWeight: 700, fontSize: '0.7rem' }} />
                      </Box>
                      <Typography sx={{ color: '#1A1A1A', fontWeight: 800, fontSize: '1.1rem' }}>
                        {metric.value}
                      </Typography>
                      {idx !== 4 && <Divider sx={{ mt: 1.5, borderColor: '#F1F5F9' }} />}
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </SuperAdminLayout>
  )
}