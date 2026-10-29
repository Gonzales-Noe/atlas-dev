// Mirrors the sections and content of the Faculty Syllabus workspace
// (src/components/FacultyWorkspacePage.jsx). The Syllabus Format page uses
// these blueprints so the Admin sees the same content Faculty complete and
// can decide which parts are fixed for everyone.
//
// Table descriptors are declarative:
//   columns        column headers, left to right
//   columnGroups   optional grouped header tier: { title, span, sub? }
//   subGroups      optional third tier under a group (e.g. Week No.)
//   defaultRows    seed rows; a null cell merges into the previous cell
//   rowLabels      leftmost header (e.g. ILOs) with fixed row labels
//   totalRow       computed totals row: { label, columns: [indexes] }
//   noteRow        merged footer row: { label, text }

const field = (key, label, type = 'text') => ({ key, label, type })

const iloRowLabels = ['ILO1', 'ILO2', 'ILO3', 'ILO4', 'ILO5', 'ILO6', 'ILO7']
const blankIloRows = Array.from({ length: 7 }, () => ['', '', '', ''])

export const SYLLABUS_SECTION_BLUEPRINTS = [
  {
    key: 'university-information',
    label: 'University Information',
    description: 'University direction applied to every syllabus: the Vision and Mission. Institution, program and college come from the course context automatically.',
    aliases: ['universityinfo', 'universitydirection'],
    groups: [
      {
        title: 'University Direction',
        fields: [
          field('vision', 'Vision', 'longtext'),
          field('mission', 'Mission', 'longtext'),
        ],
      },
    ],
  },
  {
    key: 'course-information',
    label: 'Course Information',
    description: 'Course identification, the course instructor, rationale and description, contact hours, criteria for assessment and teaching, learning, and assessment strategies.',
    aliases: ['courseinfo', 'courseidentification', 'basic', 'basicinfo', 'basicinformation', 'courseinformation', 'details', 'coursedetails'],
    groups: [
      {
        title: 'Course Identification',
        fields: [
          field('course-title', 'Course Title'),
          field('course-code', 'Course Code'),
          field('course-category', 'Course Category'),
          field('prerequisites', 'Pre-requisite(s)'),
          field('semester-year', 'Semester / Year'),
          field('credit-hours', 'Credit Hours'),
          field('reference-cmo', 'Reference CMO'),
          field('date-prepared', 'Date Prepared'),
          field('revision-no', 'Revision No.'),
          field('revision-date', 'Revision Date'),
          field('period-of-study', 'Period of Study'),
        ],
      },
      {
        title: 'Course Instructor',
        fields: [
          field('instructor-code', '7.1 Code'),
          field('instructor-qualification', '7.2 Title / Qualification', 'longtext'),
          field('instructor-email', '7.3 Email'),
        ],
      },
      {
        title: 'Course Details',
        fields: [
          field('course-rationale-description', 'Course Rationale and Description', 'longtext'),
          field('contact-hours', 'Contact Hours'),
          field('criteria-for-assessment', 'Criteria for Assessment', 'longtext'),
          field('tla-strategies', 'Teaching, Learning, and Assessment Strategies', 'longtext'),
        ],
      },
    ],
  },
  {
    key: 'iloat-references',
    label: 'ILO, AT, and References',
    description: 'Intended learning outcomes, the assessment task distribution map, and books and other references.',
    aliases: ['iloat', 'iloatreferences', 'iloassessments', 'ilosassessments', 'iloatandreferences'],
    groups: [
      {
        title: 'Intended Learning Outcomes (ILO)',
        fields: [
          field('ilos', 'Intended Learning Outcomes', 'repeat'),
        ],
      },
      {
        title: 'Assessment Tasks (AT)',
        fields: [
          field('ats', 'Assessment tasks & score distribution', 'table'),
        ],
      },
      {
        title: 'Books and Other References',
        fields: [
          field('references', 'Books and Other References', 'repeat'),
        ],
      },
    ],
    tables: [
      {
        key: 'ilo-table',
        title: 'Table 1: Intended Learning Outcomes (ILO)',
        columns: ['ILO', 'Upon completion of this course, the students should be able to:'],
        defaultRows: [
          ['ILO1', ''],
          ['ILO2', ''],
          ['ILO3', ''],
        ],
      },
      {
        key: 'at-distribution-map',
        title: 'Table 2: Assessment Method and Distribution Map',
        columnGroups: [
          { title: 'Assessment Tasks (AT) Distribution', span: 4 },
          { title: 'Intended Learning Outcomes', span: 3, dynamic: 'ilo' },
          { title: 'Domains', span: 3 },
        ],
        columns: ['Code', 'Assessment Tasks', 'I/R/D', '(%)', '1', '2', '3', 'C', 'P', 'A'],
        defaultRows: [],
        totalRow: { label: 'Total', columns: [3, 7, 8, 9] },
        noteRow: {
          label: 'Note:',
          text: 'All internal assessments with feedback will be made available within 2 week after each assessment submission except Final Project.',
        },
      },
      {
        key: 'books-references',
        title: 'Table 3: Books and Other References',
        columns: ['', ''],
        noHeader: true,
        defaultRows: [
          ['1', ''],
          ['2', ''],
          ['3', ''],
          ['4', ''],
          ['5', ''],
        ],
      },
    ],
  },
  {
    key: 'framework-mapping',
    label: 'Framework Mapping',
    description: 'Institutional Graduate Attributes (IGA), Student Outcomes (SO), CDIO framework skills and SDG skills statements mapped to the course.',
    aliases: ['frameworkmapping', 'frameworkalignment', 'fwmap'],
    tabs: [
      {
        key: 'iga',
        label: 'IGA',
        table: {
          key: 'iga-table',
          title: 'Institutional Graduate Attributes (IGA)',
          columns: ['IGA', 'Institutional Graduate Attributes (IGA) Statements'],
          defaultRows: Array.from({ length: 8 }, (_, i) => [`IGA${i + 1}`, '']),
        },
      },
      {
        key: 'so',
        label: 'SO',
        table: {
          key: 'so-table',
          title: 'Student Outcomes (SO)',
          columns: ['SO', 'Student Outcomes (SO) Statements'],
          defaultRows: Array.from({ length: 6 }, (_, i) => [`SO${i + 1}`, '']),
        },
      },
      {
        key: 'cdio',
        label: 'CDIO',
        table: {
          key: 'cdio-table',
          title: 'Framework Skills',
          columns: ['CDIO', 'CDIO Skills'],
          defaultRows: Array.from({ length: 4 }, (_, i) => [`CDIO${i + 1}`, '']),
        },
      },
      {
        key: 'sdg',
        label: 'SDG',
        table: {
          key: 'sdg-table',
          title: 'Sustainable Development Goals Skills',
          columns: ['SDG', 'SDG Skills'],
          defaultRows: Array.from({ length: 5 }, (_, i) => [`SDG${i + 1}`, '']),
        },
      },
    ],
    groups: [
      {
        title: 'Framework statements',
        fields: [
          field('igas', 'Institutional Graduate Attributes (IGA)', 'repeat'),
          field('student-outcomes', 'Student Outcomes (SO)', 'repeat'),
          field('cdio-skills', 'CDIO Skills', 'repeat'),
          field('sdg-skills', 'SDG Skills', 'repeat'),
        ],
      },
    ],
  },
  {
    key: 'course-policies',
    label: 'Course Policies',
    description: 'The grading system, class policy, missed examinations, academic dishonesty, dropping, and other course policies and requirements.',
    aliases: ['coursepolicies', 'policies', 'grading', 'gradingsystem', 'gradingcriteria'],
    groups: [
      {
        title: 'B. Course Policies',
        fields: [
          field('class-policy', 'Class Policy', 'longtext'),
          field('missed-examinations', 'Missed Examinations', 'longtext'),
          field('academic-dishonesty', 'Academic Dishonesty', 'longtext'),
          field('dropping', 'Dropping', 'longtext'),
        ],
      },
      {
        title: 'C. Other Course Policies and Requirements',
        fields: [
          field('other-policies', 'Other Course Policies and Requirements', 'longtext'),
        ],
      },
    ],
    tables: [
      {
        key: 'grading-scale',
        title: 'A. Grading System',
        intro: 'The grading system adopted by this course is as follows:',
        columns: ['Grade', 'Description', 'Range'],
        defaultRows: [
          ['1.0', '97–100', 'Excellent'],
          ['1.25', '94–96.99', 'Very Good'],
          ['1.5', '91–93.99', 'Very Good'],
          ['1.75', '88–90.99', 'Good'],
          ['2.0', '85–87.99', 'Good'],
          ['2.25', '82–84.99', 'Satisfactory'],
          ['2.5', '79–81.99', 'Satisfactory'],
          ['2.75', '76–78.99', 'Fair'],
          ['3.0', '75–75.99', 'Fair'],
          ['5.0', 'Below 75', 'Failing'],
          ['INC', 'Incomplete', null],
        ],
        footer: 'Students who got a computed grade of 70-74 will be given an appropriate remedial activity in which the final grade should be either passing (3.0) or failure (5.0). No rounding off of grades shall be allowed.',
      },
    ],
  },
  {
    key: 'tla-activities',
    label: 'Teaching, Learning, and Assessment (TLA) Activities',
    description: 'The weekly teaching, learning, and assessment plan and the assessment method schedule across the 17 weeks of the term.',
    aliases: ['tlaactivities', 'tlactivities', 'schedule', 'weeklyschedule', 'courseoutline'],
    groups: [],
    tables: [
      {
        key: 'tla-table',
        title: 'Table 1: Teaching, Learning, and Assessment (TLA) Activities',
        columns: ['Ch.', 'Topics/Reading List', 'Wks', 'Topic Outcomes', 'ILO', 'SO', 'Delivery Method'],
        defaultRows: Array.from({ length: 8 }, () => ['', '', '', '', '', '', '']),
      },
      {
        key: 'assessment-schedule',
        title: 'Table 2: Assessment Method',
        columnGroups: [{ title: 'Assessment Schedule', span: 18 }],
        subGroups: [
          { title: 'Distribution', span: 1 },
          { title: 'Week No.', span: 17 },
        ],
        columns: ['Distribution', ...Array.from({ length: 17 }, (_, i) => String(i + 1))],
        defaultRows: Array.from({ length: 6 }, () => Array.from({ length: 18 }, () => '')),
      },
    ],
  },
  {
    key: 'mapping-of-at',
    label: 'Mapping of AT',
    description: 'Mapping of assessment tasks to student outcomes and CPA domains, institutional graduate attributes, and CDIO and SDG skills.',
    aliases: ['mappingofat', 'atmapping', 'ilofwmatrix', 'iloframeworkmatrix', 'iloframeworkmapping', 'iloatmatrix', 'iloassessmentsmatrix', 'iloalignedassessmenttaskmatrix'],
    groups: [],
    tables: [
      {
        key: 'ilo-so-cpa-map',
        title: 'STUDENT OUTCOMES (SO): Mapping of Assessment Tasks (AT)',
        rowLabels: { header: 'ILOs', values: iloRowLabels },
        columnGroups: [{ title: 'STUDENT OUTCOMES (SO): Mapping of Assessment Tasks (AT)', span: 4 }],
        columns: ['2', '3', 'P', 'A'],
        defaultRows: [
          ['WA LA PA', 'LA', 'WA PA', ''],
          ['WA LA MA', 'LA', 'WA MA', 'LA'],
          ['WA LA FA FP', 'LA FP', 'WA FA', 'LA FP'],
          ...blankIloRows.slice(3),
        ],
      },
      {
        key: 'ilo-iga-map',
        title: 'INSTITUTIONAL GRADUATE ATTRIBUTES (IGA): Mapping of Assessment Tasks (AT)',
        rowLabels: { header: 'ILOs', values: iloRowLabels },
        columnGroups: [{ title: 'INSTITUTIONAL GRADUATE ATTRIBUTES (IGA): Mapping of Assessment Tasks (AT)', span: 4 }],
        columns: ['2', '3', '4', '5'],
        defaultRows: [
          ['WA PA', 'LA', 'LA', ''],
          ['WA MA', 'LA', 'LA', ''],
          ['WA FA', 'LA FP', 'LA FP', ''],
          ...blankIloRows.slice(3),
        ],
      },
      {
        key: 'ilo-cdio-sdg-map',
        title: 'CDIO SKILLS and SDG Skills: Mapping of Assessment Tasks (AT)',
        rowLabels: { header: 'ILOs', values: iloRowLabels },
        columnGroups: [
          { title: 'CDIO SKILLS', span: 1 },
          { title: 'SDG Skills', span: 2 },
        ],
        columns: ['4', '1', '5'],
        defaultRows: [
          ['WA LA PA', 'WA PA', ''],
          ['WA LA MA', 'WA MA', 'LA'],
          ['WA LA FA FP', 'WA FA', 'LA FP'],
          ['', '', ''],
          ['', '', ''],
          ['', '', ''],
          ['', '', ''],
        ],
      },
    ],
  },
]

