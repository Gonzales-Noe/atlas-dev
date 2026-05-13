// src/features/Superadmin/AccountManagement.jsx
import { useState } from 'react'
import {
  Box, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TextField, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Menu, MenuItem, IconButton, Grid, Typography, Divider, Switch, FormControlLabel
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import SuperAdminLayout from './SuperAdminLayout'

// Mock account data
const mockAccounts = [
  { id: 1, institution: 'State University', admin: 'Dr. Maria Santos', email: 'maria@stateuniv.edu', status: 'active', subscriptionPlan: 'Professional', users: 450, createdAt: '2025-03-15', lastLogin: '2026-05-10 09:45' },
  { id: 2, institution: 'Tech College', admin: 'Prof. John Doe', email: 'john@techcollege.edu', status: 'active', subscriptionPlan: 'Premium', users: 320, createdAt: '2025-04-20', lastLogin: '2026-05-09 14:30' },
  { id: 3, institution: 'Modern Academy', admin: 'Ms. Lisa Chen', email: 'lisa@modernacad.edu', status: 'active', subscriptionPlan: 'Standard', users: 180, createdAt: '2025-05-10', lastLogin: '2026-05-08 11:20' },
  { id: 4, institution: 'National University', admin: 'Dr. Ahmed Hassan', email: 'ahmed@nationaluni.edu', status: 'inactive', subscriptionPlan: 'Standard', users: 125, createdAt: '2025-01-22', lastLogin: '2026-04-15 16:00' },
  { id: 5, institution: 'Excellence School', admin: 'Mrs. Paula Garcia', email: 'paula@excellence.edu', status: 'active', subscriptionPlan: 'Professional', users: 220, createdAt: '2025-06-05', lastLogin: '2026-05-10 08:15' },
]

const getStatusColor = (status) => {
  return status === 'active' ? { bg: '#C8E6C9', color: '#2E7D32' } : { bg: '#F5F5F5', color: '#888' }
}

const getPlanColor = (plan) => {
  switch (plan) {
    case 'Premium': return { bg: '#FFF8E1', color: '#F57F17' }
    case 'Professional': return { bg: '#E3F2FD', color: '#1565C0' }
    case 'Standard': return { bg: '#F3E5F5', color: '#6A1B9A' }
    default: return { bg: '#EEEEEE', color: '#616161' }
  }
}

export default function AccountManagement() {
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

  const filteredAccounts = mockAccounts.filter((account) => {
    const matchesSearch = account.institution.toLowerCase().includes(searchTerm.toLowerCase()) || account.admin.toLowerCase().includes(searchTerm.toLowerCase()) || account.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = !filterStatus || account.status === filterStatus
    return matchesSearch && matchesFilter
  })

  const handleChangePage = (event, newPage) => setPage(newPage)
  const handleChangeRowsPerPage = (event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0) }
  const handleMenuOpen = (event, account) => { setAnchorEl(event.currentTarget); setMenuAccount(account) }
  const handleMenuClose = () => { setAnchorEl(null); setMenuAccount(null) }
  
  const handleViewDetails = (account) => { setSelectedAccount(account); setDetailsDialogOpen(true); handleMenuClose() }
  const handleEdit = (account) => { setSelectedAccount(account); setEditDialogOpen(true); handleMenuClose() }

  // New styling to match the mockup perfectly
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
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#1A1A1A' }}>{mockAccounts.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent>
                <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>Active Accounts</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#2E7D32' }}>{mockAccounts.filter((a) => a.status === 'active').length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent>
                <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>Total Users</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#1976D2' }}>{mockAccounts.reduce((sum, a) => sum + a.users, 0).toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent>
                <Typography sx={{ color: '#922724', fontSize: '1rem', mb: 1, fontWeight: 700 }}>MRR Revenue</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 700, color: '#F57C00' }}>${(mockAccounts.length * 299).toLocaleString()}</Typography>
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
                <option value="inactive">Inactive</option>
              </TextField>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)} sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }}>
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
                {filteredAccounts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((account) => {
                  const statusColor = getStatusColor(account.status)
                  const planColor = getPlanColor(account.subscriptionPlan)
                  return (
                    <TableRow key={account.id} sx={{ '&:hover': { background: '#FAFAFA' } }}>
                      <TableCell sx={{ fontWeight: 600, color: '#1A1A1A' }}>{account.institution}</TableCell>
                      <TableCell sx={{ color: '#666' }}>{account.admin}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}><Chip label={account.status.toUpperCase()} size="small" sx={{ background: statusColor.bg, color: statusColor.color, fontWeight: 600, fontSize: '0.7rem' }} /></TableCell>
                      <TableCell sx={{ textAlign: 'center' }}><Chip label={account.subscriptionPlan} size="small" sx={{ background: planColor.bg, color: planColor.color, fontWeight: 600, fontSize: '0.7rem' }} /></TableCell>
                      <TableCell sx={{ textAlign: 'right', fontWeight: 600, color: '#1A1A1A' }}>{account.users}</TableCell>
                      <TableCell sx={{ color: '#666', fontSize: '0.9rem' }}>{account.lastLogin}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <IconButton size="small" onClick={(e) => handleMenuOpen(e, account)}><MoreVertIcon fontSize="small" /></IconButton>
                        <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && menuAccount?.id === account.id} onClose={handleMenuClose}>
                          <MenuItem onClick={() => handleViewDetails(account)}>View Details</MenuItem>
                          <MenuItem onClick={() => handleEdit(account)}>Edit Account</MenuItem>
                          <MenuItem>Manage Subscription</MenuItem>
                          <MenuItem>View Usage</MenuItem>
                          <MenuItem sx={{ color: '#C62828' }}>Suspend Account</MenuItem>
                        </Menu>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
          <DialogActions sx={{ p: 2 }}><Button onClick={() => setDetailsDialogOpen(false)}>Close</Button></DialogActions>
        </Dialog>

        {/* Create/Edit Account Dialog */}
        <Dialog open={createDialogOpen || editDialogOpen} onClose={() => { setCreateDialogOpen(false); setEditDialogOpen(false) }} maxWidth="sm" fullWidth>
          <DialogTitle>{editDialogOpen ? 'Edit Account' : 'Create New Account'}</DialogTitle>
          <Divider />
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={2}>
              <TextField label="Institution Name" variant="outlined" fullWidth defaultValue={selectedAccount?.institution || ''} />
              <TextField label="Admin Name" variant="outlined" fullWidth defaultValue={selectedAccount?.admin || ''} />
              <TextField label="Admin Email" variant="outlined" type="email" fullWidth defaultValue={selectedAccount?.email || ''} />
              <FormControlLabel control={<Switch defaultChecked={selectedAccount?.status === 'active'} />} label="Active Account" />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => { setCreateDialogOpen(false); setEditDialogOpen(false) }}>Cancel</Button>
            <Button variant="contained" sx={{ background: '#922724', '&:hover': { background: '#6B0000' } }} onClick={() => { setCreateDialogOpen(false); setEditDialogOpen(false) }}>{editDialogOpen ? 'Update' : 'Create'}</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </SuperAdminLayout>
  )
}