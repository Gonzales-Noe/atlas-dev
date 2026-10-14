// src/features/Faculty/Syllabus.jsx
import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, CardHeader, Grid, Stack, TextField, Typography, Alert, Divider, Tabs, Tab,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'

const DEFAULT_SECTIONS = [
  { key: 'course-overview', label: 'Course Overview', helper: 'Describe the course purpose, objectives, and delivery plan.', enabled: true },
  { key: 'learning-outcomes', label: 'Learning Outcomes', helper: 'List measurable outcomes students should achieve by the end of the course.', enabled: true },
  { key: 'weekly-plan', label: 'Weekly Plan', helper: 'Outline weekly topics, activities, and milestones for the term.', enabled: true },
  { key: 'assessment-plan', label: 'Assessment Plan', helper: 'Define assessment types, weights, and grading criteria aligned to outcomes.', enabled: true },
  { key: 'resources', label: 'Resources', helper: 'Add textbooks, readings, tools, and support materials for learners.', enabled: true },
]

function loadSectionDrafts() {
  try {
    return JSON.parse(localStorage.getItem('atlas_faculty_syllabus_sections') || '{}')
  } catch {
    return {}
  }
}

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
  const [syllabusSections, setSyllabusSections] = useState(DEFAULT_SECTIONS)
  const [sectionDrafts, setSectionDrafts] = useState(loadSectionDrafts)

  useEffect(() => {
    setCourse(loadCourse())
    api.get('/users/institution-customization/')
      .then(({ data }) => {
        const configured = Array.isArray(data.syllabus_sections)
          ? data.syllabus_sections.filter(section => section.enabled !== false)
          : []
        setSyllabusSections(configured.length ? configured : DEFAULT_SECTIONS)
      })
      .catch(() => {
        setSyllabusSections(DEFAULT_SECTIONS)
        setAiMessage('Could not load your institution template. Showing the standard syllabus sections.')
      })
  }, [])

  useEffect(() => {
    localStorage.setItem('atlas_faculty_syllabus_sections', JSON.stringify(sectionDrafts))
  }, [sectionDrafts])

  const currentSection = syllabusSections[activeSection] || syllabusSections[0]
  const actionEnabled = Boolean(course && course.courseName && currentSection)
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
    setSectionDrafts((prev) => ({ ...prev, [currentSection.key || currentSection.label]: value }))
  }

  function handleAiAssist() {
    if (!course?.courseName) {
      setAiMessage('Select or add a course on the dashboard first.')
      return
    }

    if (currentSection.is_static) return
    const sectionLabel = currentSection.label
    const generatedText = `Suggested ${sectionLabel.toLowerCase()} for ${course.courseName} (${course.courseCode || 'course'}). Add the relevant details, learning activities, and assessment information for this section.`
    const key = currentSection.key || sectionLabel
    setSectionDrafts((prev) => ({ ...prev, [key]: prev[key] || generatedText }))
    setAiMessage(`AI assistance inserted a draft for ${sectionLabel}. Review and refine it as needed.`)
  }

  function handleSectionSave() {
    setSuccessMessage('Section content saved on this device. Keep working through the guided syllabus steps.')
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
    const content = syllabusSections.map((section) => {
      const sectionText = section.is_static
        ? section.static_content
        : sectionDrafts[section.key || section.label]?.trim() || 'No content provided yet.'
      return `${section.label}\n${sectionText}\n\n`
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
                <Tabs value={activeSection} onChange={(event, value) => { setActiveSection(value); setAiMessage('') }} textColor="inherit" indicatorColor="secondary" variant="scrollable" scrollButtons="auto" sx={{ mb: 2, '& .MuiTabs-indicator': { backgroundColor: '#15803D' }, '& .MuiTab-root': { color: 'var(--text-secondary)', '&.Mui-selected': { color: '#15803D' } } }}>
                  {syllabusSections.map((section, index) => (
                    <Tab key={section.key || section.label} label={section.label} />
                  ))}
                </Tabs>

                {currentSection.is_static ? (
                  <Alert severity="info" sx={{ mb: 2 }}>This information is set by your institution and cannot be changed.</Alert>
                ) : (
                  <Typography color="text.secondary" sx={{ mb: 2 }}>{currentSection.helper || `Complete the ${currentSection.label.toLowerCase()} section.`}</Typography>
                )}
                <TextField
                  value={currentSection.is_static
                    ? currentSection.static_content || ''
                    : sectionDrafts[currentSection.key || currentSection.label] || ''}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  multiline
                  rows={8}
                  placeholder={`Write your ${currentSection.label.toLowerCase()} here...`}
                  fullWidth
                  size="small"
                  InputProps={{ readOnly: Boolean(currentSection.is_static) }}
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 3 }}>
                  <Button variant="contained" disabled={!actionEnabled || currentSection.is_static} onClick={handleAiAssist} sx={{ background: '#15803D', '&:hover': { background: '#14532D' }, textTransform: 'none', py: 1.5, fontWeight: 700, borderRadius: 2 }}>
                    AI Assist Draft
                  </Button>
                  <Button variant="outlined" disabled={!actionEnabled || currentSection.is_static} onClick={handleSectionSave} sx={{ borderColor: '#15803D', color: '#15803D', textTransform: 'none', py: 1.5, borderRadius: 2, '&:hover': { background: 'rgba(21, 128, 61, 0.08)' } }}>
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
                  <Button variant="contained" startIcon={<CloudUploadIcon />} disabled={!actionEnabled} onClick={handleUpload} sx={{ background: '#15803D', '&:hover': { background: '#14532D' }, borderRadius: 2, textTransform: 'none', py: 1.5, px: 3, fontWeight: 700 }}>
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
                    <Button variant="contained" startIcon={<AutoAwesomeIcon />} disabled={!actionEnabled} onClick={handleGenerate} sx={{ background: '#15803D', '&:hover': { background: '#14532D' }, borderRadius: 2, textTransform: 'none', py: 1.5, fontWeight: 700 }}>
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
            {syllabusSections.map((section) => (
              <Box key={section.key || section.label} sx={{ mb: 3 }}>
                <Typography sx={{ fontWeight: 700, mb: 1 }}>{section.label}</Typography>
                <Typography color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                  {section.is_static
                    ? section.static_content
                    : sectionDrafts[section.key || section.label]?.trim() || 'No draft content yet. Use AI Assist or write your draft above.'}
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

        <Card sx={{ ...cardStyles, background: 'rgba(21, 128, 61, 0.05)', borderColor: 'rgba(21, 128, 61, 0.2)' }}>
          <CardHeader title="Syllabus Requirements" titleTypographyProps={{ fontWeight: 700, color: '#15803D' }} />
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