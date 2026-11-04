// src/features/Faculty/FacultyLayout.jsx
import React from 'react';
import DashboardLayout from '../../../components/dashboardLayout';
import { ROUTES } from '../../../config/route';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import BugReportIcon from '@mui/icons-material/BugReport';

export default function FacultyLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.FACULTY.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Issue Reports', to: ROUTES.FACULTY.ISSUE_REPORTS, icon: <BugReportIcon /> },
  ];

  return (
    <DashboardLayout navItems={navItems} role="faculty">
      {children}
    </DashboardLayout>
  );
}