// src/features/Superadmin/SuperAdminLayout.jsx
import React from 'react';
import DashboardLayout from '../../components/dashboardLayout';
import { ROUTES } from '../../config/route';

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard';
import SecurityAuditIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

export default function SuperAdminLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.SUPERADMIN.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Account Management', to: ROUTES.SUPERADMIN.ACCOUNT_MANAGEMENT, icon: <AccountBalanceIcon /> },
    { label: 'System Management', to: ROUTES.SUPERADMIN.SYSTEM_MANAGEMENT, icon: <StorageIcon /> },
    { label: 'Audit Logs', to: ROUTES.SUPERADMIN.AUDIT_LOGS, icon: <SecurityAuditIcon /> },
  ];

  return (
    <DashboardLayout navItems={navItems} role="superadmin">
      {children}
    </DashboardLayout>
  );
}