// src/features/roles/Admin/KnowledgeBased.jsx
// Tenant Admin Knowledge Base — uploads global RAG documents (CHED handbooks,
// institution-wide references) and lists what has been indexed.
//
// The "Upload File" button drives the real backend process:
//   POST /integrations/upload-global-rag-document/  (multipart, returns 202 while indexing)
//   GET  /integrations/rag-documents/               (documents + PROCESSING/READY/FAILED status)

import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Stack, LinearProgress, IconButton, TablePagination,
} from '@mui/material'
import { StatusNotice } from '../../../components/StatusNotice'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import { BookOpen, ClipboardList } from 'lucide-react'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import useDebouncedValue from '../../../hooks/useDebouncedValue'
import RouteSkeleton from '../../../components/RouteSkeleton'
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

const POLL_INTERVAL_MS = 4000

function apiErrorMessage(err, fallback) {
  const data = err.response?.data
  if (data?.error) return data.error
  if (data?.detail) return data.detail
  if (data?.errors && typeof data.errors === 'object') {
    const first = Object.entries(data.errors)[0]
    if (first) return `${first[0]}: ${[].concat(first[1]).join(' ')}`
  }
  return fallback
}

function normalizeDocTypeLabel(value) {
  const raw = (value || '').toString().trim()
  if (!raw) return 'Uncategorized'

  const mapping = {
    CHED_Handbook: 'CHED Handbook',
    CHED_Handbook_for_OBE: 'CHED Handbook for OBE',
    CHED_Handbook_on_Topology: 'CHED Handbook on Topology',
    Handbook_on_Typology: 'Handbook on Typology',
    OBE_Handbook_on_Typology: 'OBE Handbook on Typology',
    Institution_Knowledge_Base: 'Institution Knowledge Base',
    Syllabus: 'Syllabus',
    Assessment: 'Assessment',
    Policy: 'Policy',
    Reference: 'Reference',
    Files: 'Files',
  }

  return mapping[raw] || raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
}

