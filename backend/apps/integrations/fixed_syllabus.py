"""Copy admin-fixed syllabus content into every institution and course.

An admin's fixed fields and tables are the format for the whole deployment:
every institution that already exists, every institution created later, and
every faculty or admin account, because those accounts read the institution
format and the course syllabus.
"""

import copy

from django.utils import timezone

from apps.integrations.models import Course, Institution, InstitutionCustomization, Syllabus

# Admin Syllabus Format field keys -> faculty syllabus_content keys.
# Mirrors ADMIN_FIXED_FIELDS in FacultyWorkspacePage.jsx.
FIXED_FIELD_KEYS = {
    'vision': 'vision',
    'mission': 'mission',
    'course-title': 'course_title',
    'course-code': 'course_code',
    'course-category': 'course_category',
    'prerequisites': 'prerequisites',
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
    'dropping': 'dropping',
    'other-policies': 'other_policies',
}

_ATTR_TABLES = {
    'iga-table': 'igas',
    'so-table': 'student_outcomes',
    'cdio-table': 'cdio_skills',
    'sdg-table': 'sdg_skills',
}


def sections_for_course(course):
    """The admin format that a faculty save must obey for this course."""
    sections = sections_for_institution(getattr(course, 'institution', None))
    if fixed_content_patch(sections):
        return sections
    shared = canonical_syllabus_sections()
    if fixed_content_patch(shared):
        return shared
    return sections


def sections_for_institution(institution):
    if institution is None:
        return []
    customization = (
        InstitutionCustomization.objects.filter(institution=institution)
        .only('syllabus_sections')
        .first()
    )
    sections = customization.syllabus_sections if customization else None
    return sections if isinstance(sections, list) else []


def canonical_syllabus_sections():
    """The format most recently saved by an admin, shared with every institution."""
    for customization in InstitutionCustomization.objects.order_by('-updated_at').iterator():
        sections = customization.syllabus_sections
        if isinstance(sections, list) and sections:
            return sections
    return []


def attach_shared_syllabus_format(institution):
    """Give a new institution the fixed format already published for the deployment."""
    if institution is None:
        return
    sections = canonical_syllabus_sections()
    if not sections:
        return
    customization, _ = InstitutionCustomization.objects.get_or_create(institution=institution)
    if isinstance(customization.syllabus_sections, list) and customization.syllabus_sections:
        return
    customization.syllabus_sections = copy.deepcopy(sections)
    customization.save(update_fields=['syllabus_sections', 'updated_at'])


def _text(value):
    if value is None:
        return ''
    return str(value)


def _rows(override):
    rows = override.get('rows') if isinstance(override, dict) else None
    return [row for row in rows if isinstance(row, list)] if isinstance(rows, list) else []


def _columns(override):
    columns = override.get('columns') if isinstance(override, dict) else None
    return [_text(column) for column in columns] if isinstance(columns, list) else []


def _cell(row, index):
    if index is None or index < 0 or index >= len(row):
        return ''
    return _text(row[index]).strip()


def _table_has_text(override):
    for row in _rows(override):
        if any(_cell(row, index) for index in range(len(row))):
            return True
    labels = override.get('rowLabels') if isinstance(override, dict) else None
    if isinstance(labels, list) and any(_text(label).strip() for label in labels):
        return True
    return False


def _header_index(columns, predicate, fallback=None):
    for index, header in enumerate(columns):
        if predicate(header.strip().lower()):
            return index
    return fallback if fallback is not None and fallback < len(columns) else None


def _attr_items(override):
    items = []
    for row in _rows(override):
        code = _cell(row, 0)
        description = _cell(row, 1)
        if not code and not description:
            continue
        items.append({'code': code, 'title': '', 'description': description})
    return items


def _statement_list(override):
    statements = []
    for row in _rows(override):
        column = 1 if len(_columns(override)) >= 2 else 0
        statements.append(_cell(row, column))
    return [statement for statement in statements if statement]


def _reference_list(override):
    columns = _columns(override)
    index = 1 if len(columns) >= 2 else 0
    return [title for title in (_cell(row, index) for row in _rows(override)) if title]


def _grading_rows(override):
    columns = _columns(override)
    grade_at = _header_index(columns, lambda header: header == 'grade', 0)
    rating_at = _header_index(columns, lambda header: 'description' in header or header == 'rating', 1)
    range_at = _header_index(columns, lambda header: header == 'range', 2)
    rows = []
    for row in _rows(override):
        grade = _cell(row, grade_at)
        rating = _cell(row, rating_at)
        grade_range = _cell(row, range_at)
        if not grade and not rating and not grade_range:
            continue
        rows.append({'grade': grade, 'rating': rating, 'range': grade_range})
    return rows


