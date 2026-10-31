// Tab session for ATLAS Web.
// Tokens live in sessionStorage, so closing the tab drops them.
// A second tab on this same browser can borrow the open tab's session.
// Another device cannot. The server also ends the session after 30 idle
// minutes, or 12 hours after sign-in, whichever comes first.
// Keep IDLE_MS equal to IDLE_TIMEOUT in backend/apps/users/sessions.py.

const ACCESS = 'atlas_access_token'
const REFRESH = 'atlas_refresh_token'
const USER = 'atlas_user'
const NOTICE = 'atlas_auth_notice'
const ACTIVITY = 'atlas_last_activity'
const TAB_PREFIX = 'atlas_open_tab:'

export const IDLE_MS = 30 * 60 * 1000
export const IDLE_WARNING_MS = 2 * 60 * 1000

export const SESSION_NOTICES = {
  session_idle: 'You were signed out after 30 minutes of inactivity. Sign in again.',
  session_superseded: 'You were signed out because this account signed in on another device.',
  session_ended: 'Your session has ended. Sign in again.',
}

const tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
const tabKey = `${TAB_PREFIX}${tabId}`

let channel = null
let handoffWaiter = null
let replacedAt = 0

function browserAvailable() {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
}

function purgeLegacyPersistentTokens() {
  try {
    localStorage.removeItem(ACCESS)
    localStorage.removeItem(REFRESH)
    localStorage.removeItem(USER)
  } catch {
    // Storage can be blocked. The tab copy is still the source of truth.
  }
}

function post(message) {
  if (!channel) return
  try {
    channel.postMessage({ ...message, from: tabId })
  } catch {
    // Another tab can sign in on its next visit.
  }
}

export function getAccessToken() {
  if (!browserAvailable()) return ''
  return sessionStorage.getItem(ACCESS) || ''
}

export function getRefreshToken() {
  if (!browserAvailable()) return ''
  return sessionStorage.getItem(REFRESH) || ''
}

