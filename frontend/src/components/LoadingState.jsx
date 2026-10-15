export default function LoadingState({ label = 'Loading...', fullScreen = false }) {
  return (
    <div
      className={`atlas-loading${fullScreen ? ' atlas-loading--screen' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="atlas-loading__bar" aria-hidden="true" />
      <span className="atlas-loading__label">{label}</span>
    </div>
  )
}