def _tla_chapters(override):
    columns = _columns(override)
    chapter_at = _header_index(columns, lambda header: header in {'ch.', 'ch', 'chapter'} or header.startswith('ch'), 0)
    topics_at = _header_index(columns, lambda header: 'topic' in header and 'outcome' not in header, 1)
    weeks_at = _header_index(columns, lambda header: 'week' in header or header in {'wks', 'wks.'}, 2)
    outcomes_at = _header_index(columns, lambda header: 'outcome' in header, 3)
    ilo_at = _header_index(columns, lambda header: header == 'ilo' or header.startswith('ilo'), 4)
    so_at = _header_index(columns, lambda header: header == 'so' or header.startswith('so '), 5)
    delivery_at = _header_index(columns, lambda header: 'delivery' in header, 6)
    chapters = []
    for row in _rows(override):
        chapter = {
            'chapter': _cell(row, chapter_at),
            'topics': _cell(row, topics_at),
            'weeks': _cell(row, weeks_at),
            'outcomes': _cell(row, outcomes_at),
            'ilo': _cell(row, ilo_at),
            'ilo_refs': [],
            'so': _cell(row, so_at),
            'delivery': _cell(row, delivery_at),
        }
        if any(chapter[key] for key in ('chapter', 'topics', 'weeks', 'outcomes', 'ilo', 'so', 'delivery')):
            chapters.append(chapter)
    return chapters


def _schedule_methods(override):
    methods = []
    width = len(_columns(override))
    for row in _rows(override):
        name = _cell(row, 0)
        values = [_cell(row, index) for index in range(1, max(width, len(row)))]
        if name or any(values):
            methods.append({'name': name, 'values': values})
    return methods


def _mapping_rows(override, kind):
    columns = _columns(override)
    if kind == 'so':
        specials = {}
        headers = []
        header_indexes = []
        for index, column in enumerate(columns):
            token = column.strip().lower()
            if token in {'c', 'p', 'a'}:
                specials[token] = index
            else:
                headers.append(column.strip())
                header_indexes.append(index)
        rows = []
        for row in _rows(override):
            rows.append({
                'so_vals': [_cell(row, index) for index in header_indexes],
                'c': _cell(row, specials.get('c')),
                'p': _cell(row, specials.get('p')),
                'a': _cell(row, specials.get('a')),
            })
        return {'so_headers': headers, 'so_cpa_rows': rows}
    if kind == 'iga':
        return {
            'iga_headers': [column.strip() for column in columns],
            'iga_rows': [{'vals': [_cell(row, index) for index in range(len(columns))]} for row in _rows(override)],
        }
    cdio_count = 1 if len(columns) > 1 else len(columns)
    return {
        'cdio_headers': [column.strip() for column in columns[:cdio_count]],
        'sdg_headers': [column.strip() for column in columns[cdio_count:]],
        'cdio_sdg_rows': [{
            'cdio_vals': [_cell(row, index) for index in range(cdio_count)],
            'sdg_vals': [_cell(row, index) for index in range(cdio_count, len(columns))],
        } for row in _rows(override)],
    }


def _assessment_tasks(override):
    columns = _columns(override)
    code_at = _header_index(columns, lambda header: header == 'code', 0)
    task_at = _header_index(columns, lambda header: 'assessment' in header or header == 'task', 1)
    ird_at = _header_index(columns, lambda header: 'i/r/d' in header or header == 'ird', 2)
    weight_at = _header_index(columns, lambda header: '%' in header or header == 'weight', 3)
    domain = {
        'c': _header_index(columns, lambda header: header == 'c'),
        'p': _header_index(columns, lambda header: header == 'p'),
        'a': _header_index(columns, lambda header: header == 'a'),
    }
    used = {index for index in (code_at, task_at, ird_at, weight_at, *domain.values()) if index is not None}
    ilo_indexes = [index for index in range(len(columns)) if index not in used]
    tasks = []
    for row in _rows(override):
        task = {
            'code': _cell(row, code_at),
            'task': _cell(row, task_at),
            'ird': _cell(row, ird_at),
            'weight': _cell(row, weight_at),
            'ilo_values': [_cell(row, index) for index in ilo_indexes],
            'c': _cell(row, domain['c']),
            'p': _cell(row, domain['p']),
            'a': _cell(row, domain['a']),
        }
        if any((task['code'], task['task'], task['ird'], task['weight'], task['c'], task['p'], task['a'])) or any(task['ilo_values']):
            tasks.append(task)
    return tasks


def _table_patch(table_key, override):
    if not isinstance(override, dict) or not _table_has_text(override):
        return {}
    if table_key in _ATTR_TABLES:
        return {_ATTR_TABLES[table_key]: _attr_items(override)}
    if table_key == 'ilo-table':
        return {'ilos': _statement_list(override)}
    if table_key == 'books-references':
        return {'references': _reference_list(override)}
    if table_key == 'grading-scale':
        return {'grading_rows': _grading_rows(override)}
    if table_key == 'tla-table':
        return {'tla_chapters': _tla_chapters(override)}
    if table_key == 'assessment-schedule':
        return {'schedule_methods': _schedule_methods(override)}
    if table_key == 'ilo-so-cpa-map':
        return _mapping_rows(override, 'so')
    if table_key == 'ilo-iga-map':
        return _mapping_rows(override, 'iga')
    if table_key == 'ilo-cdio-sdg-map':
        return _mapping_rows(override, 'cdio')
    if table_key == 'at-distribution-map':
        return {'assessment_tasks': _assessment_tasks(override)}
    return {}