export function readCachedUser() {
  if (!browserAvailable()) return null
  try {
    const raw = sessionStorage.getItem(USER)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeCachedUser(user) {
  if (!browserAvailable() || user == null) return
  sessionStorage.setItem(USER, JSON.stringify(user))
  try {
    localStorage.removeItem(USER)
  } catch {
    // The durable copy is already ignored.
  }
}

export function markSharedActivity() {
  try {
    localStorage.setItem(ACTIVITY, String(Date.now()))
  } catch {
    // Idle tracking fails closed on the next API call.
  }
}

export function idleForMs() {
  try {
    const raw = localStorage.getItem(ACTIVITY)
    if (!raw) return 0
    const at = Number(raw)
    if (!Number.isFinite(at) || at <= 0) return 0
    return Date.now() - at
  } catch {
    return IDLE_MS
  }
}

export function sessionIsIdle() {
  try {
    if (!localStorage.getItem(ACTIVITY)) return true
  } catch {
    return true
  }
  return idleForMs() >= IDLE_MS
}

export function writeSession({ access, refresh, user, broadcast = true, touchActivity = true } = {}) {
  if (!browserAvailable()) return
  if (access != null) sessionStorage.setItem(ACCESS, access)
  if (refresh != null) sessionStorage.setItem(REFRESH, refresh)
  if (user != null) {
    sessionStorage.setItem(USER, typeof user === 'string' ? user : JSON.stringify(user))
  }
  purgeLegacyPersistentTokens()
  if (touchActivity) markSharedActivity()
  if (broadcast) {
    post({
      type: 'session-offer',
      access: getAccessToken(),
      refresh: getRefreshToken(),
      user: sessionStorage.getItem(USER) || '',
    })
  }
}

export function setAuthNotice(notice) {
  if (!browserAvailable() || !notice) return
  sessionStorage.setItem(NOTICE, notice)
}

export function consumeAuthNotice() {
  if (!browserAvailable()) return ''
  const notice = sessionStorage.getItem(NOTICE) || ''
  if (notice) sessionStorage.removeItem(NOTICE)
  return notice
}

export function clearBrowserSession({ broadcast = false, notice = '' } = {}) {
  if (!browserAvailable()) return
  sessionStorage.removeItem(ACCESS)
  sessionStorage.removeItem(REFRESH)
  sessionStorage.removeItem(USER)
  sessionStorage.removeItem('atlas_maintenance_banner_closed')
  purgeLegacyPersistentTokens()
  try {
    localStorage.removeItem(ACTIVITY)
  } catch {
    // The missing timestamp already counts as idle.
  }
  if (notice) sessionStorage.setItem(NOTICE, notice)
  if (broadcast) post({ type: 'logout', notice: notice || '' })
}

export function revokeServerSession() {
  const refresh = getRefreshToken()
  if (!refresh || refresh.endsWith('-test-token')) return
  const base = import.meta.env.VITE_API_URL || '/api'
  fetch(`${base}/auth/logout/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  }).catch(() => {})
}

export function sessionWasJustReplaced() {
  return Date.now() - replacedAt < 2000
}

export function noteSessionReplaced() {
  replacedAt = Date.now()
}

export function forceSignOut(code) {
  const notice = SESSION_NOTICES[code] || SESSION_NOTICES.session_ended
  revokeServerSession()
  clearBrowserSession({ broadcast: true, notice })
  window.dispatchEvent(new CustomEvent('atlas-session-logout'))
  window.location.assign('/signin')
}

function hasOtherOpenTab() {
  const now = Date.now()
  const stale = []
  let found = false
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key || !key.startsWith(TAB_PREFIX) || key === tabKey) continue
      const seen = Number(localStorage.getItem(key) || 0)
      if (!Number.isFinite(seen) || now - seen > 5000) stale.push(key)
      else found = true
    }
    stale.forEach((key) => localStorage.removeItem(key))
  } catch {
    return false
  }
  return found
}

export function requestSessionHandoff(timeoutMs = 450) {
  if (!channel || !hasOtherOpenTab()) return Promise.resolve(null)
  return new Promise((resolve) => {
    const finish = (value) => {
      if (handoffWaiter !== finish) return
      handoffWaiter = null
      resolve(value)
    }
    handoffWaiter = finish
    post({ type: 'session-request' })
    setTimeout(() => finish(getAccessToken() ? { access: getAccessToken() } : null), timeoutMs)
  })
}

function registerTab() {
  try {
    localStorage.setItem(tabKey, String(Date.now()))
  } catch {
    // A second tab will simply ask the person to sign in.
  }
}

function forgetTab() {
  try {
    localStorage.removeItem(tabKey)
  } catch {
    // The key expires on its own after a few seconds.
  }
}

if (browserAvailable()) {
  purgeLegacyPersistentTokens()
  try {
    channel = new BroadcastChannel('atlas-auth')
  } catch {
    channel = null
  }
  registerTab()
  window.setInterval(registerTab, 2000)
  window.addEventListener('pagehide', forgetTab)
  window.addEventListener('pageshow', registerTab)

  if (channel) {
    channel.onmessage = (event) => {
      const data = event.data || {}
      if (data.from === tabId) return
      if (data.type === 'session-request') {
        const access = getAccessToken()
        if (!access) return
        post({
          type: 'session-offer',
          access,
          refresh: getRefreshToken(),
          user: sessionStorage.getItem(USER) || '',
        })
        return
      }
      if (data.type === 'session-offer' && data.access) {
        noteSessionReplaced()
        writeSession({
          access: data.access,
          refresh: data.refresh,
          user: data.user,
          broadcast: false,
          touchActivity: false,
        })
        window.dispatchEvent(new CustomEvent('atlas-session-sync'))
        if (handoffWaiter) handoffWaiter(data)
        return
      }
      if (data.type === 'logout') {
        clearBrowserSession({
          broadcast: false,
          notice: data.notice || SESSION_NOTICES.session_ended,
        })
        window.dispatchEvent(new CustomEvent('atlas-session-logout'))
        window.location.assign('/signin')
      }
    }
  }
}
