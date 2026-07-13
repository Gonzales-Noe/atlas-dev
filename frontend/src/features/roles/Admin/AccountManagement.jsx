// src/features/Admin/AccountManagement.jsx
import { useEffect, useState } from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Stack, IconButton, Menu, MenuItem,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import AdminLayout from './AdminLayout'
import { PageHeader, GlassCard, StatCard, StatusChip, PrimaryBtn, OutlineBtn } from '../../../components/ui'

const mockFaculty = [
  { id: 1, name: 'Dr. John Smith',    email: 'john.smith@university.edu',   status: 'active',   courses: 2, role: 'faculty',     lastLogin: '2026-05-10 09:30', department: 'Computer Science' },
  { id: 2, name: 'Prof. Jane Doe',    email: 'jane.doe@university.edu',     status: 'active',   courses: 1, role: 'faculty',     lastLogin: '2026-05-09 14:20', department: 'Mathematics'      },
  { id: 3, name: 'Dr. Alice Johnson', email: 'alice.johnson@university.edu', status: 'inactive', courses: 0, role: 'faculty',     lastLogin: '2026-04-28 11:00', department: 'English'          },
  { id: 4, name: 'Prof. Bob Wilson',  email: 'bob.wilson@university.edu',   status: 'active',   courses: 3, role: 'faculty',     lastLogin: '2026-05-10 08:45', department: 'Physics'          },
  { id: 5, name: 'Admin Smoke',       email: 'admin.smoke@example.com',     status: 'active',   courses: 0, role: 'admin',       lastLogin: '2026-05-10 07:00', department: 'Administration'   },
]

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

