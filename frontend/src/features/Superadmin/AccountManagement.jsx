// Superadmin account management for the single institution.
// Additional admins are created here; they always belong to the same school.
import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Menu, MenuItem, IconButton, Divider, Stack,
  Select, FormControl, InputLabel, CircularProgress,
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import SuperAdminLayout from './SuperAdminLayout'
import { CircleCheck, Users } from 'lucide-react'
import { StatCard, PageHeader, StatusChip, GlassCard, PrimaryBtn, OutlineBtn } from '../../components/ui'
import api from '../../config/api'
import { TENANT_INSTITUTION_NAME } from '../../config/tenant'
import { StatusNotice } from '../../components/StatusNotice'
import useDebouncedValue from '../../hooks/useDebouncedValue'

const normalizePlan = p => {
  if (!p) return ''
  const s = String(p).trim().toLowerCase()
  return { starter: 'Starter', professional: 'Professional', custom: 'Custom', enterprise: 'Custom' }[s] || s
}

function apiError(err, fallback) {
  const data = err.response?.data
  if (!data) return fallback
  if (typeof data.detail === 'string') return data.detail
  for (const key of ['email', 'password', 'full_name']) {
    const value = data[key]
    if (Array.isArray(value) && value[0]) return value[0]
    if (typeof value === 'string') return value
  }
  return fallback
}

const emptyAdminForm = () => ({ full_name: '', email: '', password: '' })

