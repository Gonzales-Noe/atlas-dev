// Part 1: imports + pipeline steps
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import AssignmentIcon from '@mui/icons-material/Assignment'
import GradeIcon from '@mui/icons-material/Grade'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import TableChartIcon from '@mui/icons-material/TableChart'
import LockIcon from '@mui/icons-material/Lock'
export const PIPELINE_STEPS = [
  { key: 'syllabus', label: 'Syllabus', Icon: MenuBookIcon },
  { key: 'module', label: 'Modules', Icon: ViewModuleIcon },
  { key: 'tos', label: 'TOS', Icon: TableChartIcon },
  { key: 'assessment', label: 'Assessments', Icon: AssignmentIcon },
  { key: 'grading', label: 'Grading', Icon: GradeIcon },
  { key: 'analytics', label: 'Analytics', Icon: AnalyticsIcon },
]

function Connector({ filled }) {
  return (
    <Box sx={{ flex: 1, minWidth: 10, height: 3, borderRadius: 99, mx: 0.25, bgcolor: 'var(--workspace-border)', overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: 0, background: filled ? 'var(--brand-primary)' : 'transparent' }} />
    </Box>
  )
}
function StepNode({ step, index, active, done, locked, onSelect, compact }) {
  const StepIcon = step.Icon
  const tip = step.key + ' module'
  return (
    <Tooltip title={tip} arrow>
      <Box role="button" tabIndex={0} onClick={onSelect} data-tour={`pipeline-step-${step.key}`}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.1, cursor: 'pointer', px: 1.5, py: 0.9, borderRadius: 2, bgcolor: active ? 'rgba(170,36,35,0.16)' : 'transparent' }}>
        <Box sx={{ position: 'relative', display: 'flex' }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: done ? 'var(--brand-primary)' : 'var(--workspace-border)', color: done ? '#fff' : 'var(--workspace-muted)' }}>
            <StepIcon sx={{ fontSize: 19 }} />
          </Box>
          <Box sx={{ position: 'absolute', right: -5, bottom: -4, bgcolor: 'var(--workspace-bg)', borderRadius: '50%', display: 'flex' }}>
            {done ? <CheckCircleIcon sx={{ fontSize: 18, color: '#4ADE80' }} /> : locked ? <LockIcon sx={{ fontSize: 15, color: '#666' }} /> : <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: '#555' }} />}
          </Box>
        </Box>
        {!compact && (
          <Box sx={{ textAlign: 'left' }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--workspace-muted)' }}>STEP {index + 1}</Typography>
            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--workspace-text)' }}>{step.label}</Typography>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: done ? '#4ADE80' : '#666' }}>{done ? 'Done' : 'Not started'}</Typography>
          </Box>
        )}
      </Box>
    </Tooltip>
  )
}
export default function WorkspacePipelineStepper({ activeTab, isStepDone, onSelect, doneCount, totalSteps }) {
  const compact = useMediaQuery('(max-width: 900px)')
  const done = doneCount || 0
  const total = totalSteps || PIPELINE_STEPS.length
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <Box sx={{ width: '100%' }} data-tour="pipeline">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {PIPELINE_STEPS.map((step, i) => {
          const stepDone = Boolean(isStepDone && isStepDone(step.key))
          const active = activeTab === step.key
          return (
            <Box key={step.key} sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <StepNode step={step} index={i} active={active} done={stepDone} locked={false} compact={compact} onSelect={() => onSelect && onSelect(step.key)} />
              {i < PIPELINE_STEPS.length - 1 && <Connector filled={stepDone} />}
            </Box>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 1 }}>
        <Box sx={{ flex: 1, height: 6, borderRadius: 99, bgcolor: 'var(--workspace-hover)', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', width: pct + '%', background: 'var(--brand-primary)' }} />
        </Box>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--workspace-muted)' }}>{done}/{total} complete</Typography>
      </Box>
    </Box>
  )
}
