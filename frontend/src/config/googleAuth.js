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

/**
 * Mount Google's official Sign In button (popup UX).
 * More reliable than One Tap prompt() for custom "Continue with Google" flows.
 * @returns {Promise<() => void>} cleanup function
 */
export async function mountGoogleSignInButton(container, {
  onCredential,
  onError,
  context = 'signin',
  theme = 'filled_black',
  width,
} = {}) {
  if (!container) return () => {}

  if (!GOOGLE_WEB_CLIENT_ID) {
    onError?.(new Error('Google sign-in is not configured on this environment.'))
    return () => {}
  }

  try {
    await loadGoogleIdentityScript()
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error('Google sign-in failed to load.'))
    return () => {}
  }

  const google = window.google
  if (!google?.accounts?.id) {
    onError?.(new Error('Google sign-in failed to load.'))
    return () => {}
  }

  const buttonWidth = Math.max(
    240,
    Math.min(400, Math.floor(width || container.clientWidth || container.parentElement?.clientWidth || 360)),
  )

  google.accounts.id.initialize({
    client_id: GOOGLE_WEB_CLIENT_ID,
    callback: (response) => {
      if (response?.credential) onCredential?.(response.credential)
      else onError?.(new Error('Google sign-in was cancelled.'))
    },
    ux_mode: 'popup',
    context,
    auto_select: false,
    cancel_on_tap_outside: true,
  })

  container.innerHTML = ''
  google.accounts.id.renderButton(container, {
    type: 'standard',
    theme,
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: buttonWidth,
  })

  return () => {
    container.innerHTML = ''
  }
}
