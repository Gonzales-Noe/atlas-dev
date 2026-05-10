import RoleDashboardPage from '../../components/RoleDashboardPage'

export default function SuperAdminDashboardPage() {
  return (
    <RoleDashboardPage
      role="superadmin"
      fallbackTitle="Super Admin Dashboard"
      fallbackSubtitle="Monitor the platform, institutions, and access policy."
    />
  )
}