"""
Copy an uploaded syllabus into the JSON object stored on the syllabus row.

Each heading is placed in the field its section already reads. Lists grow to
the number of items in the file. No extra section is created.
"""

from __future__ import annotations

import re

from .syllabus_structure import _norm
from .syllabus_tab_split import _best_tab, _heading_text

_SHEET_RE = re.compile(r'^===\s*Sheet:\s*(.+?)\s*===$', re.I)
_LABEL_RE = re.compile(r'^([^:]{2,60}):\s*(.+)$')
_ITEM_RE = re.compile(
    r'^(?:(?:\d+|[A-Za-z])[.)]|[-*•]|(?:ILO|SO|CO|IGA)\s*\d+[.:)]?)\s+',
    re.I,
)

# Keys the faculty sections already display.
_LABEL_FIELDS = (
    ('course_title', ('course title', 'course name')),
    ('course_code', ('course code',)),
    ('course_category', ('course category',)),
    ('prerequisites', ('prerequisite', 'pre requisite', 'pre-requisite')),
    ('year_level', ('year level',)),
    ('semester_year', ('semester', 'academic year')),
    ('credit_hours', ('credit hours', 'credit unit', 'units')),
    ('lecture_hours', ('lecture hours',)),
    ('lab_hours', ('laboratory hours', 'lab hours')),
    ('total_hours', ('total hours',)),
    ('instructor_name', ('instructor', 'faculty name', 'prepared by')),
    ('instructor_email', ('email',)),
    ('employee_id', ('employee',)),
    ('contact_info', ('contact number', 'phone', 'mobile')),
    ('education', ('qualification', 'education')),
    ('university_name', ('university',)),
    ('college', ('college', 'department')),
    ('program', ('program', 'campus')),
    ('document_title', ('document title', 'syllabus title')),
    ('institution_contact', ('institution contact', 'address')),
    ('reference_cmo', ('cmo', 'reference cmo')),
    ('date_prepared', ('date prepared', 'date of preparation')),
    ('revision_no', ('revision no', 'revision number')),
    ('revision_date', ('revision date',)),
    ('period_of_study', ('period of study',)),
    ('passing_grade', ('passing grade',)),
    ('vision', ('vision',)),
    ('mission', ('mission',)),
)


def _table_rows(text):
    rows = []
    for raw in str(text or '').splitlines():
        line = raw.strip()
        if line.count('|') < 1 or re.fullmatch(r'[\s|:-]+', line):
            continue
        cells = [cell.strip() for cell in line.strip('|').split('|')]
        if any(cells):
            rows.append(cells)
    return rows


def _plain_lines(text):
    lines = []
    for raw in str(text or '').splitlines():
        line = raw.strip()
        if line and '|' not in line and not line.startswith('#'):
            lines.append(line)
    return lines


def _list_items(text):
    items = []
    for line in _plain_lines(text):
        cleaned = _ITEM_RE.sub('', line).strip()
        if cleaned:
            items.append(cleaned)
    return items


def _chunks(markdown):
    heading = ''
    lines = []
    chunks = []

    def flush():
        body = '\n'.join(lines).strip()
        if heading or body:
            chunks.append((heading, body))

    for raw in str(markdown or '').splitlines():
        sheet = _SHEET_RE.match(raw.strip())
        nxt = sheet.group(1).strip() if sheet else _heading_text(raw)
        if nxt and (heading or lines):
            flush()
            heading = nxt
            lines = []
            continue
        if nxt:
            heading = nxt
            continue
        lines.append(raw)
    flush()
    return chunks


def _label_matches(label, name):
    return label == name or label.startswith(f'{name} ') or label.endswith(f' {name}')


def _append_text(content, key, body):
    body = str(body or '').strip()
    if not body:
        return
    current = str(content.get(key) or '').strip()
    content[key] = f'{current}\n\n{body}'.strip() if current else body


def _apply_labels(text, content):
    for line in _plain_lines(text):
        match = _LABEL_RE.match(line)
        if not match:
            continue
        label = _norm(match.group(1))
        value = match.group(2).strip()
        if not value:
            continue
        for field, names in _LABEL_FIELDS:
            if any(_label_matches(label, name) for name in names):
                content[field] = value
                break


def _apply_identity_lines(text, content):
    """Plain lines such as a university or college name, with no colon."""
    for line in _plain_lines(text):
        if _LABEL_RE.match(line):
            continue
        title = _norm(line)
        if 'university' in title and not content.get('university_name'):
            content['university_name'] = line
        elif 'college' in title and not content.get('college'):
            content['college'] = line
        elif ('program' in title or title.startswith('bachelor') or title.startswith('bs ')) and not content.get('program'):
            content['program'] = line


def _cell(row, index):
    if index is None or index >= len(row):
        return ''
    return row[index]


def _header_index(header, *needles):
    for index, cell in enumerate(header):
        if any(needle in cell for needle in needles):
            return index
    return None