def _configured_table_rows(table_rows):
    rows = []
    for row in table_rows or []:
        values = row.get('values') if isinstance(row, dict) else row
        if not isinstance(values, list):
            continue
        cells = [_text(value).strip() if value is not None else '' for value in values]
        if any(cells):
            rows.append(cells)
    return rows


def fixed_content_patch(sections):
    """The syllabus_content keys an institution has locked, and their values."""
    patch = {}
    custom_sections = {}
    custom_subsections = {}
    custom_tables = {}
    for section in sections or []:
        if not isinstance(section, dict) or section.get('enabled') is False:
            continue
        section_key = str(section.get('key') or section.get('editor') or '').strip()
        section_fixed = bool(section.get('is_static'))
        for field in section.get('fields') or []:
            if not isinstance(field, dict):
                continue
            data_key = FIXED_FIELD_KEYS.get(field.get('key'))
            content = _text(field.get('content')).strip()
            if data_key and content and (section_fixed or field.get('fixed')):
                patch[data_key] = field.get('content')
        for table_key, override in (section.get('blueprint_tables') or {}).items():
            if isinstance(override, dict) and override.get('fixed') is False and not section_fixed:
                continue
            patch.update(_table_patch(table_key, override))
        if section_fixed and _text(section.get('static_content')).strip() and section_key:
            custom_sections[section_key] = section.get('static_content')
        section_tables = _configured_table_rows(section.get('table_rows'))
        if section.get('table_enabled') and section_tables and section_key:
            custom_tables.setdefault(section_key, {})['__section__'] = section_tables
        for subsection in section.get('subsections') or []:
            if not isinstance(subsection, dict):
                continue
            sub_key = str(subsection.get('key') or '').strip()
            if not sub_key or not section_key:
                continue
            if subsection.get('is_static') and _text(subsection.get('static_content')).strip():
                custom_subsections.setdefault(section_key, {})[sub_key] = subsection.get('static_content')
            sub_tables = _configured_table_rows(subsection.get('table_rows'))
            if subsection.get('table_enabled') and sub_tables:
                custom_tables.setdefault(section_key, {})[sub_key] = sub_tables
    if custom_sections:
        patch['custom_sections'] = custom_sections
    if custom_subsections:
        patch['custom_subsections'] = custom_subsections
    if custom_tables:
        patch['custom_tables'] = custom_tables
    return patch


def _merge_value(existing, incoming):
    if isinstance(incoming, dict) and isinstance(existing, dict):
        merged = dict(existing)
        for key, value in incoming.items():
            merged[key] = _merge_value(existing.get(key), value)
        return merged
    return incoming


def apply_fixed_content(content, sections):
    """Return syllabus content with institution-fixed values written in."""
    base = dict(content) if isinstance(content, dict) else {}
    patch = fixed_content_patch(sections)
    if not patch:
        return base
    merged = dict(base)
    for key, value in patch.items():
        merged[key] = _merge_value(base.get(key), value)
    return merged


def seed_course_syllabi(course, sections=None):
    """Write fixed content onto this course's syllabi, creating one if needed."""
    if course is None:
        return 0
    if sections is None:
        sections = sections_for_course(course)
    if not fixed_content_patch(sections):
        return 0
    syllabi = list(Syllabus.objects.filter(course=course))
    if not syllabi:
        Syllabus.objects.create(
            course=course,
            status='Draft',
            term='',
            version=1,
            generated_at=timezone.now(),
            syllabus_content=apply_fixed_content({}, sections),
        )
        return 1
    updated = 0
    for syllabus in syllabi:
        current = syllabus.syllabus_content if isinstance(syllabus.syllabus_content, dict) else {}
        merged = apply_fixed_content(current, sections)
        if merged != current:
            syllabus.syllabus_content = merged
            syllabus.save(update_fields=['syllabus_content'])
            updated += 1
    return updated


def seed_institution_syllabi(institution, sections=None):
    """Seed every course in the institution, including courses with no syllabus yet."""
    if institution is None:
        return 0
    if sections is None:
        sections = sections_for_institution(institution)
    if not fixed_content_patch(sections):
        return 0
    updated = 0
    for course in Course.objects.filter(institution=institution).iterator():
        updated += seed_course_syllabi(course, sections)
    return updated


def publish_fixed_syllabus(sections):
    """Copy one admin's format onto every institution and every course syllabus."""
    if not isinstance(sections, list) or not sections:
        return 0
    for institution in Institution.objects.all().iterator():
        customization, _ = InstitutionCustomization.objects.get_or_create(institution=institution)
        if customization.syllabus_sections != sections:
            customization.syllabus_sections = copy.deepcopy(sections)
            customization.save(update_fields=['syllabus_sections', 'updated_at'])
    updated = 0
    for course in Course.objects.all().iterator():
        updated += seed_course_syllabi(course, sections)
    return updated
