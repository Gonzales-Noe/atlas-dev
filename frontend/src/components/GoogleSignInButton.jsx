import React, { useEffect, useRef } from 'react'
import { mountGoogleSignInButton } from '../config/googleAuth'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

/**
 * ATLAS-styled Google button shell over GIS renderButton + popup UX.
 * The visible face matches the old btn-google look; clicks hit the real Google button.
 */
export default function GoogleSignInButton({
  onCredential,
  onError,
  context = 'signin',
  disabled = false,
  style,
}) {
  const gisRef = useRef(null)
  const handlersRef = useRef({ onCredential, onError })
  handlersRef.current = { onCredential, onError }

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}

    const host = gisRef.current
    const width = Math.floor(host?.parentElement?.clientWidth || 360)

    mountGoogleSignInButton(host, {
      context,
      theme: 'outline',
      width,
      onCredential: (credential) => handlersRef.current.onCredential?.(credential),
      onError: (err) => handlersRef.current.onError?.(err),
    }).then((dispose) => {
      if (disposed) dispose()
      else cleanup = dispose
    })

    return () => {
      disposed = true
      cleanup()
    }
  }, [context])

  return (
    <div
      className="atlas-google-signin"
      style={{
        position: 'relative',
        width: '100%',
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        ...style,
      }}
    >
      <style>{`
        .atlas-google-signin__face {
          width: 100%;
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.8);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          padding: 0.85rem;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-sizing: border-box;
          transition: border-color 0.2s, background 0.2s;
          pointer-events: none;
          user-select: none;
        }
        .atlas-google-signin:hover .atlas-google-signin__face {
          border-color: rgba(255,255,255,0.28);
          background: rgba(255,255,255,0.09);
        }
        .atlas-google-signin__gis {
          position: absolute;
          inset: 0;
          z-index: 2;
          overflow: hidden;
          border-radius: 12px;
          opacity: 0.02;
          cursor: pointer;
        }
        .atlas-google-signin__gis > div {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
        }
        .atlas-google-signin__gis iframe {
          position: absolute !important;
          inset: 0 !important;
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          min-height: 100% !important;
          transform: scale(1.15);
          transform-origin: center center;
        }
      `}</style>

      <div className="atlas-google-signin__face" aria-hidden="true">
        <GoogleIcon />
        Continue with Google
      </div>
      <div
        ref={gisRef}
        className="atlas-google-signin__gis"
        role="button"
        aria-label="Continue with Google"
      />
    </div>
  )
}
