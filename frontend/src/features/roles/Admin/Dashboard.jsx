// ═══════════════════════════════════════════════════════════
// src/features/Admin/Dashboard.jsx
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../store/authStore'
import AdminLayout from './AdminLayout'
import { StatCard, GlassCard, PageHeader } from '../../../components/ui'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const activityData = [
  { day: 'Mon', actions: 14 },
  { day: 'Tue', actions: 22 },
  { day: 'Wed', actions: 18 },
  { day: 'Thu', actions: 31 },
  { day: 'Fri', actions: 27 },
  { day: 'Sat', actions: 9  },
  { day: 'Sun', actions: 5  },
]

const tooltipStyle = { background: '#16161E', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#F0F0F2', fontFamily: 'var(--font-sans)', fontSize: '0.82rem' }
const axisStyle = { fill: 'rgba(255,255,255,0.35)', fontSize: 11, fontFamily: 'var(--font-sans)' }

export default function AdminDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ totalFaculty: 0, totalCourses: 0, totalAssessments: 0, totalModules: 0 })

  useEffect(() => {
    setStats({ totalFaculty: 15, totalCourses: 8, totalAssessments: 24, totalModules: 32 })
  }, [])

  const recentActivity = [
    { user: 'Dr. John Smith',   action: 'Created syllabus',       time: '2 min ago',  type: '📋' },
    { user: 'Prof. Jane Doe',   action: 'Generated assessment',   time: '18 min ago', type: '📝' },
    { user: 'Dr. Alice Johnson',action: 'Uploaded course material',time: '1 hr ago',  type: '📁' },
    { user: 'Prof. Bob Wilson', action: 'Added module',           time: '2 hr ago',   type: '🧩' },
  ]

  return (
    <AdminLayout>
      <PageHeader
        title={`Welcome, ${user?.name || 'Admin'} 👋`}
        subtitle="Institutional overview — manage faculty, courses, and activity"
      />

      <GlassCard style={{ marginBottom: 24, border: '1px solid rgba(96,170,255,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#60AAFF', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>First-time setup</div>
            <h2 style={{ margin: '7px 0 5px', fontSize: '1.12rem' }}>Make your workspace ready for faculty</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Add faculty, create your course catalog, and upload institutional knowledge.</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/admin/account-management" style={{ color: '#fff', background: '#8B0000', borderRadius: 6, padding: '10px 14px', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>Add faculty</Link>
            <Link to="/admin/knowledge-base" style={{ color: '#fff', border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, padding: '10px 14px', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>Set up knowledge base</Link>
          </div>
        </div>
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard title="Faculty Members"   value={stats.totalFaculty}      icon="👨‍🏫" accent="#FF6B6B" />
        <StatCard title="Active Courses"    value={stats.totalCourses}      icon="📚" accent="#60AAFF" />
        <StatCard title="Assessments"       value={stats.totalAssessments}  icon="📝" accent="#FFB74D" />
        <StatCard title="Modules Created"   value={stats.totalModules}      icon="🧩" accent="#5EDA7E" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <GlassCard title="Activity This Week">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={activityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="day" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="actions" fill="#8B0000" radius={[6,6,0,0]} barSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <GlassCard title="Recent Activity">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {recentActivity.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(139,0,0,0.15)', border: '1px solid rgba(192,57,43,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', flexShrink: 0 }}>
                  {item.type}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.user}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.action}</div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.time}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </AdminLayout>
  )
}