const BLUEPRINT_BY_KEY = new Map(SYLLABUS_SECTION_BLUEPRINTS.map(item => [item.key, item]))

function normalizeToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function findSectionBlueprint(section) {
  if (!section) return null
  const candidates = [section.editor, section.key, section.label]
    .filter(Boolean)
    .map(normalizeToken)
  for (const blueprint of SYLLABUS_SECTION_BLUEPRINTS) {
    const tokens = [
      blueprint.key,
      blueprint.label,
      ...(blueprint.aliases || []),
    ].map(normalizeToken)
    if (candidates.some(candidate => tokens.includes(candidate))) return blueprint
  }
  return BLUEPRINT_BY_KEY.get(section.editor) || null
}

function blueprintFields(blueprint) {
  return (blueprint.groups || []).flatMap(group =>
    (group.fields || []).map(item => ({
      key: item.key,
      label: item.label,
      type: item.type,
      group: group.title,
      lockable: !blueprint.derived && (item.type === 'text' || item.type === 'longtext'),
      fixed: false,
      content: '',
    })),
  )
}

function normalizeSubsection(subsection, index) {
  const columns = Array.isArray(subsection.table_columns) ? subsection.table_columns : []
  return {
    key: subsection.key || `subsection-${index + 1}`,
    label: subsection.label || '',
    required: Boolean(subsection.required),
    is_static: Boolean(subsection.is_static),
    static_content: subsection.static_content || '',
    table_enabled: Boolean(subsection.table_enabled),
    table_columns: columns,
    table_column_groups: Array.isArray(subsection.table_column_groups)
      ? subsection.table_column_groups
      : columns.map(() => ''),
    table_rows: Array.isArray(subsection.table_rows) ? subsection.table_rows : [],
    // Admin-added fields can be anchored to a built-in field so they render
    // beside that field instead of at the end of the section.
    after: typeof subsection.after === 'string' ? subsection.after : '',
  }
}

