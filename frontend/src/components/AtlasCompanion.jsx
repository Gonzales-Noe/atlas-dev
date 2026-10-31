import atlasMascot from '../assets/atlas.webp'
import atlasMaintenance from '../assets/atlas-maintenance.png'

export default function AtlasCompanion({ message, variant = 'teach', size = 112 }) {
  const src = variant === 'maintenance' ? atlasMaintenance : atlasMascot
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
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
          borderRadius: 16,
          padding: '10px 14px',
          color: 'var(--text-primary)',
          fontWeight: 600,
          fontSize: '0.9rem',
          lineHeight: 1.45,
          boxShadow: 'var(--shadow-card)',
        }}>
          {message}
        </div>
      )}
    </div>
  )
}
