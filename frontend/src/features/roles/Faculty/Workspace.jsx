import { useNavigate, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
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
      <Box sx={{ minHeight: '100vh', bgcolor: '#F7F9FC', px: { xs: 2, md: 5 }, py: 4, maxWidth: 1400, mx: 'auto', width: '100%' }}>
        <Button
          variant="text"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(ROUTES.FACULTY.DASHBOARD)}
          sx={{ mb: 3, color: '#1F2937', textTransform: 'none' }}
        >
          Back to courses
        </Button>

        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 12 }}>
            <CircularProgress sx={{ color: '#8B0000' }} />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : !course ? (
          <Alert severity="warning">Course workspace not found.</Alert>
        ) : (
          <Box sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: { xs: 3, md: 4 }, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' }}>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#111827', mb: 1 }}>
                {course.course_title}
              </Typography>
              <Typography variant="subtitle2" sx={{ color: '#6B7280', mb: 2 }}>
                {course.course_code}
              </Typography>
              <Typography variant="body1" sx={{ color: '#374151', mb: 3, maxWidth: 760 }}>
                {course.description || 'No course description available.'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                <Button
                  size="small"
                  variant="contained"
                  sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' }, textTransform: 'none' }}
                  onClick={() => navigate(ROUTES.FACULTY.SYLLABUS)}
                >
                  Open syllabus builder
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ color: '#1F2937', borderColor: '#D1D5DB', textTransform: 'none' }}
                  onClick={() => navigate(ROUTES.FACULTY.MODULE)}
                >
                  Go to module builder
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 3 }}>
              <Card sx={{ borderRadius: 3, p: 3, bgcolor: '#fff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <FolderOpenIcon sx={{ color: '#8B0000', fontSize: 28 }} />
                    <Typography variant="subtitle2" sx={{ color: '#111827', fontWeight: 700 }}>
                      Workspace Summary
                    </Typography>
                  </Box>
                  <Typography sx={{ color: '#374151', mb: 1 }}>Syllabi</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>{syllabusCount}</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 3, p: 3, bgcolor: '#fff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <DescriptionIcon sx={{ color: '#1565C0', fontSize: 28 }} />
                    <Typography variant="subtitle2" sx={{ color: '#111827', fontWeight: 700 }}>
                      Modules
                    </Typography>
                  </Box>
                  <Typography sx={{ color: '#374151', mb: 1 }}>Modules loaded</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>{moduleCount}</Typography>
                </CardContent>
              </Card>
              <Card sx={{ borderRadius: 3, p: 3, bgcolor: '#fff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <AssessmentIcon sx={{ color: '#2E7D32', fontSize: 28 }} />
                    <Typography variant="subtitle2" sx={{ color: '#111827', fontWeight: 700 }}>
                      Assessments
                    </Typography>
                  </Box>
                  <Typography sx={{ color: '#374151', mb: 1 }}>Assessments available</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 800, color: '#111827' }}>{assessmentCount}</Typography>
                </CardContent>
              </Card>
            </Box>

            <Card sx={{ borderRadius: 3, p: 0, bgcolor: '#fff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>
                    Course Workspace
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<BarChartIcon />}
                    sx={{ background: '#1F2937', '&:hover': { background: '#111827' }, textTransform: 'none' }}
                    onClick={() => navigate(ROUTES.FACULTY.ANALYTICS)}
                  >
                    Open analytics
                  </Button>
                </Box>
                <Typography sx={{ color: '#4B5563', mt: 2 }}>
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
