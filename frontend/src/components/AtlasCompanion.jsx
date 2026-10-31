import atlasMascot from '../assets/atlas.webp'
import atlasMaintenance from '../assets/atlas-maintenance.png'

export default function AtlasCompanion({ message, variant = 'teach', size = 56 }) {
  const src = variant === 'maintenance' ? atlasMaintenance : atlasMascot
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          imageRendering: 'pixelated',
          flexShrink: 0,
        }}
      />
      {message && (
        <div style={{
          background: 'var(--bg-elevated, #fff)',
          border: '1px solid var(--border-color)',
          borderRadius: 12,
          padding: '6px 12px',
          color: 'var(--text-primary)',
          fontWeight: 600,
          fontSize: '0.82rem',
          lineHeight: 1.35,
          boxShadow: 'var(--shadow-card)',
        }}>
          {message}
        </div>
      )}
    </div>
  )
}