function mergeFields(blueprint, savedFields) {
  const base = blueprintFields(blueprint)
  const baseKeys = new Set(base.map(item => item.key))
  const merged = base.map(item => {
    const saved = savedFields.find(entry => entry.key === item.key)
    return saved
      ? {
        ...item,
        label: (saved.label || '').trim() || item.label,
        fixed: item.lockable && Boolean(saved.fixed),
        content: item.lockable ? saved.content || '' : '',
      }
      : item
  })
  const extras = savedFields
    .filter(entry => entry.key && !baseKeys.has(entry.key))
    .map(entry => ({
      key: entry.key,
      label: entry.label || entry.key,
      type: entry.type || 'text',
      group: entry.group || 'Additional fields',
      lockable: entry.lockable !== false,
      fixed: Boolean(entry.fixed),
      content: entry.content || '',
    }))

  // Saved order wins so the admin's drag arrangement survives a reload.
  // New blueprint fields and extras keep their relative order at the end.
  const items = [...merged, ...extras]
  const byKey = new Map(items.map(item => [item.key, item]))
  const ordered = []
  const used = new Set()
  savedFields.forEach(entry => {
    if (!entry?.key || used.has(entry.key) || !byKey.has(entry.key)) return
    ordered.push(byKey.get(entry.key))
    used.add(entry.key)
  })
  items.forEach(item => {
    if (!used.has(item.key)) {
      ordered.push(item)
      used.add(item.key)
    }
  })
  return ordered
}

