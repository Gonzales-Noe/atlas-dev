// src/features/Faculty/Assessment.jsx
import { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, Stack, TextField, Typography, Alert, List, ListItem, ListItemText } from '@mui/material'
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
    if (!assessmentPrompt.trim()) { setSuccessMessage('Please provide a prompt.'); return }
    const generated = moduleList.slice(0, 3).map((module, index) => ({
      id: index + 1,
      title: `Assessment item for ${module.title}`,
      instructions: `Based on ${module.outcome}, ask students to demonstrate understanding of ${module.title}.`,
    }))
    setAssessmentItems(generated)
    setSuccessMessage('Assessment items generated.')
  }

  const cardStyles = { borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: 'none', mb: 3 };

  return (
    <FacultyLayout>
      <Box sx={{ mb: 4, textAlign: 'center', pt: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
          Assessment Generator
        </Typography>
        <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
          Create formative and summative items aligned with modules.
        </Typography>
      </Box>

      {successMessage && <Alert severity="success" sx={{ mb: 3, borderRadius: '12px' }}>{successMessage}</Alert>}

      <Card sx={cardStyles}>
        <CardContent sx={{ p: 4 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 3 }}>Assessment Prompt</Typography>
          <Stack spacing={2}>
            <TextField value={assessmentPrompt} onChange={(e) => setAssessmentPrompt(e.target.value)} multiline rows={4} placeholder="Enter a learning objective for the assessment..." fullWidth disabled={!canGenerate} InputProps={{ sx: { borderRadius: '16px', backgroundColor: '#F8FAFC' } }} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" startIcon={<QuizIcon />} disabled={!canGenerate} onClick={handleGenerate} sx={{ background: '#0F172A', '&:hover': { background: '#1E293B' }, borderRadius: '12px', textTransform: 'none', py: 1.2, px: 4, fontWeight: 700 }}>
                Generate Items
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {assessmentItems.length > 0 && (
        <Card sx={cardStyles}>
          <CardContent sx={{ p: 4 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 3 }}>Generated Items</Typography>
            <List sx={{ bgcolor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
              {assessmentItems.map((item) => (
                <ListItem key={item.id} sx={{ borderBottom: '1px solid #E2E8F0', '&:last-child': { borderBottom: 'none' }, py: 2 }}>
                  <ListItemText primary={<Typography sx={{ fontWeight: 700, color: '#0F172A' }}>{item.title}</Typography>} secondary={<Typography sx={{ color: '#475569', fontSize: '0.9rem', mt: 0.5 }}>{item.instructions}</Typography>} />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
    </FacultyLayout>
  )
}