export const GOOGLE_WEB_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '140618226788-lt31psljafm1en4n3aajo054thn5kfin.apps.googleusercontent.com'
).trim()

export function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) return Promise.resolve()

  const existing = document.querySelector('script[data-google-auth="atlas"]')
  if (existing) {
    if (window.google?.accounts?.id) return Promise.resolve()
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Google Sign-In failed to load.')), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.dataset.googleAuth = 'atlas'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Google Sign-In failed to load.')), { once: true })
    document.body.appendChild(script)
  })
}

export async function requestGoogleCredential() {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Google sign-in is not configured on this environment.')
  }
  await loadGoogleIdentityScript()
  const google = window.google
  if (!google?.accounts?.id) {
    throw new Error('Google sign-in failed to load.')
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      callback: (response) => {
        if (response?.credential) finish(resolve, response.credential)
        else finish(reject, new Error('Google sign-in was cancelled.'))
      },
    })
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        finish(reject, new Error('Google sign-in is blocked for this site. Add this origin in Google Cloud: Authorized JavaScript origins.'))
      }
    })
  })
}
