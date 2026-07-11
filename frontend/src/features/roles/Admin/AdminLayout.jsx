import DashboardIcon from '@mui/icons-material/Dashboard'
import AssessmentIcon from '@mui/icons-material/Assessment'
import PeopleIcon from '@mui/icons-material/People'
import DashboardLayout from '../../../components/dashboardLayout'
import { ROUTES } from '../../../config/route'

export default function AdminLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.ADMIN.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Audit Logs', to: ROUTES.ADMIN.AUDIT_LOGS, icon: <AssessmentIcon /> },
    { label: 'Account Management', to: ROUTES.ADMIN.ACCOUNT_MANAGEMENT, icon: <PeopleIcon /> },
  ]

  return <DashboardLayout navItems={navItems} role="admin">{children}</DashboardLayout>
}