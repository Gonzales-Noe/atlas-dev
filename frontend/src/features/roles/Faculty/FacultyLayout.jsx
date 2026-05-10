// src/features/Faculty/FacultyLayout.jsx
import React, { useEffect, useState } from 'react';
import { 
  Box, Typography, Avatar, IconButton, Button, Stack
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';

// Icons
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import QuizIcon from '@mui/icons-material/Quiz';
import BarChartIcon from '@mui/icons-material/BarChart';
import SchoolIcon from '@mui/icons-material/School';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AddIcon from '@mui/icons-material/Add';
import DescriptionIcon from '@mui/icons-material/Description';

// Config and Assets
import { ROUTES } from '../../../config/route';
import atlasLogo from '../../../assets/atlas-logo.png'; 

function loadActiveCourse() {
  try { return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null; } 
  catch { return null; }
}

export default function FacultyLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeCourse, setActiveCourse] = useState(null);

  const isDashboard = location.pathname === ROUTES.FACULTY.DASHBOARD;

  useEffect(() => {
    setActiveCourse(loadActiveCourse());
  }, [location.pathname]);

  const studioItems = [
    { label: 'Syllabus', to: ROUTES.FACULTY.SYLLABUS, icon: <MenuBookIcon /> },
    { label: 'Modules', to: ROUTES.FACULTY.MODULE, icon: <ViewModuleIcon /> },
    { label: 'Assessments', to: ROUTES.FACULTY.ASSESSMENT, icon: <QuizIcon /> },
    { label: 'Grading', to: ROUTES.FACULTY.GRADING, icon: <SchoolIcon /> },
    { label: 'Analytics', to: ROUTES.FACULTY.ANALYTICS, icon: <BarChartIcon /> },
  ];

  // VIEW 1: DASHBOARD
  if (isDashboard) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#F8FAFC' }}>
        <Box component="header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 4, py: 2, backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.02)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate(ROUTES.FACULTY.DASHBOARD)}>
            <img src={atlasLogo} alt="ATLAS Logo" style={{ height: '36px', objectFit: 'contain' }} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton sx={{ color: '#64748B', mr: 2, backgroundColor: '#F8FAFC' }}><NotificationsIcon fontSize="small" /></IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, backgroundColor: '#F8FAFC', p: 0.5, pr: 1.5, borderRadius: '24px' }}>
              <Avatar sx={{ width: 36, height: 36, bgcolor: '#8B0000', fontSize: '1rem', fontWeight: 700 }}>FM</Avatar>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1E293B', lineHeight: 1.2 }}>Faculty Member</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>Instructor</Typography>
              </Box>
              <IconButton size="small" sx={{ color: '#64748B', p: 0, ml: 1 }}><KeyboardArrowDownIcon fontSize="small" /></IconButton>
            </Box>
          </Box>
        </Box>
        <Box component="main" sx={{ flexGrow: 1, p: 4, display: 'flex', flexDirection: 'column', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          {children}
        </Box>
      </Box>
    );
  }

  // VIEW 2: NOTEBOOK WORKSPACE
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#F1F5F9', overflow: 'hidden' }}>
      
      <Box component="header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 3, py: 1.5, backgroundColor: '#F1F5F9' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate(ROUTES.FACULTY.DASHBOARD)}>
          <img src={atlasLogo} alt="ATLAS Logo" style={{ height: '32px', objectFit: 'contain' }} />
          <Typography sx={{ ml: 2, fontWeight: 700, color: '#0F172A', fontSize: '1.1rem' }}>
            {activeCourse?.courseName || 'Untitled Course'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton sx={{ color: '#64748B', mr: 2 }}><NotificationsIcon fontSize="small" /></IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#8B0000', fontSize: '0.9rem', fontWeight: 700 }}>FM</Avatar>
            <IconButton size="small" sx={{ color: '#64748B', p: 0 }}><KeyboardArrowDownIcon fontSize="small" /></IconButton>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', p: 2, pt: 0, gap: 2 }}>
        
        {/* LEFT PANE: STUDIO (Fixed: One item per line) */}
        <Box sx={{ width: 280, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, px: 1 }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1.1rem' }}>Studio</Typography>
          </Box>
          <Stack spacing={1}>
            {studioItems.map((item) => {
              const isActive = location.pathname.includes(item.to);
              return (
                <Button
                  key={item.label}
                  onClick={() => navigate(item.to)}
                  startIcon={item.icon}
                  sx={{
                    justifyContent: 'flex-start',
                    px: 2, py: 1.5,
                    borderRadius: '12px', textTransform: 'none',
                    backgroundColor: isActive ? '#8B0000' : 'transparent',
                    color: isActive ? '#FFFFFF' : '#475569',
                    boxShadow: isActive ? '0 4px 12px rgba(139,0,0,0.2)' : 'none',
                    '&:hover': { backgroundColor: isActive ? '#6B0000' : '#E2E8F0' },
                    '& .MuiButton-startIcon': { mr: 2, opacity: 0.9 }
                  }}
                >
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {item.label}
                  </Typography>
                </Button>
              );
            })}
          </Stack>
        </Box>

        {/* CENTER PANE: CANVAS */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', backgroundColor: '#FFFFFF', borderRadius: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', p: 4 }}>
          <Box sx={{ maxWidth: '800px', width: '100%', mx: 'auto' }}>
            {children}
          </Box>
        </Box>

        {/* RIGHT PANE: SOURCES */}
        <Box sx={{ width: 280, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, px: 1 }}>
            <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: '1.1rem' }}>Sources</Typography>
          </Box>
          
          <Button variant="outlined" startIcon={<AddIcon />} sx={{ borderRadius: '16px', py: 1.2, mb: 3, borderColor: '#CBD5E1', color: '#0F172A', fontWeight: 600, textTransform: 'none', backgroundColor: 'transparent', '&:hover': { backgroundColor: '#E2E8F0', borderColor: '#94A3B8' } }}>
            Add source
          </Button>

          <Box sx={{ p: 2.5, backgroundColor: '#E2E8F0', borderRadius: '16px', display: 'flex', gap: 1.5, mb: 2, cursor: 'pointer', '&:hover': { backgroundColor: '#CBD5E1' } }}>
            <Box sx={{ width: 36, height: 36, borderRadius: '8px', backgroundColor: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8B0000', flexShrink: 0 }}>
              <DescriptionIcon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A', mb: 0.5, lineHeight: 1.2 }}>
                {activeCourse?.courseName || 'Course Profile'}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#475569' }}>
                {activeCourse?.courseCode || 'No Code'}
              </Typography>
            </Box>
          </Box>
        </Box>

      </Box>
    </Box>
  );
}