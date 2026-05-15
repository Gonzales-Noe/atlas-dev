// src/features/Superadmin/AccountManagement.jsx
import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Menu, MenuItem, IconButton, Switch, FormControlLabel, Divider, Button, Stack,
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import SuperAdminLayout from './SuperAdminLayout'
import { StatCard, PageHeader, StatusChip, GlassCard, PrimaryBtn, OutlineBtn } from '../../components/ui'

const mockAccounts = [
  { id: 1, institution: 'State University',    admin: 'Dr. Maria Santos', email: 'maria@stateuniv.edu',    status: 'active',   subscriptionPlan: 'Professional', users: 450, createdAt: '2025-03-15', lastLogin: '2026-05-10 09:45' },
  { id: 2, institution: 'Tech College',        admin: 'Prof. John Doe',   email: 'john@techcollege.edu',   status: 'active',   subscriptionPlan: 'Premium',       users: 320, createdAt: '2025-04-20', lastLogin: '2026-05-09 14:30' },
  { id: 3, institution: 'Modern Academy',      admin: 'Ms. Lisa Chen',    email: 'lisa@modernacad.edu',    status: 'active',   subscriptionPlan: 'Standard',      users: 180, createdAt: '2025-05-10', lastLogin: '2026-05-08 11:20' },
  { id: 4, institution: 'National University', admin: 'Dr. Ahmed Hassan', email: 'ahmed@nationaluni.edu',  status: 'inactive', subscriptionPlan: 'Standard',      users: 125, createdAt: '2025-01-22', lastLogin: '2026-04-15 16:00' },
  { id: 5, institution: 'Excellence School',   admin: 'Mrs. Paula Garcia',email: 'paula@excellence.edu',   status: 'active',   subscriptionPlan: 'Professional', users: 220, createdAt: '2025-06-05', lastLogin: '2026-05-10 08:15' },
]

const planType = p => ({ Premium: 'premium', Professional: 'info', Standard: 'default' }[p] || 'default')

export default function AccountManagement() {
  const [page, setPage]             = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen]     = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [anchorEl, setAnchorEl]     = useState(null)
  const [menuAccount, setMenuAccount] = useState(null)

  const filtered = mockAccounts.filter(a => {
    const q = searchTerm.toLowerCase()
    const matchSearch = a.institution.toLowerCase().includes(q) || a.admin.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    const matchFilter = !filterStatus || a.status === filterStatus
    return matchSearch && matchFilter
  })

  const handleMenuOpen = (e, acc) => { setAnchorEl(e.currentTarget); setMenuAccount(acc) }
  const handleMenuClose = () => { setAnchorEl(null); setMenuAccount(null) }

  const inputSx = { '& .MuiOutlinedInput-root': { background: 'rgba(255,255,255,0.05)', borderRadius: 2, fontSize: '0.875rem' }, '& .MuiInputLabel-root': { fontSize: '0.875rem' }, input: { color: '#F0F0F2' } }

  return (
    <SuperAdminLayout>
      <PageHeader
        title="Account Management"
        subtitle="Manage institutional accounts, subscriptions, and licensing"
        action={<PrimaryBtn onClick={() => setCreateOpen(true)}><AddIcon fontSize="small" /> New Account</PrimaryBtn>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard title="Total Accounts" value={mockAccounts.length}  icon="🏛️" accent="#FF6B6B" />
        <StatCard title="Active"         value={mockAccounts.filter(a=>a.status==='active').length} icon="✅" accent="#5EDA7E" trend="accounts" />
        <StatCard title="Total Users"    value={mockAccounts.reduce((s,a)=>s+a.users,0).toLocaleString()} icon="👥" accent="#60AAFF" />
        <StatCard title="MRR"            value={`$${(mockAccounts.length*299).toLocaleString()}`} icon="💰" accent="#FFB74D" trend="+8.3%" trendUp={true} />
      </div>

      {/* Filters */}
      <GlassCard style={{ marginBottom: 16 }}>
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
              {filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(acc => (
                <TableRow key={acc.id} sx={{ '&:last-child td': { borderBottom: 'none !important' } }}>
                  <TableCell sx={{ fontWeight: 700 }}>{acc.institution}</TableCell>
                  <TableCell>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>{acc.admin}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{acc.email}</div>
                  </TableCell>
                  <TableCell><StatusChip label={acc.status} type={acc.status === 'active' ? 'active' : 'inactive'} /></TableCell>
                  <TableCell><StatusChip label={acc.subscriptionPlan} type={planType(acc.subscriptionPlan)} /></TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{acc.users.toLocaleString()}</TableCell>
                  <TableCell sx={{ color: 'rgba(255,255,255,0.45) !important', fontSize: '0.82rem !important', fontFamily: 'var(--font-mono) !important' }}>{acc.lastLogin}</TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={e => handleMenuOpen(e, acc)} sx={{ color: 'rgba(255,255,255,0.35)', '&:hover': { color: '#fff', background: 'rgba(255,255,255,0.08)' } }}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && menuAccount?.id === acc.id} onClose={handleMenuClose}
                      PaperProps={{ sx: { background: '#16161E !important', border: '1px solid rgba(255,255,255,0.1) !important', borderRadius: '14px !important', minWidth: 180 } }}>
                      <MenuItem onClick={() => { setSelectedAccount(acc); setDetailsOpen(true); handleMenuClose() }}>View Details</MenuItem>
                      <MenuItem onClick={() => { setSelectedAccount(acc); setEditOpen(true); handleMenuClose() }}>Edit Account</MenuItem>
                      <MenuItem>Manage Subscription</MenuItem>
                      <MenuItem>View Usage</MenuItem>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08) !important', my: '4px !important' }} />
                      <MenuItem sx={{ color: '#FF6B6B !important' }}>Suspend Account</MenuItem>
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
                { label: 'PLAN',         value: <StatusChip label={selectedAccount.subscriptionPlan} type={planType(selectedAccount.subscriptionPlan)} /> },
                { label: 'TOTAL USERS',  value: selectedAccount.users.toLocaleString() },
                { label: 'LAST LOGIN',   value: selectedAccount.lastLogin },
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

      {/* Create / Edit dialog */}
      <Dialog open={createOpen || editOpen} onClose={() => { setCreateOpen(false); setEditOpen(false) }} maxWidth="sm" fullWidth>
        <DialogTitle>{editOpen ? 'Edit Account' : 'Create New Account'}</DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          <Stack spacing={2}>
            <TextField label="Institution Name" fullWidth size="small" defaultValue={selectedAccount?.institution || ''} sx={inputSx} />
            <TextField label="Admin Name"        fullWidth size="small" defaultValue={selectedAccount?.admin || ''}        sx={inputSx} />
            <TextField label="Admin Email"       fullWidth size="small" type="email" defaultValue={selectedAccount?.email || ''} sx={inputSx} />
            <FormControlLabel
              control={<Switch defaultChecked={selectedAccount?.status === 'active'} sx={{ '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#8B0000 !important' } }} />}
              label={<span style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>Active Account</span>}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <OutlineBtn onClick={() => { setCreateOpen(false); setEditOpen(false) }}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={() => { setCreateOpen(false); setEditOpen(false) }}>{editOpen ? 'Update' : 'Create'}</PrimaryBtn>
        </DialogActions>
      </Dialog>
    </SuperAdminLayout>
  )
}