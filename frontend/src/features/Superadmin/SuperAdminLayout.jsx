// src/features/Superadmin/SuperAdminLayout.jsx
import React from 'react';
import DashboardLayout from '../../components/dashboardLayout';
import { ROUTES } from '../../config/route';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import SecurityAuditIcon from '@mui/icons-material/Security';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PaletteIcon from '@mui/icons-material/Palette';

export default function SuperAdminLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.SUPERADMIN.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Institutions', to: ROUTES.SUPERADMIN.ACCOUNT_MANAGEMENT, icon: <AccountBalanceIcon /> },
    { label: 'System Health', to: ROUTES.SUPERADMIN.SYSTEM_MANAGEMENT, icon: <MonitorHeartIcon /> },
    { label: 'Audit Logs', to: ROUTES.SUPERADMIN.AUDIT_LOGS, icon: <SecurityAuditIcon /> },
    { label: 'Appearance', to: ROUTES.SUPERADMIN.APPEARANCE, icon: <PaletteIcon /> },
  ];

  return (
    <DashboardLayout navItems={navItems} role="superadmin">
      {children}
    </DashboardLayout>
  );
}