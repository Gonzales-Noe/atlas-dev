// src/features/Superadmin/Dashboard.jsx
import { useState } from 'react'
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Divider,
  Chip,
  Stack,
} from '@mui/material'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'

// Mock data for stats
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

const StatCard = ({ title, value, change, color = '#8B0000' }) => (
  <Card sx={{ boxShadow: 'none', border: '1px solid #EEE', height: '100%' }}>
    <CardContent>
      <Typography sx={{ color: '#888', fontSize: '0.85rem', mb: 1, fontWeight: 500 }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: '2rem', fontWeight: 700, color: color, mb: 1 }}>
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

  return (
    <SuperAdminLayout>
      <Box sx={{ p: 3 }}>
        {/* Page Title */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1A1A', mb: 1 }}>
            Super Admin Dashboard
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            System-wide metrics, performance, and management
          </Typography>
        </Box>

        {/* Key Stats Cards */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Total Institutions" value={stats.institutionCount} change="+2 this month" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="Active Users" value={stats.activeUsers} change="+5.2%" color="#2E7D32" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="System Uptime" value={`${stats.systemHealth}%`} change="Excellent" color="#1976D2" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard title="API Traffic (req/min)" value={stats.totalTraffic} change="+12.5%" color="#F57C00" />
          </Grid>
        </Grid>

        {/* User Distribution & Traffic */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* User Type Distribution */}
          <Grid item xs={12} md={4}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
              <CardHeader
                title="User Type Distribution"
                titleTypographyProps={{ fontSize: '1rem', fontWeight: 700 }}
              />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={userTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
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

          {/* System Traffic Over Time */}
          <Grid item xs={12} md={8}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
              <CardHeader
                title="User Traffic & System Usage (Last 6 Months)"
                titleTypographyProps={{ fontSize: '1rem', fontWeight: 700 }}
              />
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
                    <Area
                      type="monotone"
                      dataKey="traffic"
                      stroke="#8B0000"
                      fillOpacity={1}
                      fill="url(#colorTraffic)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* System Health & Uptime */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
              <CardHeader
                title="System Health Over Time"
                titleTypographyProps={{ fontSize: '1rem', fontWeight: 700 }}
              />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={systemStatsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                    <XAxis dataKey="name" />
                    <YAxis domain={[98, 100]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="uptime"
                      stroke="#2E7D32"
                      strokeWidth={2}
                      dot={{ fill: '#2E7D32', r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Performance Metrics */}
          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
              <CardHeader
                title="Performance Metrics"
                titleTypographyProps={{ fontSize: '1rem', fontWeight: 700 }}
              />
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
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {metric.label}
                        </Typography>
                        <Chip
                          label={metric.status}
                          size="small"
                          sx={{
                            background: metric.color + '22',
                            color: metric.color,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        />
                      </Box>
                      <Typography sx={{ color: '#8B0000', fontWeight: 700, fontSize: '1.1rem' }}>
                        {metric.value}
                      </Typography>
                      <Divider sx={{ mt: 1 }} />
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* API Usage & Error Rates */}
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
              <CardHeader
                title="API Endpoint Usage"
                titleTypographyProps={{ fontSize: '1rem', fontWeight: 700 }}
              />
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={[
                      { name: 'Auth', usage: 12400 },
                      { name: 'Courses', usage: 8200 },
                      { name: 'Analytics', usage: 9800 },
                      { name: 'Users', usage: 7200 },
                      { name: 'Reports', usage: 5600 },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEE" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="usage" fill="#8B0000" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
              <CardHeader
                title="Error Rate by Endpoint"
                titleTypographyProps={{ fontSize: '1rem', fontWeight: 700 }}
              />
              <CardContent>
                <Stack spacing={2}>
                  {[
                    { endpoint: 'POST /api/auth/login', errors: 12, rate: '0.08%' },
                    { endpoint: 'GET /api/courses', errors: 5, rate: '0.03%' },
                    { endpoint: 'POST /api/assessments', errors: 23, rate: '0.12%' },
                    { endpoint: 'GET /api/analytics', errors: 8, rate: '0.05%' },
                    { endpoint: 'PUT /api/users/:id', errors: 3, rate: '0.02%' },
                  ].map((endpoint, idx) => (
                    <Box key={idx}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#333' }}>
                          {endpoint.endpoint}
                        </Typography>
                        <Typography sx={{ color: '#8B0000', fontWeight: 700, fontSize: '0.9rem' }}>
                          {endpoint.rate}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          background: '#EEE',
                          height: 6,
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            background: '#8B0000',
                            height: '100%',
                            width: `${parseFloat(endpoint.rate) * 100}%`,
                          }}
                        />
                      </Box>
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
