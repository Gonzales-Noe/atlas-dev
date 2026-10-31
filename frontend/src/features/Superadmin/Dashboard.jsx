// src/features/Superadmin/Dashboard.jsx
import { useEffect, useState } from 'react'
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Alert } from '@mui/material'
import { Link } from 'react-router-dom'
import SuperAdminLayout from './SuperAdminLayout'
import { CircleCheck, Landmark, Users, BookOpen, ClipboardList } from 'lucide-react'
import { StatCard, GlassCard, PageHeader } from '../../components/ui'
import api from '../../config/api'
import { cssColor } from '../../utils/brandTheme'
import { ROUTES } from '../../config/route'

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
  recent: [],
  recent_activity: [],
}

export default function SuperAdminDashboard() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
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

  const valueFor = label => summary.cards.find(card => card.label === label)?.value ?? 0
  const distribution = (summary.user_distribution || []).filter(item => Number(item.value) > 0)
  const primary = cssColor('--brand-primary', '#AA2423')
  const accent = cssColor('--brand-accent', '#E24B4A')
  const colors = [primary, accent, 'rgba(96,170,255,0.85)']

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Super Admin Dashboard"
        subtitle="Institution totals and the latest activity. Host load and model health live on System Health."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard title="Total Institutions" value={valueFor('Institutions')} icon={<Landmark size={18} color={accent} />} accent={accent} />
        <StatCard title="Active Institutions" value={valueFor('Active institutions')} icon={<CircleCheck size={18} color="#5EDA7E" />} accent="#5EDA7E" />
        <StatCard title="Users" value={valueFor('Users')} icon={<Users size={18} color="#60AAFF" />} accent="#60AAFF" />
        <StatCard title="Pending Applications" value={valueFor('Pending applications')} accent="#FFB74D" />
        <StatCard title="Unpaid institutions" value={valueFor('Unpaid institutions')} accent="#FFB74D" />
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

      <div className="atlas-super-charts" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GlassCard title="Latest institutions">
          {(summary.recent || []).length === 0 && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No institutions yet.</p>}
          {(summary.recent || []).map(item => (
            <div key={`${item.label}-${item.detail}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 700 }}>{item.label}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{item.value} · {item.detail}</span>
            </div>
          ))}
        </GlassCard>
        <GlassCard
          title="Recent activity"
          titleAction={<Link to={ROUTES.SUPERADMIN.AUDIT_LOGS} style={{ color: 'var(--brand-primary)', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'none' }}>Open audit logs</Link>}
        >
          {(summary.recent_activity || []).length === 0 && <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No audit events yet.</p>}
          {(summary.recent_activity || []).slice(0, 6).map(item => (
            <div key={`${item.timestamp}-${item.label}-${item.value}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
              <span>
                <strong>{String(item.label || '').split('_').join(' ')}</strong>
                <span style={{ color: 'var(--text-secondary)' }}> · {item.value}</span>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{item.detail}</span>
            </div>
          ))}
        </GlassCard>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .atlas-super-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperAdminLayout>
  )
}
