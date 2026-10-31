// src/features/Superadmin/Dashboard.jsx
import { useEffect, useState } from 'react'
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Alert } from '@mui/material'
import SuperAdminLayout from './SuperAdminLayout'
import { CircleCheck, Landmark, Users, BookOpen, ClipboardList } from 'lucide-react'
import { StatCard, GlassCard, PageHeader, MetricRow } from '../../components/ui'
import api from '../../config/api'
import { cssColor } from '../../utils/brandTheme'
import LlmHealthPanel from './LlmHealthPanel'

const tooltipStyle = {
  background: 'var(--shell-menu-bg, #16161E)',
  border: '1px solid var(--border-color)',
  borderRadius: 12,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: '0.82rem',
}
const axisStyle = { fill: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-sans)' }

const EMPTY_SUMMARY = {
  cards: [],
  user_distribution: [],
  institution_trend: [],
  activity_trend: [],
  recent: [],
  recent_activity: [],
}

export default function SuperAdminDashboard() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [, setBrandTick] = useState(0)

  useEffect(() => {
    const onBrand = () => setBrandTick(tick => tick + 1)
    window.addEventListener('atlas-brand', onBrand)
    return () => window.removeEventListener('atlas-brand', onBrand)
  }, [])

  useEffect(() => {
    api.get('/auth/dashboard/summary/')
      .then(({ data }) => setSummary({ ...EMPTY_SUMMARY, ...data }))
      .catch(() => setError('Live institution figures could not be loaded.'))
  }, [])

  useEffect(() => {
    let mounted = true
    const load = () => {
      api.get('/auth/system-health/')
        .then(({ data }) => { if (mounted) setHealth(data) })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 20000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  const valueFor = label => summary.cards.find(card => card.label === label)?.value ?? 0
  const distribution = (summary.user_distribution || []).filter(item => Number(item.value) > 0)
  const primary = cssColor('--brand-primary', '#AA2423')
  const accent = cssColor('--brand-accent', '#E24B4A')
  const colors = [primary, accent, 'rgba(96,170,255,0.85)']
  const hostHistory = (health?.history || []).map(point => ({
    ...point,
    label: point.time ? new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
  }))

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Super Admin Dashboard"
        subtitle="Live institution totals, host load, and recorded activity"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <LlmHealthPanel />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
        <StatCard title="CPU" value={health?.cpu?.percent == null ? '—' : `${health.cpu.percent}%`} accent={primary} />
        <StatCard title="Memory" value={health?.memory?.percent == null ? '—' : `${health.memory.percent}%`} accent="#60AAFF" />
        <StatCard title="Server disk" value={health?.disk?.percent == null ? '—' : `${health.disk.percent}%`} accent="#FFB74D" sub={health?.disk?.free_label ? `${health.disk.free_label} free` : ''} />
        <StatCard title="Database storage" value={health?.database?.size_label || '—'} accent="#5EDA7E" sub={health?.database?.latency_ms != null ? `${health.database.latency_ms} ms` : ''} />
        <StatCard
          title="Slowest right now"
          value={health?.lag?.slowest ? health.lag.slowest.name : '—'}
          accent={accent}
          sub={health?.lag?.slowest ? `${health.lag.slowest.latency_ms} ms` : 'Waiting for a check'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard title="Total Institutions" value={valueFor('Institutions')} icon={<Landmark size={18} color={accent} />} accent={accent} />
        <StatCard title="Active Institutions" value={valueFor('Active institutions')} icon={<CircleCheck size={18} color="#5EDA7E" />} accent="#5EDA7E" />
        <StatCard title="Users" value={valueFor('Users')} icon={<Users size={18} color="#60AAFF" />} accent="#60AAFF" />
        <StatCard title="Pending Applications" value={valueFor('Pending applications')} accent="#FFB74D" />
        <StatCard title="Courses" value={valueFor('Courses')} icon={<BookOpen size={18} color={primary} />} accent={primary} />
        <StatCard title="Assessments" value={valueFor('Assessments')} icon={<ClipboardList size={18} color={accent} />} accent={accent} />
      </div>

      <div className="atlas-super-charts" style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.8fr) minmax(0, 1.4fr)', gap: 16, marginBottom: 16 }}>
        <GlassCard title="User distribution">
          {distribution.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No accounts yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={distribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                  {distribution.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        <GlassCard title="New institutions and users">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={summary.institution_trend || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="institutions" name="Institutions" stroke={primary} strokeWidth={2} fill={primary} fillOpacity={0.2} dot={false} />
              <Area type="monotone" dataKey="users" name="Users" stroke="#60AAFF" strokeWidth={2} fill="transparent" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      <div className="atlas-super-charts" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(260px, 0.8fr)', gap: 16, marginBottom: 16 }}>
        <GlassCard title="Host load">
          {hostHistory.length < 2 ? (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              Load samples appear here as the server is used, about once a minute.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={hostHistory} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="cpu" name="CPU %" stroke={primary} fill={primary} fillOpacity={0.18} strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="memory" name="Memory %" stroke="#60AAFF" fill="transparent" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
        <GlassCard title="Audit events">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={summary.activity_trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="events" name="Events" fill={primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      <div className="atlas-super-charts" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GlassCard title="Application status">
          <MetricRow label="Active institutions" value={valueFor('Active institutions')} status="Active" statusType="success" />
          <MetricRow label="Pending applications" value={valueFor('Pending applications')} status="Review" statusType="warning" />
          <MetricRow label="Unpaid institutions" value={valueFor('Unpaid institutions')} status="Payment" statusType="info" divider={false} />
        </GlassCard>
        <GlassCard title="Latest institutions">
          {(summary.recent || []).length === 0 && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No institutions yet.</p>}
          {(summary.recent || []).map(item => (
            <div key={`${item.label}-${item.detail}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 700 }}>{item.label}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{item.value} · {item.detail}</span>
            </div>
          ))}
        </GlassCard>
      </div>

      <GlassCard title="Recent activity" style={{ marginTop: 16 }}>
        {(summary.recent_activity || []).length === 0 && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No audit events yet.</p>}
        {(summary.recent_activity || []).map(item => (
          <div key={`${item.timestamp}-${item.label}-${item.value}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
            <span>
              <strong>{String(item.label || '').split('_').join(' ')}</strong>
              <span style={{ color: 'var(--text-secondary)' }}> · {item.value}</span>
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>{item.detail}</span>
          </div>
        ))}
      </GlassCard>
      <style>{`
        @media (max-width: 900px) {
          .atlas-super-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperAdminLayout>
  )
}
