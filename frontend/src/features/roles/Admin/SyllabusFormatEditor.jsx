// Split editor: left = clickable DOCX preview, right = sections list.
// Flow: click a block → add/select section → click again → place content region.

import { useMemo, useState } from 'react'
import { Alert, Stack, TextField, Typography, FormControlLabel, Switch } from '@mui/material'
import { OutlineBtn } from '../../../components/ui'
import { BUILTIN_SYLLABUS_EDITORS } from './academicApi'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
}

function slug(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function regionRole(fieldMap, blockId) {
  const sections = fieldMap?.sections || []
  for (const section of sections) {
    if (section.title_region_id === blockId) return { role: 'title', section, subsection: null }
    if (section.content_region_id === blockId) return { role: 'content', section, subsection: null }
    for (const sub of section.subsections || []) {
      if (sub.title_region_id === blockId) return { role: 'title', section, subsection: sub }
      if (sub.content_region_id === blockId) return { role: 'content', section, subsection: sub }
    }
  }
  return null
}

export default function SyllabusFormatEditor({
  blocks,
  fieldMap,
  onFieldMapChange,
  templateName,
  onUpload,
  uploading,
  uploadMessage,
  uploadSeverity,
}) {
  const [clickMode, setClickMode] = useState('section') // section | content | subsection | subsection_content
  const [selectedKey, setSelectedKey] = useState('')
  const [selectedSubKey, setSelectedSubKey] = useState('')
  const [hint, setHint] = useState('Click a heading or block on the left to add it as a section.')

  const sections = fieldMap?.sections || []
  const selectedSection = sections.find(s => s.key === selectedKey) || null
  const selectedSubsection = (selectedSection?.subsections || []).find(s => s.key === selectedSubKey) || null

  const mappedIds = useMemo(() => {
    const ids = new Set()
    for (const section of sections) {
      if (section.title_region_id) ids.add(section.title_region_id)
      if (section.content_region_id) ids.add(section.content_region_id)
      for (const sub of section.subsections || []) {
        if (sub.title_region_id) ids.add(sub.title_region_id)
        if (sub.content_region_id) ids.add(sub.content_region_id)
      }
    }
    return ids
  }, [sections])

  function updateSections(nextSections) {
    onFieldMapChange({ ...(fieldMap || {}), version: 1, sections: nextSections })
  }

  function handleBlockClick(block) {
    if (!block?.id) return
    const existing = regionRole(fieldMap, block.id)

    if (clickMode === 'section') {
      if (existing?.role === 'title' && existing.section && !existing.subsection) {
        setSelectedKey(existing.section.key)
        setSelectedSubKey('')
        setClickMode('content')
        setHint(`Selected “${existing.section.label}”. Now click where its content should be written.`)
        return
      }
      if (existing) {
        setHint('That block is already mapped. Select a free block, or choose a section on the right.')
        return
      }
      const label = (block.text || 'Section').split('\n')[0].slice(0, 120)
      let key = slug(label) || `section-${sections.length + 1}`
      const used = new Set(sections.map(s => s.key))
      let n = 2
      while (used.has(key)) {
        key = `${slug(label)}-${n}`
        n += 1
      }
      const next = {
        key,
        label,
        enabled: true,
        is_static: false,
        static_content: '',
        table_enabled: block.kind === 'table',
        table_columns: block.kind === 'table' && Array.isArray(block.rows?.[0]) ? block.rows[0] : [],
        subsections: [],
        title_region_id: block.id,
        content_region_id: '',
        editor: null,
      }
      updateSections([...sections, next])
      setSelectedKey(key)
      setSelectedSubKey('')
      setClickMode('content')
      setHint(`Added “${label}”. Now click the area on the left where faculty content for this section should go.`)
      return
    }

    if (clickMode === 'content') {
      if (!selectedSection) {
        setClickMode('section')
        setHint('Select or add a section first.')
        return
      }
      if (existing && !(existing.section.key === selectedKey && existing.role === 'content' && !existing.subsection)) {
        if (block.id === selectedSection.title_region_id) {
          setHint('Pick a different block for content (not the section title).')
          return
        }
        setHint('That block is already used. Click an unmapped block for content placement.')
        return
      }
      updateSections(sections.map(section => (
        section.key === selectedKey
          ? {
              ...section,
              content_region_id: block.id,
              table_enabled: block.kind === 'table' ? true : section.table_enabled,
              table_columns: block.kind === 'table' && Array.isArray(block.rows?.[0])
                ? block.rows[0]
                : section.table_columns,
            }
          : section
      )))
      setClickMode('section')
      setHint(`Content for “${selectedSection.label}” placed. Click another block to add the next section.`)
      return
    }

    if (clickMode === 'subsection') {
      if (!selectedSection) {
        setClickMode('section')
        setHint('Select a section on the right before adding subsections.')
        return
      }
      if (existing) {
        if (existing.subsection && existing.section.key === selectedKey) {
          setSelectedSubKey(existing.subsection.key)
          setClickMode('subsection_content')
          setHint(`Selected subsection “${existing.subsection.label}”. Click where its content goes.`)
          return
        }
        setHint('That block is already mapped.')
        return
      }
      const label = (block.text || 'Subsection').split('\n')[0].slice(0, 120)
      const subs = Array.isArray(selectedSection.subsections) ? selectedSection.subsections : []
      let key = slug(label) || `subsection-${subs.length + 1}`
      const used = new Set(subs.map(s => s.key))
      let n = 2
      while (used.has(key)) {
        key = `${slug(label)}-${n}`
        n += 1
      }
      const nextSub = {
        key,
        label,
        required: false,
        table_enabled: block.kind === 'table',
        table_columns: block.kind === 'table' && Array.isArray(block.rows?.[0]) ? block.rows[0] : [],
        title_region_id: block.id,
        content_region_id: '',
      }
      updateSections(sections.map(section => (
        section.key === selectedKey
          ? { ...section, subsections: [...subs, nextSub] }
          : section
      )))
      setSelectedSubKey(key)
      setClickMode('subsection_content')
      setHint(`Added subsection “${label}”. Now click where its content should be written.`)
      return
    }

    if (clickMode === 'subsection_content') {
      if (!selectedSection || !selectedSubsection) {
        setClickMode('subsection')
        return
      }
      if (existing && !(existing.subsection?.key === selectedSubKey && existing.role === 'content')) {
        setHint('That block is already used. Click an unmapped block for subsection content.')
        return
      }
      updateSections(sections.map(section => {
        if (section.key !== selectedKey) return section
        return {
          ...section,
          subsections: (section.subsections || []).map(sub => (
            sub.key === selectedSubKey
              ? {
                  ...sub,
                  content_region_id: block.id,
                  table_enabled: block.kind === 'table' ? true : sub.table_enabled,
                  table_columns: block.kind === 'table' && Array.isArray(block.rows?.[0])
                    ? block.rows[0]
                    : sub.table_columns,
                }
              : sub
          )),
        }
      }))
      setClickMode('subsection')
      setHint(`Content for subsection “${selectedSubsection.label}” placed. Click to add another subsection, or switch to Section mode.`)
    }
  }

  function updateSelectedSection(changes) {
    if (!selectedKey) return
    updateSections(sections.map(section => (section.key === selectedKey ? { ...section, ...changes } : section)))
  }

  function removeSelectedSection() {
    if (!selectedKey) return
    updateSections(sections.filter(section => section.key !== selectedKey))
    setSelectedKey('')
    setSelectedSubKey('')
    setClickMode('section')
    setHint('Section removed. Click a block to add another.')
  }

  function removeSelectedSubsection() {
    if (!selectedKey || !selectedSubKey) return
    updateSections(sections.map(section => (
      section.key === selectedKey
        ? { ...section, subsections: (section.subsections || []).filter(sub => sub.key !== selectedSubKey) }
        : section
    )))
    setSelectedSubKey('')
    setClickMode('subsection')
  }

  const modeLabel = {
    section: 'Click preview → add section',
    content: 'Click preview → place section content',
    subsection: 'Click preview → add subsection',
    subsection_content: 'Click preview → place subsection content',
  }[clickMode]

  return (
    <Stack spacing={1.5} sx={{ minHeight: 420 }}>
      <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
        Upload a syllabus sample (.docx preferred; .pdf and .xlsx are converted to an editable DOCX).
        Click blocks on the left to add sections, then click again to place where content is written on export.
      </Typography>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <OutlineBtn small disabled={uploading} onClick={() => document.getElementById('syllabus-docx-preview-input')?.click()}>
          {uploading ? 'Loading template…' : (templateName ? 'Replace template' : 'Upload template (DOCX / PDF / Excel)')}
        </OutlineBtn>
        <input
          id="syllabus-docx-preview-input"
          hidden
          type="file"
          accept=".docx,.pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={e => { onUpload(e.target.files?.[0]); e.target.value = '' }}
        />
        {templateName && (
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Template: {templateName}</Typography>
        )}
      </Stack>

      {uploadMessage && (
        <Alert severity={uploadSeverity || 'info'}>{uploadMessage}</Alert>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <OutlineBtn small onClick={() => { setClickMode('section'); setHint('Click a block to add or select a section.') }}
          style={clickMode === 'section' || clickMode === 'content' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
          Section mode
        </OutlineBtn>
        <OutlineBtn small disabled={!selectedSection} onClick={() => { setClickMode('subsection'); setHint('Click a block to add a subsection under the selected section.') }}
          style={clickMode === 'subsection' || clickMode === 'subsection_content' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
          Subsection mode
        </OutlineBtn>
        {selectedSection && (
          <OutlineBtn small onClick={() => { setClickMode('content'); setHint(`Click where content for “${selectedSection.label}” should go.`) }}>
            Place content for selected
          </OutlineBtn>
        )}
      </Stack>
      <Typography sx={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600 }}>{modeLabel}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{hint}</Typography>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, minHeight: 360 }}>
        {/* LEFT: preview */}
        <div style={{
          border: '1px solid var(--border-color)', borderRadius: 8, padding: 12,
          overflow: 'auto', maxHeight: 480, background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
        }}>
          {!blocks?.length && (
            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
              Upload a .docx to see the clickable preview.
            </Typography>
          )}
          {(blocks || []).map(block => {
            const mapped = mappedIds.has(block.id)
            const role = regionRole(fieldMap, block.id)
            const isTitle = role?.role === 'title'
            const isContent = role?.role === 'content'
            const isSelectedTitle = selectedSection?.title_region_id === block.id
              || selectedSubsection?.title_region_id === block.id
            const isSelectedContent = selectedSection?.content_region_id === block.id
              || selectedSubsection?.content_region_id === block.id
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => handleBlockClick(block)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 6,
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  border: isSelectedTitle || isSelectedContent
                    ? '1px solid var(--accent)'
                    : mapped
                      ? '1px solid rgba(134,239,172,0.45)'
                      : '1px solid transparent',
                  background: isSelectedContent
                    ? 'rgba(134,239,172,0.18)'
                    : isSelectedTitle
                      ? 'rgba(96,165,250,0.18)'
                      : isContent
                        ? 'rgba(134,239,172,0.08)'
                        : isTitle
                          ? 'rgba(96,165,250,0.08)'
                          : 'transparent',
                  color: 'var(--text-primary)',
                  fontWeight: block.kind === 'heading' ? 700 : 400,
                  fontSize: block.kind === 'heading' ? (block.level <= 1 ? '1rem' : '0.9rem') : '0.82rem',
                }}
              >
                <span style={{ opacity: 0.45, fontSize: '0.68rem', marginRight: 6 }}>{block.id}</span>
                {isTitle && <span style={{ fontSize: '0.65rem', color: '#93c5fd', marginRight: 6 }}>TITLE</span>}
                {isContent && <span style={{ fontSize: '0.65rem', color: '#86efac', marginRight: 6 }}>CONTENT</span>}
                {block.kind === 'table' ? `Table: ${block.text}` : block.text}
              </button>
            )
          })}
        </div>

        {/* RIGHT: list */}
        <div style={{
          border: '1px solid var(--border-color)', borderRadius: 8, padding: 12,
          overflow: 'auto', maxHeight: 480,
        }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', mb: 1 }}>
            Sections ({sections.length})
          </Typography>
          {!sections.length && (
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              Nothing listed yet — click the preview.
            </Typography>
          )}
          <Stack spacing={1}>
            {sections.map(section => {
              const active = section.key === selectedKey
              return (
                <div
                  key={section.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedKey(section.key)
                    setSelectedSubKey('')
                    setClickMode(section.content_region_id ? 'section' : 'content')
                    setHint(section.content_region_id
                      ? `Selected “${section.label}”. Use Subsection mode or Place content to remap.`
                      : `Selected “${section.label}”. Click the preview to place its content.`)
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.click() }}
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                    background: active ? 'rgba(134,239,172,0.08)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{section.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                    title: {section.title_region_id || '—'} · content: {section.content_region_id || 'not placed'}
                  </div>
                  {(section.subsections || []).map(sub => (
                    <div
                      key={sub.key}
                      style={{
                        marginTop: 4, marginLeft: 8, fontSize: '0.78rem',
                        color: selectedSubKey === sub.key ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedKey(section.key)
                        setSelectedSubKey(sub.key)
                        setClickMode(sub.content_region_id ? 'subsection' : 'subsection_content')
                      }}
                    >
                      · {sub.label}
                      <span style={{ opacity: 0.6 }}> ({sub.content_region_id || 'no content place'})</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </Stack>

          {selectedSection && (
            <Stack spacing={1} sx={{ mt: 2, pt: 1.5, borderTop: '1px solid var(--border-color)' }}>
              <TextField
                size="small"
                label="Section title"
                value={selectedSection.label || ''}
                onChange={e => updateSelectedSection({
                  label: e.target.value,
                  key: BUILTIN_SYLLABUS_EDITORS[selectedSection.key]
                    ? selectedSection.key
                    : (slug(e.target.value) || selectedSection.key),
                })}
                sx={inputSx}
                fullWidth
              />
              <FormControlLabel
                control={<Switch checked={selectedSection.enabled !== false} onChange={e => updateSelectedSection({ enabled: e.target.checked })} />}
                label="Show to faculty"
                sx={{ color: 'var(--text-secondary)' }}
              />
              <FormControlLabel
                control={<Switch checked={Boolean(selectedSection.is_static)} onChange={e => updateSelectedSection({ is_static: e.target.checked })} />}
                label="Fixed for all"
                sx={{ color: 'var(--text-secondary)' }}
              />
              <TextField
                select
                size="small"
                label="Built-in editor (optional)"
                value={BUILTIN_SYLLABUS_EDITORS[selectedSection.key] ? selectedSection.key : ''}
                onChange={e => {
                  const editor = e.target.value
                  if (!editor) return
                  updateSelectedSection({ key: editor, editor })
                  setSelectedKey(editor)
                }}
                sx={inputSx}
                SelectProps={{ native: true }}
              >
                <option value="">Custom / none</option>
                {Object.entries(BUILTIN_SYLLABUS_EDITORS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </TextField>
              <Stack direction="row" spacing={1}>
                <OutlineBtn small onClick={removeSelectedSection}>Remove section</OutlineBtn>
                {selectedSubsection && (
                  <OutlineBtn small onClick={removeSelectedSubsection}>Remove subsection</OutlineBtn>
                )}
              </Stack>
            </Stack>
          )}
        </div>
      </div>
    </Stack>
  )
}

export { SyllabusFormatEditor }
