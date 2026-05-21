// src/features/Admin/KnowledgeBase.jsx
import { useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Divider, Stack,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import AdminLayout from './AdminLayout'
import { PageHeader, GlassCard, StatCard, StatusChip, PrimaryBtn, OutlineBtn } from '../../../components/ui'

const mockArticles = [
  { id: 1,  title: 'How to create an OBE-compliant syllabus',           category: 'Syllabus',    author: 'ATLAS Team', views: 142, updated: '2026-05-08', pinned: true  },
  { id: 2,  title: 'Connecting Google Sheets for gradebook sync',        category: 'Integration', author: 'ATLAS Team', views: 98,  updated: '2026-05-06', pinned: false },
  { id: 3,  title: 'Bloom\'s Taxonomy tagging guide',                    category: 'Assessment',  author: 'Admin Smoke', views: 76, updated: '2026-05-04', pinned: true  },
  { id: 4,  title: 'Setting up faculty accounts and permissions',        category: 'Admin',       author: 'Admin Smoke', views: 61, updated: '2026-05-01', pinned: false },
  { id: 5,  title: 'Generating assessments from ILOs',                   category: 'Assessment',  author: 'ATLAS Team', views: 54,  updated: '2026-04-28', pinned: false },
  { id: 6,  title: 'Understanding the prescriptive analytics dashboard', category: 'Analytics',   author: 'ATLAS Team', views: 49,  updated: '2026-04-25', pinned: false },
  { id: 7,  title: 'CHED OBE compliance checklist',                      category: 'Compliance',  author: 'Admin Smoke', views: 38, updated: '2026-04-20', pinned: false },
  { id: 8,  title: 'Uploading course materials and reference files',     category: 'Files',       author: 'Admin Smoke', views: 27, updated: '2026-04-18', pinned: false },
]

const CATEGORIES = ['All', 'Syllabus', 'Assessment', 'Integration', 'Analytics', 'Admin', 'Compliance', 'Files']

const catColor = c => ({
  Syllabus:    { bg: 'rgba(192,57,43,0.14)', border: 'rgba(192,57,43,0.35)', color: '#FF6B6B' },
  Assessment:  { bg: 'rgba(10,132,255,0.12)', border: 'rgba(10,132,255,0.3)', color: '#60AAFF' },
  Integration: { bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.3)', color: '#5EDA7E' },
  Analytics:   { bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.3)', color: '#FFB74D' },
  Admin:       { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', color: '#C084FC' },
  Compliance:  { bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)', color: '#FB923C' },
  Files:       { bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)', color: '#38BDF8' },
}[c] || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' })

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiSelect-select': { color: 'var(--text-primary)' }
}

export default function AdminKnowledgeBase() {
  const [articles, setArticles]       = useState(mockArticles)
  const [searchTerm, setSearchTerm]   = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [createOpen, setCreateOpen]   = useState(false)
  const [viewOpen, setViewOpen]       = useState(false)
  const [selected, setSelected]       = useState(null)
  const [newArticle, setNewArticle]   = useState({ title: '', category: 'Syllabus', content: '' })

  const filtered = articles.filter(a => {
    const q = searchTerm.toLowerCase()
    const matchSearch = a.title.toLowerCase().includes(q) || a.author.toLowerCase().includes(q)
    const matchCat    = activeCategory === 'All' || a.category === activeCategory
    return matchSearch && matchCat
  })

  function handleCreate() {
    if (!newArticle.title.trim()) return
    const created = { id: articles.length + 1, ...newArticle, author: 'Admin Smoke', views: 0, updated: new Date().toISOString().split('T')[0], pinned: false }
    setArticles(a => [created, ...a])
    setCreateOpen(false)
    setNewArticle({ title: '', category: 'Syllabus', content: '' })
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Knowledge Base"
        subtitle="Institutional guides, references, and how-to articles for your faculty"
        action={<PrimaryBtn onClick={() => setCreateOpen(true)}><AddIcon fontSize="small" />UPLOAD FILE</PrimaryBtn>}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard title="Total Documents"  value={articles.length}                              icon="📚" accent="#FF6B6B" />
        <StatCard title="Pinned"          value={articles.filter(a=>a.pinned).length}           icon="📌" accent="#FFB74D" />
        <StatCard title="Total Views"     value={articles.reduce((s,a)=>s+a.views,0)}           icon="👁️" accent="#60AAFF" />
        <StatCard title="Categories"      value={CATEGORIES.length - 1}                         icon="🗂️" accent="#5EDA7E" />
      </div>

      {/* Search + category filter */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField placeholder="Search articles…" size="small" value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)} sx={{ ...inputSx }}
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--text-secondary)', fontSize: 18 }} /> }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                background: activeCategory === cat ? 'linear-gradient(135deg,#8B0000,#C0392B)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${activeCategory === cat ? 'rgba(192,57,43,0.5)' : 'rgba(255,255,255,0.1)'}`,
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

      {/* Pinned articles */}
      {filtered.some(a => a.pinned) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span>📌</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>PINNED</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {filtered.filter(a => a.pinned).map(a => <ArticleCard key={a.id} article={a} onView={() => { setSelected(a); setViewOpen(true) }} />)}
          </div>
        </div>
      )}

      {/* All articles */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span>📋</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}>
            INDEXED DOCUMENTS ({filtered.filter(a => !a.pinned).length})
          </span>
        </div>
        {filtered.filter(a => !a.pinned).length === 0 ? (
          <GlassCard>
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>No articles found.</div>
          </GlassCard>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 12 }}>
            {filtered.filter(a => !a.pinned).map(a => <ArticleCard key={a.id} article={a} onView={() => { setSelected(a); setViewOpen(true) }} />)}
          </div>
        )}
      </div>

      {/* View dialog */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>{selected?.title}</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 2.5, bgcolor: 'var(--bg-card)' }}>
          {selected && (
            <Stack spacing={2}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <CategoryBadge cat={selected.category} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>by {selected.author}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>· Updated {selected.updated}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>· {selected.views} views</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
                This article covers <strong style={{ color: 'var(--text-primary)' }}>{selected.title.toLowerCase()}</strong>.
                Detailed content would be loaded from the backend. This is a placeholder for the full article body,
                including step-by-step instructions, screenshots, and FAQs relevant to your institution's ATLAS usage.
              </p>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setViewOpen(false)}>Close</OutlineBtn>
        </DialogActions>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--bg-card) !important', backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>New Knowledge Base Article</DialogTitle>
        <Divider sx={{ borderColor: 'var(--border-color)' }} />
        <DialogContent sx={{ pt: 3, bgcolor: 'var(--bg-card)' }}>
          <Stack spacing={2.2}>
            <TextField label="Discipline" value={newArticle.discipline} onChange={e => setNewArticle({ ...newArticle, discipline: e.target.value })} fullWidth size="small" sx={inputSx} />
            <TextField label="Program" value={newArticle.program} onChange={e => setNewArticle({ ...newArticle, program: e.target.value })} fullWidth size="small" sx={inputSx} />
            <TextField label="Document Title" value={newArticle.title} onChange={e => setNewArticle({ ...newArticle, title: e.target.value })} fullWidth size="small" sx={inputSx} />
            <TextField select label="Category" value={newArticle.category} onChange={e => setNewArticle({ ...newArticle, category: e.target.value })}
              SelectProps={{ native: true }} fullWidth size="small" sx={inputSx}>
              {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
            </TextField>
            <TextField label="Content" value={newArticle.content} onChange={e => setNewArticle({ ...newArticle, content: e.target.value })}
              multiline rows={6} fullWidth size="small" placeholder="Write your article content here…" sx={inputSx} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1, bgcolor: 'var(--bg-card)' }}>
          <OutlineBtn onClick={() => setCreateOpen(false)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={handleCreate}>Publish Document</PrimaryBtn>
        </DialogActions>
      </Dialog>
    </AdminLayout>
  )
}

