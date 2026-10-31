// src/features/Superadmin/Dashboard.jsx
import { useEffect, useState } from 'react'
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { StatusNotice } from '../../components/StatusNotice'
import { Link } from 'react-router-dom'
import SuperAdminLayout from './SuperAdminLayout'
import { Shield, UserCog, GraduationCap, Users, BookOpen, ClipboardList } from 'lucide-react'
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
      .catch(() => setError('Live figures could not be loaded.'))
  }, [])

  const valueFor = label => summary.cards.find(card => card.label === label)?.value ?? 0
  const distribution = (summary.user_distribution || []).filter(item => Number(item.value) > 0)
  const primary = cssColor('--brand-primary', '#AA2423')
  const accent = cssColor('--brand-accent', '#E24B4A')
  const info = cssColor('--status-info', '#0B5CAD')
  const success = cssColor('--status-success', '#157A32')
  const colors = [primary, accent, info, success]
  const stats = [
    { title: 'Super Admins', label: 'Super Admins', icon: <Shield size={18} color={primary} />, accent: primary },
    { title: 'Admins', label: 'Admins', icon: <UserCog size={18} color={accent} />, accent },
    { title: 'Faculty', label: 'Faculty', icon: <GraduationCap size={18} color={info} />, accent: info },
    { title: 'Students', label: 'Students', icon: <Users size={18} color={success} />, accent: success },
    { title: 'Courses', label: 'Courses', icon: <BookOpen size={18} color={primary} />, accent: primary },
    { title: 'Assessments', label: 'Assessments', icon: <ClipboardList size={18} color={accent} />, accent },
  ]

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Super Admin Dashboard"
        subtitle="Role totals and the latest activity. Host load and model health live on System Health."
      />

      <StatusNotice message={error} severity="error" />

      <div className="atlas-super-stats">
        {stats.map(card => (
          <StatCard key={card.title} title={card.title} value={valueFor(card.label)} icon={card.icon} accent={card.accent} />
        ))}
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

        <GlassCard title="New users">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={summary.institution_trend || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="users" name="Users" stroke={info} strokeWidth={2} fill={info} fillOpacity={0.16} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      <GlassCard title={`Maintenance updates · ${summary.maintenance_update_count || 0}`} style={{ marginBottom: 16 }}>
        {(summary.maintenance_updates || []).length === 0 && (
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No maintenance updates yet.</p>
        )}
        {(summary.maintenance_updates || []).map((item, index) => (
          <div key={`${item.started_at}-${item.ended_at}-${index}`} style={{ display: 'grid', gap: 2, padding: '10px 0', borderTop: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
            <strong>{item.summary}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              Started {item.started_at ? new Date(item.started_at).toLocaleString() : '—'}
              {' · '}
              Ended {item.ended_at ? new Date(item.ended_at).toLocaleString() : 'Still open'}
            </span>
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
      <style>{`
        .atlas-super-stats {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 1200px) {
          .atlas-super-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 700px) {
          .atlas-super-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 900px) {
          .atlas-super-charts { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </SuperAdminLayout>
  )
}
