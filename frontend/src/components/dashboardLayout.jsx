// src/components/DashboardLayout.jsx
// Sidebar + topbar shell used by Faculty, Admin, and Superadmin dashboards.
// Pass `navItems` and `role` as props from each feature's layout.

import { useState }    from 'react'
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
import AtlasLogo       from './AtlasLogo'
import { useAuth }     from '../store/authStore'
import { toInitials }  from '../utils'

const DRAWER_WIDTH = 240

const ROLE_CHIP_COLOR = {
  faculty:    { bg: '#FFF5F5', color: '#8B0000' },
  admin:      { bg: '#E3F2FD', color: '#1565C0' },
  superadmin: { bg: '#F3E5F5', color: '#6A1B9A' },
}

export default function DashboardLayout({ children, navItems = [], role }) {
  const location    = useLocation()
  const navigate    = useNavigate()
  const { user, logout } = useAuth()

  const [mobileOpen, setMobileOpen]   = useState(false)
  const [anchorEl, setAnchorEl]       = useState(null)
  const userMenuOpen = Boolean(anchorEl)

  function handleLogout() {
    logout()
    navigate('/signin')
  }

  const chip = ROLE_CHIP_COLOR[role] || ROLE_CHIP_COLOR.faculty

  const sidebarContent = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Brand */}
      <div
        style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid rgba(139,0,0,0.08)',
        }}
      >
        <AtlasLogo size={28} />
      </div>

      {/* User info */}
      <div style={{ padding: '14px 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            sx={{
              width: 36, height: 36,
              background: '#8B0000',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {toInitials(user?.name || user?.email || 'U')}
          </Avatar>
          <div>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#1A1A1A', lineHeight: 1.2 }}>
              {user?.name || 'User'}
            </Typography>
            <Typography variant="caption" sx={{ color: '#888', fontSize: '0.72rem' }}>
              {user?.email}
            </Typography>
          </div>
        </div>
        <Chip
          label={role?.toUpperCase() || 'FACULTY'}
          size="small"
          sx={{
            mt: 1.2,
            background: chip.bg,
            color: chip.color,
            fontWeight: 700,
            fontSize: '0.68rem',
            letterSpacing: '0.06em',
            height: 20,
          }}
        />
      </div>

      <Divider sx={{ mx: 2, borderColor: 'rgba(139,0,0,0.08)' }} />

      {/* Nav items */}
      <List sx={{ flex: 1, px: 1, py: 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(item.to))
          return (
            <ListItem key={item.label} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                component={Link}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                sx={{
                  borderRadius: 2,
                  py: 1,
                  background:    isActive ? 'rgba(139,0,0,0.08)'  : 'transparent',
                  color:         isActive ? '#8B0000'              : '#555',
                  '&:hover': {
                    background: 'rgba(139,0,0,0.06)',
                    color: '#8B0000',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: isActive ? '#8B0000' : '#888',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontSize: '0.88rem',
                    fontWeight: isActive ? 700 : 500,
                  }}
                />
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    style={{
                      width: 3, height: 20,
                      background: '#8B0000',
                      borderRadius: 2,
                      marginLeft: 4,
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          )
        })}
      </List>

      {/* Bottom: logout */}
      <Divider sx={{ mx: 2, borderColor: 'rgba(139,0,0,0.08)' }} />
      <List sx={{ px: 1, py: 1 }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              borderRadius: 2, py: 1, color: '#888',
              '&:hover': { background: 'rgba(139,0,0,0.06)', color: '#8B0000' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Sign Out"
              primaryTypographyProps={{ fontSize: '0.88rem', fontWeight: 500 }}
            />
          </ListItemButton>
        </ListItem>
      </List>
    </div>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', background: '#F7F7F8' }}>

      {/* ── Sidebar desktop ─────────────────────────────────────── */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            border: 'none',
            borderRight: '1px solid rgba(0,0,0,0.06)',
            background: '#ffffff',
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
            background: '#ffffff',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            zIndex: (theme) => theme.zIndex.drawer - 1,
          }}
        >
          <Toolbar sx={{ gap: 2, minHeight: '56px !important' }}>
            {/* Mobile hamburger */}
            <IconButton
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' }, color: '#555' }}
            >
              <MenuIcon />
            </IconButton>

            {/* Page title (filled by children via context if needed) */}
            <Box sx={{ flex: 1 }} />

            {/* User avatar button */}
            <Tooltip title="Account">
              <IconButton
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{ p: 0.5 }}
              >
                <Avatar
                  sx={{
                    width: 32, height: 32,
                    background: '#8B0000',
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
                sx: { mt: 1, borderRadius: 2, minWidth: 180, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' },
              }}
            >
              <MenuItem disabled sx={{ opacity: 1, pb: 0 }}>
                <div>
                  <Typography variant="body2" fontWeight={700}>{user?.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
                </div>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => setAnchorEl(null)}>
                <AccountCircleIcon fontSize="small" sx={{ mr: 1.5, color: '#888' }} />
                Profile
              </MenuItem>
              <MenuItem onClick={handleLogout} sx={{ color: '#8B0000' }}>
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