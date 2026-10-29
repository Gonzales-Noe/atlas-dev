const bar = (width, height = 14) => ({
  height,
  width,
  borderRadius: 10,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.05) 63%)',
  backgroundSize: '400% 100%',
  animation: 'atlas-skeleton 1.4s ease infinite',
})

export default function RouteSkeleton({ compact = false }) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading page"
      style={{
        minHeight: compact ? 0 : '100vh',
        boxSizing: 'border-box',
        background: compact ? 'transparent' : '#08080A',
        padding: compact ? '16px' : '32px 24px',
      }}
    >
      <style>{`@keyframes atlas-skeleton { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }`}</style>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={bar(220, 28)} />
        <div style={{ ...bar(340), marginTop: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 28 }}>
          {[0, 1, 2, 3].map((item) => <div key={item} style={bar('100%', 72)} />)}
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} style={bar('100%', 48)} />)}
        </div>
      </div>
    </main>
  )
}
