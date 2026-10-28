import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import Stepper from '@mui/material/Stepper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { COURSE_CATEGORIES, submitCourseRequest } from './courseRequestApi'

const FIELD_SX = {
  '& .MuiInputLabel-root': { color: 'var(--text-secondary)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#86EFAC' },
  '& .MuiOutlinedInput-root': {
    color: 'var(--text-primary)',
    '& fieldset': { borderColor: 'var(--border-color)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.24)' },
    '&.Mui-focused fieldset': { borderColor: '#16A34A' },
    '&.Mui-error fieldset': { borderColor: 'var(--red-status)' },
  },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
  '& .MuiFormHelperText-root': { color: 'var(--text-secondary)', fontSize: '0.68rem', margin: '4px 0 0' },
  '& .MuiFormHelperText-root.Mui-error': { color: 'var(--red-status)' },
}
const EMPTY_FORM = { course_code: '', course_title: '', description: '', category: 'professional', units: '', justification: '' }
const STEPS = ['Course basics', 'Details', 'Review & submit']
function formatCategory(value) {
  return COURSE_CATEGORIES.find((c) => c.value === value)?.label || value
}


export default function CourseRequestDialog({ open, onClose, onSubmitted }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const reset = () => { setStep(0); setForm(EMPTY_FORM); setFieldErrors({}); setSubmitError('') }
  const handleClose = () => { if (submitting) return; reset(); onClose?.() }
  const set = (name) => (e) => {
    const value = name === 'course_code' ? e.target.value.toUpperCase() : e.target.value
    setForm((f) => ({ ...f, [name]: value }))
    setFieldErrors((prev) => ({ ...prev, [name]: '' }))
  }
  const validateStep = (target = step) => {
    const errors = {}
    if (target === 0) {
      if (!form.course_code.trim()) errors.course_code = 'Course code is required (e.g. BA401).'
      if (!form.course_title.trim()) errors.course_title = 'Course title is required.'
    }
    if (target === 1 && form.units !== '' && Number.isNaN(Number(form.units))) errors.units = 'Units must be a number.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }
  const next = () => { if (!validateStep()) return; setSubmitError(''); setStep((s) => Math.min(s + 1, 2)) }
  const back = () => { setSubmitError(''); setStep((s) => Math.max(s - 1, 0)) }
  const submit = async () => {
    if (!validateStep(0) || !validateStep(1)) { setStep(0); return }
    setSubmitting(true); setSubmitError('')
    try {
      const payload = {
        course_code: form.course_code.trim().toUpperCase(),
        course_title: form.course_title.trim(),
        description: form.description.trim(),
        category: form.category,
        units: form.units === '' ? null : Number(form.units),
        justification: form.justification.trim(),
      }
      const json = await submitCourseRequest(payload)
      onSubmitted?.(json?.request); reset()
    } catch (err) {
      setSubmitError(err.response?.data?.detail || 'Could not send your request. Please try again.')
    } finally { setSubmitting(false) }
  }


  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { backgroundColor: 'var(--bg-card)', backgroundImage: 'none', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800 }}>
        Request a new course
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', fontWeight: 400, mt: 0.5 }}>
          Your admin reviews every request before it appears in your workspace.
        </Typography>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.2, pt: '4px !important' }}>
        <Stepper activeStep={step} alternativeLabel sx={{
          pt: 1,
          // MUI defaults to its light theme (no ThemeProvider in this app), so every
          // color here must be pinned to app tokens or it renders black on the dark dialog.
          '& .MuiStepLabel-label': { color: 'var(--text-secondary)', fontSize: '0.72rem' },
          '& .MuiStepLabel-label.Mui-active, & .MuiStepLabel-label.Mui-completed': { color: 'var(--text-primary)', fontWeight: 700 },
          '& .MuiStepIcon-root': { color: 'var(--text-tertiary)' },
          '& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed': { color: '#15803D' },
          '& .MuiStepIcon-text': { fill: 'var(--text-primary)' },
          '& .MuiStepIcon-root.Mui-active .MuiStepIcon-text': { fill: '#fff' },
          '& .MuiStepConnector-line': { borderColor: 'var(--border-color)' },
        }}>
          {STEPS.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
        </Stepper>
        {submitError && <Alert severity="error">{submitError}</Alert>}
        {step === 0 && (
          <>
            <Alert severity="info" sx={{ fontSize: '0.82rem' }}>Requests usually take 1-2 working days. You can keep working on approved courses meanwhile.</Alert>
            <TextField label="Course code" value={form.course_code} onChange={set('course_code')} placeholder="e.g. BA401" size="small" autoFocus disabled={submitting} error={Boolean(fieldErrors.course_code)} helperText={fieldErrors.course_code || 'Short unique code used across syllabus, modules, grading.'} inputProps={{ maxLength: 20 }} sx={FIELD_SX} />
            <TextField label="Course title" value={form.course_title} onChange={set('course_title')} placeholder="e.g. Business Analytics" size="small" disabled={submitting} error={Boolean(fieldErrors.course_title)} helperText={fieldErrors.course_title || 'Full official title for this course.'} inputProps={{ maxLength: 255 }} sx={FIELD_SX} />
          </>
        )}
        {step === 1 && (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 140px' }, gap: 2 }}>
              <TextField select label="Category" value={form.category} onChange={set('category')} size="small" disabled={submitting} sx={FIELD_SX}
                MenuProps={{ PaperProps: { sx: { backgroundColor: 'var(--bg-surface)', backgroundImage: 'none', color: 'var(--text-primary)', border: '1px solid var(--border-color)' } } }}>
                {COURSE_CATEGORIES.map((c) => (
                  <MenuItem key={c.value} value={c.value} sx={{ color: 'inherit', '&:hover': { backgroundColor: 'var(--bg-card-hover)' }, '&.Mui-selected': { backgroundColor: 'var(--active-bg)', color: 'var(--active-color)' } }}>{c.label}</MenuItem>
                ))}
              </TextField>
              <TextField label="Units" type="number" value={form.units} onChange={set('units')} placeholder="3" size="small" disabled={submitting} error={Boolean(fieldErrors.units)} helperText={fieldErrors.units || 'Optional'} inputProps={{ min: 0, max: 30, step: 0.5 }} sx={FIELD_SX} />
            </Box>
            <TextField label="Course description" value={form.description} onChange={set('description')} placeholder="What this course covers." size="small" multiline rows={3} disabled={submitting} sx={FIELD_SX} />
            <TextField label="Why do you need this course?" value={form.justification} onChange={set('justification')} placeholder="e.g. Required for 2nd-year BSBA next term." size="small" multiline rows={2} disabled={submitting} sx={FIELD_SX} />
          </>
        )}
        {step === 2 && (
          <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 2, p: 2.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{form.course_code.trim().toUpperCase() || '—'} — {form.course_title.trim() || '—'}</Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 0.5 }}>{formatCategory(form.category)}{form.units !== '' ? ` · ${form.units} units` : ''}</Typography>
            {form.description.trim() && <Typography variant="body2" sx={{ mt: 1 }}>{form.description.trim()}</Typography>}
            <Alert severity="warning" sx={{ mt: 2, fontSize: '0.82rem' }}>This sends the request to your admin. It appears in your workspace only after approval.</Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3, borderTop: '1px solid var(--border-color)', justifyContent: 'space-between' }}>
        <Button onClick={handleClose} disabled={submitting} sx={{ textTransform: 'none', color: 'var(--text-secondary)', '&:hover': { backgroundColor: 'var(--bg-card-hover)', color: 'var(--text-primary)' } }}>Cancel</Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {step > 0 && <Button onClick={back} disabled={submitting} sx={{ textTransform: 'none', color: 'var(--text-secondary)', '&:hover': { backgroundColor: 'var(--bg-card-hover)', color: 'var(--text-primary)' } }}>Back</Button>}
          {step < 2 ? (
            <Button variant="contained" onClick={next} sx={{ background: '#15803D', textTransform: 'none', fontWeight: 700 }}>Continue</Button>
          ) : (
            <Button variant="contained" onClick={submit} disabled={submitting} startIcon={submitting ? <CircularProgress size={14} color="inherit" /> : null} sx={{ background: '#15803D', textTransform: 'none', fontWeight: 700 }}>
              {submitting ? 'Sending…' : 'Send for approval'}
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  )
}
