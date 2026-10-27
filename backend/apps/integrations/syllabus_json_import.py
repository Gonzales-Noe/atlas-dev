"""
Turn an uploaded syllabus into the JSON object the faculty form already stores.

The file's own sentences and table cells are copied. A language model is not
asked to retype them. A section that is not one of the built-in fields is
kept as its own field so the screen can add it.
"""

from __future__ import annotations

import re

from .syllabus_structure import _norm
from .syllabus_tab_split import _best_tab, _heading_text

_SHEET_RE = re.compile(r'^===\s*Sheet:\s*(.+?)\s*===$', re.I)
_LABEL_RE = re.compile(r'^([^:]{2,60}):\s*(.+)$')
_ITEM_RE = re.compile(
    r'^(?:(?:\d+|[A-Za-z])[.)]|[-*•]|(?:ILO|SO|CO)\s*\d+[.:)]?)\s+',
    re.I,
)

_LABEL_FIELDS = (
    ('course_title', ('course title', 'course name')),
    ('course_code', ('course code',)),
    ('course_category', ('course category',)),
    ('prerequisites', ('prerequisite', 'pre requisite', 'pre-requisite')),
    ('year_level', ('year level',)),
    ('semester_year', ('semester', 'academic year')),
    ('credit_hours', ('credit hours', 'credit unit', 'units')),
    ('instructor_name', ('instructor', 'faculty name', 'prepared by')),
    ('instructor_email', ('email',)),
    ('employee_id', ('employee',)),
    ('lecture_hours', ('lecture hours', 'lecture')),
    ('lab_hours', ('laboratory hours', 'lab hours', 'laboratory')),
    ('university_name', ('university',)),
    ('college', ('college',)),
    ('program', ('program', 'campus')),
    ('vision', ('vision',)),
    ('mission', ('mission',)),
)


def _slug(text):
    slug = re.sub(r'[^a-z0-9]+', '-', _norm(text)).strip('-')
    return slug or 'section'


def _table_rows(text):
    rows = []
    for raw in str(text or '').splitlines():
        line = raw.strip()
        if line.count('|') < 1:
            continue
        if re.fullmatch(r'[\s|:-]+', line):
            continue
        cells = [cell.strip() for cell in line.strip('|').split('|')]
        if any(cells):
            rows.append(cells)
    return rows


def _plain_lines(text):
    lines = []
    for raw in str(text or '').splitlines():
        line = raw.strip()
        if not line or '|' in line or line.startswith('#'):
            continue
        lines.append(line)
    return lines


def _list_items(text):
    items = []
    for line in _plain_lines(text):
        cleaned = _ITEM_RE.sub('', line).strip()
        if cleaned and _norm(cleaned) != _norm(''):
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


def _mapped_label(label):
    return any(
        _label_matches(label, name)
        for _field, names in _LABEL_FIELDS
        for name in names
    )


def _without_mapped_labels(text):
    kept = []
    for line in str(text or '').splitlines():
        match = _LABEL_RE.match(line.strip())
        mapped = match and _mapped_label(_norm(match.group(1)))
        if not mapped:
            kept.append(line)
    return '\n'.join(kept).strip()


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


def _chapters(text):
    rows = _table_rows(text)
    if rows:
        header = [_norm(cell) for cell in rows[0]]
        data = rows[1:] if any(token in ' '.join(header) for token in ('week', 'topic', 'outcome')) else rows
        chapters = []
        for index, row in enumerate(data, 1):
            chapters.append({
                'chapter': str(index),
                'weeks': row[0] if row else str(index),
                'topics': row[1] if len(row) > 1 else (row[0] if row else ''),
                'outcomes': row[2] if len(row) > 2 else '',
                'ilo': row[3] if len(row) > 3 else '',
                'delivery': row[4] if len(row) > 4 else '',
            })
        return [row for row in chapters if row['topics'] or row['outcomes']]
    return [
        {'chapter': str(index), 'weeks': str(index), 'topics': line, 'outcomes': '', 'ilo': '', 'delivery': ''}
        for index, line in enumerate(_list_items(text), 1)
    ]


def _grades(text):
    rows = _table_rows(text)
    grades = []
    data = rows[1:] if rows and any(_norm(cell) in ('grade', 'rating', 'range', 'equivalent') for cell in rows[0]) else rows
    for row in data:
        if len(row) >= 3:
            grades.append({'rating': row[0], 'grade': row[1], 'range': row[2]})
        elif len(row) == 2:
            grades.append({'rating': '', 'grade': row[0], 'range': row[1]})
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


def syllabus_content_from_markdown(markdown):
    """Return a partial syllabus_content object copied from the file."""
    content = {}
    imported = []
    seen_slugs = set()

    def keep(title_text, section_body):
        if not section_body:
            return
        slug = _slug(title_text or 'section')
        base = slug
        number = 2
        while slug in seen_slugs:
            slug = f'{base}-{number}'
            number += 1
        seen_slugs.add(slug)
        imported.append({'key': slug, 'title': title_text or 'Section', 'body': section_body})

    for heading, body in _chunks(markdown):
        if not body and not heading:
            continue
        _apply_labels(body, content)
        key = _best_tab(heading) or ''
        title = _norm(heading)
        if 'rationale' in title:
            content['rationale'] = body
        elif 'description' in title:
            content['description'] = body
        elif key == 'iloat' and 'outcome' in title:
            items = _list_items(body)
            if items:
                content['ilos'] = items
            else:
                keep(heading, body)
        elif key == 'schedule':
            chapters = _chapters(body)
            if chapters:
                content['tla_chapters'] = chapters
            else:
                keep(heading, body)
        elif key == 'grading':
            grades = _grades(body)
            if grades:
                content['grading_rows'] = grades
            else:
                keep(heading, body)
        elif key == 'policies':
            content.setdefault('policies', []).append({
                'title': heading or 'Policy',
                'content': body,
            })
        elif key == 'fwmap' and ('reference' in title or 'bibliograph' in title):
            items = _list_items(body)
            if items:
                content['references'] = items
            else:
                keep(heading, body)
        elif key == 'tos':
            tos = _tos(heading, body)
            if tos:
                content['tos'] = tos
            else:
                keep(heading, body)
        elif 'vision' in title:
            content['vision'] = body
        elif 'mission' in title:
            content['mission'] = body
        elif body:
            stored = _without_mapped_labels(body) if key == 'basic' else body
            if stored.strip():
                keep(heading or 'Opening', stored)

    if imported:
        content['imported_sections'] = imported
    return content
