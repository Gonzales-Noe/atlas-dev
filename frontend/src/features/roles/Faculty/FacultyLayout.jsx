// src/features/Faculty/FacultyLayout.jsx
import React from 'react';
import DashboardLayout from '../../../components/dashboardLayout';
import { ROUTES } from '../../../config/route';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';

export default function FacultyLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.FACULTY.DASHBOARD, icon: <DashboardIcon /> },
  ];

  return (
    <DashboardLayout navItems={navItems} role="faculty">
      {children}
    </DashboardLayout>
  );
}