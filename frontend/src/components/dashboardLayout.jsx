// src/components/DashboardLayout.jsx
// Sidebar + topbar shell used by Faculty, Admin, and Superadmin dashboards.
// Pass `navItems` and `role` as props from each feature's layout.

import React, { useState, useEffect, useContext } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import atlasLogo       from '../assets/atlas-logo.png'
import { useAuth }     from '../store/authStore'
import { toInitials }  from '../utils'
import { ThemeContext } from '../App'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'

// ── Role config ───────────────────────────────────────────────────────────────
const ROLE_META = {
  superadmin: { label: 'Super Admin',   accent: '#FF453A', badge: 'SA' },
  admin:      { label: 'Admin',          accent: '#FF9F0A', badge: 'AD' },
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
          ? 'linear-gradient(135deg, rgba(139,0,0,0.35), rgba(192,57,43,0.20))'
          : 'transparent',
        border: isActive
          ? '1px solid rgba(192,57,43,0.35)'
          : '1px solid transparent',
        boxShadow: isActive ? '0 4px 16px rgba(139,0,0,0.2)' : 'none',
        transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--bg-header)'
            e.currentTarget.style.borderColor = 'var(--border-color)'
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
            background: 'linear-gradient(180deg, #FF6B6B, #8B0000)',
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
          color: isActive ? 'var(--active-color)' : 'var(--text-secondary)',
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
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const { mode, toggleColorMode } = useContext(ThemeContext)

  const [profileForm, setProfileForm] = useState({ name: '', department: '' })
  const [prefsForm, setPrefsForm] = useState({ email: true, push: true, digest: false })
  const [saveStatus, setSaveStatus] = useState('')

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

  // Effect to populate profile form when dialog opens
  useEffect(() => {
    if (profileOpen) {
      setProfileForm({
        name: user?.name || '',
        department: user?.department || 'College of Informatics', // Placeholder
      })
    }
  }, [profileOpen, user])

  function handleProfileFormChange(e) {
    setProfileForm(p => ({ ...p, [e.target.name]: e.target.value }))
  }

  function handlePrefsFormChange(e) {
    setPrefsForm(p => ({ ...p, [e.target.name]: e.target.checked }))
  }

  function handleSaveProfile() {
    // In a real app, this would make an API call to update the user profile.
    // For this demo, we'll just show a success message.
    setProfileOpen(false)
    setSaveStatus('Profile updated successfully!')
  }

  function handleSavePreferences() {
    // This would also make an API call in a real application.
    setPreferencesOpen(false)
    setSaveStatus('Preferences saved successfully!')
  }

  function handleLogout() {
    logout()
    navigate('/')
  }

  const sidebarW = collapsed ? 64 : 240

  const inputSx = {
    '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
    '& .MuiInputLabel-root': { fontSize: '0.875rem', color: 'var(--text-secondary)' },
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border-color)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--active-color)' },
    input: { color: 'var(--text-primary)' },
  }

  return (
    <div className={role === 'faculty' ? 'faculty-theme' : undefined} style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--bg-page)',
      fontFamily: 'var(--font-sans)',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ── Background orbs ─────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'rgba(139,0,0,0.08)', filter: 'blur(100px)', top: -100, left: -100 }} />
        <div style={{ position: 'absolute', width: 350, height: 350, borderRadius: '50%', background: 'rgba(100,0,0,0.06)', filter: 'blur(80px)', bottom: -80, right: -80 }} />
        {/* Subtle grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(var(--border-color) 1px, transparent 1px),
                            linear-gradient(90deg, var(--border-color) 1px, transparent 1px)`,
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
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-color)',
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
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
        }}>
          {(!collapsed || isMobile) && (
            <img
              src={atlasLogo}
              alt="ATLAS"
              style={{ height: 26, objectFit: 'contain', filter: mode === 'dark' ? 'brightness(0) invert(1)' : 'none', opacity: 0.9 }}
            />
          )}
          {collapsed && !isMobile && (
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, #8B0000, #C0392B)',
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
              color: 'var(--text-secondary)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center',
                transition: 'color 200ms',
              }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
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
            margin: '12px auto', background: 'var(--input-bg)',
            border: '1px solid var(--border-color)', borderRadius: 8,
            color: 'var(--text-secondary)', cursor: 'pointer',
              width: 40, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 200ms',
            }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-header)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--input-bg)' }}
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
        <div style={{
          borderTop: '1px solid var(--border-color)',
          padding: collapsed && !isMobile ? '12px 8px' : '12px 16px',
          flexShrink: 0,
          position: 'relative',
        }}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', background: 'var(--input-bg)',
              border: '1px solid var(--border-color)', borderRadius: 12,
              padding: collapsed && !isMobile ? '8px' : '8px 12px',
              cursor: 'pointer', transition: 'all 200ms', justifyContent: collapsed && !isMobile ? 'center' : 'flex-start',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-header)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--input-bg)'}
          >
            {/* Avatar */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #8B0000, #C0392B)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.78rem', fontWeight: 800, color: '#fff', flexShrink: 0,
            }}>
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
            {(!collapsed || isMobile) && (
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name || user?.email?.split('@')[0] || 'User'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email || meta.label}
                </div>
              </div>
            )}
          </button>

          {/* User dropdown */}
          {userMenuOpen && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              left: 8, right: 8,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0,0,0,0.15)',
              zIndex: 10,
            }}>
              {[
                { label: 'Profile Settings', icon: '👤', action: () => { setProfileOpen(true); setUserMenuOpen(false); } },
                { label: 'Preferences', icon: '⚙️', action: () => { setPreferencesOpen(true); setUserMenuOpen(false); } },
              ].map(({ label, icon, action }) => (
                <button
                  key={label}
                  onClick={action}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '10px 14px', color: 'var(--text-primary)',
                    fontSize: '0.85rem', fontFamily: 'var(--font-sans)', fontWeight: 500,
                    transition: 'background 150ms',
                  }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-header)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <span>{icon}</span> {label}
                </button>
              ))}
            <div style={{ height: 1, background: 'var(--border-color)', margin: '4px 0' }} />
              <button
                onClick={handleLogout}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '10px 14px', color: '#FF6B6B',
                  fontSize: '0.85rem', fontFamily: 'var(--font-sans)', fontWeight: 600,
                  transition: 'background 150ms',
                }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--active-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span>🚪</span> Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── TOPBAR ───────────────────────────────────────────────────────── */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: isMobile ? 0 : sidebarW,
        right: 0,
        height: 60,
        zIndex: 100,
        background: 'var(--topbar-bg)',
        borderBottom: '1px solid var(--border-color)',
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
            background: 'var(--input-bg)', border: '1px solid var(--border-color)',
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
            background: 'var(--input-bg)', border: '1px solid var(--border-color)',
            borderRadius: 10, color: 'var(--text-secondary)', cursor: 'pointer',
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', transition: 'all 200ms',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-header)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--input-bg)'}
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
            background: 'var(--input-bg)',
            border: '1px solid var(--border-color)',
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

      <Snackbar
        open={Boolean(saveStatus)}
        autoHideDuration={3000}
        onClose={() => setSaveStatus('')}
        message={saveStatus} />

      {/* ── PROFILE SETTINGS DIALOG ── */}
      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card)', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Profile Settings</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'linear-gradient(135deg, #8B0000, #C0392B)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', fontWeight: 800, color: '#fff',
              }}>
                {toInitials(user?.name || user?.email || 'U')}
              </div>
              <Button variant="outlined" size="small" sx={{ textTransform: 'none', color: 'var(--text-primary)', borderColor: 'var(--border-color)', '&:hover': { borderColor: 'var(--active-color)', color: 'var(--active-color)', background: 'var(--active-bg)' } }}>
                Change Avatar
              </Button>
            </Box>
            <TextField name="name" label="Full Name" value={profileForm.name} onChange={handleProfileFormChange} fullWidth size="small" sx={inputSx} />
            <TextField label="Email Address" defaultValue={user?.email || ''} fullWidth size="small" disabled sx={{ ...inputSx, opacity: 0.7 }} />
            <TextField label="Role" defaultValue={meta.label || ''} fullWidth size="small" disabled sx={{ ...inputSx, opacity: 0.7 }} />
            <TextField name="department" label="Department / Institution" value={profileForm.department} onChange={handleProfileFormChange} placeholder="e.g. College of Informatics" fullWidth size="small" sx={inputSx} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1, borderColor: 'var(--border-color)' }}>
          <Button onClick={() => setProfileOpen(false)} sx={{ color: 'var(--text-secondary)', textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveProfile} sx={{ bgcolor: 'var(--active-color)', textTransform: 'none', '&:hover': { bgcolor: 'var(--active-color-hover)' } }}>Save Changes</Button>
        </DialogActions>
      </Dialog>

      {/* ── PREFERENCES DIALOG ── */}
      <Dialog open={preferencesOpen} onClose={() => setPreferencesOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card)', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Preferences</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ color: 'var(--text-primary)', mb: 1, fontWeight: 700 }}>Appearance</Typography>
              <FormControlLabel
                control={<Switch checked={mode === 'dark'} onChange={toggleColorMode} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--active-color)' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--active-color)' } }} />}
                label={<Typography sx={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Dark Mode</Typography>}
              />
              <Typography variant="caption" sx={{ color: 'var(--text-tertiary)', display: 'block', mt: 0.5 }}>
                Toggle between light and dark theme globally. (Faculty dashboards use a customized light theme by default).
              </Typography>
            </Box>
            <Divider sx={{ borderColor: 'var(--border-color)' }} />
            <Box>
              <Typography variant="subtitle2" sx={{ color: 'var(--text-primary)', mb: 1, fontWeight: 700 }}>Notifications</Typography>
              <Stack spacing={1}>
                <FormControlLabel control={<Switch name="email" checked={prefsForm.email} onChange={handlePrefsFormChange} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--active-color)' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--active-color)' } }} />} label={<Typography sx={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Email Notifications</Typography>} />
                <FormControlLabel control={<Switch name="push" checked={prefsForm.push} onChange={handlePrefsFormChange} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--active-color)' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--active-color)' } }} />} label={<Typography sx={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Push Notifications</Typography>} />
                <FormControlLabel control={<Switch name="digest" checked={prefsForm.digest} onChange={handlePrefsFormChange} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: 'var(--active-color)' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: 'var(--active-color)' } }} />} label={<Typography sx={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Weekly Digest</Typography>} />
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button onClick={() => setPreferencesOpen(false)} sx={{ color: 'var(--text-secondary)', textTransform: 'none' }}>Close</Button>
          <Button variant="contained" onClick={handleSavePreferences} sx={{ bgcolor: 'var(--active-color)', textTransform: 'none', '&:hover': { bgcolor: 'var(--active-color-hover)' } }}>Save Preferences</Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}