def _chapters(text):
    rows = _table_rows(text)
    if rows:
        header = [_norm(cell) for cell in rows[0]]
        joined = ' '.join(header)
        has_header = any(token in joined for token in ('week', 'topic', 'outcome', 'delivery', 'activity'))
        data = rows[1:] if has_header else rows
        week_i = _header_index(header, 'week') if has_header else 0
        topic_i = _header_index(header, 'topic', 'activity', 'content') if has_header else (1 if data and len(data[0]) > 1 else 0)
        ilo_i = _header_index(header, 'outcome', 'ilo') if has_header else None
        delivery_i = _header_index(header, 'delivery', 'mode') if has_header else None
        chapters = []
        for index, row in enumerate(data, 1):
            topic = _cell(row, topic_i)
            ilo = _cell(row, ilo_i)
            if ilo == topic:
                ilo = ''
            if topic or ilo:
                chapters.append({
                    'chapter': _cell(row, week_i) or str(index),
                    'topics': topic,
                    'outcomes': '',
                    'ilo': ilo,
                    'delivery': _cell(row, delivery_i),
                })
        return chapters
    return [
        {'chapter': str(index), 'topics': line, 'outcomes': '', 'ilo': '', 'delivery': ''}
        for index, line in enumerate(_list_items(text), 1)
    ]


def _grades(text):
    rows = _table_rows(text)
    if not rows:
        return []
    header = [_norm(cell) for cell in rows[0]]
    has_header = any(token in ' '.join(header) for token in ('grade', 'rating', 'range', 'equivalent'))
    data = rows[1:] if has_header else rows
    rating_i = _header_index(header, 'rating', 'description') if has_header else 0
    grade_i = _header_index(header, 'grade', 'equivalent') if has_header else (1 if data and len(data[0]) > 1 else 0)
    range_i = _header_index(header, 'range', 'interval') if has_header else (2 if data and len(data[0]) > 2 else None)
    grades = []
    for row in data:
        grade = {
            'rating': _cell(row, rating_i),
            'grade': _cell(row, grade_i),
            'range': _cell(row, range_i),
        }
        if any(grade.values()):
            grades.append(grade)
    return grades


def _tos(heading, text):
    rows = _table_rows(text)
    data = rows[1:] if rows and any('topic' in _norm(cell) or 'hour' in _norm(cell) for cell in rows[0]) else rows
    topics = []
    for row in data or _list_items(text):
        if isinstance(row, str):
            topics.append({'topic': row, 'hours_class': ''})
        elif row and row[0]:
            topics.append({'topic': row[0], 'hours_class': row[1] if len(row) > 1 else ''})
    if not topics:
        return []
    return [{'examLabel': heading or 'Examination', 'topics': topics}]


def _tasks(heading, text):
    labels = _list_items(text)
    if not labels:
        rows = _table_rows(text)
        data = rows[1:] if rows else []
        labels = [' '.join(cell for cell in row if cell) for row in data]
        labels = [label for label in labels if label]
    if not labels and str(text or '').strip():
        labels = [str(text).strip()]
    if not labels:
        return []
    subs = [
        {'code': f'T{index}', 'label': label, 'weight': 0, 'ilos': [], 'scores': {}, 'iloTotals': {}}
        for index, label in enumerate(labels, 1)
    ]
    return [{'code': 'C1', 'label': heading or 'Assessment', 'weight': 0, 'subs': subs}]


def _attributes(text):
    items = _list_items(text) or ([text.strip()] if str(text or '').strip() else [])
    return [{'code': '', 'title': item, 'description': ''} for item in items if item]


def _framework_field(title):
    if 'graduate attribute' in title or title == 'iga' or title.startswith('iga '):
        return 'igas'
    if 'cdio' in title:
        return 'cdio_skills'
    if 'sdg' in title or 'sustainable development' in title:
        return 'sdg_skills'
    if 'student outcome' in title:
        return 'student_outcomes'
    return None


def _extend(content, key, items):
    if not items:
        return
    content.setdefault(key, [])
    content[key].extend(items)


def syllabus_content_from_markdown(markdown):
    """Return syllabus_content keys the existing sections already render."""
    content = {}

    for heading, body in _chunks(markdown):
        if not body and not heading:
            continue
        _apply_labels(body, content)
        _apply_identity_lines(body, content)
        key = _best_tab(heading) or ''
        title = _norm(heading)
        framework = _framework_field(title)

        if 'rationale' in title:
            _append_text(content, 'rationale', body)
        elif 'description' in title:
            _append_text(content, 'description', body)
        elif key == 'details' and ('strateg' in title or title.startswith('tla')):
            _append_text(content, 'tlas', body)
        elif key == 'details' and 'technolog' in title:
            _append_text(content, 'technology_integration', body)
        elif key == 'iloat' and 'outcome' in title:
            _extend(content, 'ilos', _list_items(body))
        elif key == 'iloat':
            _extend(content, 'ats', _tasks(heading, body))
        elif key == 'schedule':
            _extend(content, 'tla_chapters', _chapters(body))
        elif key == 'grading':
            _extend(content, 'grading_rows', _grades(body))
        elif key == 'policies':
            content.setdefault('policies', []).append({'title': heading or 'Policy', 'content': body})
        elif framework:
            _extend(content, framework, _attributes(body))
        elif key == 'fwmap' and ('reference' in title or 'bibliograph' in title):
            _extend(content, 'references', _list_items(body))
        elif key == 'tos':
            _extend(content, 'tos', _tos(heading, body))
        elif 'vision' in title:
            _append_text(content, 'vision', body)
        elif 'mission' in title:
            _append_text(content, 'mission', body)
        elif body and heading and key not in {'basic', 'iloatmatrix', 'ilofwmatrix'}:
            # Still an existing section: Policies already shows titled blocks.
            content.setdefault('policies', []).append({'title': heading, 'content': body})

    return content