function normalizeTableOverride(override) {
  if (!override || typeof override !== 'object') return null
  const columns = Array.isArray(override.columns)
    ? override.columns.map(column => String(column ?? ''))
    : []
  if (!columns.length) return null
  const rows = Array.isArray(override.rows)
    ? override.rows.map(row => columns.map((_, index) => {
      const value = Array.isArray(row) ? row[index] : ''
      return value === null ? null : String(value ?? '')
    }))
    : []
  const rowLabels = Array.isArray(override.rowLabels)
    ? override.rowLabels.map(label => String(label ?? ''))
    : []
  return {
    columns,
    rows,
    rowLabels,
    // Older saved tables have no flag and stay locked. Fixed off is explicit.
    fixed: override.fixed !== false,
  }
}

function mergeSection(section, index) {
  const blueprint = findSectionBlueprint(section)
  const savedFields = Array.isArray(section.fields) ? section.fields : []
  const common = {
    key: section.key || blueprint?.key || `section-${index + 1}`,
    label: section.label || blueprint?.label || '',
    enabled: section.enabled !== false,
    is_static: Boolean(section.is_static),
    static_content: section.static_content || '',
    subsections: Array.isArray(section.subsections)
      ? section.subsections.map(normalizeSubsection)
      : [],
    table_enabled: Boolean(section.table_enabled),
    table_columns: Array.isArray(section.table_columns) ? section.table_columns : [],
    table_column_groups: Array.isArray(section.table_column_groups)
      ? section.table_column_groups
      : [],
    table_rows: Array.isArray(section.table_rows) ? section.table_rows : [],
    table_titles: normalizeTableTitles(section.table_titles),
    table_order: Array.isArray(section.table_order) ? section.table_order.filter(Boolean) : [],
    blueprint_tables: normalizeTableOverrides(section.blueprint_tables),
  }
  if (!blueprint) {
    return { ...common, editor: section.editor || null, fields: savedFields, derived: false }
  }
  return {
    ...common,
    editor: blueprint.key,
    derived: Boolean(blueprint.derived),
    fields: mergeFields(blueprint, savedFields),
  }
}

