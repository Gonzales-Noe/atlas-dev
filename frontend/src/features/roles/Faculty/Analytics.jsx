// src/features/Faculty/Analytics.jsx
import { useEffect, useState, useMemo } from 'react'
import {
  Box, Typography, Card, CardContent, CardHeader, Grid,
  Select, MenuItem, FormControl, InputLabel, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, CircularProgress, Alert, LinearProgress,
} from '@mui/material'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts'
import FacultyLayout from './FacultyLayout'
import api from '../../../config/api'

const BLOOM_COLORS = {
  Remember: '#8884d8',
  Understand: '#82ca9d',
  Apply: '#ffc658',
  Analyze: '#ff8042',
  Evaluate: '#a4de6c',
  Create: '#d0ed57',
}

function loadStoredCourses() {
  try { return JSON.parse(localStorage.getItem('atlas_faculty_courses') || '[]') } catch { return [] }
}

export default function FacultyAnalytics() {
  const [courses, setCourses] = useState(loadStoredCourses())
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [assessments, setAssessments] = useState([])
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('')
  const [data, setData] = useState(null)
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
        }))
        setAssessments(list)
        if (list.length > 0 && !selectedAssessmentId) {
          setSelectedAssessmentId(list[0].assessment_id)
        }
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load assessments: ' + (err.response?.data?.detail || err.message))
        setLoading(false)
      })
  }, [selectedCourseId])

  useEffect(() => {
    if (!selectedCourseId || !selectedAssessmentId) return
    setLoading(true)
    setError('')
    setData(null)
    api.get(`/analytics/bloom-item-analysis/?course_id=${selectedCourseId}&assessment_id=${selectedAssessmentId}`)
      .then(r => {
        setData(r.data)
        setLoading(false)
      })
      .catch(err => {
        if (err.response?.status === 400) {
          setData({
            success: false,
            message: err.response?.data?.detail || 'Assessment items have no Bloom metadata. Generate the assessment first.',
          })
        } else if (err.response?.status === 404) {
          setData({ success: false, message: 'Assessment not found.' })
        } else {
          setError('Failed to load analytics: ' + (err.response?.data?.detail || err.message))
        }
        setLoading(false)
      })
  }, [selectedCourseId, selectedAssessmentId])

  const bloomSummaryData = useMemo(() =>
    (data?.bloom_summary || []).map(b => ({
      name: b.bloom_level,
      'Class %': b.class_pct ?? 0,
      correct: b.class_correct ?? 0,
      total: b.class_total ?? 0,
      weakness: b.weakness_flag,
    })), [data])

  const sectionAvgData = useMemo(() =>
    (data?.section_averages || []).map(s => ({
      name: s.section.length > 24 ? s.section.slice(0, 24) + '...' : s.section,
      'Avg %': s.avg_percent,
      items: s.total_items,
    })), [data])

  const weakestStudents = useMemo(() =>
    data?.per_student_bloom
      ? [...data.per_student_bloom].sort((a, b) => a.score_percent - b.score_percent).slice(0, 5)
      : [], [data])

  const bloomLevels = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create']

  const getWeaknessColor = (w) => {
    if (w === 'strong') return 'success'
    if (w === 'moderate') return 'warning'
    if (w === 'low') return 'error'
    return 'default'
  }

  const getScoreColor = (pct) => pct >= 75 ? '#34C759' : pct >= 50 ? '#FF9F0A' : '#FF3B30'
  const getScoreBg = (pct) =>
    pct >= 75 ? 'rgba(52,199,89,0.15)' : pct >= 50 ? 'rgba(255,159,10,0.15)' : 'rgba(255,59,48,0.15)'

  return (
    <FacultyLayout>
      <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', minHeight: '85vh' }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
            Assessment Analytics
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '0.95rem' }}>
            Bloom taxonomy item analysis, class averages, and per-student performance breakdown.
          </Typography>
        </Box>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Course</InputLabel>
              <Select value={selectedCourseId} label="Course" onChange={e => {
                setSelectedCourseId(e.target.value);
                setSelectedAssessmentId('');
                setData(null);
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
                setSelectedAssessmentId(e.target.value);
                setData(null);
              }}>
                {assessments.map(a => (
                  <MenuItem key={a.assessment_id} value={a.assessment_id}>{a.title}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={40} sx={{ color: '#8E1C1B' }} />
          </Box>
        ) : data?.message ? (
          <Card sx={{ ...cardStyles, p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">{data.message}</Typography>
          </Card>
        ) : data ? (
          <>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Class Average</Typography>
                    <Typography sx={{
                      fontSize: '2rem', fontWeight: 800,
                      color: (data.class_average ?? 0) >= (data.passing_threshold ?? 50) ? '#34C759' : '#FF3B30',
                    }}>
                      {data.class_average ?? '—'}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Passing Threshold</Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: '#8E1C1B' }}>
                      {data.passing_threshold ?? 50}%
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Total Students</Typography>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 800 }}>
                      {data.total_students ?? 0}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={3}>
                <Card sx={cardStyles}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Typography color="text.secondary" variant="body2">Assessment</Typography>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {data.assessment_title || '—'}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} md={7}>
                <Card sx={cardStyles}>
                  <CardHeader title="Bloom Taxonomy — Class Performance" titleTypographyProps={{ fontWeight: 700 }} />
                  <CardContent sx={{ minHeight: 280 }}>
                    {bloomSummaryData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={bloomSummaryData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                          <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                            label={{ value: '% Correct', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-secondary)' } }} />
                          <Tooltip contentStyle={{
                            borderRadius: 12, border: '1px solid var(--border-color)',
                            background: 'var(--bg-card)', color: 'var(--text-primary)',
                          }} />
                          <Bar dataKey="Class %" radius={[6, 6, 0, 0]}>
                            {bloomSummaryData.map((entry, idx) => (
                              <Cell key={idx} fill={BLOOM_COLORS[entry.name] || '#8884d8'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                        No Bloom taxonomy data available.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={5}>
                <Card sx={cardStyles}>
                  <CardHeader title="Bloom Level Details" titleTypographyProps={{ fontWeight: 700 }} />
                  <CardContent>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { borderBottom: '2px solid var(--border-color)' } }}>
                          <TableCell>Level</TableCell>
                          <TableCell align="right">Correct / Total</TableCell>
                          <TableCell align="right">%</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {bloomSummaryData.map(b => (
                          <TableRow key={b.name} hover>
                            <TableCell sx={{ fontWeight: 600 }}>{b.name}</TableCell>
                            <TableCell align="right">{b.correct} / {b.total}</TableCell>
                            <TableCell align="right">{b['Class %']?.toFixed(1) ?? '—'}%</TableCell>
                            <TableCell>
                              <Chip
                                label={b.weakness}
                                size="small"
                                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                                color={getWeaknessColor(b.weakness)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {sectionAvgData.length > 0 && (
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12}>
                  <Card sx={cardStyles}>
                    <CardHeader title="Performance by Section" titleTypographyProps={{ fontWeight: 700 }} />
                    <CardContent sx={{ minHeight: 240 }}>
                      <ResponsiveContainer width="100%" height={Math.max(240, sectionAvgData.length * 40)}>
                        <BarChart data={sectionAvgData} layout="vertical" margin={{ top: 5, right: 30, left: 90, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-color)" />
                          <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                          <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={90} />
                          <Tooltip contentStyle={{
                            borderRadius: 12, border: '1px solid var(--border-color)',
                            background: 'var(--bg-card)', color: 'var(--text-primary)',
                          }} />
                          <Bar dataKey="Avg %" fill="#8E1C1B" radius={[0, 4, 4, 0]} barSize={22} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            )}

            <Card sx={cardStyles}>
              <CardHeader
                title="Per-Student Bloom Breakdown"
                titleTypographyProps={{ fontWeight: 700 }}
                subheader="Correct / Total per Bloom level — identifies individual weaknesses"
              />
              <CardContent sx={{ pt: 0, overflowX: 'auto' }}>
                {weakestStudents.length > 0 ? (
                  <>
                    <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ '& th': { fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-color)', fontSize: '0.75rem' } }}>
                            <TableCell>Student ID</TableCell>
                            <TableCell align="right">Score</TableCell>
                            {bloomLevels.map(b => (
                              <TableCell key={b} align="center" sx={{ fontSize: '0.7rem' }}>{b.slice(0, 4)}</TableCell>
                            ))}
                            <TableCell align="center">Status</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {weakestStudents.map(ps => (
                            <TableRow key={ps.student_id} hover>
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{ps.student_id}</TableCell>
                              <TableCell align="right">
                                <Chip
                                  label={`${ps.score_percent}%`} size="small"
                                  sx={{ fontWeight: 700, bgcolor: getScoreBg(ps.score_percent), color: getScoreColor(ps.score_percent) }}
                                />
                              </TableCell>
                              {bloomLevels.map(b => {
                                const bd = ps.bloom_breakdown?.[b]
                                const pct = bd?.pct
                                const c = pct == null ? '#ccc' : getScoreColor(pct)
                                return (
                                  <TableCell key={b} align="center" sx={{ fontSize: '0.8rem' }}>
                                    {bd?.total > 0 ? (
                                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 50 }}>
                                        <Typography variant="caption" sx={{ color: c, fontWeight: 700 }}>
                                          {bd.correct}/{bd.total}
                                        </Typography>
                                        <LinearProgress
                                          variant="determinate"
                                          value={pct ?? 0}
                                          sx={{
                                            width: '100%', height: 4, borderRadius: 2, mt: 0.3,
                                            bgcolor: 'rgba(255,255,255,0.1)',
                                            '& .MuiLinearProgress-bar': { bgcolor: c },
                                          }}
                                        />
                                      </Box>
                                    ) : (
                                      <Typography variant="caption" color="text.disabled">—</Typography>
                                    )}
                                  </TableCell>
                                )
                              })}
                              <TableCell align="center">
                                <Chip
                                  label={ps.score_percent >= 75 ? 'Strong' : ps.score_percent >= 50 ? 'Moderate' : 'Needs Help'}
                                  size="small" variant="outlined"
                                  color={ps.score_percent >= 75 ? 'success' : ps.score_percent >= 50 ? 'warning' : 'error'}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    {(data.per_student_bloom?.length || 0) > 5 && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        Showing 5 weakest students. {data.per_student_bloom.length} students total.
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No student Bloom breakdown data available.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </>
        ) : selectedCourseId && selectedAssessmentId ? null : (
          <Card sx={{ ...cardStyles, p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">Select a course and assessment to view analytics.</Typography>
          </Card>
        )}
      </Box>
    </FacultyLayout>
  )
}