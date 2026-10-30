import PropTypes from 'prop-types'

export default function AuthLayout({ bubbleText, children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#F7F9FC', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '480px', background: '#fff', borderRadius: '24px', boxShadow: '0 24px 80px rgba(14, 28, 54, 0.12)', overflow: 'hidden' }}>
        <div style={{ padding: '32px', background: '#8E1C1B', color: '#fff', fontWeight: 700, fontSize: '1.25rem' }}>
          {bubbleText}
        </div>
        <div style={{ padding: '32px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

AuthLayout.propTypes = {
  bubbleText: PropTypes.string,
  children: PropTypes.node,
}
