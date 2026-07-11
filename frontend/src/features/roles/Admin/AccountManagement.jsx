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
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AdminLayout from './AdminLayout'

const mockFaculty = [
  { id: 1, name: 'Dr. John Smith', email: 'john.smith@university.edu', status: 'Active', courses: 2 },
  { id: 2, name: 'Prof. Jane Doe', email: 'jane.doe@university.edu', status: 'Active', courses: 1 },
  { id: 3, name: 'Dr. Alice Johnson', email: 'alice.johnson@university.edu', status: 'Inactive', courses: 0 },
  { id: 4, name: 'Prof. Bob Wilson', email: 'bob.wilson@university.edu', status: 'Active', courses: 3 },
]

export default function AdminAccountManagement() {
  const [faculty, setFaculty] = useState([])
  const [editDialog, setEditDialog] = useState(false)
  const [selectedFaculty, setSelectedFaculty] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', status: '' })

  useEffect(() => {
    // Mock data - in real app, fetch from API
    setFaculty(mockFaculty)
  }, [])

  function handleEdit(fac) {
    setSelectedFaculty(fac)
    setEditForm({ name: fac.name, email: fac.email, status: fac.status })
    setEditDialog(true)
  }

  function handleSaveEdit() {
    setFaculty(faculty.map(f => f.id === selectedFaculty.id ? { ...f, ...editForm } : f))
    setEditDialog(false)
  }

  function handleDeactivate(id) {
    setFaculty(faculty.map(f => f.id === id ? { ...f, status: 'Inactive' } : f))
  }

  return (
    <AdminLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            Faculty Account Management
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Manage faculty accounts, permissions, and access within your institution.
          </Typography>
        </Box>

        <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
          <CardHeader title="Faculty Members" titleTypographyProps={{ fontWeight: 700 }} />
          <CardContent>
            <TableContainer component={Paper} sx={{ boxShadow: 'none' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Courses</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {faculty.map((fac) => (
                    <TableRow key={fac.id}>
                      <TableCell>{fac.name}</TableCell>
                      <TableCell>{fac.email}</TableCell>
                      <TableCell>{fac.status}</TableCell>
                      <TableCell>{fac.courses}</TableCell>
                      <TableCell>
                        <IconButton onClick={() => handleEdit(fac)} size="small">
                          <EditIcon />
                        </IconButton>
                        <IconButton onClick={() => handleDeactivate(fac.id)} size="small" color="error">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Edit Faculty Account</DialogTitle>
          <DialogContent>
            <TextField
              label="Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              fullWidth
              margin="normal"
            />
            <TextField
              label="Status"
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              fullWidth
              margin="normal"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} variant="contained" sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}>
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </AdminLayout>
  )
}