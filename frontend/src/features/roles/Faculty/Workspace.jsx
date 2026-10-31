import { useNavigate, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import { StatusNotice } from '../../../components/StatusNotice'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import DescriptionIcon from '@mui/icons-material/Description'
import AssessmentIcon from '@mui/icons-material/Assessment'
import BarChartIcon from '@mui/icons-material/BarChart'
import useApi from '../../../hooks/useApi'
import FacultyLayout from './FacultyLayout'
import { ROUTES } from '../../../config/route'

export default function FacultyWorkspace() {
  const navigate = useNavigate()
  const { courseId } = useParams()
  const { data, loading, error } = useApi(`/curriculum/faculty-course-workspace/${courseId}/`)

  const course = data?.course
  const syllabusCount = data?.syllabi?.length ?? 0
  const moduleCount = data?.modules?.length ?? 0
  const assessmentCount = data?.assessments?.length ?? 0

  return (
    <FacultyLayout>
      <Box sx={{ px: { xs: 2, md: 5 }, py: 4, maxWidth: 1400, mx: 'auto', width: '100%' }}>
        <Button
          variant="text"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(ROUTES.FACULTY.DASHBOARD)}
          sx={{ mb: 3, color: 'var(--text-primary)', textTransform: 'none', '&:hover': { background: 'var(--border-color)' } }}
        >
          Back to courses
        </Button>

        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 12 }}>
            <CircularProgress sx={{ color: '#8E1C1B' }} />
          </Box>
        ) : error ? (
          <StatusNotice message={error} severity="error" />
        ) : !course ? (
          <Alert severity="warning">Course workspace not found.</Alert>
        ) : (
          <Box sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ background: 'var(--bg-card)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderRadius: 4, border: '1px solid var(--border-color)', p: { xs: 3, md: 4 }, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
                {course.course_title}
              </Typography>
              <Typography variant="subtitle2" sx={{ color: '#8E1C1B', mb: 2, fontWeight: 700, letterSpacing: '0.05em' }}>
                {course.course_code}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 760, lineHeight: 1.6 }}>
                {course.description || 'No course description available.'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                <Button
                  size="small"
                  variant="contained"
                  sx={{ background: '#8E1C1B', '&:hover': { background: '#6E1212' }, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                  onClick={() => navigate(ROUTES.FACULTY.SYLLABUS)}
                >
                  Open syllabus builder
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)', textTransform: 'none', borderRadius: 2, '&:hover': { borderColor: 'var(--text-primary)', background: 'var(--shell-btn-bg)' } }}
                  onClick={() => navigate(ROUTES.FACULTY.MODULE)}
                >
                  Go to module builder
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 3 }}>
              <Card sx={{ borderRadius: 4, p: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(142, 28, 27, 0.08)' }}>
                      <FolderOpenIcon sx={{ color: '#8E1C1B', fontSize: 28 }} />
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Workspace Summary
                    </Typography>
                  </Box>
                  <Typography color="text.secondary" sx={{ mb: 1, fontSize: '0.85rem' }}>Syllabi</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 800 }}>{syllabusCount}</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 4, p: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(142, 28, 27, 0.08)' }}>
                      <DescriptionIcon sx={{ color: '#8E1C1B', fontSize: 28 }} />
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Modules
                    </Typography>
                  </Box>
                  <Typography color="text.secondary" sx={{ mb: 1, fontSize: '0.85rem' }}>Modules loaded</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 800 }}>{moduleCount}</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 4, p: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(142, 28, 27, 0.08)' }}>
                      <AssessmentIcon sx={{ color: '#8E1C1B', fontSize: 28 }} />
                    </Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Assessments
                    </Typography>
                  </Box>
                  <Typography color="text.secondary" sx={{ mb: 1, fontSize: '0.85rem' }}>Assessments available</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 800 }}>{assessmentCount}</Typography>
                </CardContent>
              </Card>
            </Box>

            <Card sx={{ borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Course Workspace
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<BarChartIcon />}
                    sx={{ background: 'var(--brand-primary)', color: '#fff', '&:hover': { background: 'var(--brand-primary-hover)' }, textTransform: 'none', borderRadius: 2, boxShadow: 'none' }}
                    onClick={() => navigate(ROUTES.FACULTY.ANALYTICS)}
                  >
                    Open analytics
                  </Button>
                </Box>
                <Typography color="text.secondary" sx={{ mt: 2, fontSize: '0.9rem' }}>
                  This page loads the faculty workspace details for the selected course and keeps it inside the faculty dashboard flow.
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    </FacultyLayout>
  )
}