export function blueprintGroupsFor(section) {
  const blueprint = findSectionBlueprint(section)
  return blueprint?.groups || []
}

export function blueprintTablesFor(section) {
  const blueprint = findSectionBlueprint(section)
  return blueprint?.tables || []
}

export function blueprintTableFor(section) {
  return blueprintTablesFor(section)[0] || null
}

export function blueprintTabsFor(section) {
  const blueprint = findSectionBlueprint(section)
  return blueprint?.tabs || []
}

// Every built-in table an admin can fix, including the ones nested in tabs
// (Framework Mapping). Keys are stable across institutions.
export function blueprintTablesWithTabsFor(section) {
  const blueprint = findSectionBlueprint(section)
  if (!blueprint) return []
  const tabTables = (blueprint.tabs || []).map(tab => tab.table).filter(Boolean)
  return [...(blueprint.tables || []), ...tabTables]
}

function normalizeTableTitles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.entries(value).reduce((out, [key, title]) => {
    const text = String(title ?? '').trim()
    if (key && text) out[key] = text
    return out
  }, {})
}

export function normalizeTableOverrides(value) {
  if (!value || typeof value !== 'object') return {}
  return Object.entries(value).reduce((out, [key, override]) => {
    const normalized = normalizeTableOverride(override)
    if (normalized) out[key] = normalized
    return out
  }, {})
}

// Admin-saved content replaces the descriptor's column names and rows while
// keeping structural details (group headers, totals, notes) from the blueprint.
export function applyTableOverride(table, override) {
  if (!table || !override) return table
  const normalized = normalizeTableOverride(override)
  if (!normalized) return table
  return {
    ...table,
    columns: normalized.columns,
    defaultRows: normalized.rows,
    rowLabels: table.rowLabels
      ? {
        ...table.rowLabels,
        values: normalized.rowLabels.length
          ? normalized.rowLabels
          : normalized.rows.map((_, index) => table.rowLabels.values?.[index] || `Row ${index + 1}`),
      }
      : table.rowLabels,
  }
}

