// src/features/Superadmin/Dashboard.jsx
import { AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'
import { StatCard, GlassCard, PageHeader, MetricRow } from '../../components/ui'

const systemStatsData = [
  { name: 'Jan', traffic: 4000, usage: 2400, uptime: 99.8 },
  { name: 'Feb', traffic: 3000, usage: 1398, uptime: 99.9 },
  { name: 'Mar', traffic: 2000, usage: 9800, uptime: 99.2 },
  { name: 'Apr', traffic: 2780, usage: 3908, uptime: 99.7 },
  { name: 'May', traffic: 1890, usage: 4800, uptime: 99.5 },
  { name: 'Jun', traffic: 2390, usage: 3800, uptime: 99.9 },
]

const userTypeData = [
  { name: 'Faculty',  value: 1250 },
  { name: 'Students', value: 8500 },
  { name: 'Admins',   value: 150  },
]

const COLORS = ['#C0392B', '#FF6B6B', 'rgba(255,107,107,0.35)']

const tooltipStyle = {
  background: '#16161E',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  color: '#F0F0F2',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.82rem',
  boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
}

const axisStyle = { fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'var(--font-sans)' }

export default function SuperAdminDashboard() {
  return (
    <SuperAdminLayout>
      <PageHeader
        title="Super Admin Dashboard"
        subtitle="System-wide metrics, performance monitoring, and institutional management"
      />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard title="Total Institutions" value="12"   icon="🏛️" trend="+2 this month" trendUp={true}  accent="#FF6B6B" />
        <StatCard title="Active Users"        value="10k"  icon="👥" trend="+5.2%"        trendUp={true}  accent="#60AAFF" />
        <StatCard title="System Uptime"       value="99.7%" icon="⚡" trend="Excellent"                   accent="#5EDA7E" />
        <StatCard title="API Traffic"         value="15.5k" icon="📡" trend="+12.5%"       trendUp={true}  accent="#FFB74D" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>

        {/* Pie chart */}
        <GlassCard title="User Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={userTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                {userTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                formatter={v => <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Area chart */}
        <GlassCard title="Traffic — Last 6 Months">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={systemStatsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gTraffic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#C0392B" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#C0392B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="traffic" stroke="#C0392B" strokeWidth={2} fill="url(#gTraffic)" dot={false} activeDot={{ r: 5, fill: '#FF6B6B' }} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Uptime line chart */}
        <GlassCard title="System Uptime Trend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={systemStatsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis domain={[98, 100]} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="uptime" stroke="#34C759" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#34C759' }} />
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Performance metrics */}
        <GlassCard title="Performance Metrics">
          <MetricRow label="API Response Time"    value="145ms"   status="Excellent" statusType="success" />
          <MetricRow label="Database Query Time"  value="23ms"    status="Good"      statusType="success" />
          <MetricRow label="Server CPU Usage"     value="34%"     status="Normal"    statusType="info" />
          <MetricRow label="Memory Usage"         value="62%"     status="Acceptable" statusType="warning" />
          <MetricRow label="Network Bandwidth"    value="2.3 Gbps" status="Good"     statusType="success" divider={false} />
        </GlassCard>
      </div>
    </SuperAdminLayout>
  )
}