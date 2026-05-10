// src/features/Faculty/Syllabus.jsx
import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, CardHeader, Grid, Stack, TextField, Typography, Alert, Divider,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import FacultyLayout from './FacultyLayout'

function loadCourse() {
  try { return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null } 
  catch { return null }
}

export default function FacultySyllabus() {
  const [course, setCourse] = useState(loadCourse())
  const [iloPrompt, setIloPrompt] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [syllabusCreated, setSyllabusCreated] = useState(localStorage.getItem('atlas_faculty_syllabus_created') === 'true')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => { setCourse(loadCourse()) }, [])

  const actionEnabled = Boolean(course && course.courseName)
  const statusMessage = syllabusCreated
    ? 'Your syllabus is ready. Modules and assessments are now unlocked.'
    : 'Use the form below to upload a syllabus or generate one using ILO prompts.'

  function handleUpload() {
    setUploadMessage('Syllabus document uploaded successfully.')
    setSyllabusCreated(true)
    setSuccessMessage('Syllabus created successfully. You can now proceed to modules and assessments.')
    localStorage.setItem('atlas_faculty_syllabus_created', 'true')
  }

  function handleGenerate() {
    if (!iloPrompt.trim()) {
      setUploadMessage('Enter your ILOs or syllabus prompt to generate the syllabus.')
      return
    }
    setSyllabusCreated(true)
    localStorage.setItem('atlas_faculty_syllabus_created', 'true')
    setSuccessMessage('Syllabus generated from your prompt. Modules and assessments are unlocked.')
    setUploadMessage('')
  }

  const cardStyles = { borderRadius: 3, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' };

  return (
    <FacultyLayout>
      <Box>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
            Syllabus Creation
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
            {statusMessage}
          </Typography>
        </Box>

        {!actionEnabled && (
          <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
            Please add a course from the dashboard before creating a syllabus.
          </Alert>
        )}

        {successMessage && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>
            {successMessage}
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Upload Existing Syllabus" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent>
                <Typography sx={{ color: '#475569', mb: 3 }}>
                  Upload a completed syllabus file to import your course structure quickly.
                </Typography>
                <Button variant="contained" startIcon={<CloudUploadIcon />} disabled={!actionEnabled} onClick={handleUpload} sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2, textTransform: 'none', py: 1.5, px: 3 }}>
                  Upload File
                </Button>
                {uploadMessage && <Typography sx={{ mt: 2, color: '#166534', fontWeight: 600 }}>{uploadMessage}</Typography>}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Generate from ILOs" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
              <CardContent>
                <Typography sx={{ color: '#475569', mb: 2 }}>
                  Type your intended learning outcomes or a prompt and ATLAS will propose a syllabus structure.
                </Typography>
                <Stack spacing={2}>
                  <TextField value={iloPrompt} onChange={(e) => setIloPrompt(e.target.value)} multiline rows={6} placeholder="Enter ILOs, course outcomes, and desired topics..." fullWidth size="small" />
                  <Button variant="contained" startIcon={<AutoAwesomeIcon />} disabled={!actionEnabled} onClick={handleGenerate} sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: 2, textTransform: 'none', py: 1.5 }}>
                    Generate Syllabus
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4, borderColor: '#E2E8F0' }} />

        <Card sx={{ ...cardStyles, backgroundColor: '#F1F5F9', boxShadow: 'none' }}>
          <CardHeader title="Syllabus Requirements" titleTypographyProps={{ fontWeight: 700, color: '#0F172A' }} />
          <CardContent>
            <Typography sx={{ color: '#475569', mb: 1 }}>
              Your syllabus should include:
            </Typography>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#475569' }}>
              <li style={{ paddingBottom: '4px' }}>Course goals and intended learning outcomes</li>
              <li style={{ paddingBottom: '4px' }}>Weekly topics and assessment alignment</li>
              <li style={{ paddingBottom: '4px' }}>Grading scheme and attendance policy</li>
              <li>Reference materials and learning resources</li>
            </ul>
          </CardContent>
        </Card>
      </Box>
    </FacultyLayout>
  )
}