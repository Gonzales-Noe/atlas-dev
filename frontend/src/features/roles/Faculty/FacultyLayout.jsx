// src/features/Faculty/FacultyLayout.jsx
import React from 'react';
import { 
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, 
  ListItemText, Typography, Avatar, IconButton, Divider 
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import QuizIcon from '@mui/icons-material/Quiz';
import BarChartIcon from '@mui/icons-material/BarChart';
import SchoolIcon from '@mui/icons-material/School';
import SettingsIcon from '@mui/icons-material/Settings';
import HelpIcon from '@mui/icons-material/Help';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NotificationsIcon from '@mui/icons-material/Notifications';

// Config and Assets
import { ROUTES } from '../../../config/route';
import atlasLogo from '../../../assets/atlas-logo.png'; // Adjust path if needed

const drawerWidth = 260;

export default function FacultyLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', to: ROUTES.FACULTY.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Syllabus', to: ROUTES.FACULTY.SYLLABUS, icon: <MenuBookIcon /> },
    { label: 'Module Builder', to: ROUTES.FACULTY.MODULE, icon: <ViewModuleIcon /> },
    { label: 'Assessment', to: ROUTES.FACULTY.ASSESSMENT, icon: <QuizIcon /> },
    { label: 'Grading', to: ROUTES.FACULTY.GRADING, icon: <SchoolIcon /> },
    { label: 'Analytics', to: ROUTES.FACULTY.ANALYTICS, icon: <BarChartIcon /> },
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
      
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
            borderRight: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
          <img src={atlasLogo} alt="ATLAS Logo" style={{ height: '40px', objectFit: 'contain' }} />
        </Box>
        
        <Divider sx={{ mx: 2, borderColor: '#F1F5F9' }} />

        <List sx={{ px: 2, pt: 2, flexGrow: 1 }}>
          {navItems.map((item) => {
            const isActive = location.pathname.includes(item.to);
            return (
              <ListItem key={item.label} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  onClick={() => navigate(item.to)}
                  sx={{
                    borderRadius: 2,
                    backgroundColor: isActive ? '#FFF1F2' : 'transparent',
                    color: isActive ? '#A52028' : '#64748B',
                    '&:hover': { backgroundColor: isActive ? '#FFE4E6' : '#F8FAFC' }
                  }}
                >
                  <ListItemIcon sx={{ color: isActive ? '#A52028' : '#94A3B8', minWidth: 40 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: isActive ? 700 : 500, fontSize: '0.95rem' }} />
                </ListItemButton>
              </ListItem>
            );
          })}

          <Divider sx={{ my: 2, borderColor: '#F1F5F9' }} />

          <ListItem disablePadding sx={{ mb: 1 }}>
            <ListItemButton sx={{ borderRadius: 2, color: '#64748B', '&:hover': { backgroundColor: '#F8FAFC' } }}>
              <ListItemIcon sx={{ color: '#94A3B8', minWidth: 40 }}><SettingsIcon /></ListItemIcon>
              <ListItemText primary="Settings" primaryTypographyProps={{ fontWeight: 500 }} />
            </ListItemButton>
          </ListItem>
          <ListItem disablePadding>
            <ListItemButton sx={{ borderRadius: 2, color: '#64748B', '&:hover': { backgroundColor: '#F8FAFC' } }}>
              <ListItemIcon sx={{ color: '#94A3B8', minWidth: 40 }}><HelpIcon /></ListItemIcon>
              <ListItemText primary="Help Center" primaryTypographyProps={{ fontWeight: 500 }} />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>

      {/* MAIN CONTENT AREA */}
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Top Header */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', p: 3, pb: 0 }}>
          <IconButton sx={{ color: '#64748B', mr: 2 }}>
            <NotificationsIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ width: 40, height: 40, bgcolor: '#A52028' }}>F</Avatar>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1E293B', lineHeight: 1.2 }}>Faculty Member</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>Instructor</Typography>
            </Box>
            <IconButton size="small" sx={{ color: '#64748B', p: 0 }}>
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