// Exact-file click map: left = real DOCX/PDF/Excel, right = recorded sections.

import { useCallback, useMemo, useState } from 'react'
import { Alert, Stack, TextField, Typography, FormControlLabel, Switch } from '@mui/material'
import { OutlineBtn } from '../../../components/ui'
import { BUILTIN_SYLLABUS_EDITORS } from './academicApi'
import SyllabusDocumentPreview from './SyllabusDocumentPreview'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
}

function slug(label) {
  return String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function normalizeLookup(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Ranked search over preview blocks for manual find → highlight. */
function findBlocksByQuery(blocks, query) {
  const q = normalizeLookup(query)
  if (!q) return []
  const scored = []
  for (const block of blocks || []) {
    const text = normalizeLookup(block?.text)
    if (!text) continue
    let score = 0
    if (text === q) score = 100
    else if (text.startsWith(q)) score = 80
    else if (text.includes(q)) score = 60
    else continue
    // Prefer short labels (Vision) over long paragraphs that merely contain the word.
    score += Math.max(0, 20 - Math.min(20, text.length / 8))
    scored.push({ block, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map(item => item.block)
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
  templateFileUrl,
  fileType,
  localFile,
  onUpload,
  uploading,
  uploadMessage,
  uploadSeverity,
}) {
  const [clickMode, setClickMode] = useState('section')
  const [selectedKey, setSelectedKey] = useState('')
  const [selectedSubKey, setSelectedSubKey] = useState('')
  const [hint, setHint] = useState('Click text on your uploaded file to add it as a section.')
  const [findQuery, setFindQuery] = useState('')
  const [lookupIds, setLookupIds] = useState(() => new Set())
  const [focusRegionId, setFocusRegionId] = useState('')

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

  // Only emphasize the active role target (title OR content), not both at once.
  const selectedIds = useMemo(() => {
    const ids = new Set()
    if (selectedSubsection) {
      if (clickMode === 'subsection_content' && selectedSubsection.content_region_id) {
        ids.add(selectedSubsection.content_region_id)
      } else if (selectedSubsection.title_region_id) {
        ids.add(selectedSubsection.title_region_id)
      }
      return ids
    }
    if (!selectedSection) return ids
    if (clickMode === 'content' && selectedSection.content_region_id) {
      ids.add(selectedSection.content_region_id)
    } else if (selectedSection.title_region_id) {
      ids.add(selectedSection.title_region_id)
    }
    return ids
  }, [selectedSection, selectedSubsection, clickMode])

  const roleById = useMemo(() => {
    const map = new Map()
    for (const section of sections) {
      if (section.title_region_id) map.set(section.title_region_id, 'title')
      if (section.content_region_id) map.set(section.content_region_id, 'content')
      for (const sub of section.subsections || []) {
        if (sub.title_region_id) map.set(sub.title_region_id, 'title')
        if (sub.content_region_id) map.set(sub.content_region_id, 'content')
      }
    }
    return map
  }, [sections])

  function updateSections(nextSections) {
    onFieldMapChange({
      ...(fieldMap || {}),
      version: 1,
      sections: nextSections,
    })
  }

  const handleBlockClick = useCallback(block => {
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
        setHint('That spot is already mapped. Click a free area, or select a section on the right.')
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
        working_content_region_id: '',
        editor: null,
      }
      updateSections([...sections, next])
      setSelectedKey(key)
      setSelectedSubKey('')
      setClickMode('content')
      setHint(`Recorded “${label}”. Click where faculty content for this section should go.`)
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
          setHint('Pick a different area for content (not the section title).')
          return
        }
        setHint('That spot is already used. Click an unmapped area for content.')
        return
      }
      updateSections(sections.map(section => (
        section.key === selectedKey
          ? {
              ...section,
              content_region_id: block.id,
              working_content_region_id: block.working_region_id || '',
              table_enabled: block.kind === 'table' ? true : section.table_enabled,
              table_columns: block.kind === 'table' && Array.isArray(block.rows?.[0])
                ? block.rows[0]
                : section.table_columns,
            }
          : section
      ))
      setClickMode('section')
      setHint(`Content for “${selectedSection.label}” recorded. Click another heading to add the next section.`)
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
        setHint('That spot is already mapped.')
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
        working_content_region_id: '',
      }
      updateSections(sections.map(section => (
        section.key === selectedKey
          ? { ...section, subsections: [...subs, nextSub] }
          : section
      ))
      setSelectedSubKey(key)
      setClickMode('subsection_content')
      setHint(`Recorded subsection “${label}”. Now click where its content should be written.`)
      return
    }

    if (clickMode === 'subsection_content') {
      if (!selectedSection || !selectedSubsection) {
        setClickMode('subsection')
        return
      }
      if (existing && !(existing.subsection?.key === selectedSubKey && existing.role === 'content')) {
        setHint('That spot is already used. Click an unmapped area for subsection content.')
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
                  working_content_region_id: block.working_region_id || '',
                  table_enabled: block.kind === 'table' ? true : sub.table_enabled,
                  table_columns: block.kind === 'table' && Array.isArray(block.rows?.[0])
                    ? block.rows[0]
                    : sub.table_columns,
                }
              : sub
          )),
        }
      })
      setClickMode('subsection')
      setHint(`Content for subsection “${selectedSubsection.label}” recorded.`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: uses latest sections/fieldMap from closure each click
  }, [clickMode, fieldMap, sections, selectedKey, selectedSection, selectedSubKey, selectedSubsection])

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
    setHint('Section removed. Click the document to add another.')
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
    section: 'Click document → add / select section',
    content: 'Click document → place section content',
    subsection: 'Click document → add subsection',
    subsection_content: 'Click document → place subsection content',
  }[clickMode]

  function runFind(andUse = false) {
    const matches = findBlocksByQuery(blocks, findQuery)
    if (!matches.length) {
      setLookupIds(new Set())
      setFocusRegionId('')
      setHint(`No match for “${findQuery.trim()}” in the document.`)
      return
    }
    const ids = new Set(matches.slice(0, 8).map(b => b.id))
    setLookupIds(ids)
    setFocusRegionId(matches[0].id)
    setHint(
      andUse
        ? `Found “${matches[0].text.slice(0, 80)}”. Applying to current mode…`
        : `Found ${matches.length} match(es). Highlighted on the left — click Use match to map, or click the highlight.`,
    )
    if (andUse) handleBlockClick(matches[0])
  }

  return (
    <Stack spacing={1.5} sx={{ minHeight: 420 }}>
      <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
        Upload your syllabus sample. Click line-by-line on the left, or type a label below to find and highlight it.
      </Typography>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <OutlineBtn small disabled={uploading} onClick={() => document.getElementById('syllabus-docx-preview-input')?.click()}>
          {uploading ? 'Loading template…' : (templateName ? 'Replace file' : 'Upload DOCX / PDF / Excel')}
        </OutlineBtn>
        <input
          id="syllabus-docx-preview-input"
          hidden
          type="file"
          accept=".docx,.pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={e => { onUpload(e.target.files?.[0]); e.target.value = '' }}
        />
        {templateName && (
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>File: {templateName}</Typography>
        )}
      </Stack>

      {uploadMessage && (
        <Alert severity={uploadSeverity || 'info'}>{uploadMessage}</Alert>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <TextField
          size="small"
          label="Find text in document"
          placeholder="e.g. Vision"
          value={findQuery}
          onChange={event => setFindQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              runFind(false)
            }
          }}
          sx={{ ...inputSx, flex: 1, minWidth: 180 }}
        />
        <OutlineBtn small onClick={() => runFind(false)} disabled={!findQuery.trim()}>Find & highlight</OutlineBtn>
        <OutlineBtn small onClick={() => runFind(true)} disabled={!findQuery.trim()}>Use match</OutlineBtn>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <OutlineBtn small onClick={() => { setClickMode('section'); setHint('Click text on the file to add or select a section.') }}
          style={clickMode === 'section' || clickMode === 'content' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
          Section mode
        </OutlineBtn>
        <OutlineBtn small disabled={!selectedSection} onClick={() => { setClickMode('subsection'); setHint('Click text to add a subsection under the selected section.') }}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 12, minHeight: 360 }}>
        <div style={{
          border: '1px solid var(--border-color)', borderRadius: 8, padding: 8,
          overflow: 'auto', maxHeight: 520, background: 'var(--bg-secondary, rgba(255,255,255,0.02))',
        }}>
          <SyllabusDocumentPreview
            fileUrl={templateFileUrl}
            fileType={fileType}
            templateName={templateName}
            localFile={localFile}
            blocks={blocks}
            mappedIds={mappedIds}
            selectedIds={selectedIds}
            roleById={roleById}
            lookupIds={lookupIds}
            focusRegionId={focusRegionId}
            onBlockClick={handleBlockClick}
          />
        </div>

        <div style={{
          border: '1px solid var(--border-color)', borderRadius: 8, padding: 12,
          overflow: 'auto', maxHeight: 520,
        }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-tertiary)', mb: 1 }}>
            RECORDED SECTIONS ({sections.length})
          </Typography>
          {!sections.length && (
            <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              Nothing recorded yet. Click headings or cells on the left.
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
                      ? `Selected “${section.label}”.`
                      : `Selected “${section.label}”. Click the document to place content.`)
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedKey(section.key)
                    }
                  }}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                    background: active ? 'rgba(134,239,172,0.08)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{section.label}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                      Title {section.title_region_id ? '✓' : '—'} · Content {section.content_region_id ? '✓' : 'needed'}
                      {(section.subsections || []).length ? ` · ${(section.subsections || []).length} sub` : ''}
                    </span>
                  </div>
                  {BUILTIN_SYLLABUS_EDITORS[section.key] && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      Built-in editor: {BUILTIN_SYLLABUS_EDITORS[section.key]}
                    </div>
                  )}
                  {active && (
                    <Stack spacing={1} sx={{ mt: 1 }} onClick={event => event.stopPropagation()}>
                      <TextField
                        size="small"
                        label="Section name"
                        value={section.label}
                        onChange={event => updateSelectedSection({
                          label: event.target.value,
                          key: BUILTIN_SYLLABUS_EDITORS[section.key] ? section.key : slug(event.target.value) || section.key,
                        })}
                        sx={inputSx}
                        fullWidth
                      />
                      <FormControlLabel
                        control={<Switch checked={section.enabled !== false} onChange={event => updateSelectedSection({ enabled: event.target.checked })} size="small" />}
                        label="Show to faculty"
                        sx={{ color: 'var(--text-secondary)' }}
                      />
                      <FormControlLabel
                        control={<Switch checked={Boolean(section.is_static)} onChange={event => updateSelectedSection({ is_static: event.target.checked })} size="small" />}
                        label="Fixed for all"
                        sx={{ color: 'var(--text-secondary)' }}
                      />
                      {section.is_static && (
                        <TextField
                          size="small"
                          label="Fixed content"
                          value={section.static_content || ''}
                          onChange={event => updateSelectedSection({ static_content: event.target.value })}
                          multiline
                          minRows={2}
                          sx={inputSx}
                          fullWidth
                        />
                      )}
                      {(section.subsections || []).map(sub => (
                        <div
                          key={sub.key}
                          style={{
                            marginLeft: 8,
                            padding: 8,
                            borderLeft: '2px solid var(--border-color)',
                            background: sub.key === selectedSubKey ? 'rgba(96,165,250,0.1)' : 'transparent',
                          }}
                          onClick={() => {
                            setSelectedSubKey(sub.key)
                            setClickMode(sub.content_region_id ? 'subsection' : 'subsection_content')
                          }}
                        >
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{sub.label}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                            Title {sub.title_region_id ? '✓' : '—'} · Content {sub.content_region_id ? '✓' : 'needed'}
                          </div>
                        </div>
                      ))}
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <OutlineBtn small onClick={() => { setClickMode('subsection'); setHint('Click the document to add a subsection.') }}>
                          Add subsection
                        </OutlineBtn>
                        {selectedSubKey && (
                          <OutlineBtn small onClick={removeSelectedSubsection}>Remove subsection</OutlineBtn>
                        )}
                        <OutlineBtn small onClick={removeSelectedSection}>Remove section</OutlineBtn>
                      </Stack>
                    </Stack>
                  )}
                </div>
              )
            })}
          </Stack>

        </div>
      </div>
    </Stack>
  )
}
