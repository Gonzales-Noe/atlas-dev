import RoleDashboardPage from '../../components/RoleDashboardPage'

export default function AdminDashboardPage() {
  return (
    <RoleDashboardPage
      role="admin"
      fallbackTitle="Admin Dashboard"
      fallbackSubtitle="Oversee institutional users and governance tasks."
    />
  )
}