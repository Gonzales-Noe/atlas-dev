import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert, Box, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import ChecklistIcon from '@mui/icons-material/Checklist'
import GridOnIcon from '@mui/icons-material/GridOn'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import EventNoteIcon from '@mui/icons-material/EventNote'
import GradeIcon from '@mui/icons-material/Grade'
import GavelIcon from '@mui/icons-material/Gavel'
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import { analyzeSyllabusTemplate, describeDetectedStructure } from './academicApi'
import { PageHeader, GlassCard, PrimaryBtn, OutlineBtn } from '../../../components/ui'
import LoadingState from '../../../components/LoadingState'
import {
  blueprintGroupsFor,
  blueprintTableFor,
  blueprintTablesFor,
  blueprintTabsFor,
  cloneDefaultSyllabusSections,
  mergeSyllabusSections,
} from '../../../config/syllabusStructure'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiInputBase-input': { color: 'var(--text-primary)' },
}

const SECTION_ICONS = {
  'university-information': MenuBookIcon,
  'course-information': InfoOutlinedIcon,
  'iloat-references': ChecklistIcon,
  'framework-mapping': AccountTreeOutlinedIcon,
  'course-policies': GavelIcon,
  'tla-activities': EventNoteIcon,
  'mapping-of-at': GridOnIcon,
}

