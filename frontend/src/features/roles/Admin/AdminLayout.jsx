import DashboardIcon from '@mui/icons-material/Dashboard'
import AssessmentIcon from '@mui/icons-material/Assessment'
import PeopleIcon from '@mui/icons-material/People'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import DashboardLayout from '../../../components/dashboardLayout'
import AdminSetupGate from '../../../components/AdminSetupGate'
import { ROUTES } from '../../../config/route'

export default function AdminLayout({ children }) {
  const navItems = [
    { label: 'Dashboard', to: ROUTES.ADMIN.DASHBOARD, icon: <DashboardIcon /> },
    { label: 'Syllabus Format', to: ROUTES.ADMIN.SYLLABUS_FORMAT, icon: <FormatAlignLeftIcon /> },
    { label: 'Academic Structure', to: ROUTES.ADMIN.ACADEMIC_STRUCTURE, icon: <AccountTreeIcon /> },
    { label: 'Accounts', to: ROUTES.ADMIN.ACCOUNT_MANAGEMENT, icon: <PeopleIcon /> },
    { label: 'Knowledge Base', to: ROUTES.ADMIN.KNOWLEDGE_BASE, icon: <MenuBookIcon /> },
    { label: 'Audit Logs', to: ROUTES.ADMIN.AUDIT_LOGS, icon: <AssessmentIcon /> },
  ]
  return (
    <AdminSetupGate>
      <DashboardLayout navItems={navItems} role="admin">{children}</DashboardLayout>
    </AdminSetupGate>
  )
}
