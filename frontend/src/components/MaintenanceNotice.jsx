import { createContext, useContext, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAuth } from '../store/authStore'
import atlasMaintenance from '../assets/atlas-maintenance.png'

export const BANNER_DISMISS_KEY = 'atlas_maintenance_banner_closed'

const MaintenanceNoticeContext = createContext({
  notice: null,
  dismissed: false,
  dismiss: () => {},
  reopen: () => {},
})

function windowKey(notice) {
  if (!notice?.start || !notice?.end) return ''
  return `${notice.start}|${notice.end}`
}

export function readBannerDismissed(notice) {
  const key = windowKey(notice)
  if (!key) return false
  try {
    return sessionStorage.getItem(BANNER_DISMISS_KEY) === key
  } catch {
    return false
  }
}

export function MaintenanceNoticeProvider({ notice, children }) {
  const [dismissed, setDismissed] = useState(() => readBannerDismissed(notice))
  const key = windowKey(notice)

  useEffect(() => {
    setDismissed(readBannerDismissed(notice))
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    if (!key) return
    try { sessionStorage.setItem(BANNER_DISMISS_KEY, key) } catch { /* session-only */ }
    setDismissed(true)
  }

  function reopen() {
    try { sessionStorage.removeItem(BANNER_DISMISS_KEY) } catch { /* session-only */ }
    setDismissed(false)
  }

  return (
    <MaintenanceNoticeContext.Provider value={{ notice, dismissed, dismiss, reopen }}>
      {children}
    </MaintenanceNoticeContext.Provider>
  )
}

export function useMaintenanceNotice() {
  return useContext(MaintenanceNoticeContext)
}

function whenLabel(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function audienceCanSee(role) {
  return role === 'faculty' || role === 'admin'
}

export function MaintenanceBanner() {
  const { user } = useAuth()
  const { notice, dismissed, dismiss } = useMaintenanceNotice()
  if (!audienceCanSee(user?.role) || !notice || dismissed) return null
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginBottom: 16,
      padding: '10px 14px',
      background: '#fff',
      color: '#1A1A1A',
      border: '1px solid rgba(170, 36, 35, 0.25)',
      borderRadius: 14,
    }}>
      <img
        src={atlasMaintenance}
        alt=""
        style={{ width: 48, height: 62, objectFit: 'contain', imageRendering: 'pixelated', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '0.84rem' }}>Maintenance is scheduled</div>
        <div style={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.62)', lineHeight: 1.4 }}>
          ATLAS will pause for faculty and admins from {whenLabel(notice.start)} until {whenLabel(notice.end)}. Save your work before then.
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close maintenance banner"
        style={{
          border: 'none',
          background: 'transparent',
          color: '#1A1A1A',
          fontWeight: 800,
          cursor: 'pointer',
          fontSize: '1rem',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}

export function MaintenanceBell() {
  const { user } = useAuth()
  const { notice, dismissed, reopen } = useMaintenanceNotice()
  const [open, setOpen] = useState(false)
  if (!audienceCanSee(user?.role) || !notice) return null
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Maintenance notices"
        onClick={() => setOpen(current => !current)}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 10,
          border: '1px solid var(--shell-btn-border, rgba(0,0,0,0.12))',
          background: 'var(--shell-btn-bg, #fff)',
          color: 'var(--text-primary, #1A1A1A)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Bell size={16} />
        {dismissed && (
          <span style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--brand-primary, #AA2423)',
          }} />
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 44,
          right: 0,
          width: 320,
          zIndex: 30,
          background: '#fff',
          color: '#1A1A1A',
          border: '1px solid rgba(170, 36, 35, 0.25)',
          borderRadius: 14,
          padding: 14,
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        }}>
          <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>Maintenance is scheduled</div>
          <p style={{ margin: '6px 0 12px', fontSize: '0.8rem', lineHeight: 1.45, color: 'rgba(0,0,0,0.68)' }}>
            From {whenLabel(notice.start)} until {whenLabel(notice.end)}. Faculty and admins will be paused during that window.
          </p>
          {dismissed && (
            <button
              type="button"
              onClick={() => { reopen(); setOpen(false) }}
              style={{
                border: 'none',
                background: 'var(--brand-primary, #AA2423)',
                color: '#fff',
                borderRadius: 8,
                padding: '7px 10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Show the banner again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
