// src/features/Faculty/Dashboard.jsx
import { useState, useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import AutoStoriesIcon from '@mui/icons-material/AutoStories'
import EmojiObjectsIcon from '@mui/icons-material/EmojiObjects'
import LayersIcon from '@mui/icons-material/Layers'
import SchoolIcon from '@mui/icons-material/School'
import ScienceIcon from '@mui/icons-material/Science'
import { useNavigate } from 'react-router-dom'
import useApi from '../../../hooks/useApi'
import { fetchMyCourseRequests } from './courseRequestApi'
import CourseRequestDialog from './CourseRequestDialog'
import { ROUTES } from '../../../config/route'
import { PageHeader, PrimaryBtn } from '../../../components/ui'
import FacultyLayout from './FacultyLayout'

const CARD_ICONS = [SchoolIcon, AutoStoriesIcon, LayersIcon, EmojiObjectsIcon, ScienceIcon]
const CARD_COLORS = ['#15803D', '#166534', '#15803D', '#16A34A', '#22C55E']

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const { data, loading, error, refetch } = useApi('/curriculum/faculty-courses/')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError, setRequestsError] = useState('')

  useEffect(() => { setErrorDismissed(false) }, [error])

  const courses = data?.courses || []
  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const decidedRequests = requests.filter((r) => r.status !== 'pending')

  const loadRequests = async () => {
    setRequestsLoading(true)
    setRequestsError('')
    try {
      setRequests(await fetchMyCourseRequests())
    } catch (err) {
      setRequestsError(err.message || 'Could not load your course requests.')
    } finally {
      setRequestsLoading(false)
    }
  }

  useEffect(() => { loadRequests() }, [])

  const handleSubmitted = (created) => {
    setDialogOpen(false)
    setNotice(
      created
        ? `Request for ${created.course_code} sent. Your admin will review it before it appears below.`
        : 'Request sent. Your admin will review it before it appears below.',
    )
    loadRequests()
    refetch?.()
  }

  const statusChip = (status) => {
    if (status === 'pending') return <Chip size="small" label="Pending review" color="warning" variant="outlined" />
    if (status === 'approved') return <Chip size="small" label="Approved" color="success" variant="outlined" />
    return <Chip size="small" label="Needs changes" color="error" variant="outlined" />
  }

  return (
    <FacultyLayout>
      <Box sx={{ maxWidth: 1400, mx: 'auto', width: '100%' }}>
        {error && !errorDismissed && (
          <Alert severity="error" onClose={() => setErrorDismissed(true)} sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        {notice && (
          <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 3 }}>
            {notice}
          </Alert>
        )}

        <PageHeader
          title="My Courses"
          subtitle="Open a course workspace for syllabi, modules, assessments, grading, and knowledge uploads."
          action={(
            <PrimaryBtn onClick={() => setDialogOpen(true)}>
              <AddIcon sx={{ fontSize: 18 }} />
              Request course
            </PrimaryBtn>
          )}
        />

        {pendingRequests.length > 0 && (
          <Box sx={{ mb: 4, border: '1px solid var(--border-color)', borderRadius: 3, p: 2.5, background: 'var(--bg-card)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>
              Waiting for admin approval ({pendingRequests.length})
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
              These stay here until your admin approves them — approved courses move to your workspace list below.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
              {pendingRequests.map((req) => (
                <Box key={req.request_id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  {statusChip(req.status)}
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{req.course_code}</Typography>
                  <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>{req.course_title}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
            <CircularProgress sx={{ color: '#15803D' }} />
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid', gap: 2.5,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' },
            }}
          >
            {courses.map((course, idx) => {
              const CourseIcon = CARD_ICONS[idx % CARD_ICONS.length]
              const accentColor = CARD_COLORS[idx % CARD_COLORS.length]
              return (
                <Card
                  key={course.course_id}
                  elevation={0}
                  sx={{
                    height: '100%',
                    color: 'var(--text-primary)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 3,
                    backdropFilter: 'blur(16px)',
                    boxShadow: 'var(--shadow-card)',
                    transition: 'transform 250ms, box-shadow 250ms, border-color 250ms',
                    '&:hover': {
                      transform: 'translateY(-3px)',
                      borderColor: 'rgba(134,239,172,0.4)',
                      boxShadow: 'var(--shadow-lg)',
                    },
                  }}
                >
                  <CardActionArea onClick={() => navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', course.course_id))} sx={{ height: '100%', borderRadius: 3, color: 'inherit' }}>
                    <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%', '&:last-child': { pb: 3 } }}>
                      <Box sx={{ mb: 2, width: 48, height: 48, borderRadius: 3, bgcolor: accentColor + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CourseIcon sx={{ fontSize: 28, color: accentColor }} />
                      </Box>
                      <Typography variant="caption" sx={{ color: '#86EFAC', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
                        {course.course_code}
                      </Typography>
                      <Typography variant="h6" sx={{ color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.3, mt: 0.5, mb: 'auto', pb: 2 }}>
                        {course.course_title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {course.syllabus_count ?? 0} syllabi · {course.assessment_count ?? 0} assessments
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              )
            })}

            {courses.length === 0 && !loading && !error && (
              <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 12 }}>
                <SchoolIcon sx={{ fontSize: 56, color: 'var(--text-tertiary)', mb: 2 }} />
                <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>No approved courses yet.</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-tertiary)', mt: 0.5 }}>Request a course above — it appears here after admin approval.</Typography>
              </Box>
            )}
          </Box>
        )}

        {(requestsLoading || requestsError || decidedRequests.length > 0) && (
          <Box sx={{ mt: 5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>My requests</Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
              Track what you sent for approval, including admin feedback on rejected requests.
            </Typography>
            {requestsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} sx={{ color: '#15803D' }} />
              </Box>
            ) : requestsError ? (
              <Alert severity="error">{requestsError}</Alert>
            ) : decidedRequests.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'var(--text-tertiary)' }}>
                No decided requests yet — approved or rejected requests will show here.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {decidedRequests.slice(0, 8).map((req) => (
                  <Box key={req.request_id} sx={{ border: '1px solid var(--border-color)', borderRadius: 2, p: 2, background: 'var(--bg-card)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      {statusChip(req.status)}
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{req.course_code}</Typography>
                      <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>{req.course_title}</Typography>
                    </Box>
                    {req.status === 'rejected' && req.admin_note && (
                      <Typography variant="body2" sx={{ mt: 1, color: 'var(--text-secondary)' }}>
                        Admin feedback: {req.admin_note}
                      </Typography>
                    )}
                    {req.status === 'approved' && req.created_course_id && (
                      <Button size="small" sx={{ mt: 1, textTransform: 'none' }} onClick={() => navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', req.created_course_id))}>
                        Open workspace
                      </Button>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}
      </Box>

      <CourseRequestDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSubmitted={handleSubmitted} />
    </FacultyLayout>
  )
}
