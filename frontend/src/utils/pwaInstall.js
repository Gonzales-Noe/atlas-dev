/**
 * Captures the browser install prompt so ATLAS can show its own Install button.
 * Chromium fires `beforeinstallprompt` once the app meets PWA criteria.
 */

let deferredPrompt = null
const listeners = new Set()

function notify() {
  for (const listener of listeners) listener(deferredPrompt)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function getDeferredInstallPrompt() {
  return deferredPrompt
}

export function subscribeInstallPrompt(listener) {
  listeners.add(listener)
  listener(deferredPrompt)
  return () => listeners.delete(listener)
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  )
}

export async function promptPwaInstall() {
  if (!deferredPrompt) return { outcome: 'unavailable' }
  const promptEvent = deferredPrompt
  deferredPrompt = null
  notify()
  await promptEvent.prompt()
  const choice = await promptEvent.userChoice
  return { outcome: choice?.outcome || 'dismissed' }
}

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('ATLAS service worker registration failed.', error)
    })
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