const CAT_STYLE = {
  CHED_Handbook: { bg: 'rgba(170,36,35,0.14)', border: 'rgba(170,36,35,0.35)', color: '#E24B4A' },
  Syllabus:      { bg: 'rgba(10,132,255,0.12)', border: 'rgba(10,132,255,0.3)', color: '#60AAFF' },
  Assessment:    { bg: 'rgba(10,132,255,0.12)', border: 'rgba(10,132,255,0.3)', color: '#60AAFF' },
  Policy:        { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', color: '#C084FC' },
  Reference:     { bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.3)', color: '#5EDA7E' },
  Files:         { bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)', color: '#38BDF8' },
}

function CategoryBadge({ cat }) {
  const label = normalizeDocTypeLabel(cat)
  const c = CAT_STYLE[cat] || CAT_STYLE[label] || { bg: 'var(--shell-btn-bg)', border: 'var(--shell-btn-border)', color: 'var(--text-secondary)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 7, padding: '3px 9px', fontSize: '0.7rem', fontWeight: 700, color: c.color, letterSpacing: '0.04em', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

export default function AdminKnowledgeBase() {
  const [documents, setDocuments]     = useState([])
  const [documentsLoaded, setDocumentsLoaded] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [searchTerm, setSearchTerm]   = useState('')
  const [page, setPage]               = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(9)
  const debouncedSearch = useDebouncedValue(searchTerm, 250)
  const [activeCategory, setActiveCategory] = useState('All')
  const [createOpen, setCreateOpen]   = useState(false)
  const [viewOpen, setViewOpen]       = useState(false)
  const [selected, setSelected]       = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]       = useState(false)
  const [error, setError]             = useState('')
  const [notice, setNotice]           = useState('')

  const [file, setFile]               = useState(null)
  const [discipline, setDiscipline]   = useState('')
  const [program, setProgram]         = useState('')
  const [docType, setDocType]         = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [dragOver, setDragOver]       = useState(false)
  const fileInputRef = useRef(null)
  const prevStatusRef = useRef({})

  useEffect(() => { loadDocuments() }, [])

  const hasProcessing = documents.some(doc => doc.status === 'PROCESSING')
  useEffect(() => {
    if (!hasProcessing) return undefined
    const timer = setTimeout(() => loadDocuments({ silent: true }), POLL_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [hasProcessing, documents])

  async function loadDocuments({ silent = false } = {}) {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const { data } = await api.get('/integrations/rag-documents/')
      const docs = data.documents || []
      announceFinishedIndexing(docs)
      setDocuments(docs)
      setDocumentsLoaded(true)
    } catch (err) {
      if (!silent) setError(apiErrorMessage(err, 'Failed to load knowledge documents.'))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  function announceFinishedIndexing(docs) {
    const prev = prevStatusRef.current
    for (const doc of docs) {
      if (prev[doc.document_id] !== 'PROCESSING') continue
      if (doc.status === 'READY') setNotice(`"${doc.title}" is indexed and ready for retrieval.`)
      if (doc.status === 'FAILED') setError(`Indexing failed for "${doc.title}": ${doc.error_message || 'unknown error'}`)
    }
    prevStatusRef.current = Object.fromEntries(docs.map(doc => [doc.document_id, doc.status]))
  }

  async function handleDeleteDocument() {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    setNotice('')
    try {
      await api.delete(`/integrations/rag-documents/${deleteTarget.document_id}/delete/`)
      setDocuments(current => current.filter(doc => doc.document_id !== deleteTarget.document_id))
      setNotice(`"${deleteTarget.title}" was removed from the knowledge base.`)
      if (selected?.document_id === deleteTarget.document_id) {
        setViewOpen(false)
        setSelected(null)
      }
      setDeleteTarget(null)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete document.'))
    } finally {
      setDeleting(false)
    }
  }

  const categories = ['All', ...new Set(documents.map(doc => normalizeDocTypeLabel(doc.doc_type_label || doc.doc_type)).filter(Boolean))]

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, activeCategory])

  const filtered = documents.filter(doc => {
    const q = debouncedSearch.toLowerCase()
    const docTypeLabel = normalizeDocTypeLabel(doc.doc_type_label || doc.doc_type)
    const matchSearch = !q
      || (doc.title || '').toLowerCase().includes(q)
      || (doc.discipline || '').toLowerCase().includes(q)
      || (doc.program || '').toLowerCase().includes(q)
      || docTypeLabel.toLowerCase().includes(q)
      || (doc.description || '').toLowerCase().includes(q)
    const matchCat = activeCategory === 'All' || docTypeLabel === activeCategory
    return matchSearch && matchCat
  })
  const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1)
  const safePage = Math.min(page, maxPage)
  const pageDocs = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage)

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
        timeout: 300000,
      })
      setNotice(`"${file.name}" uploaded. Indexing runs in the background — it will show as ready here when done.`)
      handleModalClose()
      await loadDocuments({ silent: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to upload document.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Knowledge Base"
        subtitle="Manage institution documents used for knowledge retrieval"
        action={<PrimaryBtn onClick={() => setCreateOpen(true)}><AddIcon fontSize="small" /> Upload File</PrimaryBtn>}
      />

      <StatusNotice message={error} severity="error" />
      <StatusNotice message={notice} severity="success" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 360px)', gap: 14, marginBottom: 20 }}>
        <StatCard title="Total Documents" value={documentsLoaded ? documents.length : '—'} icon={<BookOpen size={18} color="#E24B4A" />} accent="#E24B4A" />
      </div>

      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField placeholder="Search documents…" size="small" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} sx={{ flex: '1 1 260px', ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                background: activeCategory === cat ? 'linear-gradient(135deg,#8E1C1B,#AA2423)' : 'var(--shell-btn-bg)',
                border: `1px solid ${activeCategory === cat ? 'rgba(170,36,35,0.5)' : 'var(--border-color)'}`,
                borderRadius: 8, padding: '5px 13px',
                color: activeCategory === cat ? '#fff' : 'var(--text-secondary)',
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
          <ClipboardList size={16} color="var(--text-tertiary)" aria-hidden="true" />
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
            INDEXED DOCUMENTS ({filtered.length})
          </span>
        </div>
        {loading ? (
          <RouteSkeleton compact />
        ) : filtered.length === 0 ? (
          <GlassCard><div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
            {!documentsLoaded ? 'Documents could not be loaded.' : documents.length ? 'No documents match your search.' : 'No documents have been uploaded for this institution.'}
          </div></GlassCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {pageDocs.map(doc => (
              <DocumentCard key={doc.document_id} doc={doc}
                onView={() => { setSelected(doc); setViewOpen(true) }}
                onDelete={() => setDeleteTarget(doc)} />
            ))}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <TablePagination
            component="div"
            rowsPerPageOptions={[9, 18, 36]}
            count={filtered.length}
            rowsPerPage={rowsPerPage}
            page={safePage}
            onPageChange={(_, nextPage) => setPage(nextPage)}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10))
              setPage(0)
            }}
            sx={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-secondary)', mt: 1 }}
          />
        )}
      </div>

      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>{selected?.title}</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
          {selected && (
            <Stack spacing={2}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <CategoryBadge cat={selected.doc_type_label || selected.doc_type} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{selected.discipline || 'No discipline'}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>· {selected.program || 'No program'}</span>
                {(selected.status === 'PROCESSING' || selected.status === 'FAILED') && (
                  <>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>·</span>
                    <IndexStatus doc={selected} />
                  </>
                )}
              </div>
              {selected.status === 'FAILED' ? (
                <StatusNotice message={`${selected.error_message || 'Indexing failed.'} Upload the file again to retry.`} severity="error" />
              ) : (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {selected.description || (selected.status === 'PROCESSING'
                    ? 'This document is being indexed. It will be available for RAG retrieval when indexing finishes.'
                    : 'This document has been indexed into the knowledge base and is available for RAG retrieval.')}
                </div>
              )}
              <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                Uploaded {selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}
              </div>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'var(--bg-card)', justifyContent: 'space-between' }}>
          <OutlineBtn onClick={() => setDeleteTarget(selected)} disabled={!selected}
            style={{ color: '#F87171', borderColor: 'rgba(248,113,113,0.45)' }}>
            <DeleteOutlinedIcon sx={{ fontSize: 17 }} /> Delete
          </OutlineBtn>
          <OutlineBtn onClick={() => setViewOpen(false)}>Close</OutlineBtn>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!deleting) setDeleteTarget(null) }}
        maxWidth="xs" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Delete document?</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
          <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            This permanently removes{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget?.title}</strong>{' '}
            from the knowledge base. Retrieval and syllabi that reference it will no longer
            find its content. This cannot be undone.
          </div>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</OutlineBtn>
          <OutlineBtn onClick={handleDeleteDocument} disabled={deleting}
            style={{ color: '#F87171', borderColor: 'rgba(248,113,113,0.45)', background: 'rgba(248,113,113,0.08)' }}>
            {deleting ? 'Deleting…' : 'Delete Document'}
          </OutlineBtn>
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
                    border: `2px dashed ${dragOver ? 'rgba(56,189,248,0.6)' : 'var(--shell-btn-border)'}`,
                    borderRadius: 12, padding: '22px 16px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    cursor: 'pointer',
                    background: dragOver ? 'rgba(56,189,248,0.06)' : 'var(--bg-header)',
                    transition: 'all 200ms',
                  }}
                >
                  <UploadFileIcon sx={{ fontSize: 32, color: dragOver ? '#38BDF8' : 'var(--text-tertiary)' }} />
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
                    backgroundColor: 'var(--shell-hover-bg)',
                    '& .MuiLinearProgress-bar': { borderRadius: 999, background: 'linear-gradient(135deg,#8E1C1B,#AA2423)' },
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

function IndexStatus({ doc }) {
  const base = { fontSize: '0.72rem', whiteSpace: 'nowrap', fontWeight: 700 }
  if (doc.status === 'PROCESSING') {
    return <span style={{ ...base, color: '#FFB74D' }}>Indexing…</span>
  }
  if (doc.status === 'FAILED') {
    return <span style={{ ...base, color: '#F87171' }} title={doc.error_message || ''}>Failed</span>
  }
  return null
}

function DocumentCard({ doc, onView, onDelete }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onView}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--border-color)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--shell-btn-border)' : 'var(--border-color)'}`,
        borderRadius: 16, padding: '16px 18px',
        backdropFilter: 'blur(16px)', cursor: 'pointer',
        transition: 'all 200ms',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <CategoryBadge cat={doc.doc_type_label || doc.doc_type} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <IndexStatus doc={doc} />
          <IconButton
            aria-label={`Delete ${doc.title}`}
            size="small"
            onClick={event => { event.stopPropagation(); onDelete() }}
            sx={{ p: 0.5, color: 'var(--text-tertiary)', '&:hover': { color: '#F87171', background: 'rgba(248,113,113,0.08)' } }}
          >
            <DeleteOutlinedIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </div>
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