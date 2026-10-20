// src/features/Superadmin/AccountManagement.jsx
import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Menu, MenuItem, IconButton, Switch, FormControlLabel, Divider, Button, Stack,
  Select, FormControl, InputLabel,
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import SuperAdminLayout from './SuperAdminLayout'
import { StatCard, PageHeader, StatusChip, GlassCard, PrimaryBtn, OutlineBtn } from '../../components/ui'
import api from '../../config/api'

const planType = p => ({ Premium: 'premium', Professional: 'info', Starter: 'default', Enterprise: 'premium', pro: 'info', enterprise: 'premium' }[p] || 'default')

// Normalize plan values coming from the backend (any casing) to the option values used in dropdowns.
const normalizePlan = p => {
  if (!p) return ''
  const s = String(p).trim().toLowerCase()
  return { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' }[s] || s
}

export default function AccountManagement() {
  const [page, setPage]             = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [subscriptionOpen, setSubscriptionOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [anchorEl, setAnchorEl]     = useState(null)
  const [menuAccount, setMenuAccount] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDeleteInstitution, setConfirmDeleteInstitution] = useState(null)
  const [deletingInstitution, setDeletingInstitution] = useState(false)
  const [editForm, setEditForm] = useState({ institution: '', subscription_plan: '', is_active: true })
  const [subscriptionForm, setSubscriptionForm] = useState({ subscription_plan: '', payment_status: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/auth/institutions/')
      .then(({ data }) => setAccounts(data))
      .catch(() => setError('Unable to load institutional accounts.'))
      .finally(() => setLoading(false))
  }, [])

  const pendingApplications = accounts.filter(account => account.status === 'pending_review')
  const filtered = accounts.filter(a => {
    const q = searchTerm.toLowerCase()
    const matchSearch = a.institution.toLowerCase().includes(q) || a.admin.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    const matchFilter = !filterStatus || a.status === filterStatus
    return matchSearch && matchFilter
  })

  const handleMenuOpen = (e, acc) => { setAnchorEl(e.currentTarget); setMenuAccount(acc) }
  const handleMenuClose = () => { setAnchorEl(null); setMenuAccount(null) }

  const approveApplication = async (account) => {
    await api.patch(`/auth/institutions/${account.id}/`, { decision: 'approve' })
    setAccounts(current => current.map(item => item.id === account.id ? { ...item, status: 'active', payment_status: 'unpaid' } : item))
  }

  const setAccountActive = async (account, isActive) => {
    await api.patch(`/auth/institutions/${account.id}/`, { is_active: isActive })
    setAccounts(current => current.map(item => item.id === account.id ? {
      ...item,
      status: isActive ? 'active' : 'rejected',
    } : item))
    handleMenuClose()
  }

  // ── Hard-delete an institution and all data under it ─────────────────────
  const deleteInstitution = async () => {
    if (!confirmDeleteInstitution) return
    setDeletingInstitution(true)
    setError('')
    try {
      await api.delete(`/auth/institutions/${confirmDeleteInstitution.id}/`)
      setAccounts(current => current.filter(item => item.id !== confirmDeleteInstitution.id))
      setNotice(
        `“${confirmDeleteInstitution.institution}” and all of its accounts and data were permanently deleted.`,
      )
      setConfirmDeleteInstitution(null)
      handleMenuClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete the institution.')
    } finally {
      setDeletingInstitution(false)
    }
  }

  const openEdit = (account) => {
    setSelectedAccount(account)
    setEditForm({ institution: account.institution, subscription_plan: normalizePlan(account.subscription_plan), is_active: account.status === 'active' })
    setEditOpen(true)
  }

  const updateInstitution = async (payload) => {
    if (!selectedAccount) return
    setSaving(true)
    setError('')
    try {
      const { data } = await api.patch(`/auth/institutions/${selectedAccount.id}/`, { ...payload, name: editForm.institution })
      const nextStatus = (data && data.status) ? data.status : (editForm.is_active ? 'active' : 'inactive')
      setAccounts(current => current.map(item => item.id === selectedAccount.id ? {
        ...item,
        institution: editForm.institution || item.institution,
        subscription_plan: editForm.subscription_plan || item.subscription_plan,
        status: nextStatus,
      } : item))
      setSelectedAccount(current => current ? {
        ...current,
        institution: editForm.institution,
        subscription_plan: editForm.subscription_plan,
        status: nextStatus,
      } : null)
      setNotice('Account updated.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update the account.')
    } finally {
      setSaving(false)
    }
  }

  const inputSx = { '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.05)', borderRadius: 2, fontSize: '0.875rem' }, '& .MuiInputLabel-root': { fontSize: '0.875rem' }, input: { color: '#F0F0F2' } }

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Account Management"
        subtitle="Manage institutional accounts, subscriptions, and licensing"
        action={<PrimaryBtn onClick={() => setCreateOpen(true)}><AddIcon fontSize="small" /> New Account</PrimaryBtn>}
      />

      {pendingApplications.map(application => (
        <GlassCard key={application.id} style={{ marginBottom: 20, border: '1px solid rgba(255,183,77,0.45)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: '#FFB74D', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pending application</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: 6 }}>{application.institution}</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.82rem', marginTop: 3 }}>{application.email} · {application.subscription_plan || 'Plan not selected'}</div>
            </div>
            <PrimaryBtn onClick={() => approveApplication(application)}>Approve and activate</PrimaryBtn>
          </div>
        </GlassCard>
      ))}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard title="Total Institutions" value={accounts.length} icon="🏛️" accent="#86EFAC" />
        <StatCard title="Active" value={accounts.filter(a => a.status === 'active').length} icon="✅" accent="#5EDA7E" />
        <StatCard title="Total Users" value={accounts.reduce((sum, account) => sum + account.users, 0).toLocaleString()} icon="👥" accent="#60AAFF" />
        <StatCard title="Pending Review" value={pendingApplications.length} icon="⏳" accent="#FFB74D" />
      </div>

      {/* Filters */}
      <GlassCard style={{ marginBottom: 16 }}>
        {notice && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(94,218,126,0.12)', border: '1px solid rgba(94,218,126,0.4)', color: '#5EDA7E', fontSize: '0.85rem' }}>
            {notice}
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(134,239,172,0.12)', border: '1px solid rgba(134,239,172,0.4)', color: '#86EFAC', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search institution, admin, or email…"
            size="small"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0) }}
            sx={{ flex: 1, minWidth: 220, ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'rgba(255,255,255,0.3)', fontSize: 18 }} /> }}
          />
          <TextField
            select size="small" label="Status" value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(0) }}
            SelectProps={{ native: true }} sx={{ minWidth: 140, ...inputSx }}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </TextField>
        </div>
      </GlassCard>

      {/* Table */}
      <GlassCard style={{ padding: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Institution', 'Admin', 'Status', 'Plan', 'Users', 'Last Login', ''].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4) !important', textTransform: 'uppercase', py: 1.5 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={7}>Loading institutional accounts...</TableCell></TableRow>}
              {!loading && error && <TableRow><TableCell colSpan={7}>{error}</TableCell></TableRow>}
              {!loading && !error && filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(acc => (
                <TableRow key={acc.id} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell sx={{ fontWeight: 700 }}>{acc.institution}</TableCell>
                  <TableCell>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>{acc.admin}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{acc.email}</div>
                  </TableCell>
                  <TableCell><StatusChip label={acc.status} type={acc.status === 'active' ? 'active' : 'inactive'} /></TableCell>
                  <TableCell><StatusChip label={acc.subscription_plan || 'Not selected'} type={planType(acc.subscription_plan)} /></TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{acc.users.toLocaleString()}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.45) !important', fontSize: '0.82rem !important', fontFamily: 'var(--font-mono) !important' }}>{acc.created_at ? new Date(acc.created_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={e => handleMenuOpen(e, acc)} sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.08)' } }}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && menuAccount?.id === acc.id} onClose={handleMenuClose}
                      PaperProps={{ sx: { background: '#16161E !important', border: '1px solid rgba(255,255,255,0.1) !important', borderRadius: '14px !important', minWidth: 180 } }}>
                      <MenuItem onClick={() => { setSelectedAccount(acc); setDetailsOpen(true); handleMenuClose() }}>View Details</MenuItem>
                      <MenuItem onClick={() => { openEdit(acc); handleMenuClose() }}>Edit Account</MenuItem>
                      <MenuItem onClick={() => { setSelectedAccount(acc); setSubscriptionForm({ subscription_plan: normalizePlan(acc.subscription_plan), payment_status: acc.payment_status || 'paid' }); setSubscriptionOpen(true); handleMenuClose() }}>Manage Subscription</MenuItem>
                      <MenuItem onClick={() => { setSelectedAccount(acc); setUsageOpen(true); handleMenuClose() }}>View Usage</MenuItem>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08) !important', my: '4px !important' }} />
                      {acc.status === 'active'
                        ? <MenuItem sx={{ color: '#86EFAC !important' }} onClick={() => setAccountActive(acc, false)}>Suspend Account</MenuItem>
                        : <MenuItem sx={{ color: '#5EDA7E !important' }} onClick={() => setAccountActive(acc, true)}>Reactivate Account</MenuItem>}
                      <MenuItem sx={{ color: '#86EFAC !important' }} onClick={() => { setConfirmDeleteInstitution(acc); handleMenuClose() }}>Delete Institution</MenuItem>
                    </Menu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5,10,25]} component="div"
          count={filtered.length} rowsPerPage={rowsPerPage} page={page}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value,10)); setPage(0) }}
          sx={{ borderTop: '1px solid rgba(255,255,255,0.07) !important' }}
        />
      </GlassCard>

      {/* Details dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Account Details</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          {selectedAccount && (
            <Stack spacing={2.5}>
              {[
                { label: 'INSTITUTION',  value: selectedAccount.institution },
                { label: 'ADMIN',        value: `${selectedAccount.admin} — ${selectedAccount.email}` },
                { label: 'STATUS',       value: <StatusChip label={selectedAccount.status} type={selectedAccount.status === 'active' ? 'active' : 'inactive'} /> },
                { label: 'PLAN',         value: <StatusChip label={selectedAccount.subscription_plan || 'Not selected'} type={planType(selectedAccount.subscription_plan)} /> },
                { label: 'TOTAL USERS',  value: selectedAccount.users.toLocaleString() },
                { label: 'CREATED',      value: selectedAccount.created_at ? new Date(selectedAccount.created_at).toLocaleString() : '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <OutlineBtn onClick={() => setDetailsOpen(false)}>Close</OutlineBtn>
        </DialogActions>
      </Dialog>

      <Dialog open={subscriptionOpen} onClose={() => setSubscriptionOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Manage Subscription</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedAccount && <Stack spacing={2}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{selectedAccount.institution}</div>
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
                <MenuItem value="Enterprise">Enterprise</MenuItem>
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
          </Stack>}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => setSubscriptionOpen(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={async () => {
            if (!selectedAccount) return
            setSaving(true)
            setError('')
            try {
              const { data } = await api.patch(`/auth/institutions/${selectedAccount.id}/`, { selected_plan: subscriptionForm.subscription_plan, payment_status: subscriptionForm.payment_status })
              const nextStatus = (data && data.status) ? data.status : selectedAccount.status
              setAccounts(current => current.map(item => item.id === selectedAccount.id ? {
                ...item,
                subscription_plan: subscriptionForm.subscription_plan,
                payment_status: subscriptionForm.payment_status,
                status: nextStatus,
              } : item))
              setSelectedAccount(current => current ? {
                ...current,
                subscription_plan: subscriptionForm.subscription_plan,
                payment_status: subscriptionForm.payment_status,
                status: nextStatus,
              } : null)
              setNotice('Subscription updated.')
              setSubscriptionOpen(false)
            } catch (err) {
              setError(err.response?.data?.detail || 'Failed to update the subscription.')
            } finally {
              setSaving(false)
            }
          }} disabled={saving}>Save subscription</PrimaryBtn>
        </DialogActions>
      </Dialog>

      <Dialog open={usageOpen} onClose={() => setUsageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Account Usage</DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedAccount && <Stack spacing={2.5}>
            <div><strong>{selectedAccount.institution}</strong></div>
            <div><div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>USERS</div><div>{selectedAccount.users.toLocaleString()}</div></div>
            <div><div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>PLAN</div><div>{selectedAccount.subscription_plan || 'Not selected'}</div></div>
            <div><div style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem' }}>PAYMENT</div><div>{selectedAccount.payment_status || 'Unknown'}</div></div>
          </Stack>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><OutlineBtn onClick={() => setUsageOpen(false)}>Close</OutlineBtn></DialogActions>
      </Dialog>

      {/* Create / Edit dialog */}
      <Dialog open={createOpen || editOpen} onClose={() => { setCreateOpen(false); setEditOpen(false) }} maxWidth="sm" fullWidth>
        <DialogTitle>{editOpen ? 'Edit Account' : 'Create New Account'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            <TextField label="Institution Name" fullWidth size="small" value={editForm.institution} onChange={e => setEditForm({ ...editForm, institution: e.target.value })} sx={inputSx} />
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Plan</InputLabel>
              <Select
                label="Plan"
                value={editForm.subscription_plan}
                onChange={e => setEditForm({ ...editForm, subscription_plan: e.target.value })}
              >
                <MenuItem value="">Not selected</MenuItem>
                <MenuItem value="Starter">Starter</MenuItem>
                <MenuItem value="Professional">Professional</MenuItem>
                <MenuItem value="Enterprise">Enterprise</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} sx={{ '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#15803D !important' } }} />}
              label={<span style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Active Account</span>}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => { setCreateOpen(false); setEditOpen(false) }}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={async () => {
            if (editOpen) {
              await updateInstitution({ selected_plan: editForm.subscription_plan, is_active: editForm.is_active })
              setEditOpen(false)
            } else {
              setCreateOpen(false)
            }
          }} disabled={saving}>{editOpen ? 'Update' : 'Create'}</PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Delete institution confirmation */}
      <Dialog
        open={Boolean(confirmDeleteInstitution)}
        onClose={() => { if (!deletingInstitution) setConfirmDeleteInstitution(null) }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete institution?</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            This permanently deletes{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{confirmDeleteInstitution?.institution}</strong>{' '}
            ({confirmDeleteInstitution?.users ?? 0} users) and all of its data — colleges, programs, courses,
            sections, syllabi, assessments, files, and every account under it. Deleted emails can be registered
            fresh. This cannot be undone.
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => setConfirmDeleteInstitution(null)} disabled={deletingInstitution}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={deleteInstitution} disabled={deletingInstitution}>
            {deletingInstitution ? 'Deleting…' : 'Delete Institution'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    </SuperAdminLayout>
  )
}