export function cloneDefaultSyllabusSections() {
  return SYLLABUS_SECTION_BLUEPRINTS.map((blueprint, index) => mergeSection({
    key: blueprint.key,
    label: blueprint.label,
    editor: blueprint.key,
  }, index))
}

export function mergeSyllabusSections(sections) {
  if (!Array.isArray(sections) || !sections.length) return cloneDefaultSyllabusSections()
  return sections.map(mergeSection)
}

export function countSectionFields(section) {
  return (section.fields || []).length + (section.subsections || []).length
}

// Admin field keys -> faculty syllabusData keys. Keep in sync with
// FIXED_FIELD_KEYS in backend/apps/integrations/fixed_syllabus.py.
const FIXED_FIELD_KEYS = {
  vision: 'vision',
  mission: 'mission',
  'course-title': 'course_title',
  'course-code': 'course_code',
  'course-category': 'course_category',
  prerequisites: 'prerequisites',
  'semester-year': 'semester_year',
  'credit-hours': 'credit_hours',
  'reference-cmo': 'reference_cmo',
  'date-prepared': 'date_prepared',
  'revision-no': 'revision_no',
  'revision-date': 'revision_date',
  'period-of-study': 'period_of_study',
  'instructor-code': 'employee_id',
  'instructor-qualification': 'education',
  'instructor-email': 'instructor_email',
  'course-rationale-description': 'rationale',
  'contact-hours': 'contact_hours',
  'criteria-for-assessment': 'assessment_criteria',
  'tla-strategies': 'tlas',
  'class-policy': 'class_policy',
  'missed-examinations': 'missed_examinations',
  'academic-dishonesty': 'academic_dishonesty',
  dropping: 'dropping',
  'other-policies': 'other_policies',
}

const ATTR_TABLES = {
  'iga-table': 'igas',
  'so-table': 'student_outcomes',
  'cdio-table': 'cdio_skills',
  'sdg-table': 'sdg_skills',
}

function cellText(row, index) {
  if (!Array.isArray(row) || index == null || index < 0 || index >= row.length || row[index] == null) return ''
  return String(row[index]).trim()
}

function tableRows(override) {
  return Array.isArray(override?.rows) ? override.rows.filter(row => Array.isArray(row)) : []
}

function tableColumns(override) {
  return Array.isArray(override?.columns) ? override.columns.map(column => String(column ?? '')) : []
}

function tableHasText(override) {
  if (tableRows(override).some(row => row.some((_, index) => cellText(row, index)))) return true
  return Array.isArray(override?.rowLabels) && override.rowLabels.some(label => String(label ?? '').trim())
}

function headerIndex(columns, predicate, fallback = null) {
  const found = columns.findIndex(header => predicate(String(header || '').trim().toLowerCase()))
  if (found >= 0) return found
  return fallback != null && fallback < columns.length ? fallback : null
}

function attrItems(override) {
  return tableRows(override).flatMap(row => {
    const code = cellText(row, 0)
    const description = cellText(row, 1)
    return code || description ? [{ code, title: '', description }] : []
  })
}

