import { useEffect, useState } from 'react'
import { useAuth } from '../store/authStore'
import { loadBrandTheme } from '../utils/brandTheme'

function MaintenanceScreen({ message, onSignOut }) {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: 'var(--bg-base, #08080A)',
      color: 'var(--text-primary, #F0F0F2)',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    }}>
      <section style={{ maxWidth: 520, textAlign: 'center' }}>
        <p style={{ letterSpacing: '0.14em', fontSize: '0.75rem', fontWeight: 700, color: 'var(--brand-accent, #E24B4A)' }}>
          MAINTENANCE
        </p>
        <h1 style={{ fontSize: '1.8rem', margin: '8px 0 12px' }}>ATLAS is temporarily unavailable</h1>
        <p style={{ color: 'var(--text-secondary, rgba(255,255,255,0.7))', lineHeight: 1.5 }}>
          {message || 'The IT team is performing maintenance. Please try again shortly.'}
        </p>
        <button
          type="button"
          onClick={onSignOut}
          style={{
            marginTop: 20,
            background: 'transparent',
            color: 'inherit',
            border: '1px solid var(--border-color, rgba(255,255,255,0.2))',
            borderRadius: 10,
            padding: '8px 16px',
            cursor: 'pointer',
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

  if (blocked) {
    return <MaintenanceScreen message={theme.maintenance_message} onSignOut={logout} />
  }

  return (
    <>
      {maintenance && (
        <div style={{
          background: 'var(--brand-primary, #AA2423)',
          color: '#fff',
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 700,
          padding: '8px 16px',
        }}>
          Maintenance mode is on.
          {user?.role === 'superadmin'
            ? ' Other roles are paused until you turn it off in System Health.'
            : ' The IT team can still sign in.'}
        </div>
      )}
      {children}
    </>
  )
}
