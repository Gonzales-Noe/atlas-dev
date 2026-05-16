// src/features/Admin/AccountManagement.jsx
import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Chip,
  CircularProgress,
  Stack
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'

export default function AdminAccountManagement() {
  const [faculty, setFaculty] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [createDialog, setCreateDialog] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '' })
  
  const [editDialog, setEditDialog] = useState(false)
  const [selectedFaculty, setSelectedFaculty] = useState(null)
  const [editForm, setEditForm] = useState({ email: '', status: true })

  // Fetch real data from the API
  const fetchFaculty = async () => {
    try {
      setLoading(true)
      const { data } = await api.get('/auth/accounts/')
      // Filter out the admin themselves, so they only see Faculty accounts
      const facultyOnly = data.filter(user => user.role === 'faculty' || user.role_code === 'faculty')
      setFaculty(facultyOnly)
    } catch (error) {
      console.error("Failed to fetch faculty:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFaculty()
  }, [])

  // Action: Create a new faculty member
  const handleCreate = async () => {
    try {
      await api.post('/auth/accounts/', { email: createForm.email })
      setCreateForm({ email: '' })
      setCreateDialog(false)
      fetchFaculty() // Refresh the table
    } catch (error) {
      console.error("Failed to create faculty:", error)
      alert(error.response?.data?.detail || "Failed to create account.")
    }
  }

  // Action: Open the edit modal
  function handleEdit(fac) {
    setSelectedFaculty(fac)
    setEditForm({ email: fac.email, status: fac.is_active })
    setEditDialog(true)
  }

  // Action: Save edits (using the PATCH endpoint we reviewed earlier)
  const handleSaveEdit = async () => {
    try {
      await api.patch(`/auth/accounts/${selectedFaculty.user_id || selectedFaculty.id}/`, {
        email: editForm.email,
        is_active: editForm.status
      })
      setEditDialog(false)
      fetchFaculty()
    } catch (error) {
      console.error("Failed to update faculty:", error)
    }
  }

  // Action: Deactivate account
  const handleDeactivate = async (id) => {
    if (!window.confirm("Are you sure you want to deactivate this account?")) return;
    try {
      await api.patch(`/auth/accounts/${id}/`, { is_active: false })
      fetchFaculty()
    } catch (error) {
      console.error("Failed to deactivate faculty:", error)
    }
  }

  return (
    <AdminLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
              Faculty Account Management
            </Typography>
            <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
              Manage faculty accounts, permissions, and access within your institution.
            </Typography>
          </Box>
          <Button 
            variant="contained" 
            startIcon={<AddIcon />} 
            onClick={() => setCreateDialog(true)}
            sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}
          >
            Add Faculty
          </Button>
        </Box>

        <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
          <CardHeader title="Faculty Members" titleTypographyProps={{ fontWeight: 700 }} />
          <CardContent>
            <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Joined</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4 }}>
                        <CircularProgress sx={{ color: '#8B0000' }} />
                      </TableCell>
                    </TableRow>
                  ) : faculty.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: '#888' }}>
                        No faculty members found. Click "Add Faculty" to invite someone.
                      </TableCell>
                    </TableRow>
                  ) : (
                    faculty.map((fac) => (
                      <TableRow key={fac.id || fac.user_id}>
                        <TableCell sx={{ fontWeight: 600 }}>{fac.email}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{fac.role || fac.role_code}</TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <Chip 
                            label={fac.is_active ? 'Active' : 'Inactive'} 
                            size="small" 
                            sx={{ 
                              background: fac.is_active ? '#C8E6C9' : '#F5F5F5', 
                              color: fac.is_active ? '#2E7D32' : '#888',
                              fontWeight: 600 
                            }} 
                          />
                        </TableCell>
                        <TableCell>{fac.created_at ? new Date(fac.created_at).toLocaleDateString() : '-'}</TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton onClick={() => handleEdit(fac)} size="small" color="primary">
                            <EditIcon />
                          </IconButton>
                          {fac.is_active && (
                            <IconButton onClick={() => handleDeactivate(fac.user_id || fac.id)} size="small" color="error">
                              <DeleteIcon />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* CREATE DIALOG */}
        <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Add New Faculty</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: '#666', mb: 2, fontSize: '0.9rem' }}>
              Enter the email address of the faculty member. They will receive an email with instructions to set their password.
            </Typography>
            <TextField
              label="Faculty Email"
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm({ email: e.target.value })}
              fullWidth
              autoFocus
            />
          </DialogContent>
          <DialogActions sx={{ p: 2, pt: 0 }}>
            <Button onClick={() => setCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} variant="contained" disabled={!createForm.email} sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}>
              Send Invite
            </Button>
          </DialogActions>
        </Dialog>

        {/* EDIT DIALOG */}
        <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>Edit Faculty Account</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                fullWidth
              />
              <TextField
                select
                label="Account Status"
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value === 'true' })}
                SelectProps={{ native: true }}
                fullWidth
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </TextField>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} variant="contained" sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}>
              Save Changes
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </AdminLayout>
  )
}