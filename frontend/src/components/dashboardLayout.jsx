// src/components/DashboardLayout.jsx
// Sidebar + topbar shell used by Faculty, Admin, and Superadmin dashboards.
// Pass `navItems` and `role` as props from each feature's layout.

import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Box             from '@mui/material/Box'
import Drawer          from '@mui/material/Drawer'
import AppBar          from '@mui/material/AppBar'
import Toolbar         from '@mui/material/Toolbar'
import List            from '@mui/material/List'
import ListItem        from '@mui/material/ListItem'
import ListItemButton  from '@mui/material/ListItemButton'
import ListItemIcon    from '@mui/material/ListItemIcon'
import ListItemText    from '@mui/material/ListItemText'
import IconButton      from '@mui/material/IconButton'
import Avatar          from '@mui/material/Avatar'
import Tooltip         from '@mui/material/Tooltip'
import Menu            from '@mui/material/Menu'
import MenuItem        from '@mui/material/MenuItem'
import Typography      from '@mui/material/Typography'
import Divider         from '@mui/material/Divider'
import Chip            from '@mui/material/Chip'
import MenuIcon        from '@mui/icons-material/Menu'
import LogoutIcon      from '@mui/icons-material/Logout'
import AccountCircleIcon from '@mui/icons-material/AccountCircle'
import SettingsIcon    from '@mui/icons-material/Settings'
import HelpIcon        from '@mui/icons-material/Help'
import LightModeIcon   from '@mui/icons-material/LightMode'
import DarkModeIcon    from '@mui/icons-material/DarkMode'
import atlasLogo       from '../assets/atlas-logo.png'
import { useAuth }     from '../store/authStore'
import { toInitials }  from '../utils'

const DRAWER_WIDTH = 240

const ROLE_CHIP_COLOR = {
  faculty:    { bg: 'rgba(139, 0, 0, 0.08)', color: '#8B0000', border: '1px solid rgba(139, 0, 0, 0.3)' },
  admin:      { bg: 'rgba(10, 132, 255, 0.15)', color: '#0a84ff', border: '1px solid rgba(10, 132, 255, 0.3)' },
  superadmin: { bg: 'rgba(191, 90, 242, 0.15)', color: '#bf5af2', border: '1px solid rgba(191, 90, 242, 0.3)' },
}

