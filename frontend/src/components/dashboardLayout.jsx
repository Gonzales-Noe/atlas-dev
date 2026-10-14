// src/components/DashboardLayout.jsx
// Sidebar + topbar shell used by Faculty, Admin, and Superadmin dashboards.
// Pass `navItems` and `role` as props from each feature's layout.

import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import atlasLogo       from '../assets/atlas-logo.png'
import { useAuth }     from '../store/authStore'
import { toInitials }  from '../utils'
import SidebarUserMenu from './SidebarUserMenu'

// ── Role config ───────────────────────────────────────────────────────────────
const ROLE_META = {
  superadmin: { label: 'Super Admin',   accent: '#86EFAC', badge: 'SA' },
  admin:      { label: 'Admin',          accent: '#16A34A', badge: 'AD' },
  faculty:    { label: 'Faculty',        accent: '#30D158', badge: 'FA' },
}

// ── Sidebar nav item ──────────────────────────────────────────────────────────
function NavItem({ item, collapsed }) {
  const location = useLocation()
  const isActive = location.pathname === item.to ||
    (item.to !== '/' && location.pathname.startsWith(item.to))

  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      style={{ textDecoration: 'none' }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 12,
        padding: collapsed ? '10px 0' : '10px 14px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 12,
        margin: '2px 8px',
        background: isActive
          ? 'linear-gradient(135deg, rgba(21,128,61,0.35), rgba(22,163,74,0.20))'
          : 'transparent',
        border: isActive
          ? '1px solid rgba(22,163,74,0.35)'
          : '1px solid transparent',
        boxShadow: isActive ? '0 4px 16px rgba(21,128,61,0.2)' : 'none',
        transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }
        }}
      >
        {/* Active indicator bar */}
        {isActive && (
          <div style={{
            position: 'absolute',
            left: 0, top: '20%', bottom: '20%',
            width: 3,
            background: 'linear-gradient(180deg, #86EFAC, #15803D)',
            borderRadius: '0 3px 3px 0',
          }} />
        )}

        {/* Icon */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          flexShrink: 0,
          color: isActive ? '#86EFAC' : 'rgba(255,255,255,0.45)',
          transition: 'color 200ms',
        }}>
          {React.cloneElement(item.icon, { style: { fontSize: 20 } })}
        </div>

        {/* Label */}
        {!collapsed && (
          <span style={{
            fontSize: '0.875rem',
            fontWeight: isActive ? 700 : 500,
            color: isActive ? '#F0F0F2' : 'rgba(255,255,255,0.55)',
            fontFamily: 'var(--font-sans)',
            whiteSpace: 'nowrap',
            transition: 'color 200ms',
          }}>
            {item.label}
          </span>
        )}
      </div>
    </Link>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────
export default function DashboardLayout({ children, navItems = [], role = 'faculty' }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const meta = ROLE_META[role] || ROLE_META.faculty

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) setCollapsed(true)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  function handleLogout() {
    logout()
    navigate('/')
  }

  const sidebarW = collapsed ? 64 : 240

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-base)',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Background orbs ─────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(21,128,61,0.08)', filter: 'blur(100px)', top: -100, left: -100 }} />
        <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'rgba(100,0,0,0.06)', filter: 'blur(80px)', bottom: -80, right: -80 }} />
        {/* Subtle grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)`,
          backgroundSize: '52px 52px',
        }} />
      </div>

      {/* ── Mobile overlay ───────────────────────────────────────────────── */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 998,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside style={{
        position: 'fixed',
        left: isMobile ? (mobileOpen ? 0 : -280) : 0,
        top: 0,
        bottom: 0,
        width: isMobile ? 260 : sidebarW,
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(10,10,14,0.92)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        transition: 'width 280ms cubic-bezier(0.4,0,0.2,1), left 280ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>

        {/* Logo area */}
        <div style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
          padding: collapsed && !isMobile ? '0 16px' : '0 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          {(!collapsed || isMobile) && (
            <img
              src={atlasLogo}
              alt="ATLAS"
              style={{
                height: 26,
                objectFit: 'contain',
                backgroundColor: '#fff',
                borderRadius: 4,
                padding: 2,
              }}
            />
          )}
          {collapsed && !isMobile && (
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, #15803D, #16A34A)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.72rem', fontWeight: 800, color: '#fff',
            }}>
              {meta.badge}
            </div>
          )}
          {(!collapsed || isMobile) && (
            <button
              onClick={() => isMobile ? setMobileOpen(false) : setCollapsed(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.35)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
                transition: 'color 200ms',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
          )}
          {collapsed && !isMobile && (
            <button
              onClick={() => setCollapsed(false)}
              style={{ display: 'none' }}
            />
          )}
        </div>

        {/* Expand button when collapsed (desktop) */}
        {collapsed && !isMobile && (
          <button
            onClick={() => setCollapsed(false)}
            style={{
              margin: '12px auto', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
              width: 40, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 200ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* Role badge */}
        {!collapsed && (
          <div style={{ padding: '12px 16px 8px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: `${meta.accent}18`,
              border: `1px solid ${meta.accent}40`,
              borderRadius: 8, padding: '4px 10px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.accent, boxShadow: `0 0 6px ${meta.accent}`, flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: meta.accent, letterSpacing: '0.06em' }}>
                {meta.label.toUpperCase()}
              </span>
            </div>
          </div>
        )}

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
          {navItems.map((item, i) => (
            <NavItem key={i} item={item} collapsed={collapsed && !isMobile} />
          ))}
        </nav>

        {/* User area */}
        <SidebarUserMenu
          user={user}
          metaLabel={meta.label}
          collapsed={collapsed}
          isMobile={isMobile}
          onSignOut={handleLogout}
        />
      </aside>

      {/* ── TOPBAR ───────────────────────────────────────────────────────── */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: isMobile ? 0 : sidebarW,
        right: 0,
        height: 60,
        zIndex: 100,
        background: 'rgba(8,8,10,0.85)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 16,
        transition: 'left 280ms cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Mobile hamburger */}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(true)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, color: 'var(--text-primary)', cursor: 'pointer',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Topbar right: notifications + user badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Notification bell */}
          <button style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, color: 'var(--text-secondary)', cursor: 'pointer',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', transition: 'all 200ms',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span style={{
              position: 'absolute', top: 6, right: 6,
              width: 7, height: 7, borderRadius: '50%',
              background: '#FF453A', boxShadow: '0 0 6px #FF453A',
            }} />
          </button>

          {/* Role pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 10, padding: '5px 12px',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.accent, boxShadow: `0 0 6px ${meta.accent}` }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
              {meta.label}
            </span>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main style={{
        marginLeft: isMobile ? 0 : sidebarW,
        marginTop: 60,
        minHeight: 'calc(100vh - 60px)',
        width: isMobile ? '100%' : `calc(100% - ${sidebarW}px)`,
        padding: '28px 28px',
        transition: 'margin-left 280ms cubic-bezier(0.4,0,0.2,1), width 280ms cubic-bezier(0.4,0,0.2,1)',
        position: 'relative',
        zIndex: 1,
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}>
        <div className="page-enter" style={{ minHeight: '100%' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
