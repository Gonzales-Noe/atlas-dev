// src/features/Superadmin/Dashboard.jsx
import { useEffect, useState } from 'react'
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import SuperAdminLayout from './SuperAdminLayout'
import { StatCard, GlassCard, PageHeader, MetricRow } from '../../components/ui'
import api from '../../config/api'

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

const EMPTY_SUMMARY = { cards: [], user_distribution: [], institution_trend: [] }
const LOCAL_SUMMARY = {
  cards: [
    { label: 'Institutions', value: 5 },
    { label: 'Active institutions', value: 4 },
    { label: 'Users', value: 1295 },
    { label: 'Pending applications', value: 0 },
    { label: 'Unpaid institutions', value: 0 },
  ],
  user_distribution: [
    { name: 'Admins', value: 5 },
    { name: 'Faculty', value: 1280 },
    { name: 'Other', value: 10 },
  ],
  institution_trend: [
    { name: 'Jan', institutions: 2, users: 480 },
    { name: 'Feb', institutions: 3, users: 710 },
    { name: 'Mar', institutions: 4, users: 980 },
    { name: 'Apr', institutions: 5, users: 1295 },
  ],
}

export default function SuperAdminDashboard() {
  const [summary, setSummary] = useState({ cards: [], user_distribution: [], institution_trend: [] })

  useEffect(() => {
    if (localStorage.getItem('atlas_access_token') === 'superadmin-test-token') {
      setSummary(LOCAL_SUMMARY)
      return
    }

    api.get('/auth/dashboard/summary/')
      .then(({ data }) => setSummary(data))
      .catch(() => setSummary(EMPTY_SUMMARY))
  }, [])

  const valueFor = label => summary.cards.find(card => card.label === label)?.value ?? 0

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Super Admin Dashboard"
        subtitle="System-wide metrics, performance monitoring, and institutional management"
      />

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard title="Total Institutions" value={valueFor('Institutions')} icon="🏛️" accent="#FF6B6B" />
        <StatCard title="Active Institutions" value={valueFor('Active institutions')} icon="✅" accent="#5EDA7E" />
        <StatCard title="Users" value={valueFor('Users')} icon="👥" accent="#60AAFF" />
        <StatCard title="Pending Applications" value={valueFor('Pending applications')} icon="⏳" accent="#FFB74D" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>

        {/* Pie chart */}
        <GlassCard title="User Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={summary.user_distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                {summary.user_distribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                formatter={v => <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Area chart */}
        <GlassCard title="Institution and user growth">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={summary.institution_trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
              <Area type="monotone" dataKey="institutions" name="Institutions" stroke="#C0392B" strokeWidth={2} fill="url(#gTraffic)" dot={false} activeDot={{ r: 5, fill: '#FF6B6B' }} />
              <Area type="monotone" dataKey="users" name="Users" stroke="#60AAFF" strokeWidth={2} fill="transparent" dot={false} activeDot={{ r: 5, fill: '#60AAFF' }} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <GlassCard title="Application status">
          <MetricRow label="Active institutions" value={valueFor('Active institutions')} status="Active" statusType="success" />
          <MetricRow label="Pending applications" value={valueFor('Pending applications')} status="Review" statusType="warning" />
          <MetricRow label="Unpaid institutions" value={valueFor('Unpaid institutions')} status="Payment due" statusType="info" divider={false} />
        </GlassCard>
      </div>
    </SuperAdminLayout>
  )
}