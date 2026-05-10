// src/features/Faculty/Grading.jsx
import { useEffect, useState } from 'react'
import { Box, Button, Card, CardContent, Stack, TextField, Typography, Alert } from '@mui/material'
import GradeIcon from '@mui/icons-material/Grade'
import FacultyLayout from './FacultyLayout'

function loadModuleList() { try { return JSON.parse(localStorage.getItem('atlas_faculty_modules')) || [] } catch { return [] } }

export default function FacultyGrading() {
  const [moduleList, setModuleList] = useState(loadModuleList())
  const [selectedModuleId, setSelectedModuleId] = useState(moduleList.length > 0 ? moduleList[0].id : null)
  const [score, setScore] = useState('')
  const [comments, setComments] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setModuleList(loadModuleList())
    setSelectedModuleId((prev) => prev ?? (moduleList[0]?.id ?? null))
  }, [])

  const selectedModule = moduleList.find((item) => item.id === selectedModuleId)

  function handleSave() {
    setSuccess('Grade and feedback saved.')
    setScore('')
    setComments('')
  }

  const cardStyles = { borderRadius: '20px', border: '1px solid #E2E8F0', boxShadow: 'none', mb: 3 };

  return (
    <FacultyLayout>
      <Box sx={{ mb: 4, textAlign: 'center', pt: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: '#0F172A' }}>
          Grading & Feedback
        </Typography>
        <Typography sx={{ color: '#64748B', fontSize: '0.95rem' }}>
          Record grades and provide feedback for student work.
        </Typography>
      </Box>

      {moduleList.length === 0 ? (
        <Alert severity="info" sx={{ mb: 3, borderRadius: '12px' }}>Create modules first to use grading.</Alert>
      ) : (
        <Stack spacing={3}>
          <Card sx={cardStyles}>
            <CardContent sx={{ p: 4 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A', mb: 3 }}>Select Module</Typography>
              <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
                {moduleList.map((module) => (
                  <Button key={module.id} variant={selectedModuleId === module.id ? 'contained' : 'outlined'} onClick={() => setSelectedModuleId(module.id)} sx={{ textTransform: 'none', background: selectedModuleId === module.id ? '#0F172A' : undefined, color: selectedModuleId === module.id ? '#fff' : '#64748B', borderColor: '#CBD5E1', py: 1, px: 3, borderRadius: '12px', fontWeight: 600 }}>
                    {module.title}
                  </Button>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card sx={cardStyles}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <GradeIcon sx={{ color: '#A52028', mr: 1.5 }} />
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#0F172A' }}>Grade Student Work</Typography>
              </Box>
              {selectedModule && <Typography sx={{ color: '#475569', mb: 3, fontSize: '0.95rem' }}>Grading module: <strong style={{ color: '#0F172A' }}>{selectedModule.title}</strong></Typography>}
              <Stack spacing={2}>
                <TextField label="Score" value={score} onChange={(e) => setScore(e.target.value)} sx={{ maxWidth: '200px' }} size="small" InputProps={{ sx: { borderRadius: '12px' } }} />
                <TextField label="Feedback comments" value={comments} onChange={(e) => setComments(e.target.value)} multiline rows={4} fullWidth InputProps={{ sx: { borderRadius: '12px' } }} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
                  <Button variant="contained" onClick={handleSave} sx={{ background: '#A52028', '&:hover': { background: '#8B1A20' }, borderRadius: '12px', textTransform: 'none', py: 1.2, px: 4, fontWeight: 700 }}>
                    Save Feedback
                  </Button>
                </Box>
                {success && <Alert severity="success" sx={{ borderRadius: '12px' }}>{success}</Alert>}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}
    </FacultyLayout>
  )
}