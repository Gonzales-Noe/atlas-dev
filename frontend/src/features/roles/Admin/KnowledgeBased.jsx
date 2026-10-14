// src/features/roles/Admin/KnowledgeBased.jsx
// Tenant Admin Knowledge Base — uploads global RAG documents (CHED handbooks,
// institution-wide references) and lists what has been indexed.
//
// The "Upload File" button drives the real backend process:
//   POST /integrations/upload-global-rag-document/  (multipart)
//   GET  /integrations/rag-documents/               (indexed documents)

import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Stack, LinearProgress, Alert,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import CloseIcon from '@mui/icons-material/Close'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import { PageHeader, GlassCard, StatCard, PrimaryBtn, OutlineBtn } from '../../../components/ui'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' },
}

function detectFileType(file) {
  const name = (file?.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  return ''
}

function formatFileSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CAT_STYLE = {
  CHED_Handbook: { bg: 'rgba(22,163,74,0.14)', border: 'rgba(22,163,74,0.35)', color: '#86EFAC' },
  Syllabus:      { bg: 'rgba(10,132,255,0.12)', border: 'rgba(10,132,255,0.3)', color: '#60AAFF' },
  Assessment:    { bg: 'rgba(10,132,255,0.12)', border: 'rgba(10,132,255,0.3)', color: '#60AAFF' },
  Policy:        { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', color: '#C084FC' },
  Reference:     { bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.3)', color: '#5EDA7E' },
  Files:         { bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)', color: '#38BDF8' },
}

function CategoryBadge({ cat }) {
  const c = CAT_STYLE[cat] || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 7, padding: '3px 9px', fontSize: '0.7rem', fontWeight: 700, color: c.color, letterSpacing: '0.04em', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
      {cat || 'Uncategorized'}
    </span>
  )
}

export default function AdminKnowledgeBase() {
  const [documents, setDocuments]     = useState([])
  const [documentsLoaded, setDocumentsLoaded] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [searchTerm, setSearchTerm]   = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [createOpen, setCreateOpen]   = useState(false)
  const [viewOpen, setViewOpen]       = useState(false)
  const [selected, setSelected]       = useState(null)
  const [error, setError]             = useState('')
  const [notice, setNotice]           = useState('')

  const [file, setFile]               = useState(null)
  const [discipline, setDiscipline]   = useState('')
  const [program, setProgram]         = useState('')
  const [docType, setDocType]         = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [dragOver, setDragOver]       = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { loadDocuments() }, [])

  async function loadDocuments() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/integrations/rag-documents/')
      setDocuments(data.documents || [])
      setDocumentsLoaded(true)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Failed to load knowledge documents.')
    } finally {
      setLoading(false)
    }
  }

  const categories = ['All', ...new Set(documents.map(doc => doc.doc_type).filter(Boolean))]

  const filtered = documents.filter(doc => {
    const q = searchTerm.toLowerCase()
    const matchSearch = !q
      || (doc.title || '').toLowerCase().includes(q)
      || (doc.discipline || '').toLowerCase().includes(q)
      || (doc.program || '').toLowerCase().includes(q)
      || (doc.doc_type || '').toLowerCase().includes(q)
      || (doc.description || '').toLowerCase().includes(q)
    const matchCat = activeCategory === 'All' || doc.doc_type === activeCategory
    return matchSearch && matchCat
  })

  function handleFileSelect(selectedFile) {
    if (!selectedFile) return
    setFile(selectedFile)
    setError('')
    setNotice('')
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFileSelect(e.dataTransfer.files?.[0])
  }

  function resetForm() {
    setFile(null)
    setDiscipline('')
    setProgram('')
    setDocType('')
    setDragOver(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleModalClose() {
    setCreateOpen(false)
    resetForm()
  }

  async function handleUpload() {
    setError('')
    setNotice('')

    if (!file) {
      setError('Please select a PDF or DOCX file to upload.')
      return
    }
    const fileType = detectFileType(file)
    if (!fileType) {
      setError('Unsupported file type. Upload a PDF or DOCX file.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('file_type', fileType)
    formData.append('discipline', discipline.trim())
    formData.append('program', program.trim())
    formData.append('doc_type', docType.trim())

    setSubmitting(true)
    try {
      await api.post('/integrations/upload-global-rag-document/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 1200000,
      })
      setNotice('Document uploaded and indexed successfully.')
      handleModalClose()
      await loadDocuments()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Failed to upload document.')
    } finally {
      setSubmitting(false)
    }
  }

  const totalChunks = documents.reduce((sum, d) => sum + (d.total_chunks || 0), 0)
  return (
    <AdminLayout>
      <PageHeader
        title="Knowledge Base"
        subtitle="Manage institution documents used for knowledge retrieval"
        action={<PrimaryBtn onClick={() => setCreateOpen(true)}><AddIcon fontSize="small" /> Upload File</PrimaryBtn>}
      />

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard title="Total Documents" value={documentsLoaded ? documents.length : '—'} icon="📚" accent="#86EFAC" />
        <StatCard title="Indexed Chunks"  value={documentsLoaded ? totalChunks : '—'}       icon="🧩" accent="#FFB74D" />
      </div>

      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField placeholder="Search documents…" size="small" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} sx={{ ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                background: activeCategory === cat ? 'linear-gradient(135deg,#15803D,#16A34A)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${activeCategory === cat ? 'rgba(22,163,74,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 8, padding: '5px 13px',
                color: activeCategory === cat ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'var(--font-sans)', transition: 'all 200ms',
              }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span>📋</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
            INDEXED DOCUMENTS ({filtered.length})
          </span>
        </div>
        {loading ? (
          <GlassCard><div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>Loading documents…</div></GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard><div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
            {!documentsLoaded ? 'Documents could not be loaded.' : documents.length ? 'No documents match your search.' : 'No documents have been uploaded for this institution.'}
          </div></GlassCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {filtered.map(doc => (
              <DocumentCard key={doc.document_id} doc={doc} onView={() => { setSelected(doc); setViewOpen(true) }} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>{selected?.title}</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
          {selected && (
            <Stack spacing={2}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <CategoryBadge cat={selected.doc_type} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{selected.discipline || 'No discipline'}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>· {selected.program || 'No program'}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>· {selected.total_chunks || 0} chunks</span>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {selected.description || 'This document has been indexed into the knowledge base and is available for RAG retrieval.'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                Uploaded {selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}
              </div>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setViewOpen(false)}>Close</OutlineBtn>
        </DialogActions>
      </Dialog>

      <Dialog open={createOpen} onClose={handleModalClose} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Upload Knowledge Base Document</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            <div>
              <div style={{ margin: '0 0 8px', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                ATTACH FILE (PDF or DOCX)
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                style={{ display: 'none' }}
                onChange={e => handleFileSelect(e.target.files?.[0])}
              />
              {file ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.3)',
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <InsertDriveFileIcon sx={{ color: '#38BDF8', fontSize: 20, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>{formatFileSize(file.size)}</div>
                  </div>
                  <button onClick={resetForm} title="Remove file"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', padding: 2 }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? 'rgba(56,189,248,0.6)' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 12, padding: '22px 16px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    cursor: 'pointer',
                    background: dragOver ? 'rgba(56,189,248,0.06)' : 'rgba(255,255,255,0.02)',
                    transition: 'all 200ms',
                  }}
                >
                  <UploadFileIcon sx={{ fontSize: 32, color: dragOver ? '#38BDF8' : 'rgba(255,255,255,0.25)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: dragOver ? '#38BDF8' : 'var(--text-secondary)' }}>
                      Drop a file here or <span style={{ color: '#38BDF8', textDecoration: 'underline' }}>browse</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 3 }}>PDF or Word (.docx)</div>
                  </div>
                </div>
              )}
            </div>

            <Divider sx={{ borderColor: 'var(--border-color)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', padding: '0 8px' }}>DOCUMENT DETAILS</span>
            </Divider>

            <TextField label="Discipline" value={discipline} onChange={e => setDiscipline(e.target.value)} fullWidth size="small" placeholder="Optional discipline" sx={inputSx} />
            <TextField label="Program" value={program} onChange={e => setProgram(e.target.value)} fullWidth size="small" placeholder="Optional program" sx={inputSx} />
            <TextField label="Document Type" value={docType} onChange={e => setDocType(e.target.value)}
              fullWidth size="small" sx={inputSx} />

            {submitting && (
              <div>
                <LinearProgress
                  variant="indeterminate"
                  sx={{
                    height: 10, borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    '& .MuiLinearProgress-bar': { borderRadius: 999, background: 'linear-gradient(135deg,#15803D,#16A34A)' },
                  }}
                />
              </div>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={handleModalClose} disabled={submitting}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleUpload} disabled={submitting || !file}>
            {submitting ? 'Uploading…' : 'Upload and Index'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  )
}

function DocumentCard({ doc, onView }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onView}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(255,255,255,0.07)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.15)' : 'var(--border-color)'}`,
        borderRadius: 16, padding: '16px 18px',
        backdropFilter: 'blur(16px)', cursor: 'pointer',
        transition: 'all 200ms',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <CategoryBadge cat={doc.doc_type} />
        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{doc.total_chunks || 0} chunks</span>
      </div>
      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {doc.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)' }}>{doc.discipline || 'No discipline'}</span>
        <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)' }}>
          {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
        </span>
      </div>
    </div>
  )
}