export default function AdminAccountManagement() {
  const [faculty, setFaculty]           = useState([])
  const [filtered, setFiltered]         = useState([])
  const [searchTerm, setSearchTerm]     = useState('')
  const [editDialog, setEditDialog]     = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [detailDialog, setDetailDialog] = useState(false)
  const [selectedFaculty, setSelectedFaculty] = useState(null)
  const [editForm, setEditForm]         = useState({ name: '', email: '', status: '', department: '' })
  const [anchorEl, setAnchorEl]         = useState(null)
  const [menuItem, setMenuItem]         = useState(null)

  useEffect(() => {
    setFaculty(mockFaculty)
    setFiltered(mockFaculty)
  }, [])

  useEffect(() => {
    const q = searchTerm.toLowerCase()
    setFiltered(faculty.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.email.toLowerCase().includes(q) ||
      f.department.toLowerCase().includes(q)
    ))
  }, [searchTerm, faculty])

  function handleEdit(fac) {
    setSelectedFaculty(fac)
    setEditForm({ name: fac.name, email: fac.email, status: fac.status, department: fac.department })
    setEditDialog(true)
    handleMenuClose()
  }

  function handleViewDetail(fac) {
    setSelectedFaculty(fac)
    setDetailDialog(true)
    handleMenuClose()
  }

  function handleDeactivate(id) {
    setFaculty(f => f.map(item => item.id === id ? { ...item, status: item.status === 'active' ? 'inactive' : 'active' } : item))
    handleMenuClose()
  }

  function handleSaveEdit() {
    setFaculty(f => f.map(item => item.id === selectedFaculty.id ? { ...item, ...editForm } : item))
    setEditDialog(false)
  }

  function handleMenuOpen(e, fac) { setAnchorEl(e.currentTarget); setMenuItem(fac) }
  function handleMenuClose()      { setAnchorEl(null); setMenuItem(null) }

  const activeFaculty   = faculty.filter(f => f.status === 'active' && f.role === 'faculty').length
  const inactiveFaculty = faculty.filter(f => f.status === 'inactive').length
  const totalCourses    = faculty.reduce((s, f) => s + f.courses, 0)

  return (
    <AdminLayout>
      <PageHeader
        title="Accounts"
        subtitle="Manage faculty accounts, roles, and access within your institution"
        action={<PrimaryBtn onClick={() => setCreateDialog(true)}><AddIcon fontSize="small" /> Add Faculty</PrimaryBtn>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard title="Total Faculty"    value={faculty.filter(f => f.role === 'faculty').length} icon="👨‍🏫" accent="#FF6B6B" />
        <StatCard title="Active Faculty"   value={activeFaculty}   icon="✅" accent="#5EDA7E" />
        <StatCard title="Inactive"         value={inactiveFaculty} icon="⏸️" accent="#FFB74D" />
        <StatCard title="Courses Assigned" value={totalCourses}    icon="📚" accent="#60AAFF" />
      </div>

      {/* Filter bar */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            placeholder="Search by name, email, or department…"
            size="small" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            sx={{ flex: 1, minWidth: 220, ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }}
          />
          <TextField
            select size="small" label="Role"
            SelectProps={{ native: true }}
            defaultValue=""
            sx={{ minWidth: 130, ...inputSx }}
          >
            <option value="">All Roles</option>
            <option value="faculty">Faculty</option>
            <option value="admin">Admin</option>
          </TextField>
          <TextField
            select size="small" label="Status"
            SelectProps={{ native: true }}
            defaultValue=""
            sx={{ minWidth: 130, ...inputSx }}
          >
            <option value="">All Status</option>
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
                {['Name & Email', 'Department', 'Role', 'Status', 'Courses', 'Last Login', ''].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', letterSpacing: '0.06em', color: 'var(--text-secondary) !important', textTransform: 'uppercase', py: 1.5, borderBottom: '1px solid var(--border-color)' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(fac => (
                <TableRow key={fac.id} sx={{ '&:last-child td': { borderBottom: 'none !important' }, cursor: 'pointer' }}>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #8B0000, #C0392B)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.78rem', fontWeight: 800, color: '#fff', flexShrink: 0,
                      }}>
                        {fac.name.split(' ').map(w => w[0]).slice(0,2).join('')}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{fac.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{fac.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell sx={{ color: 'var(--text-secondary) !important', fontSize: '0.85rem !important', borderBottom: '1px solid var(--border-color)' }}>{fac.department}</TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <StatusChip label={fac.role} type={fac.role === 'admin' ? 'warning' : 'info'} />
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <StatusChip label={fac.status} type={fac.status === 'active' ? 'active' : 'inactive'} />
                  </TableCell>
                  <TableCell sx={{ fontWeight: '700 !important', color: fac.courses > 0 ? 'var(--text-primary) !important' : 'var(--text-tertiary) !important', borderBottom: '1px solid var(--border-color)' }}>
                    {fac.courses}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'var(--font-mono) !important', fontSize: '0.78rem !important', color: 'var(--text-secondary) !important', borderBottom: '1px solid var(--border-color)' }}>
                    {fac.lastLogin}
                  </TableCell>
                  <TableCell sx={{ borderBottom: '1px solid var(--border-color)' }}>
                    <IconButton size="small" onClick={e => handleMenuOpen(e, fac)}
                      sx={{ color: 'var(--text-secondary)', '&:hover': { color: 'var(--text-primary)', background: 'var(--active-bg)' } }}>
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                    <Menu
                      anchorEl={anchorEl}
                      open={Boolean(anchorEl) && menuItem?.id === fac.id}
                      onClose={handleMenuClose}
                      PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none !important', border: '1px solid var(--border-color) !important', borderRadius: '14px !important', minWidth: 170 } }}
                    >
                      <MenuItem onClick={() => handleViewDetail(fac)}>View Profile</MenuItem>
                      <MenuItem onClick={() => handleEdit(fac)}>Edit Account</MenuItem>
                      <MenuItem onClick={() => handleDeactivate(fac.id)} sx={{ color: fac.status === 'active' ? '#FFB74D !important' : '#5EDA7E !important' }}>
                        {fac.status === 'active' ? 'Deactivate' : 'Reactivate'}
                      </MenuItem>
                      <Divider sx={{ borderColor: 'var(--border-color) !important', my: '4px !important' }} />
                      <MenuItem sx={{ color: '#FF6B6B !important' }}>Remove Account</MenuItem>
                    </Menu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
            No accounts match your search.
          </div>
        )}
      </GlassCard>

      {/* Detail Dialog */}
      <Dialog open={detailDialog} onClose={() => setDetailDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Faculty Profile</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          {selectedFaculty && (
            <Stack spacing={2.5}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#8B0000,#C0392B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {selectedFaculty.name.split(' ').map(w => w[0]).slice(0,2).join('')}
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{selectedFaculty.name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>{selectedFaculty.email}</div>
                </div>
              </div>
              {[
                { label: 'DEPARTMENT', value: selectedFaculty.department },
                { label: 'ROLE',       value: <StatusChip label={selectedFaculty.role} type={selectedFaculty.role === 'admin' ? 'warning' : 'info'} /> },
                { label: 'STATUS',     value: <StatusChip label={selectedFaculty.status} type={selectedFaculty.status === 'active' ? 'active' : 'inactive'} /> },
                { label: 'COURSES',    value: selectedFaculty.courses },
                { label: 'LAST LOGIN', value: selectedFaculty.lastLogin },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{value}</div>
                </div>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setDetailDialog(false)}>Close</OutlineBtn>
          <PrimaryBtn onClick={() => { setDetailDialog(false); handleEdit(selectedFaculty) }}>
            <EditIcon fontSize="small" /> Edit
          </PrimaryBtn>
        </DialogActions>
      </Dialog>

      {/* Edit / Create Dialog */}
      <Dialog
        open={editDialog || createDialog}
        onClose={() => { setEditDialog(false); setCreateDialog(false) }}
        maxWidth="sm" fullWidth
        PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>{editDialog ? 'Edit Faculty Account' : 'Add New Faculty'}</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            <TextField label="Full Name"   value={editForm.name}       onChange={e => setEditForm({ ...editForm, name: e.target.value })}       fullWidth size="small" sx={inputSx} />
            <TextField label="Email"       value={editForm.email}      onChange={e => setEditForm({ ...editForm, email: e.target.value })}      fullWidth size="small" type="email" sx={inputSx} />
            <TextField label="Department"  value={editForm.department} onChange={e => setEditForm({ ...editForm, department: e.target.value })} fullWidth size="small" sx={inputSx} />
            {createDialog && (
              <TextField label="Temporary Password" fullWidth size="small" type="password" sx={inputSx} />
            )}
            <TextField select label="Status" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
              SelectProps={{ native: true }} fullWidth size="small" sx={inputSx}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => { setEditDialog(false); setCreateDialog(false) }}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={editDialog ? handleSaveEdit : () => setCreateDialog(false)}>
            {editDialog ? 'Save Changes' : 'Create Account'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  )
}