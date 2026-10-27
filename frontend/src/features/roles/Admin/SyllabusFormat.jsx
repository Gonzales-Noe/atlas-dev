import { useEffect, useState } from 'react'
import {
  Alert, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControlLabel, IconButton, Stack, Switch, TextField, Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import AdminLayout from './AdminLayout'
import api from '../../../config/api'
import { analyzeSyllabusTemplate, describeDetectedStructure, BUILTIN_SYLLABUS_EDITORS } from './academicApi'
import { PageHeader, GlassCard, PrimaryBtn, OutlineBtn } from '../../../components/ui'
import { cloneDefaultSyllabusSections, mergeSyllabusSections } from '../../../config/syllabusStructure'

const inputSx = {
  '& .MuiOutlinedInput-root': { background: 'var(--input-bg)', borderRadius: 2, fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
  input: { color: 'var(--text-primary)' },
  '& .MuiInputBase-input': { color: 'var(--text-primary)' },
}

const emptySection = () => ({
  key: `section-${Date.now()}`,
  label: '', enabled: true, is_static: false, static_content: '',
  subsections: [], table_enabled: false, table_columns: [], table_column_groups: [], table_rows: [],
})

const emptyTableRow = columns => ({ fixed: false, values: Array.from({ length: columns }, () => '') })

const FACULTY_SECTION_FIELDS = {
  overview: ['Syllabus Summary'],
  basic: ['University Name', 'College', 'Program', 'Syllabus Title', 'Vision', 'Mission'],
  details: ['Course Title', 'Course Code', 'Course Category', 'Prerequisites', 'Units/Credit Hours', 'Course Description', 'Assessment Criteria', 'Teaching and Learning Strategies'],
  'iloat': [],
  'iloatmatrix': [],
  fwmap: [],
  ilofwmatrix: [],
  schedule: ['Chapter/Week', 'Topics', 'Weeks', 'Learning Outcomes', 'Delivery'],
  grading: ['Grading rows', 'Passing grade', 'Plus/minus grading'],
  policies: ['Policies', 'Other policies'],
}

const FACULTY_SECTION_DEFAULTS = [
  ['overview', 'Course Overview'], ['basic', 'Basic Info'], ['details', 'Course Details'],
  ['iloat', 'ILOs & Assessments'], ['iloatmatrix', 'ILO–AT Matrix'], ['fwmap', 'Framework Mapping'],
  ['ilofwmatrix', 'ILO–Framework Matrix'], ['schedule', 'Teaching, Learning, and Assessment (TLA) Activities'],
  ['grading', 'Grading'], ['policies', 'Policies'],
].map(([key, label]) => ({
  key, label, enabled: true, is_static: false, static_content: '',
  faculty_fields: FACULTY_SECTION_FIELDS[key] || [], subsections: [],
  table_enabled: false, table_columns: [], table_column_groups: [], table_rows: [],
}))

function withFacultyFields(sections) {
  return sections.map(section => ({
    ...section,
    faculty_fields: Array.isArray(section.faculty_fields)
      ? section.faculty_fields
      : (FACULTY_SECTION_FIELDS[section.key] || []),
  }))
}

export default function SyllabusFormat() {
  const [customization, setCustomization] = useState({ header_text: '', footer_text: '', syllabus_sections: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [templateImport, setTemplateImport] = useState({ busy: false, message: '', severity: 'info' })
  const [settingsTarget, setSettingsTarget] = useState(null)
  const [tableTarget, setTableTarget] = useState(null)
  const [tableDraft, setTableDraft] = useState({ columns: [], rows: [], columnGroups: [] })

  useEffect(() => {
    api.get('/users/institution-customization/')
      .then(({ data }) => setCustomization(current => ({
        ...current,
        ...data,
        syllabus_sections: withFacultyFields(
          Array.isArray(data.syllabus_sections) && data.syllabus_sections.length
            ? mergeSyllabusSections(data.syllabus_sections)
            : cloneDefaultSyllabusSections(),
        ),
      })))
      .catch(err => setError(err.response?.data?.detail || 'Failed to load syllabus format.'))
      .finally(() => setLoading(false))
  }, [])

  const updateSection = (index, changes) => setCustomization(current => ({
    ...current,
    syllabus_sections: current.syllabus_sections.map((section, i) => i === index ? { ...section, ...changes } : section),
  }))

  const updateSubsection = (sectionIndex, subsectionIndex, changes) => updateSection(sectionIndex, {
    subsections: (customization.syllabus_sections[sectionIndex].subsections || []).map((item, i) => i === subsectionIndex ? { ...item, ...changes } : item),
  })

  const addSubsection = index => updateSection(index, {
    subsections: [...(customization.syllabus_sections[index].subsections || []), {
      key: `subsection-${Date.now()}`, label: '', required: false, is_static: false,
      static_content: '', table_enabled: false, table_columns: [], table_column_groups: [], table_rows: [],
    }],
  })

  function openTable(sectionIndex, subsectionIndex = null) {
    const field = subsectionIndex == null
      ? customization.syllabus_sections[sectionIndex]
      : customization.syllabus_sections[sectionIndex].subsections[subsectionIndex]
    const columns = Array.isArray(field.table_columns) && field.table_columns.length ? field.table_columns : ['']
    const storedRows = Array.isArray(field.table_rows) ? field.table_rows : []
    const rows = storedRows.map(row => ({ fixed: Boolean(row.fixed), values: Array.from({ length: columns.length }, (_, i) => row.values?.[i] || '') }))
    setTableDraft({ columns, rows, columnGroups: Array.from({ length: columns.length }, (_, i) => field.table_column_groups?.[i] || '') })
    setTableTarget({ sectionIndex, subsectionIndex })
  }

  function saveTable() {
    if (!tableTarget) return
    const columns = tableDraft.columns.map(column => column.trim())
    if (!columns.length || columns.some(column => !column)) return setError('Name every table column before saving.')
    const rows = tableDraft.rows.map(row => ({ fixed: Boolean(row.fixed), values: columns.map((_, i) => row.values?.[i] || '') }))
    const changes = { table_enabled: true, table_columns: columns, table_column_groups: tableDraft.columnGroups, table_rows: rows }
    if (tableTarget.subsectionIndex == null) updateSection(tableTarget.sectionIndex, changes)
    else updateSubsection(tableTarget.sectionIndex, tableTarget.subsectionIndex, changes)
    setTableTarget(null)
  }

  function toggleTable(sectionIndex, subsectionIndex, enabled) {
    if (enabled) openTable(sectionIndex, subsectionIndex)
    else if (subsectionIndex == null) updateSection(sectionIndex, { table_enabled: false })
    else updateSubsection(sectionIndex, subsectionIndex, { table_enabled: false })
  }

  async function importTemplate(file) {
    if (!file) return
    setTemplateImport({ busy: true, message: 'Reading the syllabus template…', severity: 'info' })
    try {
      const result = await analyzeSyllabusTemplate(file)
      if (result.sections?.length) {
        setCustomization(current => ({ ...current, syllabus_template_name: result.template_name || file.name, syllabus_sections: result.sections }))
        setTemplateImport({ busy: false, message: describeDetectedStructure(result), severity: 'success' })
      } else setTemplateImport({ busy: false, message: result.detail || 'No sections were detected.', severity: 'warning' })
    } catch (err) {
      setTemplateImport({ busy: false, message: err.response?.data?.detail || 'Could not analyze the template.', severity: 'error' })
    }
  }

  async function save() {
    const sections = (customization.syllabus_sections || []).map(section => ({
      ...section,
      key: section.key?.trim(), label: section.label?.trim(),
      is_static: Boolean(section.is_static),
      static_content: section.is_static ? (section.static_content || '').trim() : '',
      subsections: (section.subsections || []).map(subsection => ({
        ...subsection, label: subsection.label?.trim(), is_static: Boolean(subsection.is_static),
        static_content: subsection.is_static ? (subsection.static_content || '').trim() : '',
      })),
    }))
    if (sections.some(section => section.enabled !== false && !section.label)) return setError('Add a name to every enabled section.')
    if (sections.some(section => section.enabled !== false && !section.is_static && section.subsections.some(sub => !sub.label))) return setError('Add a name to each subsection before saving.')
    if (sections.some(section => section.table_enabled && (!section.table_columns?.length || section.table_columns.some(column => !column)))) return setError('Name every table column before saving.')
    try {
      await api.patch('/users/institution-customization/', { ...customization, syllabus_sections: sections })
      setCustomization(current => ({ ...current, syllabus_sections: sections }))
      setNotice('Syllabus format saved.')
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save syllabus format.') }
  }

  function renderTableEditor() {
    if (!tableTarget) return null
    const setDraft = changes => setTableDraft(current => ({ ...current, ...changes }))
    return <Dialog open onClose={() => setTableTarget(null)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ color: 'var(--text-primary)' }}>Table settings</DialogTitle>
      <DialogContent sx={{ bgcolor: 'var(--bg-card)' }}>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 2 }}>Define the table shape. Fixed rows are supplied by the Admin; other rows remain editable for Faculty.</Typography>
        <Stack spacing={1.5}>
          {tableDraft.columns.map((column, index) => <Stack key={index} direction="row" spacing={1} alignItems="center">
            <TextField size="small" fullWidth label={`Column ${index + 1} name`} value={column} sx={inputSx}
              onChange={event => setDraft({ columns: tableDraft.columns.map((item, i) => i === index ? event.target.value : item) })} />
            <TextField size="small" fullWidth label="Group heading (optional)" value={tableDraft.columnGroups[index] || ''} sx={inputSx}
              onChange={event => setDraft({ columnGroups: tableDraft.columnGroups.map((item, i) => i === index ? event.target.value : item) })} />
            <IconButton aria-label={`Remove column ${index + 1}`} onClick={() => setDraft({ columns: tableDraft.columns.filter((_, i) => i !== index), columnGroups: tableDraft.columnGroups.filter((_, i) => i !== index), rows: tableDraft.rows.map(row => ({ ...row, values: row.values.filter((_, i) => i !== index) })) })}><DeleteOutlinedIcon /></IconButton>
          </Stack>)}
          <OutlineBtn small onClick={() => setDraft({ columns: [...tableDraft.columns, ''], columnGroups: [...tableDraft.columnGroups, ''], rows: tableDraft.rows.map(row => ({ ...row, values: [...row.values, ''] })) })}>Add column</OutlineBtn>
          <Divider />
          <Typography sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Rows ({tableDraft.rows.length})</Typography>
          {tableDraft.rows.map((row, rowIndex) => <Stack key={rowIndex} spacing={1} sx={{ p: 1.5, border: '1px solid var(--border-color)', borderRadius: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography sx={{ color: 'var(--text-secondary)' }}>Row {rowIndex + 1}</Typography><><FormControlLabel control={<Switch checked={row.fixed} onChange={event => setDraft({ rows: tableDraft.rows.map((item, i) => i === rowIndex ? { ...item, fixed: event.target.checked } : item) })} />} label="Fixed row" /><IconButton aria-label={`Remove row ${rowIndex + 1}`} onClick={() => setDraft({ rows: tableDraft.rows.filter((_, i) => i !== rowIndex) })}><DeleteOutlinedIcon /></IconButton></></Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>{tableDraft.columns.map((_, columnIndex) => <TextField key={columnIndex} size="small" fullWidth label={`Row ${rowIndex + 1} · ${tableDraft.columns[columnIndex] || `Column ${columnIndex + 1}`}`} value={row.values[columnIndex] || ''} sx={inputSx} onChange={event => setDraft({ rows: tableDraft.rows.map((item, i) => i === rowIndex ? { ...item, values: item.values.map((value, j) => j === columnIndex ? event.target.value : value) } : item) })} />)}</Stack>
          </Stack>)}
          <OutlineBtn small onClick={() => setDraft({ rows: [...tableDraft.rows, emptyTableRow(tableDraft.columns.length)] })}>Add row</OutlineBtn>
        </Stack>
      </DialogContent>
      <DialogActions><OutlineBtn onClick={() => setTableTarget(null)}>Cancel</OutlineBtn><PrimaryBtn onClick={saveTable}>Save table</PrimaryBtn></DialogActions>
    </Dialog>
  }

  return <AdminLayout>
    <PageHeader title="Syllabus Format" subtitle="Define what every syllabus section contains and what Faculty may complete." action={<PrimaryBtn onClick={save}>Save Format</PrimaryBtn>} />
    {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}
    <GlassCard>
      <Stack spacing={2}>
        <Typography sx={{ color: 'var(--text-primary)', fontWeight: 700 }}>Syllabus sections</Typography>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>Section names are managed by the Admin. Use the pencil to choose whether the whole section or only selected subsections are fixed. Anything not fixed is completed by Faculty.</Typography>
        <OutlineBtn small disabled={templateImport.busy} onClick={() => document.getElementById('syllabus-template-import')?.click()}>{templateImport.busy ? 'Analyzing template…' : 'Import from syllabus file (PDF/DOCX)'}</OutlineBtn>
        <input id="syllabus-template-import" hidden type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => { importTemplate(event.target.files?.[0]); event.target.value = '' }} />
        {templateImport.message && <Alert severity={templateImport.severity}>{templateImport.message}</Alert>}
        {!loading && !customization.syllabus_sections.length && <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>No sections yet. Add the first section below.</Typography>}
        {customization.syllabus_sections.map((section, index) => <Stack key={`${section.key}-${index}`} spacing={1.25} sx={{ p: 2, border: '1px solid var(--border-color)', borderRadius: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center"><TextField size="small" fullWidth label="Section name" placeholder="e.g. University Information" value={section.label || ''} onChange={event => updateSection(index, { label: event.target.value })} sx={inputSx} /><FormControlLabel control={<Switch checked={section.enabled !== false} onChange={event => updateSection(index, { enabled: event.target.checked })} />} label="Show" /><IconButton aria-label={`Edit ${section.label || 'section'} settings`} onClick={() => setSettingsTarget(index)}><EditIcon /></IconButton><IconButton aria-label={`Remove ${section.label || 'section'}`} onClick={() => setCustomization(current => ({ ...current, syllabus_sections: current.syllabus_sections.filter((_, i) => i !== index) }))}><DeleteOutlinedIcon /></IconButton></Stack>
          {section.faculty_fields?.length > 0 && <Stack spacing={0.5}><Typography variant="caption" sx={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Faculty Syllabus Module fields</Typography><Typography variant="caption" sx={{ color: 'var(--text-tertiary)' }}>{section.faculty_fields.join(' · ')}</Typography></Stack>}
          <Stack direction="row" spacing={2} alignItems="center"><FormControlLabel control={<Switch checked={Boolean(section.is_static)} onChange={event => updateSection(index, { is_static: event.target.checked })} />} label="All fixed" /><Typography variant="caption" sx={{ color: 'var(--text-secondary)' }}>{section.is_static ? 'Admin supplies all content in this section.' : 'Faculty supplies content unless a subsection is fixed.'}</Typography></Stack>
          {section.is_static && <TextField size="small" multiline minRows={2} label="Fixed section content" placeholder="Content managed by the Admin" value={section.static_content || ''} onChange={event => updateSection(index, { static_content: event.target.value })} sx={inputSx} />}
          {!section.is_static && <Stack spacing={1} sx={{ pl: 2, borderLeft: '2px solid var(--border-color)' }}><Typography sx={{ color: 'var(--text-secondary)', fontWeight: 700 }}>Subsections</Typography>{(section.subsections || []).map((subsection, subIndex) => <Stack key={subsection.key || subIndex} direction="row" spacing={1} alignItems="center"><TextField size="small" fullWidth label="Subsection name" placeholder="e.g. Mission" value={subsection.label || ''} onChange={event => updateSubsection(index, subIndex, { label: event.target.value })} sx={inputSx} /><Typography variant="caption" sx={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{subsection.is_static ? 'Fixed' : 'Faculty content'}</Typography><IconButton aria-label={`Toggle fixed for ${subsection.label || 'subsection'}`} onClick={() => updateSubsection(index, subIndex, { is_static: !subsection.is_static })}><Switch checked={Boolean(subsection.is_static)} /></IconButton><IconButton aria-label={`Remove ${subsection.label || 'subsection'}`} onClick={() => updateSection(index, { subsections: section.subsections.filter((_, i) => i !== subIndex) })}><DeleteOutlinedIcon /></IconButton></Stack>)}<OutlineBtn small sx={{ width: 'fit-content', alignSelf: 'flex-start' }} onClick={() => addSubsection(index)}>Add subsection</OutlineBtn></Stack>}
          {!section.is_static && <Stack direction="row" alignItems="center" justifyContent="space-between"><FormControlLabel control={<Switch checked={Boolean(section.table_enabled)} onChange={event => toggleTable(index, null, event.target.checked)} />} label="Include a table" />{section.table_enabled && <OutlineBtn small onClick={() => openTable(index)}>Table settings</OutlineBtn>}</Stack>}
          {!section.is_static && (section.subsections || []).map((subsection, subIndex) => subsection.table_enabled && <Stack key={`table-${subsection.key || subIndex}`} direction="row" alignItems="center" justifyContent="space-between" sx={{ pl: 2 }}><Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>{subsection.label || 'Subsection'} table</Typography><OutlineBtn small onClick={() => openTable(index, subIndex)}>Table settings</OutlineBtn></Stack>)}
        </Stack>)}
        <OutlineBtn small sx={{ width: 'fit-content', alignSelf: 'flex-start' }} onClick={() => setCustomization(current => ({ ...current, syllabus_sections: [...current.syllabus_sections, emptySection()] }))}>Add section</OutlineBtn>
      </Stack>
    </GlassCard>
    <Dialog open={settingsTarget != null} onClose={() => setSettingsTarget(null)} maxWidth="sm" fullWidth><DialogTitle sx={{ color: 'var(--text-primary)' }}>Section settings</DialogTitle><DialogContent sx={{ bgcolor: 'var(--bg-card)' }}>{settingsTarget != null && (() => { const section = customization.syllabus_sections[settingsTarget]; return <Stack spacing={2}><Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>Choose which parts are locked for this section. Turn on “All fixed” above to lock the complete section.</Typography>{(section.subsections || []).map((subsection, index) => <FormControlLabel key={subsection.key || index} control={<Switch checked={Boolean(subsection.is_static)} onChange={event => updateSubsection(settingsTarget, index, { is_static: event.target.checked })} />} label={`${subsection.label || `Subsection ${index + 1}`} — fixed for Faculty`} />)}</Stack> })()}</DialogContent><DialogActions><PrimaryBtn onClick={() => setSettingsTarget(null)}>Done</PrimaryBtn></DialogActions></Dialog>
    {renderTableEditor()}
  </AdminLayout>
}