function tablePatch(tableKey, override) {
  if (!override || !tableHasText(override)) return {}
  const columns = tableColumns(override)
  const rows = tableRows(override)
  if (ATTR_TABLES[tableKey]) return { [ATTR_TABLES[tableKey]]: attrItems(override) }
  if (tableKey === 'ilo-table') {
    const index = columns.length >= 2 ? 1 : 0
    return { ilos: rows.map(row => cellText(row, index)).filter(Boolean) }
  }
  if (tableKey === 'books-references') {
    const index = columns.length >= 2 ? 1 : 0
    return { references: rows.map(row => cellText(row, index)).filter(Boolean) }
  }
  if (tableKey === 'grading-scale') {
    const gradeAt = headerIndex(columns, header => header === 'grade', 0)
    const ratingAt = headerIndex(columns, header => header.includes('description') || header === 'rating', 1)
    const rangeAt = headerIndex(columns, header => header === 'range', 2)
    return {
      grading_rows: rows.flatMap(row => {
        const grade = cellText(row, gradeAt)
        const rating = cellText(row, ratingAt)
        const range = cellText(row, rangeAt)
        return grade || rating || range ? [{ grade, rating, range }] : []
      }),
    }
  }
  if (tableKey === 'tla-table') {
    const at = {
      chapter: headerIndex(columns, header => ['ch.', 'ch', 'chapter'].includes(header) || header.startsWith('ch'), 0),
      topics: headerIndex(columns, header => header.includes('topic') && !header.includes('outcome'), 1),
      weeks: headerIndex(columns, header => header.includes('week') || header === 'wks' || header === 'wks.', 2),
      outcomes: headerIndex(columns, header => header.includes('outcome'), 3),
      ilo: headerIndex(columns, header => header === 'ilo' || header.startsWith('ilo'), 4),
      so: headerIndex(columns, header => header === 'so' || header.startsWith('so '), 5),
      delivery: headerIndex(columns, header => header.includes('delivery'), 6),
    }
    return {
      tla_chapters: rows.flatMap(row => {
        const chapter = {
          chapter: cellText(row, at.chapter),
          topics: cellText(row, at.topics),
          weeks: cellText(row, at.weeks),
          outcomes: cellText(row, at.outcomes),
          ilo: cellText(row, at.ilo),
          ilo_refs: [],
          so: cellText(row, at.so),
          delivery: cellText(row, at.delivery),
        }
        return Object.entries(chapter).some(([key, value]) => key !== 'ilo_refs' && value) ? [chapter] : []
      }),
    }
  }
  if (tableKey === 'assessment-schedule') {
    const width = columns.length
    return {
      schedule_methods: rows.flatMap(row => {
        const name = cellText(row, 0)
        const values = Array.from({ length: Math.max(width, row.length) - 1 }, (_, index) => cellText(row, index + 1))
        return name || values.some(Boolean) ? [{ name, values }] : []
      }),
    }
  }
  if (tableKey === 'ilo-so-cpa-map') {
    const specials = {}
    const headers = []
    const headerIndexes = []
    columns.forEach((column, index) => {
      const token = column.trim().toLowerCase()
      if (token === 'c' || token === 'p' || token === 'a') specials[token] = index
      else {
        headers.push(column.trim())
        headerIndexes.push(index)
      }
    })
    return {
      so_headers: headers,
      so_cpa_rows: rows.map(row => ({
        so_vals: headerIndexes.map(index => cellText(row, index)),
        c: cellText(row, specials.c),
        p: cellText(row, specials.p),
        a: cellText(row, specials.a),
      })),
    }
  }
  if (tableKey === 'ilo-iga-map') {
    return {
      iga_headers: columns.map(column => column.trim()),
      iga_rows: rows.map(row => ({ vals: columns.map((_, index) => cellText(row, index)) })),
    }
  }
  if (tableKey === 'ilo-cdio-sdg-map') {
    const cdioCount = columns.length > 1 ? 1 : columns.length
    return {
      cdio_headers: columns.slice(0, cdioCount).map(column => column.trim()),
      sdg_headers: columns.slice(cdioCount).map(column => column.trim()),
      cdio_sdg_rows: rows.map(row => ({
        cdio_vals: columns.slice(0, cdioCount).map((_, index) => cellText(row, index)),
        sdg_vals: columns.slice(cdioCount).map((_, index) => cellText(row, cdioCount + index)),
      })),
    }
  }
  if (tableKey === 'at-distribution-map') {
    const codeAt = headerIndex(columns, header => header === 'code', 0)
    const taskAt = headerIndex(columns, header => header.includes('assessment') || header === 'task', 1)
    const irdAt = headerIndex(columns, header => header.includes('i/r/d') || header === 'ird', 2)
    const weightAt = headerIndex(columns, header => header.includes('%') || header === 'weight', 3)
    const domain = {
      c: headerIndex(columns, header => header === 'c'),
      p: headerIndex(columns, header => header === 'p'),
      a: headerIndex(columns, header => header === 'a'),
    }
    const used = new Set([codeAt, taskAt, irdAt, weightAt, domain.c, domain.p, domain.a].filter(index => index != null))
    const iloIndexes = columns.map((_, index) => index).filter(index => !used.has(index))
    return {
      assessment_tasks: rows.flatMap(row => {
        const task = {
          code: cellText(row, codeAt),
          task: cellText(row, taskAt),
          ird: cellText(row, irdAt),
          weight: cellText(row, weightAt),
          ilo_values: iloIndexes.map(index => cellText(row, index)),
          c: cellText(row, domain.c),
          p: cellText(row, domain.p),
          a: cellText(row, domain.a),
        }
        const filled = [task.code, task.task, task.ird, task.weight, task.c, task.p, task.a, ...task.ilo_values].some(Boolean)
        return filled ? [task] : []
      }),
    }
  }
  return {}
}

