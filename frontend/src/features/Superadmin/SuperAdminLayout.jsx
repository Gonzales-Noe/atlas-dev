// src/features/Superadmin/SuperAdminLayout.jsx
import React from 'react';
import { 
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Avatar, IconButton, Divider 
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

import DashboardIcon from '@mui/icons-material/Dashboard';
import SecurityAuditIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpIcon from '@mui/icons-material/Help';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NotificationsIcon from '@mui/icons-material/Notifications';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import { ROUTES } from '../../config/route';
import atlasLogo from '../../assets/atlas-logo.png'; 

const drawerWidth = 260;

export default function SuperAdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', to: ROUTES.SUPERADMIN.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Audit Logs', to: ROUTES.SUPERADMIN.AUDIT_LOGS, icon: <SecurityAuditIcon /> },
    { label: 'System Management', to: ROUTES.SUPERADMIN.SYSTEM_MANAGEMENT, icon: <StorageIcon /> },
    { label: 'Account Management', to: ROUTES.SUPERADMIN.ACCOUNT_MANAGEMENT, icon: <AccountBalanceIcon /> },
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F4F7F9' }}>
      
      {/* SIDEBAR */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: '#FFFFFF',
            borderRight: 'none',
            boxShadow: '4px 0 24px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        {/* Logo Area */}
        <Box sx={{ p: 3, pb: 2, display: 'flex', justifyContent: 'center' }}>
          <img src={atlasLogo} alt="ATLAS Logo" style={{ height: '40px', objectFit: 'contain' }} />
        </Box>
        
        <Divider sx={{ mx: 3, mb: 2, borderColor: '#F1F5F9' }} />

        {/* Navigation Links */}
        <List sx={{ px: 2, pt: 0, flexGrow: 1 }}>
          {navItems.map((item, index) => {
            const isActive = location.pathname.includes(item.to);
            return (
              <Box key={item.label}>
                <ListItem disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={() => navigate(item.to)}
                    sx={{
                      borderRadius: '12px',
                      backgroundColor: isActive ? '#8B0000' : 'transparent',
                      color: isActive ? '#FFFFFF' : '#333333',
                      py: 1.2,
                      '&:hover': {
                        backgroundColor: isActive ? '#6B0000' : '#F1F5F9',
                      }
                    }}
                  >
                    <ListItemIcon sx={{ color: isActive ? '#FFFFFF' : '#666666', minWidth: 40 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText 
                      primary={item.label} 
                      primaryTypographyProps={{ fontWeight: isActive ? 700 : 500, fontSize: '0.95rem' }} 
                    />
                  </ListItemButton>
                </ListItem>
                
                {/* Dotted separator */}
                {index < navItems.length - 1 && (
                  <Box sx={{ borderBottom: '2px dotted #E2E8F0', mx: 2, my: 1.5 }} />
                )}
              </Box>
            );
          })}

          <Divider sx={{ my: 3, borderColor: '#F1F5F9' }} />

          {/* Bottom Action Links */}
          <ListItem disablePadding sx={{ mb: 1 }}>
            <ListItemButton sx={{ borderRadius: '12px', color: '#333333', '&:hover': { backgroundColor: '#F1F5F9' } }}>
              <ListItemIcon sx={{ color: '#666666', minWidth: 40 }}><SettingsIcon /></ListItemIcon>
              <ListItemText primary="Settings" primaryTypographyProps={{ fontWeight: 500 }} />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton sx={{ borderRadius: '12px', color: '#333333', '&:hover': { backgroundColor: '#F1F5F9' } }}>
              <ListItemIcon sx={{ color: '#666666', minWidth: 40 }}><HelpIcon /></ListItemIcon>
              <ListItemText primary="Help Center" primaryTypographyProps={{ fontWeight: 500 }} />
            </ListItemButton>
          </ListItem>
        </List>

        {/* Bottom Red Block */}
        <Box sx={{ p: 3, pb: 4 }}>
          <Box sx={{ 
            height: 120, 
            borderRadius: '20px', 
            background: 'linear-gradient(135deg, #A52028 0%, #6B0000 100%)',
            boxShadow: '0 8px 24px rgba(139,0,0,0.2)'
          }} />
        </Box>
      </Drawer>

      {/* MAIN CONTENT AREA */}
      <Box component="main" sx={{ flexGrow: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        
        {/* Deep Red Background Header - Positioned Absolutely */}
        <Box sx={{ 
          position: 'absolute', 
          top: 0, left: 0, right: 0, 
          height: 340, 
          backgroundColor: '#8B0000', 
          borderBottomLeftRadius: '32px',
          borderBottomRightRadius: '32px',
          zIndex: 0 
        }} />

        {/* Content Wrapper - Positioned Relatively to sit above the red background */}
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          
          {/* Top Header Controls */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', p: 4, pb: 1 }}>
            <IconButton sx={{ color: '#FFF', mr: 1 }}>
              <NotificationsIcon />
            </IconButton>
            <IconButton sx={{ color: '#FFF', mr: 2 }}>
              <InsertDriveFileIcon />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Avatar sx={{ border: '2px solid #FFF', width: 40, height: 40 }} src="" />
              <Box sx={{ color: '#FFF' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>Jasmin Esperida</Typography>
                <Typography sx={{ fontSize: '0.75rem', opacity: 0.8 }}>Admin</Typography>
              </Box>
              <IconButton size="small" sx={{ color: '#FFF', p: 0 }}>
                <KeyboardArrowDownIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Page Content Injects Here */}
          <Box sx={{ px: 4, pb: 4, flexGrow: 1 }}>
            {children}
          </Box>

        </Box>
      </Box>
    </Box>
  );
}