// src/features/Faculty/Assessment.jsx
import { useEffect, useState } from 'react'
import {
  Box, Button, Card, CardContent, CardHeader, Grid, Stack, TextField, Typography, Alert, List, ListItem, ListItemText,
} from '@mui/material'
import QuizIcon from '@mui/icons-material/Quiz'
import FacultyLayout from './FacultyLayout'

function loadCourse() { try { return JSON.parse(localStorage.getItem('atlas_faculty_course')) || null } catch { return null } }
function loadModuleList() { try { return JSON.parse(localStorage.getItem('atlas_faculty_modules')) || [] } catch { return [] } }

export default function FacultyAssessment() {
  const [course, setCourse] = useState(loadCourse())
  const [syllabusReady, setSyllabusReady] = useState(localStorage.getItem('atlas_faculty_syllabus_created') === 'true')
  const [moduleList, setModuleList] = useState(loadModuleList())
  const [assessmentPrompt, setAssessmentPrompt] = useState('')
  const [assessmentItems, setAssessmentItems] = useState([])
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    setCourse(loadCourse())
    setSyllabusReady(localStorage.getItem('atlas_faculty_syllabus_created') === 'true')
    setModuleList(loadModuleList())
  }, [])

  const canGenerate = Boolean(course?.courseName && syllabusReady && moduleList.length > 0)

  function handleGenerate() {
    if (!assessmentPrompt.trim()) {
      setSuccessMessage('Please provide an assessment prompt or learning objective.')
      return
    }
    const generated = moduleList.slice(0, 3).map((module, index) => ({
      id: index + 1,
      title: `Assessment item for ${module.title}`,
      instructions: `Based on ${module.outcome}, ask students to demonstrate understanding of ${module.title}.`,
    }))
    setAssessmentItems(generated)
    setSuccessMessage('Assessment items generated. Review them and adjust as needed.')
  }

  const cardStyles = { borderRadius: 4 };

  return (
    <FacultyLayout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
            Assessment Generator
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.95rem' }}>
            Create formative and summative assessment items aligned with your course modules.
          </Typography>
        </Box>

        {!course?.courseName && <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>Add a course from the dashboard before generating assessments.</Alert>}
        {!syllabusReady && course?.courseName && <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>Create a syllabus first to unlock assessment generation.</Alert>}
        {course?.courseName && syllabusReady && moduleList.length === 0 && <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>Add at least one module first before generating assessment items.</Alert>}
        {successMessage && <Alert severity="success" sx={{ mb: 3, borderRadius: 2 }}>{successMessage}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card sx={cardStyles}>
              <CardHeader title="Assessment Prompt" titleTypographyProps={{ fontWeight: 700 }} />
              <CardContent>
                <Stack spacing={2}>
                  <TextField value={assessmentPrompt} onChange={(e) => setAssessmentPrompt(e.target.value)} multiline rows={6} placeholder="Enter a prompt or learning objective for the assessment..." fullWidth size="small" disabled={!canGenerate} />
                  <Button variant="contained" startIcon={<QuizIcon />} disabled={!canGenerate} onClick={handleGenerate} sx={{ background: '#8E1C1B', '&:hover': { background: '#6E1212' }, borderRadius: 2, textTransform: 'none', py: 1.5, fontWeight: 700 }}>
                    Generate Assessment Items
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ ...cardStyles, minHeight: 320 }}>
              <CardHeader title="Generated Items" titleTypographyProps={{ fontWeight: 700 }} />
              <CardContent>
                {assessmentItems.length === 0 ? (
                  <Typography color="text.secondary">No assessment items generated yet.</Typography>
                ) : (
                  <List sx={{ borderRadius: 2, border: '1px solid var(--border-color)' }}>
                    {assessmentItems.map((item) => (
                      <ListItem key={item.id} alignItems="flex-start">
                        <ListItemText primary={<Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>} secondary={<Typography color="text.secondary" sx={{ fontSize: '0.85rem', mt: 0.5 }}>{item.instructions}</Typography>} />
                      </ListItem>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </FacultyLayout>
  )
}