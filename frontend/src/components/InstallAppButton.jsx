import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import {
  isStandaloneDisplay,
  promptPwaInstall,
  subscribeInstallPrompt,
} from '../utils/pwaInstall'

/**
 * Shows an Install button when the browser can install ATLAS as an app.
 * Hidden when already installed / running standalone, or when the browser
 * never fires beforeinstallprompt (e.g. iOS Safari — use Share → Add to Home Screen).
 */
export default function InstallAppButton({
  className = '',
  style,
  variant = 'outline',
  label = 'Install App',
  fullWidth = false,
}) {
  const [canInstall, setCanInstall] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setCanInstall(false)
      return undefined
    }
    return subscribeInstallPrompt((prompt) => setCanInstall(Boolean(prompt)))
  }, [])

  if (!canInstall) return null

  async function handleClick() {
    if (busy) return
    setBusy(true)
    try {
      await promptPwaInstall()
    } finally {
      setBusy(false)
    }
  }

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: fullWidth ? '100%' : undefined,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.75 : 1,
    ...style,
  }

  if (variant === 'menu') {
    return (
      <button
        type="button"
        className={className}
        onClick={handleClick}
        disabled={busy}
        style={{
          ...baseStyle,
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: '#F0F0F2',
          fontSize: '0.85rem',
          fontWeight: 500,
          padding: '10px 14px',
          textAlign: 'left',
          borderRadius: 0,
        }}
      >
        <Download size={18} strokeWidth={2.25} aria-hidden="true" />
        {busy ? 'Installing…' : label}
      </button>
    )
  }

  return (
    <button
      type="button"
      className={className || (variant === 'primary' ? 'atlas-btn-primary' : 'atlas-btn-outline')}
      onClick={handleClick}
      disabled={busy}
      style={baseStyle}
      aria-label="Install ATLAS on this device"
    >
      <Download size={16} strokeWidth={2.25} aria-hidden="true" />
      {busy ? 'Installing…' : label}
    </button>
  )
}
