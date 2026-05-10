// src/features/Faculty/Dashboard.jsx
import { useEffect, useState } from 'react'
import {
  Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Stack, TextField, Typography, IconButton, InputBase, Menu, MenuItem, Alert
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import SchoolIcon from '@mui/icons-material/School'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted'
import FacultyLayout from './FacultyLayout'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../config/route'

const defaultCourse = {
  instructorName: '',
  courseName: '',
  courseCode: '',
  yearLevel: '',
  semester: '',
  section: '',
}

function loadCourses() {
  try {
    const courses = JSON.parse(localStorage.getItem('atlas_faculty_courses'))
    if (courses && Array.isArray(courses)) return courses;
    
    // Fallback migration
    const singleCourse = JSON.parse(localStorage.getItem('atlas_faculty_course'))
    if (singleCourse && singleCourse.courseName) {
      const arr = [{ ...singleCourse, id: Date.now() }];
      localStorage.setItem('atlas_faculty_courses', JSON.stringify(arr));
      return arr;
    }
    return [];
  } catch {
    return [];
  }
}

function saveCourses(courses) {
  localStorage.setItem('atlas_faculty_courses', JSON.stringify(courses))
}

function setActiveCourse(course) {
  localStorage.setItem('atlas_faculty_course', JSON.stringify(course))
}

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [formState, setFormState] = useState(defaultCourse)
  const [anchorEl, setAnchorEl] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    setCourses(loadCourses())
  }, [])

  function handleCreateCourse() {
    if (!formState.courseName) return;
    
    const newCourse = { ...formState, id: Date.now(), createdAt: new Date().toLocaleDateString() };
    const updatedCourses = [newCourse, ...courses];
    
    saveCourses(updatedCourses);
    setCourses(updatedCourses);
    setActiveCourse(newCourse); 
    
    setFormState(defaultCourse);
    setOnboardingOpen(false);
    setSuccessMsg(`Created ${newCourse.courseName}!`);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  function handleEnterCourse(course) {
    setActiveCourse(course);
    navigate(ROUTES.FACULTY.SYLLABUS);
  }

  const handleMenuClick = (event, id) => {
    event.stopPropagation(); 
    setAnchorEl(event.currentTarget);
    setSelectedCourseId(id);
  }

  const handleMenuClose = (event) => {
    if(event) event.stopPropagation();
    setAnchorEl(null);
    setSelectedCourseId(null);
  }

  return (
    <FacultyLayout>
      <Box>
        {successMsg && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: '12px' }}>{successMsg}</Alert>
        )}

        {/* Top Toolbar (Toggle Removed) */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 5, flexWrap: 'wrap', gap: 2 }}>
          
          {/* iOS Style Search Bar (Now on the left) */}
          <Box sx={{ display: 'flex', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: '24px', px: 2, py: 0.8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', minWidth: 300 }}>
            <SearchIcon sx={{ color: '#94A3B8', mr: 1 }} fontSize="small" />
            <InputBase placeholder="Search your courses..." sx={{ flex: 1, fontSize: '0.95rem', color: '#1E293B' }} />
          </Box>

          {/* View Toggles (On the right) */}
          <Box sx={{ display: 'flex', backgroundColor: '#FFFFFF', borderRadius: '16px', p: 0.5, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <IconButton size="small" sx={{ color: '#8B0000', backgroundColor: '#FFF1F2', borderRadius: '12px' }}>
              <ViewModuleIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" sx={{ color: '#94A3B8', borderRadius: '12px' }}>
              <FormatListBulletedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0F172A', mb: 3 }}>
          Recent courses
        </Typography>

        {/* Course Grid */}
        <Grid container spacing={3}>
          
          {/* Create New Course Card */}
          <Grid item xs={12} sm={6} md={4} lg={3}>
            <Card 
              onClick={() => setOnboardingOpen(true)}
              sx={{ 
                borderRadius: '24px', 
                border: '2px dashed #CBD5E1', 
                backgroundColor: 'transparent', 
                boxShadow: 'none', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                minHeight: 240, 
                cursor: 'pointer', 
                transition: 'all 0.2s ease', 
                '&:hover': { backgroundColor: 'rgba(203, 213, 225, 0.2)', borderColor: '#94A3B8' } 
              }}
            >
              <Box sx={{ width: 56, height: 56, borderRadius: '50%', backgroundColor: '#8B0000', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, boxShadow: '0 4px 12px rgba(139,0,0,0.3)' }}>
                <AddIcon fontSize="medium" />
              </Box>
              <Typography sx={{ fontWeight: 700, color: '#475569', fontSize: '1.05rem' }}>
                Create new course
              </Typography>
            </Card>
          </Grid>

          {/* Render Saved Courses */}
          {courses.map((course) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={course.id}>
              <Card 
                onClick={() => handleEnterCourse(course)}
                sx={{ 
                  borderRadius: '24px', 
                  backgroundColor: '#FFFFFF', 
                  boxShadow: '0 8px 32px rgba(0,0,0,0.06)', 
                  minHeight: 240, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  p: 3, 
                  cursor: 'pointer', 
                  position: 'relative',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease', 
                  '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 12px 48px rgba(0,0,0,0.1)' } 
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 'auto' }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '16px', backgroundColor: '#FFF1F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SchoolIcon sx={{ color: '#8B0000' }} />
                  </Box>
                  <IconButton size="small" sx={{ color: '#94A3B8' }} onClick={(e) => handleMenuClick(e, course.id)}>
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
                
                <Box>
                  <Typography sx={{ fontWeight: 800, color: '#0F172A', mb: 0.5, fontSize: '1.15rem', lineHeight: 1.3 }}>
                    {course.courseName}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
                    {course.createdAt || 'Just now'} • {course.courseCode || 'No code'}
                  </Typography>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Action Menu */}
        <Menu 
          anchorEl={anchorEl} 
          open={Boolean(anchorEl)} 
          onClose={handleMenuClose}
          PaperProps={{ sx: { borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', mt: 1, minWidth: 150 } }}
        >
          <MenuItem onClick={handleMenuClose} sx={{ fontWeight: 500, fontSize: '0.9rem', color: '#1E293B' }}>Edit details</MenuItem>
          <MenuItem onClick={handleMenuClose} sx={{ fontWeight: 500, fontSize: '0.9rem', color: '#1E293B' }}>Duplicate</MenuItem>
          <MenuItem onClick={handleMenuClose} sx={{ fontWeight: 500, fontSize: '0.9rem', color: '#C62828' }}>Delete course</MenuItem>
        </Menu>

        {/* Create Course Dialog */}
        <Dialog open={onboardingOpen} onClose={() => setOnboardingOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '24px', p: 1 } }}>
          <DialogTitle sx={{ fontWeight: 800, fontSize: '1.4rem', color: '#0F172A' }}>Create New Course</DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 3, color: '#64748B', fontSize: '0.95rem' }}>
              Set up the foundation for your new course environment.
            </Typography>
            <Stack spacing={2.5}>
              <TextField label="Instructor Name" value={formState.instructorName} onChange={(e) => setFormState({ ...formState, instructorName: e.target.value })} fullWidth size="small" InputProps={{ sx: { borderRadius: '12px' } }} />
              <TextField label="Course Name" value={formState.courseName} onChange={(e) => setFormState({ ...formState, courseName: e.target.value })} fullWidth size="small" InputProps={{ sx: { borderRadius: '12px' } }} required />
              <TextField label="Course Code" value={formState.courseCode} onChange={(e) => setFormState({ ...formState, courseCode: e.target.value })} fullWidth size="small" InputProps={{ sx: { borderRadius: '12px' } }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField label="Year Level" value={formState.yearLevel} onChange={(e) => setFormState({ ...formState, yearLevel: e.target.value })} fullWidth size="small" InputProps={{ sx: { borderRadius: '12px' } }} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Semester" value={formState.semester} onChange={(e) => setFormState({ ...formState, semester: e.target.value })} fullWidth size="small" InputProps={{ sx: { borderRadius: '12px' } }} />
                </Grid>
              </Grid>
              <TextField label="Section" value={formState.section} onChange={(e) => setFormState({ ...formState, section: e.target.value })} fullWidth size="small" InputProps={{ sx: { borderRadius: '12px' } }} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setOnboardingOpen(false)} sx={{ color: '#64748B', fontWeight: 600, textTransform: 'none' }}>Cancel</Button>
            <Button variant="contained" sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, borderRadius: '12px', textTransform: 'none', px: 3, fontWeight: 700 }} onClick={handleCreateCourse}>
              Create Course
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </FacultyLayout>
  )
}