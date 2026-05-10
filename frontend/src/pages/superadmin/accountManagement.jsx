import AccountManagementPage from '../../components/AccountManagementPage'

export default function SuperAdminAccountManagementPage() {
  return (
    <AccountManagementPage
      role="superadmin"
      title="Super Admin Account Management"
      subtitle="Manage accounts across the platform, including admins and faculty."
    />
  )
}