export default function AccountManagement() {
  const [institution, setInstitution] = useState(null)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearch = useDebouncedValue(searchTerm, 250)
  const [filterStatus, setFilterStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [subscriptionOpen, setSubscriptionOpen] = useState(false)
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuAdmin, setMenuAdmin] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [busyAdminId, setBusyAdminId] = useState('')
  const [adminForm, setAdminForm] = useState(emptyAdminForm)
  const [subscriptionForm, setSubscriptionForm] = useState({ subscription_plan: '', payment_status: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    api.get('/auth/institutions/')
      .then(({ data }) => setInstitution(data))
      .catch(() => setError('Unable to load admins.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const admins = institution?.admins || []
  const filtered = admins.filter(admin => {
    const q = debouncedSearch.toLowerCase()
    const matchSearch = !q
      || (admin.full_name || '').toLowerCase().includes(q)
      || (admin.email || '').toLowerCase().includes(q)
    const matchFilter = !filterStatus
      || (filterStatus === 'active' ? admin.is_active : !admin.is_active)
    return matchSearch && matchFilter
  })

  const handleMenuOpen = (e, admin) => { setAnchorEl(e.currentTarget); setMenuAdmin(admin) }
  const handleMenuClose = () => { setAnchorEl(null); setMenuAdmin(null) }

  const setAdminActive = async (admin, isActive) => {
    if (busyAdminId) return
    setError('')
    setBusyAdminId(admin.user_id)
    try {
      await api.patch(`/auth/accounts/${admin.user_id}/`, { is_active: isActive })
      setNotice(isActive ? `${admin.email} is active again.` : `${admin.email} is paused.`)
      handleMenuClose()
      load()
    } catch (err) {
      setError(apiError(err, 'Failed to update the admin.'))
    } finally {
      setBusyAdminId('')
    }
  }

  const deleteAdmin = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/auth/accounts/${confirmDelete.user_id}/`)
      setNotice(`${confirmDelete.email} was deleted. ${TENANT_INSTITUTION_NAME} and its courses stay.`)
      setConfirmDelete(null)
      handleMenuClose()
      load()
    } catch (err) {
      setError(apiError(err, 'Failed to delete the admin.'))
    } finally {
      setDeleting(false)
    }
  }

  const createAdmin = async () => {
    setSaving(true)
    setError('')
    try {
      await api.post('/auth/institutions/', {
        full_name: adminForm.full_name.trim(),
        email: adminForm.email.trim(),
        password: adminForm.password,
      })
      setNotice(`${adminForm.email.trim()} can sign in as an admin of ${TENANT_INSTITUTION_NAME}.`)
      setAdminForm(emptyAdminForm())
      setCreateOpen(false)
      load()
    } catch (err) {
      setError(apiError(err, 'Failed to create the admin.'))
    } finally {
      setSaving(false)
    }
  }

  const saveSubscription = async () => {
    if (!institution) return
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch(`/auth/institutions/${institution.id}/`, {
        selected_plan: subscriptionForm.subscription_plan,
        payment_status: subscriptionForm.payment_status,
      })
      setInstitution(data)
      setNotice('Subscription updated.')
      setSubscriptionOpen(false)
    } catch (err) {
      setError(apiError(err, 'Failed to update the subscription.'))
    } finally {
      setSaving(false)
    }
  }

  const inputSx = {
    '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
    '& .MuiInputLabel-root': { fontSize: '0.875rem', color: 'var(--text-secondary)' },
    input: { color: 'var(--text-primary)' },
    '& .MuiSelect-select': { color: 'var(--text-primary)' },
  }

  const activeAdmins = admins.filter(admin => admin.is_active).length

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Account Management"
        subtitle={`Admins for ${institution?.institution || TENANT_INSTITUTION_NAME}`}
        action={<PrimaryBtn onClick={() => { setError(''); setCreateOpen(true) }}><AddIcon fontSize="small" /> Add admin</PrimaryBtn>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard title="Admins" value={admins.length} icon={<Users size={18} color="#60AAFF" />} accent="#60AAFF" />
        <StatCard title="Active admins" value={activeAdmins} icon={<CircleCheck size={18} color="#5EDA7E" />} accent="#5EDA7E" />
        <StatCard title="Total users" value={(institution?.users || 0).toLocaleString()} icon={<Users size={18} color="#FFB74D" />} accent="#FFB74D" />
      </div>

      <GlassCard style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>CAMPUS</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 4 }}>{institution?.institution || TENANT_INSTITUTION_NAME}</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: 4 }}>
              {normalizePlan(institution?.subscription_plan) || 'Plan not selected'} · {institution?.payment_status || 'payment unknown'}
            </div>
          </div>
          <Stack direction="row" spacing={1} alignItems="center">
            <StatusChip label={institution?.status || 'active'} type={institution?.status === 'active' ? 'active' : 'inactive'} />
            <OutlineBtn onClick={() => {
              setSubscriptionForm({
                subscription_plan: normalizePlan(institution?.subscription_plan),
                payment_status: institution?.payment_status || 'paid',
              })
              setSubscriptionOpen(true)
            }}>Manage subscription</OutlineBtn>
          </Stack>
        </div>
      </GlassCard>

      <GlassCard style={{ marginBottom: 16 }}>
        <StatusNotice message={notice} severity="success" />
        <StatusNotice message={error} severity="error" />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search admin name or email…"
            size="small"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0) }}
            sx={{ flex: 1, minWidth: 220, ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }}
          />
          <select
            aria-label="Status"
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
            style={{
              minWidth: 160,
              height: 40,
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              padding: '0 12px',
              cursor: 'pointer',
            }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </GlassCard>

      <GlassCard style={{ padding: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Admin', 'Status', 'Created', ''].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.06em', color: 'var(--text-secondary) !important', textTransform: 'uppercase', py: 1.5 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={4}>Loading admins...</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={4}>No admins yet. Add one for {TENANT_INSTITUTION_NAME}.</TableCell></TableRow>}
              {!loading && filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(admin => (
                <TableRow key={admin.user_id} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>{admin.full_name || '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{admin.email}</div>
                  </TableCell>
                  <TableCell><StatusChip label={admin.is_active ? 'active' : 'inactive'} type={admin.is_active ? 'active' : 'inactive'} /></TableCell>
                  <TableCell sx={{ color: 'var(--text-secondary) !important', fontSize: '0.82rem !important', fontFamily: 'var(--font-mono) !important' }}>
                    {admin.created_at ? new Date(admin.created_at).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={e => handleMenuOpen(e, admin)} disabled={busyAdminId === admin.user_id} sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--text-primary)', background: 'var(--bg-header)' } }}>
                      {busyAdminId === admin.user_id
                        ? <CircularProgress size={16} sx={{ color: 'var(--text-secondary)' }} />
                        : <MoreVertIcon fontSize="small" />}
                    </IconButton>
                    <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && menuAdmin?.user_id === admin.user_id} onClose={() => { if (busyAdminId !== admin.user_id) handleMenuClose() }}
                      PaperProps={{ sx: { background: 'var(--shell-menu-bg) !important', border: '1px solid var(--shell-menu-border) !important', borderRadius: '14px !important', minWidth: 180, color: 'var(--text-primary)' } }}>
                      {admin.is_active
                        ? <MenuItem disabled={Boolean(busyAdminId)} sx={{ color: '#E24B4A !important' }} onClick={() => setAdminActive(admin, false)}>
                            {busyAdminId === admin.user_id
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CircularProgress size={14} sx={{ color: '#E24B4A' }} /> Pausing…</span>
                              : 'Pause admin'}
                          </MenuItem>
                        : <MenuItem disabled={Boolean(busyAdminId)} sx={{ color: 'var(--status-success) !important' }} onClick={() => setAdminActive(admin, true)}>
                            {busyAdminId === admin.user_id
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CircularProgress size={14} /> Activating…</span>
                              : 'Activate admin'}
                          </MenuItem>}
                      <Divider sx={{ borderColor: 'var(--border-color) !important', my: '4px !important' }} />
                      <MenuItem disabled={Boolean(busyAdminId)} sx={{ color: '#E24B4A !important' }} onClick={() => { setConfirmDelete(admin); handleMenuClose() }}>Delete admin</MenuItem>
                    </Menu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]} component="div"
          count={filtered.length} rowsPerPage={rowsPerPage} page={page}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0) }}
          sx={{ borderTop: '1px solid var(--border-color) !important', color: 'var(--text-secondary)' }}
        />
      </GlassCard>

      <Dialog open={createOpen} onClose={() => { if (!saving) setCreateOpen(false) }} maxWidth="sm" fullWidth>
        <DialogTitle>Add admin</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              This admin joins {TENANT_INSTITUTION_NAME}.
            </div>
            <TextField label="Full name" fullWidth size="small" value={adminForm.full_name} onChange={e => setAdminForm({ ...adminForm, full_name: e.target.value })} sx={inputSx} />
            <TextField label="Email" type="email" fullWidth size="small" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} sx={inputSx} />
            <TextField label="Temporary password" type="password" fullWidth size="small" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} sx={inputSx} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={createAdmin} disabled={saving || !adminForm.full_name.trim() || !adminForm.email.trim() || adminForm.password.length < 8}>
            {saving ? 'Saving…' : 'Create admin'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>

      <Dialog open={subscriptionOpen} onClose={() => setSubscriptionOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Manage subscription</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{TENANT_INSTITUTION_NAME}</div>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Plan</InputLabel>
              <Select
                label="Plan"
                value={subscriptionForm.subscription_plan}
                onChange={e => setSubscriptionForm({ ...subscriptionForm, subscription_plan: e.target.value })}
              >
                <MenuItem value="">Not selected</MenuItem>
                <MenuItem value="Starter">Starter</MenuItem>
                <MenuItem value="Professional">Professional</MenuItem>
                <MenuItem value="Custom">Custom</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Payment status</InputLabel>
              <Select
                label="Payment status"
                value={subscriptionForm.payment_status || 'paid'}
                onChange={e => setSubscriptionForm({ ...subscriptionForm, payment_status: e.target.value })}
              >
                <MenuItem value="unpaid">Unpaid</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => setSubscriptionOpen(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={saveSubscription} disabled={saving}>Save subscription</PrimaryBtn>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmDelete)} onClose={() => { if (!deleting) setConfirmDelete(null) }} maxWidth="xs" fullWidth>
        <DialogTitle>Delete admin?</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            This permanently deletes{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{confirmDelete?.email}</strong>.
            {' '}{TENANT_INSTITUTION_NAME} and its courses, syllabi, and other accounts stay.
            You can add another admin afterward.
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={deleteAdmin} disabled={deleting}>
            {deleting ? <><CircularProgress size={14} sx={{ color: '#fff' }} /> Deleting…</> : 'Delete admin'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    </SuperAdminLayout>
  )
}
