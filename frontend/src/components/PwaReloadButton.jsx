import { useEffect, useState } from 'react'

function ReloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 12a8.5 8.5 0 1 1-2.1-5.6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M20.8 3.2v5.2h-5.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function installedDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
}

export default function PwaReloadButton() {
  const [placement, setPlacement] = useState(null)

  useEffect(() => {
    const overlay = navigator.windowControlsOverlay
    const standaloneQuery = window.matchMedia('(display-mode: standalone)')
    const overlayQuery = window.matchMedia('(display-mode: window-controls-overlay)')

    const sync = () => {
      const shown = Boolean(overlay?.visible)
      if (shown) {
        const rect = overlay.getTitlebarAreaRect()
        const size = Math.max(rect.height, 32)
        document.documentElement.style.setProperty('--atlas-titlebar-h', `${rect.height}px`)
        setPlacement({
          mode: 'titlebar',
          drag: { top: rect.y, left: rect.x, width: rect.width, height: rect.height },
          button: {
            top: rect.y,
            left: rect.x + rect.width - size,
            width: size,
            height: rect.height || size,
          },
        })
        return
      }

      document.documentElement.style.setProperty('--atlas-titlebar-h', '0px')
      if (installedDisplay()) {
        setPlacement({
          mode: 'floating',
          button: { top: 18, right: 18, width: 36, height: 36 },
        })
        return
      }
      setPlacement(null)
    }

    sync()
    overlay?.addEventListener('geometrychange', sync)
    standaloneQuery.addEventListener('change', sync)
    overlayQuery.addEventListener('change', sync)
    return () => {
      overlay?.removeEventListener('geometrychange', sync)
      standaloneQuery.removeEventListener('change', sync)
      overlayQuery.removeEventListener('change', sync)
      document.documentElement.style.setProperty('--atlas-titlebar-h', '0px')
    }
  }, [])

  if (!placement) return null

  return (
    <>
      {placement.drag && <div className="atlas-pwa-drag" style={placement.drag} />}
      <button
        type="button"
        className={placement.mode === 'floating' ? 'atlas-pwa-reload atlas-pwa-reload-floating' : 'atlas-pwa-reload'}
        style={placement.button}
        aria-label="Reload"
        title="Reload"
        onClick={() => window.location.reload()}
      >
        <ReloadIcon />
      </button>
    </>
  )
}
