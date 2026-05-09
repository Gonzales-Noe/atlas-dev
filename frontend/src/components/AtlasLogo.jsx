export default function AtlasLogo({ size = 28 }) {
  const border = Math.max(2, Math.round(size * 0.08))
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${border}px solid #8B0000`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8B0000',
        fontWeight: 700,
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        background: '#fff',
      }}
    >
      A
    </div>
  )
}
