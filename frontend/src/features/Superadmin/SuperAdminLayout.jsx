// src/features/Superadmin/SuperAdminLayout.jsx
import React from 'react'
import DashboardLayout from '../../components/dashboardLayout'
import useOpenIssueReportCount from '../../hooks/useOpenIssueReportCount'
import { ROUTES } from '../../config/route'

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard'
import SecurityAuditIcon from '@mui/icons-material/Security'
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PaletteIcon from '@mui/icons-material/Palette'
import FeedbackOutlinedIcon from '@mui/icons-material/FeedbackOutlined'

export default function SuperAdminLayout({ children }) {
  const openIssues = useOpenIssueReportCount(true)
  const navItems = [
    { label: 'Dashboard', to: ROUTES.SUPERADMIN.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Admins', to: ROUTES.SUPERADMIN.ACCOUNT_MANAGEMENT, icon: <AccountBalanceIcon /> },
    { label: 'System Health', to: ROUTES.SUPERADMIN.SYSTEM_MANAGEMENT, icon: <MonitorHeartIcon /> },
    { label: 'Audit Logs', to: ROUTES.SUPERADMIN.AUDIT_LOGS, icon: <SecurityAuditIcon /> },
    {
      label: 'Issue Reports',
      to: ROUTES.SUPERADMIN.ISSUE_REPORTS,
      icon: <FeedbackOutlinedIcon />,
      badge: openIssues > 0,
    },
    { label: 'Appearance', to: ROUTES.SUPERADMIN.APPEARANCE, icon: <PaletteIcon /> },
  ]

  return (
    <DashboardLayout navItems={navItems} role="superadmin">
      {children}
    </DashboardLayout>
  )
}
