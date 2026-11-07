import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import api from '../config/api'
import { getGenerationNotificationsEnabled, setGenerationNotificationsEnabled } from '../utils/userPreferences'
import { setServerAlertsEnabled } from '../utils/pushNotifications'

function navigateWithRefresh(navigate, href) {
  if (!href || !href.startsWith('/')) return
  const [path, search = ''] = href.split('?')
  const params = new URLSearchParams(search)
  params.set('focus', String(Date.now()))
  navigate(`${path}?${params.toString()}`)
  if (path.includes('issue-reports')) {
    window.dispatchEvent(new CustomEvent('atlas-issue-reports-refresh'))
  }
}

function timeAgo(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationCenter() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [busy, setBusy] = useState(false)
  const [alertNote, setAlertNote] = useState('')
  const alertsOn = typeof window !== 'undefined'
    && 'Notification' in window
    && Notification.permission === 'granted'
    && getGenerationNotificationsEnabled()

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/notifications/', { atlasCache: false, skipAtlasErrorCard: true })
      const next = Array.isArray(data?.notifications) ? data.notifications : []
      setItems(next)
      setUnread(Number(data?.unread_count) || 0)
      if (next.some((item) => (
        !item?.read
        && (item?.kind === 'mobile_app_update' || String(item?.href || '').includes('/faculty/atlas-mobile'))
      ))) {
        window.dispatchEvent(new CustomEvent('atlas-mobile-release-refresh'))
      }
    } catch {
      // The bell stays quiet when the inbox cannot be reached.
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 30000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    const onMessage = (event) => {
      const type = event?.data?.type
      if (type === 'atlas-notification') {
        refresh()
        window.dispatchEvent(new CustomEvent('atlas-issue-reports-refresh'))
      }
      if (type === 'atlas-notification-open' && event.data.url) {
        navigateWithRefresh(navigate, event.data.url)
        refresh()
      }
    }
    navigator.serviceWorker?.addEventListener?.('message', onMessage)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      navigator.serviceWorker?.removeEventListener?.('message', onMessage)
    }
  }, [navigate, refresh])

  useEffect(() => {
    if (!alertsOn) return undefined
    setServerAlertsEnabled(true)
    return undefined
  }, [alertsOn])

  async function enableAlerts() {
    setBusy(true)
    setAlertNote('')
    try {
      const result = await setGenerationNotificationsEnabled(true)
      if (!result.enabled) {
        setAlertNote(result.reason === 'unsupported'
          ? 'This browser does not support desktop alerts.'
          : 'Alerts are blocked. Allow them in the browser site settings.')
        return
      }
      const push = await setServerAlertsEnabled(true)
      setAlertNote(push.enabled
        ? 'Alerts are on, including when this tab is in the background.'
        : 'In-app alerts are on. Desktop delivery is not available in this browser.')
    } finally {
      setBusy(false)
    }
  }

  async function markRead(ids, markAll = false) {
    try {
      const { data } = await api.post('/auth/notifications/read/', markAll ? { all: true } : { ids })
      setUnread(Number(data?.unread_count) || 0)
      setItems((current) => current.map((item) => {
        if (markAll || ids.includes(item.id)) return { ...item, read: true }
        return item
      }))
    } catch {
      setAlertNote('Could not update those alerts. Try again.')
    }
  }

  function openItem(item) {
    if (!item.read) markRead([item.id])
    setOpen(false)
    if (item?.kind === 'mobile_app_update' || String(item?.href || '').includes('/faculty/atlas-mobile')) {
      window.dispatchEvent(new CustomEvent('atlas-mobile-release-refresh'))
    }
    navigateWithRefresh(navigate, item.href)
  }

  const badge = unread > 9 ? '9+' : String(unread)

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => {
          setOpen((current) => !current)
          refresh()
        }}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 10,
          border: '1px solid var(--shell-btn-border)',
          background: 'var(--shell-btn-bg)',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 999,
            background: 'var(--brand-primary, #AA2423)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 800,
            lineHeight: '16px',
            textAlign: 'center',
          }}
          >
            {badge}
          </span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              border: 'none',
              background: 'transparent',
              zIndex: 40,
              cursor: 'default',
            }}
          />
          <div style={{
            position: 'absolute',
            top: 44,
            right: 0,
            width: 'min(360px, calc(100vw - 24px))',
            maxHeight: 460,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--shell-menu-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--shell-menu-border)',
            borderRadius: 14,
            boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
            overflow: 'hidden',
          }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              padding: '12px 14px',
              borderBottom: '1px solid var(--shell-divider)',
            }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Notifications</div>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead([], true)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--brand-primary, #AA2423)',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>
            {!alertsOn && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--shell-divider)' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={enableAlerts}
                  style={{
                    border: 'none',
                    background: 'var(--brand-primary, #AA2423)',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '7px 10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.78rem',
                  }}
                >
                  {busy ? 'Turning on…' : 'Turn on alerts'}
                </button>
                <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Maintenance, course requests, assignments, and finished generation.
                </div>
              </div>
            )}
            {alertNote && (
              <div style={{ padding: '8px 14px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{alertNote}</div>
            )}
            <div style={{ overflowY: 'auto' }}>
              {items.length === 0 && (
                <div style={{ padding: '22px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  No alerts yet.
                </div>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    borderBottom: '1px solid var(--shell-divider)',
                    background: item.read ? 'transparent' : 'var(--active-bg, rgba(170,36,35,0.08))',
                    color: 'inherit',
                    padding: '12px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.82rem' }}>{item.title}</span>
                    <span style={{ flexShrink: 0, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{timeAgo(item.created_at)}</span>
                  </div>
                  {item.body && (
                    <div style={{ marginTop: 4, fontSize: '0.78rem', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
                      {item.body}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
