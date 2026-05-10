import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useAuth } from '../store/authStore'
import { extractApiError } from '../utils'
import useApi from '../hooks/useApi'
import api from '../config/api'
import DashboardLayout from './dashboardLayout'

const ROLE_OPTIONS = [
  { label: 'Faculty', value: 'faculty' },
  { label: 'Admin', value: 'admin' },
  { label: 'Super Admin', value: 'super_admin' },
]

function AccountRow({ user, currentRole, onSave, saving }) {
  const [draft, setDraft] = useState({
    email: user.email || '',
    role: normalizeRole(user.role_code) || 'faculty',
    is_active: Boolean(user.is_active),
  })

  useEffect(() => {
    setDraft({
      email: user.email || '',
      role: normalizeRole(user.role_code) || 'faculty',
      is_active: Boolean(user.is_active),
    })
  }, [user])

  const options = useMemo(() => {
    if (currentRole === 'admin') {
      return ROLE_OPTIONS.filter((option) => option.value !== 'super_admin')
    }
    return ROLE_OPTIONS
  }, [currentRole])

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '1.8fr 1fr 1fr auto' },
        gap: 1.5,
        alignItems: 'center',
        py: 1.5,
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <TextField
        size="small"
        label="Email"
        value={draft.email}
        onChange={(event) => setDraft((state) => ({ ...state, email: event.target.value }))}
      />
      <FormControl size="small" fullWidth>
        <InputLabel>Role</InputLabel>
        <Select
          label="Role"
          value={draft.role}
          onChange={(event) => setDraft((state) => ({ ...state, role: event.target.value }))}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ justifySelf: { lg: 'center' } }}>
        <Switch
          checked={draft.is_active}
          onChange={(event) => setDraft((state) => ({ ...state, is_active: event.target.checked }))}
        />
        <Typography variant="body2" sx={{ color: '#666' }}>
          Active
        </Typography>
      </Stack>
      <Button
        variant="contained"
        disabled={saving}
        onClick={() => onSave(user.user_id, draft)}
        sx={{ whiteSpace: 'nowrap' }}
      >
        {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save'}
      </Button>
    </Box>
  )
}

export default function AccountManagementPage({ role, title, subtitle }) {
  const { user: authUser } = useAuth()
  const { data, loading, error, execute } = useApi('/users/accounts/')
  const [savingId, setSavingId] = useState(null)
  const [localError, setLocalError] = useState('')

  const navItems = useMemo(() => {
    if (role === 'admin') {
      return [
        { label: 'Dashboard', to: '/admin/dashboard' },
        { label: 'Accounts', to: '/admin/account-management' },
        { label: 'Knowledge Base', to: '/admin/global-knowledge' },
        { label: 'Audit Logs', to: '/admin/audit-logs' },
      ]
    }
    return [
      { label: 'Dashboard', to: '/superadmin/dashboard' },
      { label: 'Accounts', to: '/superadmin/account-management' },
      { label: 'Audit Logs', to: '/superadmin/audit-logs' },
    ]
  }, [role])

  async function handleSave(userId, draft) {
    setSavingId(userId)
    setLocalError('')
    try {
      await api.patch(`/users/accounts/${userId}/`, {
        email: draft.email,
        role: draft.role,
        is_active: draft.is_active,
      })
      await execute()
    } catch (err) {
      setLocalError(extractApiError(err))
    } finally {
      setSavingId(null)
    }
  }

  if (loading && !data) {
    return (
      <DashboardLayout role={role} navItems={navItems}>
        <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role={role} navItems={navItems}>
      <Box sx={{ display: 'grid', gap: 3 }}>
        {(error || localError) && <Alert severity="error">{error || localError}</Alert>}

        <Card sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
              {title}
            </Typography>
            <Typography variant="body1" sx={{ color: '#666' }}>
              {subtitle}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: '#888' }}>
              Signed in as {authUser?.email}
            </Typography>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Accounts
              </Typography>
            </Box>
            <Box sx={{ px: 3, pb: 1 }}>
              {Array.isArray(data) && data.length > 0 ? (
                data.map((account) => (
                  <AccountRow
                    key={account.user_id}
                    user={account}
                    currentRole={role}
                    onSave={handleSave}
                    saving={savingId === account.user_id}
                  />
                ))
              ) : (
                <Box sx={{ py: 4 }}>
                  <Typography variant="body2" sx={{ color: '#666' }}>
                    No accounts found.
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </DashboardLayout>
  )
}