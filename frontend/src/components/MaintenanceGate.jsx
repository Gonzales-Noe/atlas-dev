import { useEffect, useState } from 'react'
import { useAuth } from '../store/authStore'
import api from '../config/api'
import { loadBrandTheme } from '../utils/brandTheme'
import { MaintenanceNoticeProvider } from './MaintenanceNotice'
import atlasMaintenance from '../assets/atlas-maintenance.png'

function noticeIsUpcoming(theme) {
  if (!theme?.maintenance_notice_enabled || !theme?.maintenance_scheduled_for || !theme?.maintenance_scheduled_until) return false
  const start = new Date(theme.maintenance_scheduled_for)
  const end = new Date(theme.maintenance_scheduled_until)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  return end.getTime() > Date.now() && end.getTime() > start.getTime()
}

function MaintenanceScreen({ message, onSignOut }) {
  const [notices, setNotices] = useState([])

  useEffect(() => {
    let mounted = true
    api.get('/auth/notifications/', { atlasCache: false, skipAtlasErrorCard: true })
      .then(({ data }) => {
        if (mounted) setNotices((data?.notifications || []).slice(0, 4))
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: 'var(--bg-base, #F7F9FC)',
      color: 'var(--text-primary, #1A1A1A)',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    }}>
      <section style={{ maxWidth: 560, textAlign: 'center' }}>
        <img
          src={atlasMaintenance}
          alt="ATLAS holding a wrench and toolbox"
          style={{ width: 180, height: 220, objectFit: 'contain', imageRendering: 'pixelated' }}
        />
        <p style={{ letterSpacing: '0.14em', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-primary, #AA2423)', marginBottom: 0 }}>
          MAINTENANCE
        </p>
        <h1 style={{ fontSize: '1.8rem', margin: '8px 0 12px', color: 'var(--text-primary, #1A1A1A)' }}>ATLAS is temporarily unavailable</h1>
        <p style={{ color: 'var(--text-secondary, rgba(0,0,0,0.62))', lineHeight: 1.5 }}>
          {message || 'The IT team is performing maintenance. Please try again shortly.'}
        </p>
        {notices.length > 0 && (
          <div style={{ marginTop: 18, textAlign: 'left' }}>
            {notices.map((item) => (
              <div key={item.id} style={{
                background: 'var(--bg-surface, #fff)',
                border: '1px solid var(--border-color, rgba(0,0,0,0.08))',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 8,
              }}>
                <div style={{ fontWeight: 800, fontSize: '0.84rem' }}>{item.title}</div>
                {item.body && (
                  <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.body}</div>
                )}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onSignOut}
          style={{
            marginTop: 20,
            background: 'transparent',
            color: 'var(--text-primary, #1A1A1A)',
            border: '1px solid var(--border-color, rgba(0,0,0,0.15))',
            borderRadius: 10,
            padding: '8px 16px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Sign out
        </button>
      </section>
    </main>
  )
}

export default function MaintenanceGate({ children }) {
  const { user, isLoading, logout } = useAuth()
  const [theme, setTheme] = useState(null)

  useEffect(() => {
    let mounted = true
    const pull = () => loadBrandTheme().then(data => { if (mounted && data) setTheme(data) })
    pull()
    const onBrand = event => { if (event.detail) setTheme(event.detail) }
    window.addEventListener('atlas-brand', onBrand)
    const timer = setInterval(pull, 60000)
    return () => {
      mounted = false
      window.removeEventListener('atlas-brand', onBrand)
      clearInterval(timer)
    }
  }, [])

  const maintenance = Boolean(theme?.maintenance_enabled)
  const blocked = maintenance && !isLoading && user && user.role !== 'superadmin'
  const upcoming = !blocked && noticeIsUpcoming(theme)

  if (blocked) {
    return <MaintenanceScreen message={theme.maintenance_message} onSignOut={logout} />
  }

  const notice = upcoming
    ? { start: theme.maintenance_scheduled_for, end: theme.maintenance_scheduled_until }
    : null

  return (
    <MaintenanceNoticeProvider notice={notice}>
      {maintenance && user?.role === 'superadmin' && (
        <div style={{
          background: 'var(--brand-primary, #AA2423)',
          color: '#fff',
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 700,
          padding: '8px 16px',
        }}>
          Maintenance mode is on. Other roles are paused until you turn it off in System Health.
        </div>
      )}
      {children}
    </MaintenanceNoticeProvider>
  )
}
