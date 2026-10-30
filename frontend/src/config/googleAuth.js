export const GOOGLE_WEB_CLIENT_ID = (
  import.meta.env.VITE_GOOGLE_CLIENT_ID
  || '140618226788-lt31psljafm1en4n3aajo054thn5kfin.apps.googleusercontent.com'
).trim()

/** Google GIS caps standard button width at 400px. */
const GOOGLE_BUTTON_MAX_WIDTH = 400
const GOOGLE_BUTTON_MIN_WIDTH = 200

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

/** Prefer the ATLAS primary CTA (LOGIN / Continue with Email) width. */
function findSizeReference(container) {
  const root = container.closest('.form-panel') || container.parentElement
  return root?.querySelector('.btn-primary') || null
}

function clampGoogleWidth(px) {
  return Math.max(
    GOOGLE_BUTTON_MIN_WIDTH,
    Math.min(GOOGLE_BUTTON_MAX_WIDTH, Math.floor(px || 0)),
  )
}

function measureButtonWidth(container, preferredWidth) {
  if (preferredWidth) return clampGoogleWidth(preferredWidth)

  const ref = findSizeReference(container)
  const measured = Math.floor(
    ref?.getBoundingClientRect?.().width
    || ref?.offsetWidth
    || container.clientWidth
    || container.parentElement?.clientWidth
    || 0,
  )
  return clampGoogleWidth(measured || 360)
}

function paintGoogleButton(container, {
  onCredential,
  onError,
  context,
  theme,
  width,
}) {
  const google = window.google
  if (!google?.accounts?.id || !container) return

  const buttonWidth = measureButtonWidth(container, width)

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
}

/**
 * Mount Google's official Sign In button (popup UX).
 * Rectangular shape; width matches the nearby .btn-primary (LOGIN / Continue with Email)
 * up to Google's 400px max. Height is fixed by Google's "large" size.
 * @returns {Promise<() => void>} cleanup function
 */
export async function mountGoogleSignInButton(container, {
  onCredential,
  onError,
  context = 'signin',
  theme = 'outline',
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

  if (!window.google?.accounts?.id) {
    onError?.(new Error('Google sign-in failed to load.'))
    return () => {}
  }

  const options = { onCredential, onError, context, theme, width }
  let lastWidth = 0

  const render = () => {
    const nextWidth = measureButtonWidth(container, width)
    if (nextWidth === lastWidth && container.childElementCount > 0) return
    lastWidth = nextWidth
    paintGoogleButton(container, options)
  }

  // Wait a frame so .btn-primary has a real laid-out width before measuring.
  await new Promise((resolve) => requestAnimationFrame(() => resolve()))
  render()

  let resizeObserver
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => render())
    resizeObserver.observe(container)
    if (container.parentElement) resizeObserver.observe(container.parentElement)
    const ref = findSizeReference(container)
    if (ref) resizeObserver.observe(ref)
  }

  return () => {
    resizeObserver?.disconnect()
    container.innerHTML = ''
  }
}
