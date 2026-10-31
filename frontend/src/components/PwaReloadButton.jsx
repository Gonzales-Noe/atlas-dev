import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'

export default function PwaReloadButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const overlay = navigator.windowControlsOverlay
    if (!overlay) return undefined

    const sync = () => {
      const shown = Boolean(overlay.visible)
      setVisible(shown)
      const height = shown ? overlay.getTitlebarAreaRect().height : 0
      document.documentElement.style.setProperty('--atlas-titlebar-h', `${height}px`)
    }

    sync()
    overlay.addEventListener('geometrychange', sync)
    return () => {
      overlay.removeEventListener('geometrychange', sync)
      document.documentElement.style.setProperty('--atlas-titlebar-h', '0px')
    }
  }, [])

  if (!visible) return null

  return (
    <>
      <div className="atlas-pwa-drag" />
      <button
        type="button"
        className="atlas-pwa-reload"
        aria-label="Reload"
        title="Reload"
        onClick={() => window.location.reload()}
      >
        <RotateCw size={15} />
      </button>
    </>
  )
}