export default function DashboardLayout({ children, navItems = [], role }) {
  const location    = useLocation()
  const navigate    = useNavigate()
  const { user, logout } = useAuth()

  const [mobileOpen, setMobileOpen]   = useState(false)
  const [anchorEl, setAnchorEl]       = useState(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDarkMode, setIsDarkMode]   = useState(() => localStorage.getItem('atlas_theme_mode') !== 'light')
  const userMenuOpen = Boolean(anchorEl)

  useEffect(() => {
    const handleThemeChange = () => setIsDarkMode(localStorage.getItem('atlas_theme_mode') !== 'light')
    window.addEventListener('atlas_theme_changed', handleThemeChange)
    return () => window.removeEventListener('atlas_theme_changed', handleThemeChange)
  }, [])

  function handleLogout() {
    logout()
    navigate('/signin')
  }

  const toggleTheme = () => {
    const newMode = !isDarkMode
    setIsDarkMode(newMode)
    localStorage.setItem('atlas_theme_mode', newMode ? 'dark' : 'light')
    window.dispatchEvent(new Event('atlas_theme_changed'))
  }

  const chip = ROLE_CHIP_COLOR[role] || ROLE_CHIP_COLOR.faculty
  const currentDrawerWidth = isCollapsed ? 80 : DRAWER_WIDTH

  const sidebarContent = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Brand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '0' : '0 8px 0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: 57,
          boxSizing: 'border-box'
        }}
      >
        {!isCollapsed && (
          <div style={{ overflow: 'hidden', display: 'flex' }}>
            <img src={atlasLogo} alt="ATLAS Logo" style={{ height: 28, objectFit: 'contain', objectPosition: 'left' }} />
          </div>
        )}
        <IconButton onClick={() => setIsCollapsed(!isCollapsed)} size="small" sx={{ color: isDarkMode ? '#fff' : '#111827' }}>
          <MenuIcon />
        </IconButton>
      </div>

      {/* User info */}
      <div style={{ padding: isCollapsed ? '14px 0 10px' : '14px 20px 10px', display: 'flex', flexDirection: 'column', alignItems: isCollapsed ? 'center' : 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
          <Avatar
            sx={{
              width: 36, height: 36,
              background: chip.color,
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {toInitials(user?.name || user?.email || 'U')}
          </Avatar>
          {!isCollapsed && (
            <div>
              <Typography variant="body2" sx={{ fontWeight: 700, color: isDarkMode ? '#FFFFFF' : '#111827', lineHeight: 1.2 }}>
                {user?.name || 'User'}
              </Typography>
              <Typography variant="caption" sx={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#6B7280', fontSize: '0.72rem' }}>
                {user?.email}
              </Typography>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <Chip
            label={role?.toUpperCase() || 'FACULTY'}
            size="small"
            sx={{
              mt: 1.2,
              background: chip.bg,
              color: chip.color,
              border: chip.border,
              fontWeight: 700,
              fontSize: '0.68rem',
              letterSpacing: '0.06em',
              height: 20,
            }}
          />
        )}
      </div>

      <Divider sx={{ mx: isCollapsed ? 1 : 2, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />

      {/* Nav items */}
      <List sx={{ flex: 1, px: 1, py: 1, overflowX: 'hidden' }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to))
          return (
            <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={isCollapsed ? item.label : ''} placement="right" disableHoverListener={!isCollapsed}>
              <ListItemButton
                component={Link}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                sx={{
                  borderRadius: 2,
                  py: 1,
                  px: isCollapsed ? 0 : 2,
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  background:    isActive ? chip.bg : 'transparent',
                  color:         isActive ? chip.color : (isDarkMode ? 'rgba(255,255,255,0.7)' : '#4B5563'),
                  '&:hover': {
                    background: chip.bg,
                    color: chip.color,
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: isCollapsed ? 0 : 36,
                    mr: isCollapsed ? 0 : 1,
                    justifyContent: 'center',
                    color: isActive ? chip.color : 'inherit',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {!isCollapsed && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '0.88rem',
                      fontWeight: isActive ? 700 : 500,
                    }}
                  />
                )}
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute', left: 0, width: 3, height: 20,
                      background: chip.color, boxShadow: `0 0 8px ${chip.color}`,
                      borderRadius: '0 2px 2px 0',
                    }}
                  />
                )}
              </ListItemButton>
              </Tooltip>
            </ListItem>
          )
        })}
      </List>

      {/* Bottom: Settings, Help, Sign out */}
      <Divider sx={{ mx: isCollapsed ? 1 : 2, borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
      <List sx={{ px: 1, py: 1 }}>
        {[
          { label: 'Settings', icon: <SettingsIcon fontSize="small" />, action: () => {} },
          { label: 'Help Center', icon: <HelpIcon fontSize="small" />, action: () => {} },
          { label: 'Sign Out', icon: <LogoutIcon fontSize="small" />, action: handleLogout },
        ].map((item) => (
          <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
            <Tooltip title={isCollapsed ? item.label : ''} placement="right" disableHoverListener={!isCollapsed}>
              <ListItemButton
                onClick={item.action}
                sx={{
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  borderRadius: 2, py: 1, px: isCollapsed ? 0 : 2, color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#4B5563',
                  '&:hover': { background: chip.bg, color: chip.color },
                }}
              >
                <ListItemIcon sx={{ minWidth: isCollapsed ? 0 : 36, mr: isCollapsed ? 0 : 1, justifyContent: 'center', color: 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                {!isCollapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.88rem', fontWeight: 500 }} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </div>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: isDarkMode ? '#000000' : '#F7F9FC', backgroundImage: isDarkMode ? 'radial-gradient(circle at 15% 50%, rgba(255, 45, 85, 0.15), transparent 25%), radial-gradient(circle at 85% 30%, rgba(10, 132, 255, 0.15), transparent 25%)' : 'none' }}>
      <style>{`
        :root {
          --border-color:      ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
          --bg-card:           ${isDarkMode ? 'rgba(30, 30, 35, 0.4)' : '#ffffff'};
          --bg-page:           ${isDarkMode ? '#000000' : '#F7F9FC'};
          --bg-header:         ${isDarkMode ? 'rgba(255,255,255,0.05)' : '#F3F4F6'};
          --text-primary:      ${isDarkMode ? '#ffffff' : '#111827'};
          --text-secondary:    ${isDarkMode ? 'rgba(255,255,255,0.6)' : '#4B5563'};
          --input-border:      ${isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.23)'};
          --input-border-hover:${isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.5)'};
          --scrollbar-thumb:   ${isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
        }

        /* ── Page & scrollbars ─────────────────────── */
        body { background: var(--bg-page) !important; color: var(--text-primary) !important; }
        * { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent; }
        *::-webkit-scrollbar { width: 6px; height: 6px; }
        *::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }

        /* ── Cards / Paper ─────────────────────────── */
        .MuiPaper-root, .MuiCard-root {
          background: var(--bg-card) !important;
          backdrop-filter: ${isDarkMode ? 'blur(24px)' : 'none'} !important;
          -webkit-backdrop-filter: ${isDarkMode ? 'blur(24px)' : 'none'} !important;
          border: 1px solid var(--border-color) !important;
          box-shadow: ${isDarkMode ? '0 8px 32px 0 rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)'} !important;
          color: var(--text-primary) !important;
        }

        /* ── Typography ────────────────────────────── */
        .MuiTypography-root { color: var(--text-primary) !important; }
        .MuiTypography-colorTextSecondary,
        [class*="MuiTypography-"][class*="Secondary"] { color: var(--text-secondary) !important; }

        /* ── Table ─────────────────────────────────── */
        .MuiTableCell-root {
          border-color: var(--border-color) !important;
          color: var(--text-primary) !important;
          background: transparent !important;
        }
        .MuiTableCell-head { background: var(--bg-header) !important; font-weight: 700 !important; }
        .MuiDivider-root { border-color: var(--border-color) !important; }

        /* ── Form inputs ───────────────────────────── */
        .MuiInputBase-root { color: var(--text-primary) !important; background: transparent !important; }
        .MuiInputBase-root.Mui-disabled { color: var(--text-secondary) !important; -webkit-text-fill-color: var(--text-secondary) !important; }
        .MuiOutlinedInput-notchedOutline { border-color: var(--input-border) !important; }
        .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline { border-color: var(--input-border-hover) !important; }
        .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline { border-color: ${chip.color} !important; }
        .MuiInputLabel-root { color: var(--text-secondary) !important; }
        .MuiInputLabel-root.Mui-focused { color: ${chip.color} !important; }
        .MuiInputBase-input::placeholder { color: var(--text-secondary) !important; opacity: 0.7 !important; }
        .MuiSelect-icon { color: var(--text-secondary) !important; }

        /* ── Chips: only override generic ones, not accent chips ── */
        .MuiChip-root:not([style*="color"]) {
          background: ${isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'} !important;
          color: var(--text-primary) !important;
          border-color: var(--border-color) !important;
        }

        /* ── Alert ─────────────────────────────────── */
        .MuiAlert-root { color: var(--text-primary) !important; }

        /* ── List items ────────────────────────────── */
        .MuiListItemText-primary, .MuiListItemText-secondary { color: inherit !important; }
        .MuiMenuItem-root { color: var(--text-primary) !important; }

        /* ── Recharts ──────────────────────────────── */
        .recharts-text tspan { fill: var(--text-secondary) !important; }
        .recharts-cartesian-grid-horizontal line,
        .recharts-cartesian-grid-vertical line { stroke: var(--border-color) !important; }
        .recharts-tooltip-wrapper .recharts-default-tooltip {
          background: var(--bg-card) !important;
          border-color: var(--border-color) !important;
          color: var(--text-primary) !important;
        }
      `}</style>

      {/* ── Sidebar desktop ─────────────────────────────────────── */}
      <Drawer
        variant="permanent"
        sx={{
          width: currentDrawerWidth,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: currentDrawerWidth,
            transition: 'width 0.2s',
            overflowX: 'hidden',
            boxSizing: 'border-box',
            borderRight: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
            background: isDarkMode ? 'rgba(20, 20, 25, 0.65)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          },
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* ── Sidebar mobile drawer ────────────────────────────────── */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: isDarkMode ? 'rgba(20, 20, 25, 0.65)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
            borderRight: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)'
          },
        }}
      >
        {sidebarContent}
      </Drawer>

      {/* ── Main content ──────────────────────────────────────────── */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          overflow: 'hidden',
        }}
      >
        {/* Top bar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            background: isDarkMode ? 'rgba(20, 20, 25, 0.65)' : 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderBottom: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)',
            zIndex: (theme) => theme.zIndex.drawer - 1,
          }}
        >
          <Toolbar sx={{ gap: 2, minHeight: '56px !important' }}>
            {/* Mobile hamburger */}
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' }, color: isDarkMode ? '#fff' : '#111827' }}
            >
              <MenuIcon />
            </IconButton>

            {/* Page title (filled by children via context if needed) */}
            <Box sx={{ flex: 1 }} />

            {/* Theme Toggle */}
            <Tooltip title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              <IconButton
                onClick={toggleTheme}
                size="small"
                sx={{ color: isDarkMode ? '#fff' : '#111827', mr: 0.5 }}
              >
                {isDarkMode ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
              </IconButton>
            </Tooltip>

            {/* User avatar button */}
            <Tooltip title="Account">
              <IconButton
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{ p: 0.5 }}
              >
                <Avatar
                  sx={{
                    width: 32, height: 32,
                  background: chip.color,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  {toInitials(user?.name || user?.email || 'U')}
                </Avatar>
              </IconButton>
            </Tooltip>

            {/* User drop-down menu */}
            <Menu
              anchorEl={anchorEl}
              open={userMenuOpen}
              onClose={() => setAnchorEl(null)}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              PaperProps={{
                sx: { mt: 1, borderRadius: 4, minWidth: 180, background: isDarkMode ? 'rgba(30, 30, 35, 0.8)' : '#ffffff', backdropFilter: 'blur(24px)', border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', color: isDarkMode ? '#fff' : '#111827' },
              }}
            >
              <MenuItem disabled sx={{ opacity: 1, pb: 0 }}>
                <div>
                  <Typography variant="body2" fontWeight={700} sx={{ color: isDarkMode ? '#fff' : '#111827' }}>{user?.name}</Typography>
                  <Typography variant="caption" sx={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>{user?.email}</Typography>
                </div>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => setAnchorEl(null)}>
                <AccountCircleIcon fontSize="small" sx={{ mr: 1.5, color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#6B7280' }} />
                Profile
              </MenuItem>
              <MenuItem onClick={handleLogout} sx={{ color: chip.color }}>
                <LogoutIcon fontSize="small" sx={{ mr: 1.5 }} />
                Sign Out
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box sx={{ flex: 1, p: { xs: 2, md: 3 }, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}