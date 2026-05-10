// src/features/Superadmin/SuperAdminLayout.jsx
import React from 'react';
import { 
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Avatar, IconButton, Divider 
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import SecurityAuditIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpIcon from '@mui/icons-material/Help';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

// Config and Assets
import { ROUTES } from '../../config/route';
import atlasLogo from '../../assets/atlas-logo.png';

const drawerWidth = 260;

export default function SuperAdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', to: ROUTES.SUPERADMIN.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Account Management', to: ROUTES.SUPERADMIN.ACCOUNT_MANAGEMENT, icon: <AccountBalanceIcon /> },
    { label: 'System Management', to: ROUTES.SUPERADMIN.SYSTEM_MANAGEMENT, icon: <StorageIcon /> },
    { label: 'Audit Logs', to: ROUTES.SUPERADMIN.AUDIT_LOGS, icon: <SecurityAuditIcon /> },
  ];

  return (
    <Box sx={{ 
      display: 'flex', 
      minHeight: '100vh', 
      // NEW: Gradient Background instead of pure flat red
      background: 'linear-gradient(135deg, #A52028 0%, #4A0E12 100%)' 
    }}>
      
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
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
          <img src={atlasLogo} alt="ATLAS Logo" style={{ height: '40px', objectFit: 'contain' }} />
        </Box>
        
        <Divider sx={{ mx: 2, borderColor: '#E0E0E0' }} />

        <List sx={{ px: 2, pt: 2, flexGrow: 1 }}>
          {navItems.map((item, index) => {
            const isActive = location.pathname.includes(item.to);
            return (
              <Box key={item.label}>
                <ListItem disablePadding sx={{ mb: 1 }}>
                  <ListItemButton
                    onClick={() => navigate(item.to)}
                    sx={{
                      borderRadius: 2,
                      backgroundColor: isActive ? '#C62828' : 'transparent',
                      color: isActive ? '#FFFFFF' : '#EF5350',
                      '&:hover': { backgroundColor: isActive ? '#B71C1C' : '#FFEBEE' }
                    }}
                  >
                    <ListItemIcon sx={{ color: isActive ? '#FFFFFF' : '#EF5350', minWidth: 40 }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 700, fontSize: '0.95rem' }} />
                  </ListItemButton>
                </ListItem>
                {index < navItems.length - 1 && (
                  <Typography sx={{ color: '#B39DDB', textAlign: 'left', pl: 2, fontSize: '1.2rem', lineHeight: 0.5, mb: 2 }}>...</Typography>
                )}
              </Box>
            );
          })}

          <Divider sx={{ my: 2, borderColor: '#E0E0E0' }} />

          <ListItem disablePadding sx={{ mb: 1 }}>
            <ListItemButton sx={{ borderRadius: 2, color: '#EF5350', '&:hover': { backgroundColor: '#FFEBEE' } }}>
              <ListItemIcon sx={{ color: '#EF5350', minWidth: 40 }}><SettingsIcon /></ListItemIcon>
              <ListItemText primary="Settings" primaryTypographyProps={{ fontWeight: 700 }} />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton sx={{ borderRadius: 2, color: '#EF5350', '&:hover': { backgroundColor: '#FFEBEE' } }}>
              <ListItemIcon sx={{ color: '#EF5350', minWidth: 40 }}><HelpIcon /></ListItemIcon>
              <ListItemText primary="Help Center" primaryTypographyProps={{ fontWeight: 700 }} />
            </ListItemButton>
          </ListItem>
        </List>

        <Box sx={{ p: 3, pb: 4 }}>
          <Box sx={{ height: 120, borderRadius: 3, background: 'linear-gradient(135deg, #E53935 0%, #B71C1C 100%)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />
        </Box>
      </Drawer>

      {/* MAIN CONTENT AREA */}
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', p: 3, pb: 0 }}>
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

        <Box sx={{ p: 4, flexGrow: 1 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}