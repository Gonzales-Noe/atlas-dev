// src/features/Faculty/Dashboard.jsx
import { useState, useEffect } from 'react'
import { StatusNotice } from '../../../components/StatusNotice'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
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
import AtlasCompanion from '../../../components/AtlasCompanion'
import FacultyLayout from './FacultyLayout'
import { useAuth } from '../../../store/authStore'

const CARD_ICONS = [SchoolIcon, AutoStoriesIcon, LayersIcon, EmojiObjectsIcon, ScienceIcon]
const CARD_COLORS = ['var(--brand-primary-hover)', 'var(--brand-red-core)', 'var(--brand-deep)', 'var(--brand-primary)', 'var(--brand-accent)']
const COURSE_LAYOUT_KEY = 'atlas_faculty_course_layout'
const DESKTOP_LAYOUT_QUERY = '(min-width: 900px)'

function readCourseLayout() {
  try {
    const value = localStorage.getItem(COURSE_LAYOUT_KEY)
    if (value === 'list' || value === 'list-2') return value
  } catch {
    // Keep the card grid when this browser cannot store a preference.
  }
  return 'cards'
}

function storeCourseLayout(layout) {
  try {
    localStorage.setItem(COURSE_LAYOUT_KEY, layout)
  } catch {
    // The choice still applies for this visit.
  }
}

export default function FacultyDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [errorDismissed, setErrorDismissed] = useState(false)
  const { data, loading, error, refetch } = useApi('/curriculum/faculty-courses/')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [requests, setRequests] = useState([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestsError, setRequestsError] = useState('')
  const [courseLayout, setCourseLayout] = useState(readCourseLayout)
  const isDesktop = useMediaQuery(DESKTOP_LAYOUT_QUERY, { noSsr: true })
  const layout = courseLayout === 'list-2' && !isDesktop ? 'list' : courseLayout

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
        <StatusNotice message={!errorDismissed ? error : ''} severity="error" />
        <StatusNotice message={notice} severity="success" />

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

        <Box sx={{ mb: 1.5 }}>
          <AtlasCompanion
            size={56}
            message={`Welcome back, ${user?.name?.split(' ')[0] || 'there'}. Open a course, or request one and I'll wait with you for approval.`}
          />
        </Box>

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
            <CircularProgress sx={{ color: '#8E1C1B' }} />
          </Box>
        ) : (
          <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={layout}
              aria-label="Course layout"
              onChange={(_, next) => {
                if (!next) return
                setCourseLayout(next)
                storeCourseLayout(next)
              }}
              sx={{
                bgcolor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 2,
                overflow: 'hidden',
                '& .MuiToggleButtonGroup-grouped': { border: 0, borderRadius: 0 },
                '& .MuiToggleButton-root': {
                  color: 'var(--text-secondary)',
                  textTransform: 'none',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  px: 1.5,
                  py: 0.75,
                  '&.Mui-selected': {
                    bgcolor: 'var(--brand-primary)',
                    color: '#fff',
                    '&:hover': { bgcolor: 'var(--brand-primary-hover)' },
                  },
                },
              }}
            >
              <ToggleButton value="cards">Cards</ToggleButton>
              <ToggleButton value="list">List</ToggleButton>
              {isDesktop && <ToggleButton value="list-2">2 columns</ToggleButton>}
            </ToggleButtonGroup>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gap: layout === 'cards' ? 2.5 : 1.25,
              gridTemplateColumns: layout === 'cards'
                ? { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }
                : layout === 'list-2'
                  ? 'repeat(2, minmax(0, 1fr))'
                  : '1fr',
            }}
          >
            {courses.map((course, idx) => {
              const CourseIcon = CARD_ICONS[idx % CARD_ICONS.length]
              const accentColor = CARD_COLORS[idx % CARD_COLORS.length]
              const isList = layout !== 'cards'
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
                      transform: isList ? 'none' : 'translateY(-3px)',
                      borderColor: 'rgba(226,75,74,0.4)',
                      boxShadow: 'var(--shadow-lg)',
                    },
                  }}
                >
                  <CardActionArea onClick={() => navigate(ROUTES.FACULTY.WORKSPACE.replace(':courseId', course.course_id))} sx={{ height: '100%', borderRadius: 3, color: 'inherit' }}>
                    <CardContent sx={{
                      p: isList ? 2 : 3,
                      display: 'flex',
                      flexDirection: isList ? 'row' : 'column',
                      alignItems: isList ? 'center' : 'stretch',
                      gap: isList ? 1.5 : 0,
                      height: '100%',
                      '&:last-child': { pb: isList ? 2 : 3 },
                    }}>
                      <Box sx={{
                        mb: isList ? 0 : 2,
                        width: isList ? 40 : 48,
                        height: isList ? 40 : 48,
                        flexShrink: 0,
                        borderRadius: isList ? 2 : 3,
                        bgcolor: accentColor + '30',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <CourseIcon sx={{ fontSize: isList ? 22 : 28, color: accentColor }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="caption" sx={{ color: '#E24B4A', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem' }}>
                          {course.course_code}
                        </Typography>
                        <Typography variant={isList ? 'body1' : 'h6'} sx={{ color: 'var(--text-primary)', fontWeight: 700, lineHeight: 1.3, mt: 0.25, mb: isList ? 0 : 'auto', pb: isList ? 0 : 2 }}>
                          {course.course_title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 500, display: isList ? 'block' : 'inline' }}>
                          {course.syllabus_count ?? 0} syllabi · {course.assessment_count ?? 0} assessments
                        </Typography>
                      </Box>
                    </CardContent>
                  </CardActionArea>
                </Card>
              )
            })}

            {courses.length === 0 && !loading && !error && (
              <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 6 }}>
                <Typography variant="body1" sx={{ color: 'var(--text-secondary)' }}>No approved courses yet.</Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-tertiary)', mt: 0.5 }}>Request a course above — it appears here after admin approval.</Typography>
              </Box>
            )}
          </Box>
          </>
        )}

        {(requestsLoading || requestsError || decidedRequests.length > 0) && (
          <Box sx={{ mt: 5 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>My requests</Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
              Track what you sent for approval, including admin feedback on rejected requests.
            </Typography>
            {requestsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} sx={{ color: '#8E1C1B' }} />
              </Box>
            ) : requestsError ? (
              <StatusNotice message={requestsError} severity="error" />
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
