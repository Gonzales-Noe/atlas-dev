const THEME_KEY = 'atlas_theme_preference'
const GENERATION_NOTIFICATIONS_KEY = 'atlas_generation_notifications'

export function getThemePreference() {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return
  document.body.classList.toggle('atlas-light', theme === 'light')
}

export function applyStoredThemePreference() {
  applyTheme(getThemePreference())
}

export function setThemePreference(theme) {
  const preference = theme === 'light' ? 'light' : 'dark'
  try {
    localStorage.setItem(THEME_KEY, preference)
  } catch {
    // The current page can still change themes if storage is unavailable.
  }
  applyTheme(preference)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('atlas-theme-change'))
  return preference
}

export function getGenerationNotificationsEnabled() {
  try {
    return localStorage.getItem(GENERATION_NOTIFICATIONS_KEY) === 'true'
  } catch {
    return false
  }
}

export async function setGenerationNotificationsEnabled(enabled) {
  if (!enabled) {
    try {
      localStorage.setItem(GENERATION_NOTIFICATIONS_KEY, 'false')
    } catch {
      // Keep the preference available for this session even without storage.
    }
    return { enabled: false, reason: '' }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { enabled: false, reason: 'unsupported' }
  }

  let permission = Notification.permission
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission()
    } catch {
      permission = 'denied'
    }
  }

  if (permission !== 'granted') {
    return { enabled: false, reason: permission }
  }

  try {
    localStorage.setItem(GENERATION_NOTIFICATIONS_KEY, 'true')
  } catch {
    return { enabled: false, reason: 'storage' }
  }
  return { enabled: true, reason: '' }
}

export function notifyGenerationComplete(category, itemName = '') {
  if (!getGenerationNotificationsEnabled()) return
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return

  const label = itemName.trim()
  const body = label ? `${label} is ready.` : `${category} generation is complete.`
  const notification = new Notification(`${category} ready`, {
    body,
    icon: '/favicon.svg',
    tag: `atlas-generation-${category.toLowerCase().replace(/\s+/g, '-')}`,
  })
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}