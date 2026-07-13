
import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DashboardLayout from '../../components/dashboardLayout'
import api from '../../config/api'
import useApi from '../../hooks/useApi'
import { extractApiError, formatDateTime } from '../../utils'

function detectFileType(file) {
  const lowerName = (file?.name || '').toLowerCase()
  if (lowerName.endsWith('.pdf')) return 'pdf'
  if (lowerName.endsWith('.docx')) return 'docx'
  return ''
}

export default function AdminGlobalKnowledgePage() {
  const { data, loading, error, execute } = useApi('/integrations/rag-documents/')
  const [file, setFile] = useState(null)
  const [discipline, setDiscipline] = useState('')
  const [program, setProgram] = useState('')
  const [docType, setDocType] = useState('CHED_Handbook')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')

  const navItems = useMemo(() => ([
    { label: 'Dashboard', to: '/admin/dashboard' },
    { label: 'Accounts', to: '/admin/account-management' },
    { label: 'Knowledge Base', to: '/admin/global-knowledge' },
    { label: 'Audit Logs', to: '/admin/audit-logs' },
  ]), [])

  useEffect(() => {
    if (!submitting) return undefined

    // Fast ramp to 80%, then a slower climb while processing runs server-side.
    const progressTimer = setInterval(() => {
      setProgress((current) => {
        if (current < 80) return Math.min(80, current + 4)
        if (current < 95) return Math.min(95, current + 0.35)
        return current
      })
    }, 120)

    const stageTimers = [
      setTimeout(() => {
        setStatusMessage('Upload received. We are now preparing the file for the knowledge base.')
      }, 500),
      setTimeout(() => {
        setStatusMessage('We are organizing the document into readable sections.')
      }, 2200),
      setTimeout(() => {
        setStatusMessage('We are making the document searchable in the knowledge base.')
      }, 5200),
      setTimeout(() => {
        setStatusMessage('Finalizing and saving to the knowledge base...')
      }, 9000),
    ]

    return () => {
      clearInterval(progressTimer)
      stageTimers.forEach((timerId) => clearTimeout(timerId))
    }
  }, [submitting])

  async function handleUpload(event) {
    event.preventDefault()
    setLocalError('')
    setSuccessMessage('')
    setStatusMessage('')
    setProgress(0)

    if (!file) {
      setLocalError('Please select a PDF or DOCX file to upload.')
      return
    }

    const fileType = detectFileType(file)
    if (!fileType) {
      setLocalError('Unsupported file type. Upload a PDF or DOCX file.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('file_type', fileType)
    formData.append('discipline', discipline.trim())
    formData.append('program', program.trim())
    formData.append('doc_type', docType.trim())

    setSubmitting(true)
    setStatusMessage('Uploading your file...')
    try {
      const { data: response } = await api.post('/integrations/upload-global-rag-document/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 1200000,
      })

      setProgress(100)
      setStatusMessage('Done. Your document is now available in the knowledge base.')
      setSuccessMessage('Success! Your document has been saved and is now ready to use in the Knowledge Base.')
      setFile(null)
      await execute()
    } catch (err) {
      setProgress(0)
      setStatusMessage('')
      setLocalError(extractApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const documents = data?.documents || []

  if (loading && !data) {
    return (
      <DashboardLayout role="admin" navItems={navItems}>
        <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout role="admin" navItems={navItems}>
      <Box sx={{ display: 'grid', gap: 3 }}>
        {(error || localError) && <Alert severity="error">{error || localError}</Alert>}
        {successMessage && <Alert severity="success">{successMessage}</Alert>}
        {statusMessage && (
          <Alert severity={submitting ? 'info' : 'success'}>
            {statusMessage}
          </Alert>
        )}

        <Card sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Typography variant="h4" sx={{ fontWeight: 800, mb: 1 }}>
              Global Knowledge Base Upload
            </Typography>
            <Typography variant="body1" sx={{ color: '#666', mb: 3 }}>
              Upload CHED handbooks and other institution-wide references for RAG retrieval.
            </Typography>

            <Box component="form" onSubmit={handleUpload} sx={{ display: 'grid', gap: 2 }}>
              <Button variant="outlined" component="label" sx={{ justifySelf: 'start' }} disabled={submitting}>
                Choose File
                <input
                  hidden
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] || null
                    setFile(selected)
                    setLocalError('')
                    setSuccessMessage('')
                  }}
                />
              </Button>

              <Typography variant="body2" sx={{ color: file ? '#1a1a1a' : '#777' }}>
                {file ? file.name : 'No file selected'}
              </Typography>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Discipline"
                  value={discipline}
                  onChange={(event) => setDiscipline(event.target.value)}
                  placeholder="Education"
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Program"
                  value={program}
                  onChange={(event) => setProgram(event.target.value)}
                  placeholder="General"
                />
                <TextField
                  fullWidth
                  size="small"
                  label="Document Type"
                  value={docType}
                  onChange={(event) => setDocType(event.target.value)}
                  placeholder="CHED_Handbook"
                />
              </Stack>

              <Button type="submit" variant="contained" disabled={submitting} sx={{ justifySelf: 'start' }}>
                {submitting ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Upload and Index'}
              </Button>

              {(submitting || progress === 100) && (
                <Box sx={{ mt: 1 }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                    <Typography variant="body2" sx={{ color: '#555', fontWeight: 600 }}>
                      Progress
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#555', fontWeight: 700 }}>
                      {Math.round(progress)}%
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: 'rgba(0,0,0,0.08)',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 999,
                        transition: 'transform 180ms linear',
                      },
                    }}
                  />
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ px: 3, py: 2.25, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Indexed Documents ({documents.length})
              </Typography>
            </Box>

            <Box sx={{ px: 3, pb: 2 }}>
              {documents.length > 0 ? (
                documents.map((doc) => (
                  <Box
                    key={doc.document_id}
                    sx={{ py: 1.5, borderBottom: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {doc.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#666' }}>
                      {doc.doc_type || 'Unspecified type'} | {doc.discipline || 'No discipline'} | {doc.program || 'No program'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#888' }}>
                      Chunks: {doc.total_chunks || 0} | Uploaded: {formatDateTime(doc.created_at)}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Box sx={{ py: 3 }}>
                  <Typography variant="body2" sx={{ color: '#666' }}>
                    No global knowledge documents indexed yet.
                  </Typography>
                </Box>
              )}
            </Box>
          </CardContent>
        </Card>
      </Box>
    </DashboardLayout>
  )
}