// ── Article card ──────────────────────────────────────────────────────────────
function ArticleCard({ article, onView }) {
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
        <CategoryBadge cat={article.category} />
        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{article.views} views</span>
      </div>
      <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4, marginBottom: 8 }}>
        {article.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)' }}>by {article.author}</span>
        <span style={{ fontSize: '0.73rem', color: 'var(--text-tertiary)' }}>{article.updated}</span>
      </div>
    </div>
  )
}

function CategoryBadge({ cat }) {
  const c = { Syllabus: { bg: 'rgba(192,57,43,0.14)', border: 'rgba(192,57,43,0.35)', color: '#FF6B6B' }, Assessment: { bg: 'rgba(10,132,255,0.12)', border: 'rgba(10,132,255,0.3)', color: '#60AAFF' }, Integration: { bg: 'rgba(52,199,89,0.12)', border: 'rgba(52,199,89,0.3)', color: '#5EDA7E' }, Analytics: { bg: 'rgba(255,159,10,0.12)', border: 'rgba(255,159,10,0.3)', color: '#FFB74D' }, Admin: { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', color: '#C084FC' }, Compliance: { bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)', color: '#FB923C' }, Files: { bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.3)', color: '#38BDF8' } }[cat] || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 7, padding: '3px 9px', fontSize: '0.7rem', fontWeight: 700, color: c.color, letterSpacing: '0.04em', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
      {cat}
    </span>
  )
}