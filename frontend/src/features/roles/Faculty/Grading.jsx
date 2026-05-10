import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  TextField,
  Typography,
  Alert,
  Stack,
} from '@mui/material'
import GradeIcon from '@mui/icons-material/Grade'
import FacultyLayout from './FacultyLayout'

function loadModuleList() {
  try {
    return JSON.parse(localStorage.getItem('atlas_faculty_modules')) || []
  } catch {
    return []
  }
}

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
    setSuccess('Grade and feedback saved for the selected module.')
    setScore('')
    setComments('')
  }

  return (
    <FacultyLayout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: '#1A1A1A' }}>
            Grading & Feedback
          </Typography>
          <Typography sx={{ color: '#666', fontSize: '0.95rem' }}>
            Record grades and provide feedback for student work tied to course modules.
          </Typography>
        </Box>

        {moduleList.length === 0 ? (
          <Alert severity="info" sx={{ mb: 3 }}>
            Create modules first to use the grading workflow.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
                <CardHeader title="Select Module" titleTypographyProps={{ fontWeight: 700 }} />
                <CardContent>
                  <Stack spacing={2}>
                    {moduleList.map((module) => (
                      <Button
                        key={module.id}
                        variant={selectedModuleId === module.id ? 'contained' : 'outlined'}
                        onClick={() => setSelectedModuleId(module.id)}
                        sx={{ justifyContent: 'flex-start', textTransform: 'none', background: selectedModuleId === module.id ? '#8B0000' : undefined, color: selectedModuleId === module.id ? '#fff' : undefined }}
                      >
                        {module.title}
                      </Button>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ boxShadow: 'none', border: '1px solid #EEE' }}>
                <CardHeader title="Grade Student Work" titleTypographyProps={{ fontWeight: 700 }} avatar={<GradeIcon sx={{ color: '#8B0000' }} />} />
                <CardContent>
                  <Stack spacing={2}>
                    <TextField
                      label="Score"
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      fullWidth
                      size="small"
                    />
                    <TextField
                      label="Feedback comments"
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      multiline
                      rows={4}
                      fullWidth
                      size="small"
                    />
                    <Button
                      variant="contained"
                      onClick={handleSave}
                      sx={{ background: '#8B0000', '&:hover': { background: '#6B0000' } }}
                    >
                      Save Feedback
                    </Button>
                    {selectedModule && (
                      <Typography sx={{ color: '#666', mt: 1 }}>
                        Grading module: <strong>{selectedModule.title}</strong>
                      </Typography>
                    )}
                    {success && <Alert severity="success">{success}</Alert>}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}
      </Box>
    </FacultyLayout>
  )
}
