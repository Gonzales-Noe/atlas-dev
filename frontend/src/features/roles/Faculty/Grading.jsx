// src/features/Faculty/Grading.jsx
import { useEffect, useState, useMemo } from 'react'
import {
  Box, Typography, Card, CardContent, CardHeader, Grid,
  Select, MenuItem, FormControl, InputLabel, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
  CircularProgress,
} from '@mui/material'
import { StatusNotice } from '../../../components/StatusNotice'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'

function loadStoredCourses() {
  try { return JSON.parse(localStorage.getItem('atlas_faculty_courses') || '[]') } catch { return [] }
}

export default function FacultyGrading() {
  const [courses, setCourses] = useState(loadStoredCourses())
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [assessments, setAssessments] = useState([])
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('')
  const [students, setStudents] = useState([])
  const [assessmentTitle, setAssessmentTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cardStyles = { borderRadius: 4, height: '100%', display: 'flex', flexDirection: 'column' }

  useEffect(() => {
    const stored = loadStoredCourses()
    if (stored.length > 0) {
      setCourses(stored)
      if (!selectedCourseId) setSelectedCourseId(stored[0].course_id || '')
    }
  }, [])

  // Load assessments from workspace when course changes
  useEffect(() => {
    if (!selectedCourseId) {
      setAssessments([])
      setSelectedAssessmentId('')
      return
    }
    setLoading(true)
    setError('')
    api.get(`/curriculum/faculty-course-workspace/${selectedCourseId}/`)
      .then(res => {
        const list = (res.data?.assessments || []).map(a => ({
          assessment_id: a.assessment_id,
          title: a.title || `${a.assessment_type || 'Assessment'} (${a.assessment_id?.slice(0, 8)}...)`,
          assessment_type: a.assessment_type,
          status: a.status,
        }))
        setAssessments(list)
        if (list.length > 0 && !selectedAssessmentId) {
          setSelectedAssessmentId(list[0].assessment_id)
          setAssessmentTitle(list[0].title)
        }
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load assessments: ' + (err.response?.data?.detail || err.message))
        setLoading(false)
      })
  }, [selectedCourseId])

  // Fetch scores when assessment changes
  useEffect(() => {
    if (!selectedCourseId || !selectedAssessmentId) {
      setStudents([])
      return
    }
    setLoading(true)
    setError('')
    api.get(`/grading/student-scores/?course_id=${selectedCourseId}&assessment_id=${selectedAssessmentId}`)
      .then(res => {
        setStudents(res.data?.students || [])
        setAssessmentTitle(res.data?.assessment_title || '')
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load scores: ' + (err.response?.data?.detail || err.message))
        setLoading(false)
      })
  }, [selectedCourseId, selectedAssessmentId])

  const stats = useMemo(() => {
    const total = students.length
    if (total === 0) return { avg: null, passed: 0, flagged: 0 }
    const sum = students.reduce((s, st) => s + (st.percent ?? st.score ?? 0), 0)
    const avg = +(sum / total).toFixed(1)
    const passed = students.filter(s => (s.percent ?? s.score ?? 0) >= 50).length
    const flagged = students.filter(s => s.flagged).length
    return { avg, passed, flagged }
  }, [students])

  const selectedAssessment = assessments.find(a => a.assessment_id === selectedAssessmentId)

  return (
    <FacultyLayout>
      <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', minHeight: '85vh' }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Grading & Student Scores
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.95rem' }}>
            View student scores and performance for major examinations.
          </Typography>
        </Box>

        {/* Selectors */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Course</InputLabel>
              <Select value={selectedCourseId} label="Course" onChange={e => {
                setSelectedCourseId(e.target.value)
                setSelectedAssessmentId('')
                setStudents([])
              }}>
                {courses.map(c => (
                  <MenuItem key={c.course_id} value={c.course_id}>
                    {c.course_code ? `${c.course_code} — ` : ''}{c.course_title || c.course_id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Assessment / Exam</InputLabel>
              <Select value={selectedAssessmentId} label="Assessment / Exam" onChange={e => {
                setSelectedAssessmentId(e.target.value)
                const a = assessments.find(x => x.assessment_id === e.target.value)
                setAssessmentTitle(a?.title || '')
              }}>
                {assessments.map(a => (
                  <MenuItem key={a.assessment_id} value={a.assessment_id}>{a.title}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          {selectedAssessment && (
            <Grid item xs={12} md={4} sx={{ display: 'flex', alignItems: 'center' }}>
              <Chip
                label={selectedAssessment.assessment_type || 'Assessment'}
                size="small" variant="outlined"
                sx={{ mr: 1 }}
              />
              {selectedAssessment.status && (
                <Chip
                  label={selectedAssessment.status}
                  size="small"
                  color={selectedAssessment.status === 'Final' ? 'success' : 'default'}
                  variant="outlined"
                />
              )}
            </Grid>
          )}
        </Grid>

        <StatusNotice message={error} severity="error" />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={40} sx={{ color: '#8E1C1B' }} />
          </Box>
        ) : students.length === 0 && selectedAssessmentId ? (
          <Card sx={{ ...cardStyles, p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">No student score data found for this assessment.</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
              Scores will appear here after students submit bubble sheets or grade data is imported.
            </Typography>
          </Card>
        ) : students.length === 0 ? (
          <Card sx={{ ...cardStyles, p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Select a course and assessment to view student scores.</Typography>
          </Card>
        ) : (
          <>
            {/* Summary stats */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Total Students</Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: '#8E1C1B' }}>
                      {students.length}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Class Average</Typography>
                    <Typography sx={{
                      fontSize: '2rem', fontWeight: 800,
                      color: (stats.avg ?? 0) >= 50 ? '#34C759' : '#FF9F0A',
                    }}>
                      {stats.avg ?? '—'}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Passed (≥50%)</Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: '#34C759' }}>
                      {stats.passed}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Flagged</Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: '#FF3B30' }}>
                      {stats.flagged}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Score table */}
            <Card sx={cardStyles}>
              <CardHeader
                title={assessmentTitle || 'Student Scores'}
                titleTypographyProps={{ fontWeight: 700 }}
              />
              <CardContent sx={{ pt: 0 }}>
                <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-color)' } }}>
                        <TableCell>#</TableCell>
                        <TableCell>Student ID</TableCell>
                        <TableCell align="right">Score</TableCell>
                        <TableCell align="right">Max</TableCell>
                        <TableCell align="right">Percent</TableCell>
                        <TableCell>Source</TableCell>
                        <TableCell>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {students.map((s, idx) => (
                        <TableRow key={s.student_id + '-' + idx} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{s.student_id}</TableCell>
                          <TableCell align="right">{s.score?.toFixed(1) ?? '—'}</TableCell>
                          <TableCell align="right">{s.max_score?.toFixed(1) ?? '—'}</TableCell>
                          <TableCell align="right">
                            <Chip
                              label={`${s.percent?.toFixed(1) ?? s.score?.toFixed(1) ?? '—'}%`}
                              size="small"
                              sx={{
                                fontWeight: 700,
                                bgcolor: (s.percent || s.score || 0) >= 75 ? 'rgba(52,199,89,0.15)' :
                                         (s.percent || s.score || 0) >= 50 ? 'rgba(255,159,10,0.15)' :
                                         'rgba(255,59,48,0.15)',
                                color: (s.percent || s.score || 0) >= 75 ? '#34C759' :
                                       (s.percent || s.score || 0) >= 50 ? '#FF9F0A' : '#FF3B30',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={s.source === 'bubble_sheet' ? 'Bubble Sheet' : s.source === 'grade_sheet' ? 'Grade Sheet' : s.source}
                              size="small" variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            {s.flagged
                              ? <Chip label="Flagged" size="small" color="warning" />
                              : <Chip label="OK" size="small" color="success" variant="outlined" />
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </>
        )}
      </Box>
    </FacultyLayout>
  )
}
