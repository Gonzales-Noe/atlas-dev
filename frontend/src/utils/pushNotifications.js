import api from '../config/api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output
}

async function readyRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    await navigator.serviceWorker.register('/sw.js')
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => { window.setTimeout(() => resolve(null), 4000) }),
    ])
  } catch {
    return null
  }
}

export async function setServerAlertsEnabled(enabled) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { enabled: false, reason: 'unsupported' }
  }
  const registration = await readyRegistration()
  if (!registration) return { enabled: false, reason: 'unsupported' }

  if (!enabled) {
    try {
      const current = await registration.pushManager.getSubscription()
      const endpoint = current?.endpoint
      if (current) await current.unsubscribe()
      if (endpoint) {
        await api.delete('/auth/notifications/push-subscribe/', { data: { endpoint } })
      }
    } catch {
      return { enabled: false, reason: 'failed' }
    }
    return { enabled: false, reason: '' }
  }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return { enabled: false, reason: Notification.permission || 'denied' }
  }

  try {
    const { data } = await api.get('/auth/notifications/push-key/', { atlasCache: false })
    const key = data?.public_key
    if (!key) return { enabled: false, reason: 'unavailable' }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
    const json = subscription.toJSON()
    await api.post('/auth/notifications/push-subscribe/', {
      endpoint: json.endpoint,
      keys: json.keys,
    })
    return { enabled: true, reason: '' }
  } catch {
    return { enabled: false, reason: 'unavailable' }
  }
}
