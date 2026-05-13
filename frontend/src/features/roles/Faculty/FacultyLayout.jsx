// src/features/Faculty/FacultyLayout.jsx
import React from 'react';
import DashboardLayout from '../../../components/dashboardLayout';
import { ROUTES } from '../../../config/route';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import QuizIcon from '@mui/icons-material/Quiz';
import BarChartIcon from '@mui/icons-material/BarChart';
import SchoolIcon from '@mui/icons-material/School';

export default function FacultyLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.FACULTY.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Syllabus', to: ROUTES.FACULTY.SYLLABUS, icon: <MenuBookIcon /> },
    { label: 'Module Builder', to: ROUTES.FACULTY.MODULE, icon: <ViewModuleIcon /> },
    { label: 'Assessment', to: ROUTES.FACULTY.ASSESSMENT, icon: <QuizIcon /> },
    { label: 'Grading', to: ROUTES.FACULTY.GRADING, icon: <SchoolIcon /> },
    { label: 'Analytics', to: ROUTES.FACULTY.ANALYTICS, icon: <BarChartIcon /> },
  ];

  return (
    <DashboardLayout navItems={navItems} role="faculty">
      {children}
    </DashboardLayout>
  );
}