const FIELD_TYPE_LABELS = {
  text: 'Short answer',
  longtext: 'Long answer',
  repeat: 'Repeatable list',
  table: 'Structured rows',
  toggle: 'Toggle',
  computed: 'Auto-generated',
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const emptySection = () => ({
  key: `custom-${Date.now()}`,
  label: '',
  editor: null,
  derived: false,
  enabled: true,
  is_static: false,
  static_content: '',
  fields: [],
  subsections: [],
  table_enabled: false,
  table_columns: [],
  table_column_groups: [],
  table_rows: [],
})

const emptySubsection = () => ({
  key: `field-${Date.now()}`,
  label: '',
  required: false,
  is_static: false,
  static_content: '',
  table_enabled: false,
  table_columns: [],
  table_column_groups: [],
  table_rows: [],
})

const emptyTableRow = columns => ({ fixed: false, values: Array.from({ length: columns }, () => '') })

function chipSx(color) {
  return {
    height: 22,
    fontSize: '0.68rem',
    fontWeight: 700,
    color,
    borderColor: `${color}66`,
    bgcolor: `${color}14`,
  }
}

export default function SyllabusFormat() {
  const [customization, setCustomization] = useState({
    header_text: '',
    footer_text: '',
    syllabus_template_name: '',
    syllabus_sections: [],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [templateImport, setTemplateImport] = useState({ busy: false, message: '', severity: 'info' })
  const [tableTarget, setTableTarget] = useState(null)
  const [tableDraft, setTableDraft] = useState({ columns: [], rows: [], columnGroups: [] })
  const [fieldEditor, setFieldEditor] = useState(null)
  const [fieldDraft, setFieldDraft] = useState('')
  const [labelEditor, setLabelEditor] = useState(null)
  const [labelDraft, setLabelDraft] = useState('')
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  const loadFormat = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/users/institution-customization/')
      const sections = Array.isArray(data.syllabus_sections) && data.syllabus_sections.length
        ? mergeSyllabusSections(data.syllabus_sections)
        : cloneDefaultSyllabusSections()
      setCustomization(current => ({ ...current, ...data, syllabus_sections: sections }))
      setActiveIndex(index => Math.max(0, Math.min(index, sections.length - 1)))
      dirtyRef.current = false
    } catch (err) {
      if (!quiet) setError(err.response?.data?.detail || 'Failed to load syllabus format.')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFormat()
  }, [loadFormat])

  // The format is stored once per institution, so an admin who already has the
  // page open should pick up another admin's saved changes without a reload.
  useEffect(() => {
    function resync() {
      if (document.visibilityState !== 'visible' || dirtyRef.current || savingRef.current) return
      loadFormat({ quiet: true })
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [loadFormat])

  useEffect(() => {
    if (activeIndex > customization.syllabus_sections.length - 1) {
      setActiveIndex(Math.max(0, customization.syllabus_sections.length - 1))
    }
  }, [activeIndex, customization.syllabus_sections.length])

  const sections = customization.syllabus_sections
  const activeSection = sections[activeIndex]
  const activeBlueprintGroups = activeSection ? blueprintGroupsFor(activeSection) : []
  const activeBlueprintTables = activeSection ? blueprintTablesFor(activeSection) : []
  const activeBlueprintTabs = activeSection ? blueprintTabsFor(activeSection) : []

  function updateSection(index, changes) {
    dirtyRef.current = true
    setCustomization(current => ({
      ...current,
      syllabus_sections: current.syllabus_sections.map((section, i) => (
        i === index ? { ...section, ...changes } : section
      )),
    }))
  }

  function updateField(index, fieldKey, changes) {
    const section = sections[index]
    if (!section) return
    updateSection(index, {
      fields: (section.fields || []).map(field => (
        field.key === fieldKey ? { ...field, ...changes } : field
      )),
    })
  }

  function updateSubsection(sectionIndex, subsectionIndex, changes) {
    const section = sections[sectionIndex]
    if (!section) return
    updateSection(sectionIndex, {
      subsections: (section.subsections || []).map((subsection, i) => (
        i === subsectionIndex ? { ...subsection, ...changes } : subsection
      )),
    })
  }

  function addSubsection(sectionIndex) {
    const section = sections[sectionIndex]
    if (!section) return
    updateSection(sectionIndex, {
      subsections: [...(section.subsections || []), emptySubsection()],
    })
  }

  function removeSubsection(sectionIndex, subsectionIndex) {
    const section = sections[sectionIndex]
    if (!section) return
    updateSection(sectionIndex, {
      subsections: (section.subsections || []).filter((_, i) => i !== subsectionIndex),
    })
  }

  function addSection() {
    dirtyRef.current = true
    setCustomization(current => ({
      ...current,
      syllabus_sections: [...current.syllabus_sections, emptySection()],
    }))
    setActiveIndex(sections.length)
  }

  function removeSection(index) {
    dirtyRef.current = true
    setCustomization(current => ({
      ...current,
      syllabus_sections: current.syllabus_sections.filter((_, i) => i !== index),
    }))
    setActiveIndex(current => (current > index ? current - 1 : current))
  }

  function moveSection(index, direction) {
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    dirtyRef.current = true
    setCustomization(current => {
      const next = [...current.syllabus_sections]
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...current, syllabus_sections: next }
    })
    setActiveIndex(target)
  }

  function openTable(sectionIndex, subsectionIndex = null) {
    const section = sections[sectionIndex]
    if (!section) return
    const field = subsectionIndex == null ? section : section.subsections[subsectionIndex]
    const columns = Array.isArray(field.table_columns) && field.table_columns.length ? field.table_columns : ['']
    const storedRows = Array.isArray(field.table_rows) ? field.table_rows : []
    const rows = storedRows.map(row => ({
      fixed: Boolean(row.fixed),
      values: Array.from({ length: columns.length }, (_, i) => row.values?.[i] || ''),
    }))
    setTableDraft({
      columns,
      rows,
      columnGroups: Array.from({ length: columns.length }, (_, i) => field.table_column_groups?.[i] || ''),
    })
    setTableTarget({ sectionIndex, subsectionIndex })
  }

  function saveTable() {
    if (!tableTarget) return
    const columns = tableDraft.columns.map(column => column.trim())
    if (!columns.length || columns.some(column => !column)) {
      setError('Name every table column before saving.')
      return
    }
    const rows = tableDraft.rows.map(row => ({
      fixed: Boolean(row.fixed),
      values: columns.map((_, i) => row.values?.[i] || ''),
    }))
    const changes = {
      table_enabled: true,
      table_columns: columns,
      table_column_groups: tableDraft.columnGroups,
      table_rows: rows,
    }
    if (tableTarget.subsectionIndex == null) updateSection(tableTarget.sectionIndex, changes)
    else updateSubsection(tableTarget.sectionIndex, tableTarget.subsectionIndex, changes)
    setError('')
    setTableTarget(null)
  }

  function toggleTable(sectionIndex, subsectionIndex, enabled) {
    if (enabled) openTable(sectionIndex, subsectionIndex)
    else if (subsectionIndex == null) updateSection(sectionIndex, { table_enabled: false })
    else updateSubsection(sectionIndex, subsectionIndex, { table_enabled: false })
  }

  function openFieldEditor(field) {
    const entry = (activeSection?.fields || []).find(item => item.key === field.key)
    setFieldEditor({
      type: 'field',
      sectionIndex: activeIndex,
      key: field.key,
      label: entry?.label || field.label,
      multiline: field.type !== 'text',
    })
    setFieldDraft(entry?.content || '')
  }

  function openSubsectionEditor(subsection, subsectionIndex) {
    setFieldEditor({
      type: 'subsection',
      sectionIndex: activeIndex,
      subsectionIndex,
      label: subsection.label || 'Additional field',
      multiline: true,
    })
    setFieldDraft(subsection.static_content || '')
  }

  function saveFieldEditor() {
    if (!fieldEditor) return
    let nextSections
    if (fieldEditor.type === 'subsection') {
      nextSections = sections.map((section, index) => (
        index === fieldEditor.sectionIndex
          ? {
            ...section,
            subsections: (section.subsections || []).map((subsection, i) => (
              i === fieldEditor.subsectionIndex ? { ...subsection, static_content: fieldDraft } : subsection
            )),
          }
          : section
      ))
    } else {
      nextSections = sections.map((section, index) => (
        index === fieldEditor.sectionIndex
          ? {
            ...section,
            fields: (section.fields || []).map(field => (
              field.key === fieldEditor.key ? { ...field, content: fieldDraft } : field
            )),
          }
          : section
      ))
    }
    dirtyRef.current = true
    setCustomization(current => ({ ...current, syllabus_sections: nextSections }))
    setFieldEditor(null)
    setFieldDraft('')
    save(nextSections)
  }

  function openLabelEditor(field) {
    const entry = (activeSection?.fields || []).find(item => item.key === field.key)
    setError('')
    setLabelEditor({ sectionIndex: activeIndex, key: field.key, blueprintLabel: field.label })
    setLabelDraft(entry?.label || field.label)
  }

  function saveLabelEditor() {
    if (!labelEditor) return
    const label = labelDraft.trim()
    if (!label) {
      setError('Add a name to the field.')
      return
    }
    const nextSections = sections.map((section, index) => (
      index === labelEditor.sectionIndex
        ? {
          ...section,
          fields: (section.fields || []).map(field => (
            field.key === labelEditor.key ? { ...field, label } : field
          )),
        }
        : section
    ))
    dirtyRef.current = true
    setError('')
    setCustomization(current => ({ ...current, syllabus_sections: nextSections }))
    setLabelEditor(null)
    setLabelDraft('')
    save(nextSections)
  }

  async function importTemplate(file) {
    if (!file) return
    setTemplateImport({ busy: true, message: 'Reading the syllabus template…', severity: 'info' })
    try {
      const result = await analyzeSyllabusTemplate(file)
      if (result.sections?.length) {
        const importedSections = mergeSyllabusSections(result.sections)
        dirtyRef.current = true
        setCustomization(current => ({
          ...current,
          syllabus_template_name: result.template_name || file.name,
          syllabus_sections: importedSections,
        }))
        setActiveIndex(0)
        setTemplateImport({ busy: false, message: describeDetectedStructure(result), severity: 'success' })
      } else {
        setTemplateImport({ busy: false, message: result.detail || 'No sections were detected.', severity: 'warning' })
      }
    } catch (err) {
      setTemplateImport({
        busy: false,
        message: err.response?.data?.detail || 'Could not analyze the template.',
        severity: 'error',
      })
    }
  }

  async function save(nextSections = sections) {
    setError('')
    setNotice('')
    const payload = nextSections.map(section => ({
      ...section,
      key: (section.key || slug(section.label) || '').trim(),
      label: (section.label || '').trim(),
      is_static: Boolean(section.is_static),
      static_content: section.is_static ? (section.static_content || '').trim() : '',
      fields: (section.fields || []).map(field => ({
        key: field.key,
        label: field.label,
        type: field.type,
        group: field.group,
        lockable: Boolean(field.lockable),
        fixed: section.is_static ? false : Boolean(field.fixed),
        content: !section.is_static && field.fixed ? (field.content || '').trim() : '',
      })),
      subsections: (section.subsections || []).map(subsection => ({
        ...subsection,
        label: (subsection.label || '').trim(),
        is_static: Boolean(subsection.is_static),
        static_content: subsection.is_static ? (subsection.static_content || '').trim() : '',
      })),
    }))

    if (payload.some(section => section.enabled !== false && !section.label)) {
      setError('Add a name to every enabled section.')
      return
    }
    if (payload.some(section => section.enabled !== false && section.subsections.some(sub => !sub.label))) {
      setError('Add a name to each additional field before saving.')
      return
    }
    if (payload.some(section => !section.is_static && section.fields.some(field => field.fixed && !field.content))) {
      setError('Add fixed content for every locked field.')
      return
    }
    if (payload.some(section => section.table_enabled && (!section.table_columns?.length || section.table_columns.some(column => !column)))) {
      setError('Name every table column before saving.')
      return
    }

    setSaving(true)
    savingRef.current = true
    try {
      await api.patch('/users/institution-customization/', { ...customization, syllabus_sections: payload })
      setCustomization(current => ({ ...current, syllabus_sections: payload }))
      dirtyRef.current = false
      setNotice('Syllabus format saved for every admin in your institution.')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save syllabus format.')
    } finally {
      setSaving(false)
      savingRef.current = false
    }
  }

  function renderTableEditor() {
    if (!tableTarget) return null
    const setDraft = changes => setTableDraft(current => ({ ...current, ...changes }))
    return (
      <Dialog open onClose={() => setTableTarget(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Table settings</DialogTitle>
        <DialogContent sx={{ bgcolor: 'var(--bg-card)' }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
            Define the table shape. Fixed rows are supplied by the Admin; other rows remain editable for Faculty.
          </Typography>
          <Stack spacing={1.5}>
            {tableDraft.columns.map((column, index) => (
              <Stack key={index} direction="row" spacing={1} alignItems="center">
                <TextField size="small" fullWidth label={`Column ${index + 1} name`} value={column} sx={inputSx}
                  onChange={event => setDraft({ columns: tableDraft.columns.map((item, i) => i === index ? event.target.value : item) })} />
                <TextField size="small" fullWidth label="Group heading (optional)" value={tableDraft.columnGroups[index] || ''} sx={inputSx}
                  onChange={event => setDraft({ columnGroups: tableDraft.columnGroups.map((item, i) => i === index ? event.target.value : item) })} />
                <IconButton aria-label={`Remove column ${index + 1}`} onClick={() => setDraft({
                  columns: tableDraft.columns.filter((_, i) => i !== index),
                  columnGroups: tableDraft.columnGroups.filter((_, i) => i !== index),
                  rows: tableDraft.rows.map(row => ({ ...row, values: row.values.filter((_, i) => i !== index) })),
                })}><DeleteOutlinedIcon /></IconButton>
              </Stack>
            ))}
            <OutlineBtn small onClick={() => setDraft({
              columns: [...tableDraft.columns, ''],
              columnGroups: [...tableDraft.columnGroups, ''],
              rows: tableDraft.rows.map(row => ({ ...row, values: [...row.values, ''] })),
            })}>Add column</OutlineBtn>
            <Divider />
            <Typography sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Rows ({tableDraft.rows.length})</Typography>
            {tableDraft.rows.map((row, rowIndex) => (
              <Stack key={rowIndex} spacing={1} sx={{ p: 1.5, border: '1px solid var(--border-color)', borderRadius: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography sx={{ color: 'var(--text-secondary)' }}>Row {rowIndex + 1}</Typography>
                  <>
                    <FormControlLabel control={<Switch checked={row.fixed} onChange={event => setDraft({ rows: tableDraft.rows.map((item, i) => i === rowIndex ? { ...item, fixed: event.target.checked } : item) })} />} label="Fixed row" />
                    <IconButton aria-label={`Remove row ${rowIndex + 1}`} onClick={() => setDraft({ rows: tableDraft.rows.filter((_, i) => i !== rowIndex) })}><DeleteOutlinedIcon /></IconButton>
                  </>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  {tableDraft.columns.map((_, columnIndex) => (
                    <TextField key={columnIndex} size="small" fullWidth
                      label={`Row ${rowIndex + 1} · ${tableDraft.columns[columnIndex] || `Column ${columnIndex + 1}`}`}
                      value={row.values[columnIndex] || ''} sx={inputSx}
                      onChange={event => setDraft({ rows: tableDraft.rows.map((item, i) => i === rowIndex ? { ...item, values: item.values.map((value, j) => j === columnIndex ? event.target.value : value) } : item) })} />
                  ))}
                </Stack>
              </Stack>
            ))}
            <OutlineBtn small onClick={() => setDraft({ rows: [...tableDraft.rows, emptyTableRow(tableDraft.columns.length)] })}>Add row</OutlineBtn>
          </Stack>
        </DialogContent>
        <DialogActions><OutlineBtn onClick={() => setTableTarget(null)}>Cancel</OutlineBtn><PrimaryBtn onClick={saveTable}>Save table</PrimaryBtn></DialogActions>
      </Dialog>
    )
  }

  function renderFieldEditor() {
    if (!fieldEditor) return null
    return (
      <Dialog open onClose={() => setFieldEditor(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Fixed content</DialogTitle>
        <DialogContent sx={{ bgcolor: 'var(--bg-card)' }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
            {fieldEditor.label} — Faculty see this content and cannot edit the field. Saving applies it to every Faculty syllabus in your institution.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={fieldEditor.multiline ? 5 : 2}
            maxRows={12}
            label="Content Faculty will see"
            value={fieldDraft}
            onChange={event => setFieldDraft(event.target.value)}
            sx={inputSx}
          />
        </DialogContent>
        <DialogActions>
          <OutlineBtn onClick={() => setFieldEditor(null)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={saveFieldEditor} disabled={saving}>
            {saving ? 'Saving…' : 'Save & apply'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    )
  }

  function renderLabelEditor() {
    if (!labelEditor) return null
    const resetLabel = () => setLabelDraft(labelEditor.blueprintLabel)
    return (
      <Dialog open onClose={() => setLabelEditor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: 'var(--text-primary)' }}>Rename field</DialogTitle>
        <DialogContent sx={{ bgcolor: 'var(--bg-card)' }}>
          <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>
            Faculty see this name on the field in their Syllabus workspace. Saving applies it to every Faculty syllabus in your institution.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Field name"
            value={labelDraft}
            onChange={event => setLabelDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') saveLabelEditor() }}
            sx={inputSx}
          />
          {labelDraft.trim() !== labelEditor.blueprintLabel && (
            <Typography variant="caption" sx={{ color: 'var(--text-tertiary)', display: 'block', mt: 1 }}>
              Default name: {labelEditor.blueprintLabel}
              {' · '}
              <Box component="button" type="button" onClick={resetLabel}
                sx={{ background: 'none', border: 0, p: 0, color: '#86EFAC', cursor: 'pointer', fontSize: 'inherit' }}>
                Restore
              </Box>
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <OutlineBtn onClick={() => setLabelEditor(null)}>Cancel</OutlineBtn>
          <PrimaryBtn onClick={saveLabelEditor} disabled={saving}>
            {saving ? 'Saving…' : 'Save name'}
          </PrimaryBtn>
        </DialogActions>
      </Dialog>
    )
  }

  function renderNavItem(section, index) {
    const Icon = SECTION_ICONS[section.editor] || WidgetsOutlinedIcon
    const isActive = index === activeIndex
    const fieldCount = (section.fields || []).length + (section.subsections || []).length
    const hasTable = Boolean(blueprintTableFor(section)) || section.table_enabled
    return (
      <Box
        key={`${section.key}-${index}`}
        component="button"
        type="button"
        onClick={() => setActiveIndex(index)}
        sx={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          p: 1.25,
          borderRadius: 2,
          border: '1px solid',
          borderColor: isActive ? 'rgba(134,239,172,0.55)' : 'var(--border-color)',
          bgcolor: isActive ? 'rgba(21,128,61,0.14)' : 'transparent',
          color: 'inherit',
          transition: 'border-color 160ms ease, background 160ms ease',
          '&:hover': { borderColor: 'rgba(134,239,172,0.35)', bgcolor: 'rgba(255,255,255,0.03)' },
        }}
      >
        <Stack direction="row" spacing={1.1} alignItems="flex-start">
          <Box sx={{
            width: 30, height: 30, borderRadius: 1.5, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: isActive ? 'rgba(134,239,172,0.16)' : 'rgba(255,255,255,0.05)',
            color: isActive ? '#86EFAC' : 'var(--text-secondary)',
          }}>
            <Icon sx={{ fontSize: '1rem' }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {section.label || 'Untitled section'}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
              {section.derived && <Chip size="small" label="Auto" sx={chipSx('#60AAFF')} variant="outlined" />}
              {section.is_static && <Chip size="small" label="Fixed" sx={chipSx('#FFB74D')} variant="outlined" />}
              {section.enabled === false && <Chip size="small" label="Hidden" sx={chipSx('#FF7B72')} variant="outlined" />}
              <Typography variant="caption" sx={{ color: 'var(--text-tertiary)', fontSize: '0.68rem' }}>
                {fieldCount ? `${fieldCount} fields` : hasTable ? 'Table layout' : 'No fields'}
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </Box>
    )
  }

  function renderField(field) {
    const entry = (activeSection.fields || []).find(item => item.key === field.key)
    if (!entry) return null
    const label = entry.label || field.label
    const canLock = entry.lockable && !activeSection.is_static && !activeSection.derived
    const locked = Boolean(entry.fixed) && !activeSection.is_static
    const fixedContent = (entry.content || '').trim()
    return (
      <Box key={field.key} sx={{ py: 1, borderBottom: '1px solid var(--border-color)' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography sx={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {label}
              </Typography>
              <Tooltip title="Rename field">
                <IconButton
                  size="small"
                  aria-label={`Rename ${label}`}
                  onClick={() => openLabelEditor(field)}
                  sx={{ color: 'var(--text-tertiary)', p: 0.25 }}
                >
                  <EditOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                </IconButton>
              </Tooltip>
              <Chip size="small" label={FIELD_TYPE_LABELS[field.type] || 'Field'} sx={{
                height: 20, fontSize: '0.64rem', color: 'var(--text-tertiary)',
                borderColor: 'var(--border-color)', bgcolor: 'transparent',
              }} variant="outlined" />
              {locked
                ? <Chip size="small" label="Fixed" sx={chipSx('#FFB74D')} variant="outlined" />
                : !activeSection.derived && (
                  <Typography variant="caption" sx={{ color: 'var(--text-tertiary)' }}>
                    Faculty fills
                  </Typography>
                )}
            </Stack>
            {locked && (
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: fixedContent ? 'var(--text-tertiary)' : '#FFB74D' }}>
                  {fixedContent
                    ? 'Faculty see your fixed content and cannot edit this field.'
                    : 'Use Edit to add the content Faculty will see.'}
                </Typography>
                {fixedContent && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                      mt: 0.25, px: 1, py: 0.5, borderRadius: 1, bgcolor: 'var(--input-bg)',
                    }}
                  >
                    {fixedContent}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
          {canLock ? (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <FormControlLabel
                sx={{ m: 0, whiteSpace: 'nowrap' }}
                control={<Switch size="small" checked={locked} onChange={event => updateField(activeIndex, field.key, { fixed: event.target.checked })} />}
                label={<Typography variant="caption" sx={{ fontWeight: 700, color: locked ? '#FFB74D' : 'var(--text-secondary)' }}>Fixed</Typography>}
              />
              {locked && (
                <Tooltip title="Edit fixed content">
                  <IconButton
                    size="small"
                    aria-label={`Edit fixed content for ${field.label}`}
                    onClick={() => openFieldEditor(field)}
                    sx={{ color: '#FFB74D' }}
                  >
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : (
            <Chip size="small" variant="outlined"
              label={activeSection.derived ? 'Auto-generated' : 'Faculty fills'}
              sx={{ height: 22, fontSize: '0.68rem', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }} />
          )}
        </Stack>
      </Box>
    )
  }

  function renderBlueprintTable(table) {
    const groups = table.columnGroups || []
    const subGroups = table.subGroups || []
    const hasRowLabels = Boolean(table.rowLabels)
    const dataColCount = table.columns.length
    const totalCols = dataColCount + (hasRowLabels ? 1 : 0)
    const headerDepth = (groups.length ? 1 : 0) + (subGroups.length ? 1 : 0) + (table.noHeader ? 0 : 1)
    const previewSx = {
      width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem', mt: 1,
      '& th, & td': {
        border: '1px solid var(--border-color)', px: 1, py: 0.5, textAlign: 'left',
        color: 'var(--text-secondary)', fontWeight: 400, whiteSpace: 'pre-wrap',
      },
      '& th': { color: 'var(--text-primary)', fontWeight: 600, bgcolor: 'rgba(255,255,255,0.03)' },
    }
    const sampleRows = (table.defaultRows || []).filter(row => (row || []).some(cell => cell !== '' && cell !== null))
    const showRows = sampleRows.length ? sampleRows : (table.defaultRows || []).slice(0, 3)
    // When a subGroup already names the first leaf column (e.g. "Distribution"),
    // skip repeating it in the leaf header tier.
    const leafColumns = subGroups.length && table.columns[0] === subGroups[0].title
      ? table.columns.map((column, i) => (i === 0 ? '' : column))
      : table.columns

    return (
      <Box key={table.key} sx={{ border: '1px solid var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid var(--border-color)', bgcolor: 'rgba(255,255,255,0.03)' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {table.title}
            </Typography>
            <Chip size="small" label="Built-in table" sx={chipSx('#60AAFF')} variant="outlined" />
            {groups.some(group => group.dynamic) && (
              <Chip size="small" label="Grows with the ILOs" sx={chipSx('#60AAFF')} variant="outlined" />
            )}
          </Stack>
        </Box>
        <Box sx={{ px: 2, py: 1.5 }}>
          {table.intro && (
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 1 }}>{table.intro}</Typography>
          )}
          <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={previewSx}>
              <thead>
                {groups.length > 0 && (
                  <tr>
                    {hasRowLabels && <th rowSpan={headerDepth}>{table.rowLabels.header}</th>}
                    {groups.map((group, index) => (
                      <th key={index} colSpan={group.span}>
                        {group.title}{group.dynamic ? ' (per ILO)' : ''}
                      </th>
                    ))}
                  </tr>
                )}
                {subGroups.length > 0 && (
                  <tr>
                    {subGroups.map((group, index) => (
                      <th key={index} colSpan={group.span}>{group.title}</th>
                    ))}
                  </tr>
                )}
                {!table.noHeader && (
                  <tr>
                    {groups.length === 0 && hasRowLabels && <th rowSpan={headerDepth}>{table.rowLabels.header}</th>}
                    {leafColumns.map((column, index) => (
                      <th key={index}>{column || ' '}</th>
                    ))}
                  </tr>
                )}
                {table.noHeader && groups.length === 0 && hasRowLabels && <tr><th>{table.rowLabels.header}</th></tr>}
              </thead>
              <tbody>
                {showRows.map((row, rowIndex) => {
                  const cells = []
                  ;(row || []).forEach((cell, cellIndex) => {
                    if (cell === null && cells.length) {
                      cells[cells.length - 1].colSpan += 1
                      return
                    }
                    cells.push({ value: cell, colSpan: 1, key: cellIndex })
                  })
                  return (
                    <tr key={rowIndex}>
                      {hasRowLabels && <td>{table.rowLabels.values[rowIndex] || ''}</td>}
                      {cells.map(cell => (
                        <td key={cell.key} colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}>
                          {cell.value || ' '}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {table.totalRow && (
                  <tr>
                    {hasRowLabels && <td>{table.totalRow.label}</td>}
                    {Array.from({ length: dataColCount }, (_, columnIndex) => (
                      <td key={columnIndex}>
                        {table.totalRow.columns.includes(columnIndex) ? 'Total (auto)' : ''}
                      </td>
                    ))}
                  </tr>
                )}
                {table.noteRow && (
                  <tr>
                    <td>{table.noteRow.label}</td>
                    <td colSpan={totalCols - 1}>{table.noteRow.text}</td>
                  </tr>
                )}
              </tbody>
            </Box>
          </Box>
          {table.footer && (
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mt: 1 }}>{table.footer}</Typography>
          )}
          <Typography variant="caption" sx={{ color: 'var(--text-tertiary)', display: 'block', mt: 0.75 }}>
            {sampleRows.length
              ? 'Rows above are the default content; Faculty can edit every row in the Syllabus workspace.'
              : 'Faculty fill this table row by row in the Syllabus workspace.'}
          </Typography>
        </Box>
      </Box>
    )
  }

  function renderBlueprintTabs() {
    if (!activeBlueprintTabs.length) return null
    return (
      <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid var(--border-color)', bgcolor: 'rgba(255,255,255,0.03)' }}>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Framework tabs
            </Typography>
            <Chip size="small" label="Built-in tabs" sx={chipSx('#60AAFF')} variant="outlined" />
            {activeBlueprintTabs.map(tab => (
              <Chip key={tab.key} size="small" label={tab.label} sx={{
                height: 22, fontSize: '0.68rem', color: 'var(--text-secondary)',
                borderColor: 'var(--border-color)', bgcolor: 'transparent',
              }} variant="outlined" />
            ))}
          </Stack>
        </Box>
        <Stack spacing={2} sx={{ p: 2 }}>
          {activeBlueprintTabs.map(tab => renderBlueprintTable({ ...tab.table, title: `${tab.label} — ${tab.table.title}` }))}
        </Stack>
      </Box>
    )
  }

  function renderGroups() {
    const knownKeys = new Set(activeBlueprintGroups.flatMap(group => (group.fields || []).map(item => item.key)))
    const extras = (activeSection.fields || []).filter(field => !knownKeys.has(field.key))
    return (
      <Stack spacing={2}>
        {activeBlueprintGroups.map(group => (
          <Box key={group.title} sx={{ border: '1px solid var(--border-color)', borderRadius: 2.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid var(--border-color)', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {group.title}
                </Typography>
                {group.fields.length > 0 && (
                  <Typography variant="caption" sx={{ color: 'var(--text-tertiary)' }}>
                    {group.fields.length} field{group.fields.length === 1 ? '' : 's'}
                  </Typography>
                )}
              </Stack>
            </Box>
            <Box sx={{ px: 2, py: 1 }}>
              {group.fields.map(renderField)}
              {!group.fields.length && (
                <Typography variant="body2" sx={{ color: 'var(--text-tertiary)', py: 1 }}>
                  No fields in this group.
                </Typography>
              )}
            </Box>
          </Box>
        ))}
        {extras.length > 0 && (
          <Box sx={{ border: '1px solid var(--border-color)', borderRadius: 2.5, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid var(--border-color)', bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Additional fields
              </Typography>
            </Box>
            <Box sx={{ px: 2, py: 1 }}>{extras.map(renderField)}</Box>
          </Box>
        )}
      </Stack>
    )
  }

  function renderSectionPanel() {
    if (!activeSection) {
      return (
        <GlassCard>
          <Typography sx={{ color: 'var(--text-secondary)' }}>
            No syllabus sections yet. Add the first section from the list.
          </Typography>
        </GlassCard>
      )
    }

    return (
      <Stack spacing={2.5}>
        <GlassCard>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{
                  width: 38, height: 38, borderRadius: 2, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: 'rgba(134,239,172,0.12)', color: '#86EFAC',
                }}>
                  {(() => {
                    const Icon = SECTION_ICONS[activeSection.editor] || WidgetsOutlinedIcon
                    return <Icon sx={{ fontSize: '1.15rem' }} />
                  })()}
                </Box>
                <TextField
                  size="small"
                  fullWidth
                  label="Section name"
                  placeholder="e.g. Course Details"
                  value={activeSection.label || ''}
                  onChange={event => updateSection(activeIndex, { label: event.target.value })}
                  sx={inputSx}
                />
              </Stack>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={<Switch size="small" checked={activeSection.enabled !== false} onChange={event => updateSection(activeIndex, { enabled: event.target.checked })} />}
                  label={<Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Show to faculty</Typography>}
                />
                <Tooltip title="Move up">
                  <span><IconButton size="small" disabled={activeIndex === 0} onClick={() => moveSection(activeIndex, -1)}><ArrowUpwardIcon fontSize="small" /></IconButton></span>
                </Tooltip>
                <Tooltip title="Move down">
                  <span><IconButton size="small" disabled={activeIndex === sections.length - 1} onClick={() => moveSection(activeIndex, 1)}><ArrowDownwardIcon fontSize="small" /></IconButton></span>
                </Tooltip>
                <Tooltip title="Remove section">
                  <IconButton size="small" aria-label={`Remove ${activeSection.label || 'section'}`} onClick={() => removeSection(activeIndex)}>
                    <DeleteOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <FormControlLabel
                sx={{ m: 0 }}
                control={<Switch size="small" disabled={activeSection.derived} checked={Boolean(activeSection.is_static)} onChange={event => updateSection(activeIndex, { is_static: event.target.checked })} />}
                label={<Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Fix the whole section</Typography>}
              />
              <Typography variant="caption" sx={{ color: 'var(--text-tertiary)' }}>
                {activeSection.derived
                  ? 'This section is generated automatically from the syllabus data.'
                  : activeSection.is_static
                    ? 'Faculty see the fixed content below and cannot edit this section.'
                    : 'Faculty complete every field below unless you turn on Fixed for it.'}
              </Typography>
            </Stack>

            {activeSection.derived && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                Course Overview and the two matrices are read-only in the Faculty workspace, so there is nothing to fill in here.
              </Alert>
            )}

            {activeSection.is_static && (
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={4}
                label="Fixed section content"
                placeholder="Content managed by the Admin and shown to every faculty member"
                value={activeSection.static_content || ''}
                onChange={event => updateSection(activeIndex, { static_content: event.target.value })}
                sx={inputSx}
              />
            )}
          </Stack>
        </GlassCard>

        <GlassCard>
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ color: 'var(--text-primary)', fontWeight: 800, mb: 0.5 }}>
                Faculty workspace content
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                {activeSection.derived
                  ? 'These items are computed from the syllabus. Faculty cannot type into them.'
                  : 'The fields below mirror the Faculty Syllabus module. Faculty fill them by default; turn on Fixed to supply content they cannot edit.'}
              </Typography>
            </Box>
            {activeBlueprintGroups.length
              ? renderGroups()
              : (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  This is a custom section. Add answer fields below; Faculty will see them as text boxes or tables in the Syllabus workspace.
                </Alert>
              )}
            {activeBlueprintTabs.length > 0 && renderBlueprintTabs()}
            {activeBlueprintTables.length > 0 && (
              <Stack spacing={2}>
                {activeBlueprintTables.map(renderBlueprintTable)}
              </Stack>
            )}
          </Stack>
        </GlassCard>

        {!activeSection.derived && (
          <GlassCard>
            <Stack spacing={1.5}>
              <Box>
                <Typography sx={{ color: 'var(--text-primary)', fontWeight: 800, mb: 0.5 }}>
                  Additional answer fields
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  Extra fields that Faculty complete. Mark one as fixed to supply the content yourself, or add a table.
                </Typography>
              </Box>
              {(activeSection.subsections || []).map((subsection, subsectionIndex) => (
                <Box key={subsection.key || subsectionIndex} sx={{ border: '1px solid var(--border-color)', borderRadius: 2, p: 1.5 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                    <TextField
                      size="small"
                      fullWidth
                      label="Field name"
                      placeholder="e.g. Course Requirements"
                      value={subsection.label || ''}
                      onChange={event => updateSubsection(activeIndex, subsectionIndex, { label: event.target.value })}
                      sx={inputSx}
                    />
                    <FormControlLabel
                      sx={{ m: 0, whiteSpace: 'nowrap' }}
                      control={<Switch size="small" checked={Boolean(subsection.is_static)} onChange={event => updateSubsection(activeIndex, subsectionIndex, { is_static: event.target.checked })} />}
                      label={<Typography variant="caption" sx={{ fontWeight: 700, color: subsection.is_static ? '#FFB74D' : 'var(--text-secondary)' }}>Fixed</Typography>}
                    />
                    {subsection.is_static && (
                      <Tooltip title="Edit fixed content">
                        <IconButton
                          size="small"
                          aria-label={`Edit fixed content for ${subsection.label || 'field'}`}
                          onClick={() => openSubsectionEditor(subsection, subsectionIndex)}
                          sx={{ color: '#FFB74D' }}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <FormControlLabel
                      sx={{ m: 0, whiteSpace: 'nowrap' }}
                      control={<Switch size="small" checked={Boolean(subsection.required)} onChange={event => updateSubsection(activeIndex, subsectionIndex, { required: event.target.checked })} />}
                      label={<Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Required</Typography>}
                    />
                    <IconButton size="small" aria-label={`Remove ${subsection.label || 'field'}`} onClick={() => removeSubsection(activeIndex, subsectionIndex)}>
                      <DeleteOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                  {subsection.is_static && !(subsection.static_content || '').trim() && (
                    <Typography variant="caption" sx={{ color: '#FFB74D', display: 'block', mt: 1 }}>
                      Use Edit to add the content Faculty will see.
                    </Typography>
                  )}
                  {subsection.is_static && (subsection.static_content || '').trim() && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                        mt: 1, px: 1, py: 0.5, borderRadius: 1, bgcolor: 'var(--input-bg)',
                      }}
                    >
                      {subsection.static_content}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                    <FormControlLabel
                      sx={{ m: 0 }}
                      control={<Switch size="small" checked={Boolean(subsection.table_enabled)} onChange={event => toggleTable(activeIndex, subsectionIndex, event.target.checked)} />}
                      label={<Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Use a table</Typography>}
                    />
                    {subsection.table_enabled && (
                      <>
                        <Typography variant="caption" sx={{ color: 'var(--text-tertiary)' }}>
                          {subsection.table_columns.map(column => column || 'Untitled').join(' · ') || 'No columns yet'}
                        </Typography>
                        <OutlineBtn small onClick={() => openTable(activeIndex, subsectionIndex)}>Table settings</OutlineBtn>
                      </>
                    )}
                  </Stack>
                </Box>
              ))}
              <OutlineBtn small sx={{ width: 'fit-content', alignSelf: 'flex-start' }} onClick={() => addSubsection(activeIndex)}>
                <AddIcon fontSize="small" /> Add field
              </OutlineBtn>
            </Stack>
          </GlassCard>
        )}

        {!activeSection.derived && (
          <GlassCard>
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                <Box>
                  <Typography sx={{ color: 'var(--text-primary)', fontWeight: 800, mb: 0.5 }}>
                    Section table
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                    Add a table of your own to this section. Fixed rows are supplied by the Admin.
                  </Typography>
                </Box>
                <FormControlLabel
                  sx={{ m: 0, whiteSpace: 'nowrap' }}
                  control={<Switch size="small" checked={Boolean(activeSection.table_enabled)} onChange={event => toggleTable(activeIndex, null, event.target.checked)} />}
                  label={<Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Include a table</Typography>}
                />
              </Stack>
              {activeSection.table_enabled && (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                  {activeSection.table_columns.map((column, columnIndex) => (
                    <Chip key={columnIndex} size="small" label={column || 'Untitled column'} sx={{
                      height: 22, fontSize: '0.68rem', color: 'var(--text-secondary)',
                      borderColor: 'var(--border-color)', bgcolor: 'transparent',
                    }} variant="outlined" />
                  ))}
                  <OutlineBtn small onClick={() => openTable(activeIndex)}>Table settings</OutlineBtn>
                </Stack>
              )}
            </Stack>
          </GlassCard>
        )}
      </Stack>
    )
  }

  const visibleCount = sections.filter(section => section.enabled !== false).length
  const fixedCount = sections.filter(section => section.is_static).length

  return (
    <AdminLayout>
      <PageHeader
        title="Syllabus Format"
        subtitle="The Admin view of the Faculty Syllabus workspace. Choose the sections Faculty see and lock the content that must stay the same. Changes apply to every admin account in your institution."
        action={<PrimaryBtn onClick={save} disabled={loading || saving}>{saving ? 'Saving…' : 'Save Format'}</PrimaryBtn>}
      />
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}

      {loading ? (
        <LoadingState label="Loading the syllabus format…" />
      ) : (
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr)' },
          gap: 2.5,
          alignItems: 'start',
        }}>
          <GlassCard>
            <Stack spacing={1.75}>
              <Box>
                <Typography sx={{ color: 'var(--text-primary)', fontWeight: 800, mb: 0.5 }}>
                  Faculty sections
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                  Same sections Faculty see in the Syllabus workspace. Pick one to manage its content.
                </Typography>
              </Box>

              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                <Chip size="small" label={`${sections.length} sections`} sx={{ height: 22, fontSize: '0.68rem', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }} variant="outlined" />
                <Chip size="small" label={`${visibleCount} visible`} sx={chipSx('#86EFAC')} variant="outlined" />
                <Chip size="small" label={`${fixedCount} fixed`} sx={chipSx('#FFB74D')} variant="outlined" />
              </Stack>

              <OutlineBtn small disabled={templateImport.busy} onClick={() => document.getElementById('syllabus-template-import')?.click()}>
                <CloudUploadIcon sx={{ fontSize: '1rem' }} />
                {templateImport.busy ? 'Analyzing template…' : 'Import syllabus file'}
              </OutlineBtn>
              <input
                id="syllabus-template-import"
                hidden
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={event => { importTemplate(event.target.files?.[0]); event.target.value = '' }}
              />
              {customization.syllabus_template_name && (
                <Typography variant="caption" sx={{ color: 'var(--text-tertiary)' }}>
                  Template: {customization.syllabus_template_name}
                </Typography>
              )}
              {templateImport.message && <Alert severity={templateImport.severity}>{templateImport.message}</Alert>}

              <Divider />
              <Stack spacing={1}>
                {sections.map(renderNavItem)}
              </Stack>
              <OutlineBtn small sx={{ width: 'fit-content', alignSelf: 'flex-start' }} onClick={addSection}>
                <AddIcon fontSize="small" /> Add section
              </OutlineBtn>
            </Stack>
          </GlassCard>

          {renderSectionPanel()}
        </Box>
      )}

      {renderTableEditor()}
      {renderFieldEditor()}
      {renderLabelEditor()}
    </AdminLayout>
  )
}
