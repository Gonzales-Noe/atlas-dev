// Enriched faculty workspace header: back button + course identity + status.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import SchoolIcon from '@mui/icons-material/School'

export default function WorkspacePageHeader({ course, activeLabel, done, onBack, onToggleDone, actionLoading }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', minWidth: 0 }}>
      <Tooltip title="Back to courses">
        <IconButton onClick={onBack} size="small"
          sx={{ width: 38, height: 38, borderRadius: 2, color: 'rgba(255,255,255,0.8)', bgcolor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0, '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', color: '#fff' } }}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'linear-gradient(135deg, #6E1212, #AA2423)', boxShadow: '0 4px 14px rgba(170,36,35,0.35)' }}>
        <SchoolIcon sx={{ color: '#fff', fontSize: 22 }} />
      </Box>
      <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#fff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {course?.course_title || 'Course Workspace'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.3, minWidth: 0, flexWrap: 'wrap' }}>
          {course?.course_code && (
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', color: '#E24B4A' }}>{course.course_code}</Typography>
          )}
          <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>Now working on: {activeLabel}</Typography>
        </Box>
      </Box>
      <Tooltip title={done ? 'Mark this module as not yet approved' : 'Approve this generation (Step 11: Faculty Review and Approval)'}>
        <span>
          <Button onClick={onToggleDone} disabled={Boolean(actionLoading)} size="small"
            startIcon={done ? <CheckCircleIcon fontSize="small" /> : <RadioButtonUncheckedIcon fontSize="small" />}
            sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.78rem', borderRadius: 2, px: 1.75, py: 0.9, flexShrink: 0, color: done ? '#fff' : '#E24B4A', bgcolor: done ? '#AA2423' : 'rgba(170,36,35,0.12)', border: '1px solid rgba(170,36,35,0.45)', '&:hover': { bgcolor: done ? '#6E1212' : 'rgba(170,36,35,0.22)' } }}>
            {done ? 'Approved' : 'Mark as Done'}
          </Button>
        </span>
      </Tooltip>
    </Box>
  )
}
