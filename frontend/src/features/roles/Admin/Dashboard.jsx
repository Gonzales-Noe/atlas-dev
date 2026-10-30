// ═══════════════════════════════════════════════════════════
// src/features/Admin/Dashboard.jsx
// ═══════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import { useAuth } from '../../../store/authStore'
import AdminLayout from './AdminLayout'
import { fetchSetupStatus } from './academicApi'
import { BookOpen, Hand, Users } from 'lucide-react'
import { StatCard, GlassCard, PageHeader } from '../../../components/ui'

const secondaryActionSx = {
  color: 'var(--text-primary)',
  background: 'var(--shell-btn-bg)',
  border: '1px solid var(--shell-btn-border)',
  borderRadius: 10,
  padding: '10px 16px',
  textDecoration: 'none',
  fontSize: '0.82rem',
  fontWeight: 700,
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [setup, setSetup] = useState(null)
  const [setupError, setSetupError] = useState('')

  useEffect(() => {
    fetchSetupStatus()
      .then(setSetup)
      .catch(err => {
        setSetupError(err?.response?.data?.detail || 'Could not load institution statistics.')
      })
  }, [])

  return (
    <AdminLayout>
      <PageHeader
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>Welcome, {user?.name || 'Admin'} <Hand size={22} strokeWidth={2.25} aria-hidden="true" /></span>}
        subtitle="Institutional overview — manage your faculty and academic structure"
      />

      {setupError && <Alert severity="error" sx={{ mb: 2 }}>{setupError}</Alert>}

      <GlassCard style={{ marginBottom: 24, border: '1px solid rgba(96,170,255,0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#60AAFF', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {setup?.setup_completed ? 'Your academic structure' : 'First-time setup'}
            </div>
            <h2 style={{ margin: '7px 0 5px', fontSize: '1.12rem' }}>
              {setup?.setup_completed
                ? `${setup.course_count} course(s) · ${setup.section_count} section(s)`
                : 'Make your workspace ready for faculty'}
            </h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {setup?.setup_completed
                ? 'Keep your sections and courses current so faculty assignments stay accurate.'
                : 'Add faculty, their section and course assignments, and institutional knowledge.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/admin/academic-structure" style={{ color: '#fff', background: '#8E1C1B', border: '1px solid rgba(170,36,35,0.6)', borderRadius: 10, padding: '10px 16px', textDecoration: 'none', fontSize: '0.82rem', fontWeight: 700 }}>Academic structure</Link>
            <Link to="/admin/account-management" style={secondaryActionSx}>Add faculty</Link>
            <Link to="/admin/knowledge-base" style={secondaryActionSx}>Set up knowledge base</Link>
          </div>
        </div>
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard title="Faculty Members" value={setup ? setup.faculty_count : '—'} icon={<Users size={18} color="#E24B4A" />} accent="#E24B4A" />
        <StatCard title="Active Courses" value={setup ? setup.course_count : '—'} icon={<BookOpen size={18} color="#60AAFF" />} accent="#60AAFF" />
      </div>
    </AdminLayout>
  )
}