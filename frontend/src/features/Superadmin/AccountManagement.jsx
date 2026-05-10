// src/features/Superadmin/AccountManagement.jsx
import { useState } from 'react'
import {
  Box, Card, CardContent, CardHeader, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, TextField, Stack, Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Menu, MenuItem, IconButton, Grid, Typography, Divider, Switch, FormControlLabel
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import SuperAdminLayout from './SuperAdminLayout'

const mockAccounts = [
  { id: 1, institution: 'State University', admin: 'Dr. Maria Santos', email: 'maria@stateuniv.edu', status: 'active', subscriptionPlan: 'Professional', users: 450, createdAt: '2025-03-15', lastLogin: '2026-05-10 09:45' },
  { id: 2, institution: 'Tech College', admin: 'Prof. John Doe', email: 'john@techcollege.edu', status: 'active', subscriptionPlan: 'Premium', users: 320, createdAt: '2025-04-20', lastLogin: '2026-05-09 14:30' },
  { id: 3, institution: 'Modern Academy', admin: 'Ms. Lisa Chen', email: 'lisa@modernacad.edu', status: 'active', subscriptionPlan: 'Standard', users: 180, createdAt: '2025-05-10', lastLogin: '2026-05-08 11:20' },
  { id: 4, institution: 'National University', admin: 'Dr. Ahmed Hassan', email: 'ahmed@nationaluni.edu', status: 'inactive', subscriptionPlan: 'Standard', users: 125, createdAt: '2025-01-22', lastLogin: '2026-04-15 16:00' },
  { id: 5, institution: 'Excellence School', admin: 'Mrs. Paula Garcia', email: 'paula@excellence.edu', status: 'active', subscriptionPlan: 'Professional', users: 220, createdAt: '2025-06-05', lastLogin: '2026-05-10 08:15' },
]

const getStatusColor = (status) => {
  return status === 'active' ? { bg: '#E8F5E9', color: '#2E7D32' } : { bg: '#F1F5F9', color: '#64748B' }
}

const getPlanColor = (plan) => {
  switch (plan) {
    case 'Premium': return { bg: '#FFF8E1', color: '#F57F17' }
    case 'Professional': return { bg: '#E3F2FD', color: '#1565C0' }
    case 'Standard': return { bg: '#F3E5F5', color: '#6A1B9A' }
    default: return { bg: '#F1F5F9', color: '#64748B' }
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

  const cardStyles = { borderRadius: '24px', border: 'none', boxShadow: '0 8px 32px rgba(0,0,0,0.08)', background: '#FFFFFF', p: 1 };

  return (
    <SuperAdminLayout>
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#FFFFFF', mb: 1 }}>
            Account Management
          </Typography>
          <Typography sx={{ color: '#FFCDD2', fontSize: '0.95rem' }}>
            Manage institutional accounts, subscriptions, and licensing
          </Typography>
        </Box>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent sx={{ p: 3 }}>
                <Typography sx={{ color: '#64748B', fontSize: '0.9rem', mb: 1, fontWeight: 700 }}>Total Accounts</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: '#1A1A1A', lineHeight: 1 }}>{mockAccounts.length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent sx={{ p: 3 }}>
                <Typography sx={{ color: '#64748B', fontSize: '0.9rem', mb: 1, fontWeight: 700 }}>Active Accounts</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: '#2E7D32', lineHeight: 1 }}>{mockAccounts.filter((a) => a.status === 'active').length}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent sx={{ p: 3 }}>
                <Typography sx={{ color: '#64748B', fontSize: '0.9rem', mb: 1, fontWeight: 700 }}>Total Users</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: '#1976D2', lineHeight: 1 }}>{mockAccounts.reduce((sum, a) => sum + a.users, 0).toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={cardStyles}>
              <CardContent sx={{ p: 3 }}>
                <Typography sx={{ color: '#64748B', fontSize: '0.9rem', mb: 1, fontWeight: 700 }}>MRR Revenue</Typography>
                <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: '#F57C00', lineHeight: 1 }}>${(mockAccounts.length * 299).toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card sx={{ ...cardStyles, mb: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
              <TextField placeholder="Search institution, admin, or email..." variant="outlined" size="small" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0) }} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: '#888' }} /> }} sx={{ flex: 1, minWidth: 250, '& .MuiOutlinedInput-root': { borderRadius: '12px' } }} />
              <TextField select label="Filter by Status" variant="outlined" size="small" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }} SelectProps={{ native: true }} sx={{ minWidth: 150, '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}>
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </TextField>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)} sx={{ background: '#8B0000', borderRadius: '12px', '&:hover': { background: '#6B0000' }, textTransform: 'none', px: 3 }}>
                New Account
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={cardStyles}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ background: '#F8FAFC' }}>
                  <TableCell sx={{ fontWeight: 700, color: '#475569', borderBottom: 'none' }}>Institution</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#475569', borderBottom: 'none' }}>Admin</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#475569', textAlign: 'center', borderBottom: 'none' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#475569', textAlign: 'center', borderBottom: 'none' }}>Plan</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#475569', textAlign: 'right', borderBottom: 'none' }}>Users</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#475569', borderBottom: 'none' }}>Last Login</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#475569', textAlign: 'center', borderBottom: 'none' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredAccounts.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((account) => {
                  const statusColor = getStatusColor(account.status)
                  const planColor = getPlanColor(account.subscriptionPlan)
                  return (
                    <TableRow key={account.id} sx={{ '&:hover': { background: '#F8FAFC' }, '& td': { borderBottom: '1px solid #F1F5F9' }, '&:last-child td': { borderBottom: 'none' } }}>
                      <TableCell sx={{ fontWeight: 700, color: '#1A1A1A' }}>{account.institution}</TableCell>
                      <TableCell sx={{ color: '#64748B' }}>{account.admin}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}><Chip label={account.status.toUpperCase()} size="small" sx={{ background: statusColor.bg, color: statusColor.color, fontWeight: 700, fontSize: '0.7rem', borderRadius: '8px' }} /></TableCell>
                      <TableCell sx={{ textAlign: 'center' }}><Chip label={account.subscriptionPlan} size="small" sx={{ background: planColor.bg, color: planColor.color, fontWeight: 700, fontSize: '0.7rem', borderRadius: '8px' }} /></TableCell>
                      <TableCell sx={{ textAlign: 'right', fontWeight: 700, color: '#1A1A1A' }}>{account.users}</TableCell>
                      <TableCell sx={{ color: '#64748B', fontSize: '0.9rem' }}>{account.lastLogin}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <IconButton size="small" onClick={(e) => handleMenuOpen(e, account)}><MoreVertIcon fontSize="small" /></IconButton>
                        <Menu anchorEl={anchorEl} open={Boolean(anchorEl) && menuAccount?.id === account.id} onClose={handleMenuClose} PaperProps={{ sx: { borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } }}>
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
          <TablePagination rowsPerPageOptions={[5, 10, 25]} component="div" count={filteredAccounts.length} rowsPerPage={rowsPerPage} page={page} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} sx={{ borderTop: '1px solid #F1F5F9' }} />
        </Card>

        {/* Dialogs */}
        <Dialog open={detailsDialogOpen} onClose={() => setDetailsDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '24px' } }}>
          <DialogTitle sx={{ fontWeight: 800 }}>Account Details</DialogTitle>
          <Divider sx={{ borderColor: '#F1F5F9' }} />
          <DialogContent sx={{ pt: 3 }}>
            {selectedAccount && (
              <Stack spacing={2.5}>
                <Box><Typography sx={{ fontWeight: 700, color: '#64748B', fontSize: '0.8rem', mb: 0.5 }}>INSTITUTION</Typography><Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>{selectedAccount.institution}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#64748B', fontSize: '0.8rem', mb: 0.5 }}>PRIMARY ADMIN</Typography><Typography sx={{ fontWeight: 600 }}>{selectedAccount.admin}</Typography><Typography sx={{ color: '#64748B', fontSize: '0.9rem' }}>{selectedAccount.email}</Typography></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#64748B', fontSize: '0.8rem', mb: 0.5 }}>STATUS</Typography><Chip label={selectedAccount.status.toUpperCase()} sx={{ background: getStatusColor(selectedAccount.status).bg, color: getStatusColor(selectedAccount.status).color, fontWeight: 700, borderRadius: '8px' }} /></Box>
                <Box><Typography sx={{ fontWeight: 700, color: '#64748B', fontSize: '0.8rem', mb: 0.5 }}>TOTAL USERS</Typography><Typography sx={{ fontSize: '1.8rem', fontWeight: 800, color: '#1A1A1A' }}>{selectedAccount.users}</Typography></Box>
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 0 }}><Button onClick={() => setDetailsDialogOpen(false)} sx={{ color: '#64748B', fontWeight: 700 }}>Close</Button></DialogActions>
        </Dialog>

        <Dialog open={createDialogOpen || editDialogOpen} onClose={() => { setCreateDialogOpen(false); setEditDialogOpen(false) }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '24px' } }}>
          <DialogTitle sx={{ fontWeight: 800 }}>{editDialogOpen ? 'Edit Account' : 'Create New Account'}</DialogTitle>
          <Divider sx={{ borderColor: '#F1F5F9' }} />
          <DialogContent sx={{ pt: 3 }}>
            <Stack spacing={2.5}>
              <TextField label="Institution Name" variant="outlined" fullWidth defaultValue={selectedAccount?.institution || ''} InputProps={{ sx: { borderRadius: '12px' } }} />
              <TextField label="Admin Name" variant="outlined" fullWidth defaultValue={selectedAccount?.admin || ''} InputProps={{ sx: { borderRadius: '12px' } }} />
              <TextField label="Admin Email" variant="outlined" type="email" fullWidth defaultValue={selectedAccount?.email || ''} InputProps={{ sx: { borderRadius: '12px' } }} />
              <FormControlLabel control={<Switch defaultChecked={selectedAccount?.status === 'active'} color="error" />} label={<Typography sx={{ fontWeight: 600 }}>Active Account</Typography>} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 3, pt: 0 }}>
            <Button onClick={() => { setCreateDialogOpen(false); setEditDialogOpen(false) }} sx={{ color: '#64748B', fontWeight: 700 }}>Cancel</Button>
            <Button variant="contained" sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, borderRadius: '12px', px: 3, textTransform: 'none', fontWeight: 700 }} onClick={() => { setCreateDialogOpen(false); setEditDialogOpen(false) }}>{editDialogOpen ? 'Update' : 'Create'}</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </SuperAdminLayout>
  )
}