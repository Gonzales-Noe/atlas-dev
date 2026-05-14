// src/features/Faculty/Syllabus.jsx
import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, CardHeader, Grid, Stack, TextField, Typography, Alert, Divider, Tabs, Tab,
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
  const [activeSection, setActiveSection] = useState(0)
  const [aiMessage, setAiMessage] = useState('')

  const sectionSteps = [
    { label: 'Course Overview', helper: 'Describe the course purpose, objectives, and delivery plan.' },
    { label: 'Learning Outcomes', helper: 'List measurable outcomes students should achieve by the end of the course.' },
    { label: 'Weekly Plan', helper: 'Outline weekly topics, activities, and milestones for the term.' },
    { label: 'Assessment Plan', helper: 'Define assessment types, weights, and grading criteria aligned to outcomes.' },
    { label: 'Resources', helper: 'Add textbooks, readings, tools, and support materials for learners.' },
  ]

  const [sectionDrafts, setSectionDrafts] = useState(() => {
    const saved = JSON.parse(localStorage.getItem('atlas_faculty_syllabus_sections') || 'null')
    return saved || sectionSteps.reduce((acc, step) => ({ ...acc, [step.label]: '' }), {})
  })

  useEffect(() => {
    setCourse(loadCourse())
  }, [])

  useEffect(() => {
    localStorage.setItem('atlas_faculty_syllabus_sections', JSON.stringify(sectionDrafts))
  }, [sectionDrafts])

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

  function handleSectionChange(value) {
    const sectionLabel = sectionSteps[activeSection].label
    setSectionDrafts((prev) => ({ ...prev, [sectionLabel]: value }))
  }

  function handleAiAssist() {
    if (!course?.courseName) {
      setAiMessage('Select or add a course on the dashboard first.')
      return
    }

    const sectionLabel = sectionSteps[activeSection].label
    const generatedText = `Suggested ${sectionLabel.toLowerCase()} for ${course.courseName}: \n` +
      (sectionLabel === 'Course Overview'
        ? `This course introduces ${course.courseName} with a focus on ${course.courseCode || 'core competencies'} and student success through active learning.`
        : sectionLabel === 'Learning Outcomes'
          ? 'By the end of this course, students will be able to: 1) Explain the core concepts, 2) Apply modeling techniques, 3) Evaluate outcomes, 4) Collaborate in project-based tasks.'
          : sectionLabel === 'Weekly Plan'
            ? 'Week 1: Course introduction and orientation. Week 2: Topic A with reading. Week 3: Topic B lab session. Week 4: Midterm review and assessment.'
            : sectionLabel === 'Assessment Plan'
              ? 'Assignments 30%, Midterm 30%, Final 30%, Participation 10%. Assessments align with outcomes and active learning goals.'
              : 'Primary resources include the course textbook, selected readings, online tutorials, and instructor-curated materials.')

    setSectionDrafts((prev) => ({ ...prev, [sectionLabel]: prev[sectionLabel] || generatedText }))
    setAiMessage(`AI assistance inserted a draft for ${sectionLabel}. Review and refine it as needed.`)
  }

  function handleSectionSave() {
    setSuccessMessage('Section content saved locally. Keep working through the guided syllabus steps.')
    setUploadMessage('')
    setAiMessage('')
  }

  function handleCompleteSyllabus() {
    setSyllabusCreated(true)
    localStorage.setItem('atlas_faculty_syllabus_created', 'true')
    setSuccessMessage('Full syllabus completed. Modules and assessments are unlocked.')
    setUploadMessage('')
    setAiMessage('')
  }

  function handleDownloadSyllabus() {
    const content = sectionSteps.map((step) => {
      const sectionText = sectionDrafts[step.label]?.trim() || 'No content provided yet.'
      return `${step.label}\n${sectionText}\n\n`
    }).join('')

    const fileName = `${course?.courseCode || 'syllabus'}-${course?.courseName?.replace(/\s+/g, '_') || 'course'}-syllabus.txt`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  const cardStyles = { borderRadius: 4 };

  return (
    <FacultyLayout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
            Syllabus Creation
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.95rem' }}>
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
              <CardHeader title="Syllabus Builder" titleTypographyProps={{ fontWeight: 700 }} />
              <CardContent>
                <Tabs value={activeSection} onChange={(event, value) => { setActiveSection(value); setAiMessage('') }} textColor="inherit" indicatorColor="secondary" variant="scrollable" scrollButtons="auto" sx={{ mb: 2, '& .MuiTabs-indicator': { backgroundColor: '#ff2d55' }, '& .MuiTab-root': { color: 'var(--text-secondary)', '&.Mui-selected': { color: '#ff2d55' } } }}>
                  {sectionSteps.map((step, index) => (
                    <Tab key={step.label} label={step.label} />
                  ))}
                </Tabs>

                <Typography color="text.secondary" sx={{ mb: 2 }}>{sectionSteps[activeSection].helper}</Typography>
                <TextField
                  value={sectionDrafts[sectionSteps[activeSection].label]}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  multiline
                  rows={8}
                  placeholder={`Write your ${sectionSteps[activeSection].label.toLowerCase()} here...`}
                  fullWidth
                  size="small"
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
                  <Button variant="contained" disabled={!actionEnabled} onClick={handleAiAssist} sx={{ background: '#ff2d55', '&:hover': { background: '#d02045' }, textTransform: 'none', py: 1.5, fontWeight: 700, borderRadius: 2 }}>
                    AI Assist Draft
                  </Button>
                  <Button variant="outlined" disabled={!actionEnabled} onClick={handleSectionSave} sx={{ borderColor: '#ff2d55', color: '#ff2d55', textTransform: 'none', py: 1.5, borderRadius: 2, '&:hover': { background: 'rgba(255, 45, 85, 0.1)' } }}>
                    Save Section
                  </Button>
                  <Button variant="text" disabled={!actionEnabled} onClick={handleCompleteSyllabus} sx={{ color: 'var(--text-secondary)', textTransform: 'none', py: 1.5, '&:hover': { background: 'rgba(255,255,255,0.05)' } }}>
                    Mark Syllabus Complete
                  </Button>
                </Stack>
                {aiMessage && <Typography sx={{ mt: 2, color: '#34C759', fontWeight: 600 }}>{aiMessage}</Typography>}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Stack spacing={3}>
              <Card sx={cardStyles}>
                <CardHeader title="Upload Existing Syllabus" titleTypographyProps={{ fontWeight: 700 }} />
                <CardContent>
                  <Typography color="text.secondary" sx={{ mb: 3 }}>
                    Upload a completed syllabus file to import your course structure quickly.
                  </Typography>
                  <Button variant="contained" startIcon={<CloudUploadIcon />} disabled={!actionEnabled} onClick={handleUpload} sx={{ background: '#ff2d55', '&:hover': { background: '#d02045' }, borderRadius: 2, textTransform: 'none', py: 1.5, px: 3, fontWeight: 700 }}>
                    Upload File
                  </Button>
                  {uploadMessage && <Typography sx={{ mt: 2, color: '#34C759', fontWeight: 600 }}>{uploadMessage}</Typography>}
                </CardContent>
              </Card>

              <Card sx={cardStyles}>
                <CardHeader title="Generate from ILOs" titleTypographyProps={{ fontWeight: 700 }} />
                <CardContent>
                  <Typography color="text.secondary" sx={{ mb: 2 }}>
                    Type your intended learning outcomes or a prompt and ATLAS will propose a syllabus structure.
                  </Typography>
                  <Stack spacing={2}>
                    <TextField value={iloPrompt} onChange={(e) => setIloPrompt(e.target.value)} multiline rows={6} placeholder="Enter ILOs, course outcomes, and desired topics..." fullWidth size="small" />
                    <Button variant="contained" startIcon={<AutoAwesomeIcon />} disabled={!actionEnabled} onClick={handleGenerate} sx={{ background: '#ff2d55', '&:hover': { background: '#d02045' }, borderRadius: 2, textTransform: 'none', py: 1.5, fontWeight: 700 }}>
                      Generate Syllabus
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4, borderColor: 'var(--border-color)' }} />

        <Card sx={{ ...cardStyles, mb: 3 }}>
          <CardHeader title="Review Your Draft" titleTypographyProps={{ fontWeight: 700 }} />
          <CardContent>
            {sectionSteps.map((step) => (
              <Box key={step.label} sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 700, mb: 1 }}>{step.label}</Typography>
                <Typography color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {sectionDrafts[step.label]?.trim() || 'No draft content yet. Use AI Assist or write your draft above.'}
                </Typography>
              </Box>
            ))}
            <Button
              variant="contained"
              disabled={!actionEnabled}
              onClick={handleDownloadSyllabus}
              sx={{ mt: 2, background: 'rgba(255,255,255,0.1)', color: '#fff', '&:hover': { background: 'rgba(255,255,255,0.2)' }, borderRadius: 2, textTransform: 'none', boxShadow: 'none' }}
            >
              Download Syllabus
            </Button>
          </CardContent>
        </Card>

        <Card sx={{ ...cardStyles, background: 'rgba(255, 45, 85, 0.05)', borderColor: 'rgba(255, 45, 85, 0.2)' }}>
          <CardHeader title="Syllabus Requirements" titleTypographyProps={{ fontWeight: 700, color: '#ff2d55' }} />
          <CardContent>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              Your syllabus should include:
            </Typography>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)' }}>
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