// src/features/Admin/AdminLayout.jsx
import DashboardIcon    from '@mui/icons-material/Dashboard'
import PeopleIcon       from '@mui/icons-material/People'
import MenuBookIcon     from '@mui/icons-material/MenuBook'
import AssessmentIcon   from '@mui/icons-material/Assessment'
import DashboardLayout  from '../../../components/dashboardLayout'
import { ROUTES }       from '../../../config/route'

export default function AdminLayout({ children }) {
  const navItems = [
    { label: 'Dashboard',          to: ROUTES.ADMIN.DASHBOARD,           icon: <DashboardIcon />  },
    { label: 'Accounts',           to: ROUTES.ADMIN.ACCOUNT_MANAGEMENT,  icon: <PeopleIcon />     },
    { label: 'Knowledge Base',     to: ROUTES.ADMIN.KNOWLEDGE_BASE,      icon: <MenuBookIcon />   },
    { label: 'Audit Logs',         to: ROUTES.ADMIN.AUDIT_LOGS,          icon: <AssessmentIcon /> },
  ]

  return (
    <DashboardLayout navItems={navItems} role="admin">
      {children}
    </DashboardLayout>
  )
}