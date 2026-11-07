// src/features/Faculty/FacultyLayout.jsx
import React from 'react';
import DashboardLayout from '../../../components/dashboardLayout';
import { ROUTES } from '../../../config/route';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import FeedbackIcon from '@mui/icons-material/Feedback';
import SmartphoneIcon from '@mui/icons-material/Smartphone';

export default function FacultyLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.FACULTY.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Issue Reports', to: ROUTES.FACULTY.ISSUE_REPORTS, icon: <FeedbackIcon /> },
    { label: 'ATLAS Mobile', to: ROUTES.FACULTY.ATLAS_MOBILE, icon: <SmartphoneIcon /> },
  ];

  return (
    <DashboardLayout navItems={navItems} role="faculty">
      {children}
    </DashboardLayout>
  );
}