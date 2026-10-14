// src/components/SidebarUserMenu.jsx
// Bottom-left account area for the dashboard sidebars: the user chip plus the
// profile menu that opens above it.
//
// Extracted verbatim from components/dashboardLayout.jsx so the faculty
// workspace renders it identically. Do not restyle one copy — change this file
// and both sidebars follow.

import { useState } from 'react'

export default function SidebarUserMenu({
  user,
  metaLabel = 'User',
  collapsed = false,
  isMobile = false,
  onSignOut,
}) {
  const [open, setOpen] = useState(false)
  // Collapsed sidebars show only the avatar, so it centres and tightens up.
  const tight = collapsed && !isMobile

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '10px 14px', color: 'var(--text-primary)',
    fontSize: '0.85rem', fontFamily: 'var(--font-sans)', fontWeight: 500,
    transition: 'background 150ms',
  }
  const enter = e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }
  const leave = e => { e.currentTarget.style.background = 'none' }

  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: tight ? '12px 8px' : '12px 16px',
      flexShrink: 0,
      position: 'relative',
    }}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
          padding: tight ? '8px' : '8px 12px',
          cursor: 'pointer', transition: 'all 200ms', justifyContent: tight ? 'center' : 'flex-start',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
      >
        {/* Avatar */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, #15803D, #16A34A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>
          {(user?.name || user?.email || 'U')[0].toUpperCase()}
        </div>
        {!tight && (
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name || user?.email?.split('@')[0] || 'User'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email || metaLabel}
            </div>
          </div>
        )}
      </button>

      {/* Profile menu */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 8, right: 8,
          // A collapsed rail is far narrower than this menu needs, so let it
          // overhang instead of crushing the labels.
          minWidth: tight ? 200 : undefined,
          background: '#16161E', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          zIndex: 10,
        }}>
          {[
            { label: 'Profile Settings', icon: '👤' },
            { label: 'Preferences', icon: '⚙️' },
          ].map(({ label, icon }) => (
            <button
              key={label}
              style={itemStyle}
              onClick={() => setOpen(false)}
              onMouseEnter={enter}
              onMouseLeave={leave}
            >
              <span>{icon}</span> {label}
            </button>
          ))}
          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
          <button
            onClick={onSignOut}
            style={{ ...itemStyle, color: '#86EFAC', fontWeight: 600 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,80,80,0.08)' }}
            onMouseLeave={leave}
          >
            <span>🚪</span> Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