function configuredTableRows(tableRows) {
  return (Array.isArray(tableRows) ? tableRows : []).flatMap(row => {
    const values = Array.isArray(row?.values) ? row.values : (Array.isArray(row) ? row : null)
    if (!values) return []
    const cells = values.map(value => (value == null ? '' : String(value).trim()))
    return cells.some(Boolean) ? [cells] : []
  })
}

export function fixedContentPatch(sections) {
  const patch = {}
  const customSections = {}
  const customSubsections = {}
  const customTables = {}
  ;(Array.isArray(sections) ? sections : []).forEach(section => {
    if (!section || section.enabled === false) return
    const sectionKey = String(section.key || section.editor || '').trim()
    const sectionFixed = Boolean(section.is_static)
    ;(section.fields || []).forEach(field => {
      const dataKey = FIXED_FIELD_KEYS[field?.key]
      const content = String(field?.content ?? '').trim()
      if (dataKey && content && (sectionFixed || field.fixed)) patch[dataKey] = field.content
    })
    Object.entries(section.blueprint_tables || {}).forEach(([tableKey, override]) => {
      if (override && override.fixed === false && !sectionFixed) return
      Object.assign(patch, tablePatch(tableKey, override))
    })
    if (sectionFixed && String(section.static_content ?? '').trim() && sectionKey) {
      customSections[sectionKey] = section.static_content
    }
    const sectionTables = configuredTableRows(section.table_rows)
    if (section.table_enabled && sectionTables.length && sectionKey) {
      customTables[sectionKey] = { ...(customTables[sectionKey] || {}), __section__: sectionTables }
    }
    ;(section.subsections || []).forEach(subsection => {
      const subKey = String(subsection?.key || '').trim()
      if (!subKey || !sectionKey) return
      if (subsection.is_static && String(subsection.static_content ?? '').trim()) {
        customSubsections[sectionKey] = { ...(customSubsections[sectionKey] || {}), [subKey]: subsection.static_content }
      }
      const subTables = configuredTableRows(subsection.table_rows)
      if (subsection.table_enabled && subTables.length) {
        customTables[sectionKey] = { ...(customTables[sectionKey] || {}), [subKey]: subTables }
      }
    })
  })
  if (Object.keys(customSections).length) patch.custom_sections = customSections
  if (Object.keys(customSubsections).length) patch.custom_subsections = customSubsections
  if (Object.keys(customTables).length) patch.custom_tables = customTables
  return patch
}

function mergeFixedValue(existing, incoming) {
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)
    && existing && typeof existing === 'object' && !Array.isArray(existing)) {
    const merged = { ...existing }
    Object.entries(incoming).forEach(([key, value]) => {
      merged[key] = mergeFixedValue(existing[key], value)
    })
    return merged
  }
  return incoming
}

function sameFixedValue(left, right) {
  if (left === right) return true
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return false
  }
}

// Write institution-fixed fields and tables onto a faculty syllabus object.
// Returns the same object when nothing changes.
export function applyFixedSyllabusContent(content, sections) {
  const source = content && typeof content === 'object' ? content : {}
  const patch = fixedContentPatch(sections)
  const keys = Object.keys(patch)
  if (!keys.length) return content
  let changed = false
  const next = { ...source }
  keys.forEach(key => {
    const value = mergeFixedValue(source[key], patch[key])
    if (!sameFixedValue(source[key], value)) {
      next[key] = value
      changed = true
    }
  })
  return changed ? next : content
}
