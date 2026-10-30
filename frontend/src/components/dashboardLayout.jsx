// src/components/DashboardLayout.jsx
// Sidebar + topbar shell used by Faculty, Admin, and Superadmin dashboards.
// Pass `navItems` and `role` as props from each feature's layout.

import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth }     from '../store/authStore'
import { toInitials }  from '../utils'
import SidebarUserMenu from './SidebarUserMenu'
import AtlasLogo from './AtlasLogo'

// ── Role config ───────────────────────────────────────────────────────────────
const ROLE_META = {
  superadmin: { label: 'Super Admin', accent: '#E24B4A' },
  admin:      { label: 'Admin', accent: '#AA2423' },
  faculty:    { label: 'Faculty', accent: '#30D158' },
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
          ? 'var(--shell-nav-active-bg)'
          : 'transparent',
        border: isActive
          ? '1px solid var(--shell-nav-active-border)'
          : '1px solid transparent',
        boxShadow: isActive ? '0 4px 16px rgba(142,28,27,0.2)' : 'none',
        transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--shell-hover-bg)'
            e.currentTarget.style.borderColor = 'var(--shell-hover-border)'
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
            background: 'linear-gradient(180deg, #E24B4A, #8E1C1B)',
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
          color: isActive ? 'var(--active-color)' : 'var(--shell-icon)',
          transition: 'color 200ms',
        }}>
          {React.cloneElement(item.icon, { style: { fontSize: 20 } })}
        </div>

        {/* Label */}
        {!collapsed && (
          <span style={{
            fontSize: '0.875rem',
            fontWeight: isActive ? 700 : 500,
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
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
  const { user, logout, updateProfile } = useAuth()
  const sidebarPreferenceKey = `atlas-dashboard-sidebar-collapsed:${user?.id ?? user?.email ?? role}`
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(sidebarPreferenceKey) === 'true'
    } catch {
      return false
    }
  })
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

  function updateSidebarPreference(nextCollapsed) {
    setCollapsed(nextCollapsed)
    try {
      window.localStorage.setItem(sidebarPreferenceKey, String(nextCollapsed))
    } catch {
      // Keep the sidebar usable when browser storage is unavailable.
    }
  }

  function toggleSidebar() {
    if (isMobile) {
      setMobileOpen(false)
      return
    }

    updateSidebarPreference(!collapsed)
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
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(142,28,27,0.08)', filter: 'blur(100px)', top: -100, left: -100 }} />
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
        background: 'var(--shell-bg)',
        borderRight: '1px solid var(--shell-border)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        transition: 'width 280ms cubic-bezier(0.4,0,0.2,1), left 280ms cubic-bezier(0.4,0,0.2,1)',
        overflow: isMobile ? 'hidden' : 'visible',
      }}>

        {/* Logo area */}
        <div style={{
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
          padding: collapsed && !isMobile ? '0 16px' : '0 16px',
          borderBottom: '1px solid var(--shell-divider)',
          flexShrink: 0,
        }}>
          {(!collapsed || isMobile) && (
            <AtlasLogo size={26} />
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            title={isMobile ? 'Close sidebar' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isMobile ? 'Close sidebar' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              background: 'var(--shell-btn-bg)', border: '1px solid var(--shell-btn-border)', cursor: 'pointer',
              color: 'var(--shell-icon-strong)', padding: 4, borderRadius: 8,
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 200ms, background 200ms, border-color 200ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--shell-btn-hover-bg)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--shell-icon-strong)'; e.currentTarget.style.background = 'var(--shell-btn-bg)' }}
          >
            {collapsed && !isMobile
              ? <PanelLeftOpen size={22} strokeWidth={2.75} />
              : <PanelLeftClose size={22} strokeWidth={2.75} />}
          </button>
        </div>

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
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: `var(--shell-badge-text, ${meta.accent})`, letterSpacing: '0.06em' }}>
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
          sidebarCollapsed={collapsed}
          onSidebarCollapsedChange={updateSidebarPreference}
          onUpdateProfile={updateProfile}
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
        background: 'var(--shell-topbar-bg)',
        borderBottom: '1px solid var(--shell-border)',
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
              background: 'var(--shell-btn-bg)', border: '1px solid var(--shell-btn-border)',
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
