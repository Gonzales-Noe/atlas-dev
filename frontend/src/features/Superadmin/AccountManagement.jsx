// src/features/Superadmin/AccountManagement.jsx
import { useState, useEffect } from 'react'
import {
  Box, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TextField, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Menu, MenuItem, IconButton, Grid, Typography, Divider, Switch, FormControlLabel, CircularProgress
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import CheckCircleIcon from '@mui/icons-material/CheckCircle' // <-- Added for the Approve button
import SuperAdminLayout from './SuperAdminLayout'

// Updated to make pending accounts orange!
const getStatusColor = (status) => {
  return status === 'active' ? { bg: '#C8E6C9', color: '#2E7D32' } : { bg: '#FFF3E0', color: '#E65100' }
}

const getPlanColor = (plan) => {
  switch (plan?.toLowerCase()) {
    case 'premium': return { bg: '#FFF8E1', color: '#F57F17' }
    case 'professional': return { bg: '#E3F2FD', color: '#1565C0' }
    case 'standard': return { bg: '#F3E5F5', color: '#6A1B9A' }
    default: return { bg: '#EEEEEE', color: '#616161' } 
  }
}

const getRoleDisplayName = (role) => {
  switch (role?.toLowerCase()) {
    case 'superadmin':
    case 'super_admin':
      return 'Platform Admin'
    case 'admin':
      return 'Institution Admin'
    case 'faculty':
      return 'Faculty'
    default:
      return 'User'
  }
}

const SESSION_STORAGE_KEY = 'atlas_superadmin_accounts'
const DEFAULT_ACCOUNTS = [
  {
    id: 1,
    institution: 'Lakewood University',
    admin: 'Julian Manning',
    email: 'julian.manning@lakewood.edu',
    status: 'active',
    subscriptionPlan: 'Professional',
    users: 12,
    createdAt: '02/14/2025',
    lastLogin: '5/12/2026 10:25 AM'
  },
  {
    id: 2,
    institution: 'Riverside Academy',
    admin: 'Arielle Carter',
    email: 'arielle.carter@riverside.ac',
    status: 'pending',
    subscriptionPlan: 'Standard',
    users: 8,
    createdAt: '11/08/2025',
    lastLogin: 'Never logged in'
  },
  {
    id: 3,
    institution: 'Summit Tech College',
    admin: 'Marcus Reed',
    email: 'marcus.reed@summittech.edu',
    status: 'active',
    subscriptionPlan: 'Premium',
    users: 29,
    createdAt: '01/09/2026',
    lastLogin: '5/19/2026 4:02 PM'
  }
]

export default function AccountManagement() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuAccount, setMenuAccount] = useState(null)
  const [createForm, setCreateForm] = useState({ institution: '', admin: '', email: '', isActive: false, plan: 'Standard', users: 1 })
  const [editForm, setEditForm] = useState({ institution: '', admin: '', email: '', isActive: false, plan: 'Standard', users: 1 })

  const loadSessionAccounts = () => {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.warn('Could not parse session accounts:', error)
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(DEFAULT_ACCOUNTS))
    return DEFAULT_ACCOUNTS
  }

  const saveAccounts = (nextAccounts) => {
    setAccounts(nextAccounts)
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextAccounts))
  }

  useEffect(() => {
    const initialAccounts = loadSessionAccounts()
    setAccounts(initialAccounts)
    setLoading(false)
  }, [])

  const handleActivateAccount = (accountId) => {
    const nextAccounts = accounts.map((account) => (
      account.id === accountId ? { ...account, status: 'active' } : account
    ))
    saveAccounts(nextAccounts)
    if (selectedAccount?.id === accountId) {
      setSelectedAccount(nextAccounts.find((acc) => acc.id === accountId))
    }
    handleMenuClose()
  }

  const handleEdit = (account) => {
    setSelectedAccount(account)
    setEditForm({
      institution: account.institution,
      admin: account.admin,
      email: account.email,
      isActive: account.status === 'active',
      plan: account.subscriptionPlan,
      users: account.users
    })
    setEditDialogOpen(true)
    handleMenuClose()
  }

  const openCreateDialog = () => {
    setCreateForm({ institution: '', admin: '', email: '', isActive: false, plan: 'Standard', users: 1 })
    setCreateDialogOpen(true)
  }

  const handleCreateAccount = () => {
    const newAccount = {
      id: Date.now(),
      institution: createForm.institution || 'New Institution',
      admin: createForm.admin || 'New Admin',
      email: createForm.email || 'new@institution.edu',
      status: createForm.isActive ? 'active' : 'pending',
      subscriptionPlan: createForm.plan,
      users: Number(createForm.users) || 1,
      createdAt: new Date().toLocaleDateString(),
      lastLogin: 'Never logged in'
    }
    saveAccounts([newAccount, ...accounts])
    setCreateDialogOpen(false)
  }

  const handleSaveEdit = () => {
    const updatedAccounts = accounts.map((account) => (
      account.id === selectedAccount.id
        ? {
            ...account,
            institution: editForm.institution,
            admin: editForm.admin,
            email: editForm.email,
            status: editForm.isActive ? 'active' : 'pending',
            subscriptionPlan: editForm.plan,
            users: Number(editForm.users) || 1
          }
        : account
    ))
    saveAccounts(updatedAccounts)
    setSelectedAccount(updatedAccounts.find((acc) => acc.id === selectedAccount.id))
    setEditDialogOpen(false)
  }

  const closeFormDialogs = () => {
    setCreateDialogOpen(false)
    setEditDialogOpen(false)
  }

  const filteredAccounts = accounts.filter((account) => {
    const matchesSearch = account.institution.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          account.admin.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          account.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = !filterStatus || account.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const handleChangePage = (event, newPage) => setPage(newPage)
  const handleChangeRowsPerPage = (event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0) }
  const handleMenuOpen = (event, account) => { setAnchorEl(event.currentTarget); setMenuAccount(account) }
  const handleMenuClose = () => { setAnchorEl(null); setMenuAccount(null) }
  
  const handleViewDetails = (account) => { setSelectedAccount(account); setDetailsDialogOpen(true); handleMenuClose() }

  const cardStyles = { borderRadius: 4, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };

  return (
    <SuperAdminLayout>
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#1A1A1A', mb: 1 }}>
            Account Management
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Manage institutional accounts, subscriptions, and licensing
          </Typography>
        </Box>

        {/* Summary Stats */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent>
                <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>Total Accounts</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#1A1A1A' }}>{accounts.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent>
                <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>Active Accounts</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#2E7D32' }}>{accounts.filter((a) => a.status === 'active').length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent>
                <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>Pending Accounts</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#E65100' }}>{accounts.filter((a) => a.status === 'pending').length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent>
                <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>MRR Revenue</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#F57C00' }}>${(accounts.length * 299).toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Filters & Search */}
        <Card sx={{ ...cardStyles, mb: 3 }}>
          <CardContent>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
              <TextField placeholder="Search institution, admin, or email..." variant="outlined" size="small" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: '#888' }} /> }} sx={{ flex: 1, minWidth: 250 }} />
              <TextField select label="Filter by Status" variant="outlined" size="small" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }} SelectProps={{ native: true }} sx={{ minWidth: 150 }}>
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
              </TextField>
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog} sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }}>
                New Account
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Accounts Table */}
        <Card sx={cardStyles}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ background: '#FAFAFA', borderBottom: '2px solid #EEE' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Institution</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Admin</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'center' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'center' }}>Plan</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'right' }}>Users</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>Last Login</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#1A1A1A', textAlign: 'center' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 5 }}>
                      <CircularProgress sx={{ color: '#922724' }} />
                    </TableCell>
                  </TableRow>
                ) : filteredAccounts.length === 0 ? (
                   <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 5, color: '#888' }}>
                      No accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((account) => {
                    const statusColor = getStatusColor(account.status)
                    const planColor = getPlanColor(account.subscriptionPlan)
                    return (
                      <TableRow key={account.id} sx={{ '&:hover': { background: '#FAFAFA' } }}>
                        <TableCell sx={{ fontWeight: 600, color: '#1A1A1A' }}>{account.institution}</TableCell>
                        <TableCell sx={{ color: '#666' }}>{account.admin}<br/><span style={{fontSize: '0.75rem', color: '#999'}}>{account.email}</span></TableCell>
                        <TableCell sx={{ textAlign: 'center' }}><Chip label={account.status.toUpperCase()} size="small" sx={{ background: statusColor.bg, color: statusColor.color, fontWeight: 700, fontSize: '0.7rem' }} /></TableCell>
                        <TableCell sx={{ textAlign: 'center' }}><Chip label={account.subscriptionPlan?.toUpperCase()} size="small" sx={{ background: planColor.bg, color: planColor.color, fontWeight: 700, fontSize: '0.7rem' }} /></TableCell>
                        <TableCell sx={{ textAlign: 'right', fontWeight: 600, color: '#1A1A1A' }}>{account.users}</TableCell>
                        <TableCell sx={{ color: '#666', fontSize: '0.9rem' }}>{account.lastLogin}</TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          
                          {/* 🚨 NEW: The Approve Button! */}
                          {account.status === 'pending' && (
                            <Button 
                              size="small" 
                              variant="contained" 
                              color="success" 
                              startIcon={<CheckCircleIcon />}
                              onClick={() => handleActivateAccount(account.id)}
                              sx={{ mr: 1, textTransform: 'none', fontWeight: 600 }}
                            >
                              Approve
                            </Button>
                          )}

                          <IconButton size="small" onClick={(e) => handleMenuOpen(e, account)}><MoreVertIcon fontSize="small" /></IconButton>
                          <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && menuAccount?.id === account.id} onClose={handleMenuClose}>
                            <MenuItem onClick={() => handleViewDetails(account)}>View Details</MenuItem>
                            {/* 🚨 NEW: The Approve option inside the dropdown menu! */}
                            {account.status === 'pending' && (
                              <MenuItem onClick={() => handleActivateAccount(account.id)} sx={{ color: '#2E7D32', fontWeight: 600 }}>
                                Approve & Activate
                              </MenuItem>
                            )}
                            <MenuItem onClick={() => handleEdit(account)}>Edit Account</MenuItem>
                            <MenuItem>Manage Subscription</MenuItem>
                            <MenuItem>View Usage</MenuItem>
                            <MenuItem sx={{ color: '#C62828' }}>Suspend Account</MenuItem>
                          </Menu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination rowsPerPageOptions={[5, 10, 25]} component="div" count={filteredAccounts.length} rowsPerPage={rowsPerPage} page={page} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} sx={{ borderTop: '1px solid #EEE', '& .MuiTablePagination-root': { p: 2 } }} />
        </Card>

        {/* Account Details Dialog */}
        <Dialog open={detailsDialogOpen} onClose={() => setDetailsDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Account Details</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 3 }}>
            {selectedAccount && (
              <Stack spacing={2}>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>INSTITUTION</Typography><Typography sx={{ fontWeight: 600 }}>{selectedAccount.institution}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>PRIMARY ADMIN</Typography><Typography>{selectedAccount.admin}</Typography><Typography sx={{ color: '#666', fontSize: '0.9rem' }}>{selectedAccount.email}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>STATUS</Typography><Chip label={selectedAccount.status.toUpperCase()} sx={{ background: getStatusColor(selectedAccount.status).bg, color: getStatusColor(selectedAccount.status).color, fontWeight: 600 }} /></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#666', fontSize: '0.8rem', mb: 0.5 }}>TOTAL USERS</Typography><Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#922724' }}>{selectedAccount.users}</Typography></Box>
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
            {/* 🚨 NEW: Added Approve button to details view as well */}
            {selectedAccount?.status === 'pending' && (
              <Button variant="contained" color="success" onClick={() => { handleActivateAccount(selectedAccount.id); setDetailsDialogOpen(false); }}>
                Approve Account
              </Button>
            )}
          </DialogActions>
        </Dialog>

        {/* Create/Edit Account Dialog */}
        <Dialog open={createDialogOpen || editDialogOpen} onClose={closeFormDialogs} maxWidth="sm" fullWidth>
          <DialogTitle>{editDialogOpen ? 'Edit Account' : 'Create New Account'}</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={2}>
              <TextField
                label="Institution Name"
                variant="outlined"
                fullWidth
                value={editDialogOpen ? editForm.institution : createForm.institution}
                onChange={(e) => {
                  if (editDialogOpen) setEditForm({ ...editForm, institution: e.target.value })
                  else setCreateForm({ ...createForm, institution: e.target.value })
                }}
              />
              <TextField
                label="Admin Name"
                variant="outlined"
                fullWidth
                value={editDialogOpen ? editForm.admin : createForm.admin}
                onChange={(e) => {
                  if (editDialogOpen) setEditForm({ ...editForm, admin: e.target.value })
                  else setCreateForm({ ...createForm, admin: e.target.value })
                }}
              />
              <TextField
                label="Admin Email"
                variant="outlined"
                type="email"
                fullWidth
                value={editDialogOpen ? editForm.email : createForm.email}
                onChange={(e) => {
                  if (editDialogOpen) setEditForm({ ...editForm, email: e.target.value })
                  else setCreateForm({ ...createForm, email: e.target.value })
                }}
              />
              <TextField
                select
                label="Plan"
                value={editDialogOpen ? editForm.plan : createForm.plan}
                onChange={(e) => {
                  if (editDialogOpen) setEditForm({ ...editForm, plan: e.target.value })
                  else setCreateForm({ ...createForm, plan: e.target.value })
                }}
                SelectProps={{ native: true }}
                fullWidth
              >
                <option value="Standard">Standard</option>
                <option value="Professional">Professional</option>
                <option value="Premium">Premium</option>
                <option value="Free">Free</option>
              </TextField>
              <TextField
                label="Users"
                variant="outlined"
                type="number"
                fullWidth
                value={editDialogOpen ? editForm.users : createForm.users}
                onChange={(e) => {
                  const nextUsers = Number(e.target.value) || 1
                  if (editDialogOpen) setEditForm({ ...editForm, users: nextUsers })
                  else setCreateForm({ ...createForm, users: nextUsers })
                }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={editDialogOpen ? editForm.isActive : createForm.isActive}
                    onChange={(e) => {
                      if (editDialogOpen) setEditForm({ ...editForm, isActive: e.target.checked })
                      else setCreateForm({ ...createForm, isActive: e.target.checked })
                    }}
                  />
                }
                label="Active Account"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeFormDialogs}>Cancel</Button>
            {editDialogOpen ? (
              <Button variant="contained" sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }} onClick={handleSaveEdit}>
                Update
              </Button>
            ) : (
              <Button
                variant="contained"
                sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }}
                onClick={handleCreateAccount}
                disabled={!createForm.institution || !createForm.admin || !createForm.email}
              >
                Create
              </Button>
            )}
          </DialogActions>
        </Dialog>
      </Box>
    </SuperAdminLayout>
  )
}