"""
Derive an institution's syllabus form structure (sections, subsections and
table columns) from an uploaded syllabus template.

The template is converted to Markdown, a deterministic outline is built from
its headings and tables, and an open-source LLM can optionally clean that
outline up. Every label the LLM returns must appear in the source document,
and fixed ("static") content is always copied from the document itself, so
the structure is never invented.
"""

import json
import logging
import re

from .document_processor import DocumentProcessor

logger = logging.getLogger(__name__)

MAX_SECTIONS = 25
MAX_SUBSECTIONS = 30
MAX_COLUMNS = 12
MAX_STATIC_CHARS = 4000
MAX_SKELETON_CHARS = 14000

BUILTIN_EDITORS = {
    'basic': 'Basic Info (institution, vision, mission, course identification, instructor)',
    'details': 'Course Details (rationale, description, contact hours, teaching strategies)',
    'iloat': 'ILOs & Assessments (intended learning outcomes and assessment tasks)',
    'schedule': 'Weekly Schedule (course learning plan: topics, outcomes, weeks, delivery)',
    'tos': 'Table of Specifications',
    'grading': 'Grading (grading system / grade equivalence)',
    'policies': 'Policies (course and class policies)',
}

# Checked in order; the first section matching a rule claims that editor.
_EDITOR_RULES = [
    ('tos', ('table of specification',)),
    ('schedule', ('learning plan', 'weekly schedule', 'course outline', 'course content',
                  'course map', 'calendar', 'schedule of topics', 'topics')),
    ('grading', ('grading', 'grade')),
    ('policies', ('policies', 'class policy', 'course policy')),
    ('iloat', ('intended learning outcome', 'course outcome', 'learning outcome')),
    ('details', ('course description', 'rationale')),
    ('basic', ('course information', 'course specification', 'course identification',
               'university direction', 'vision')),
]

# Built-in editors that already provide the whole section as lists/tables;
# subsections extracted from the template's sample content would duplicate them.
_LIST_EDITORS = {'iloat', 'schedule', 'tos', 'grading', 'policies'}

# Fields the basic/details editors already render.
_EDITOR_FIELDS = {
    'basic': {
        'coursetitle', 'title', 'coursecode', 'code', 'category', 'coursecategory',
        'yearlevel', 'credithours', 'credits', 'credit', 'coursecredit', 'units',
        'semesteryear', 'semester', 'referencecmo', 'cmo', 'dateprepared', 'revisionno',
        'revisionnumber', 'revisiondate', 'periodofstudy', 'instructor', 'instructorname',
        'name', 'employeeid', 'email', 'emailaddress', 'contact', 'contactnumber',
        'qualifications', 'vision', 'mission', 'universityvision', 'universitymission',
        'institution', 'program', 'college', 'department',
    },
    'details': {
        'rationale', 'courserationale', 'description', 'coursedescription', 'lecturehours',
        'labhours', 'laboratoryhours', 'totalhours', 'teachingandlearningstrategies',
        'tlas', 'technologyintegration',
    },
}
_EDITOR_FIELD_PREFIXES = ('prerequisite', 'corequisite', 'courseprerequisite')

_HEADING_RE = re.compile(r'^(#{1,6})\s+(.*\S)\s*$')
_BOLD_LINE_RE = re.compile(r'^\*\*([^*]+)\*\*:?$')
_TABLE_SEPARATOR_RE = re.compile(r'^\|?\s*:?-{3,}')
_NUMBERING_RE = re.compile(r'^(?:[IVXLC]+|\d+(?:\.\d+)*|[A-Za-z])[.)]\s+')
_SMALL_WORDS = {'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'}
_TITLE_LABELS = {'syllabus', 'course syllabus', 'table of contents', 'contents'}


# ── text helpers ────────────────────────────────────────────────────────────

def _norm(text):
    return re.sub(r'[^a-z0-9]+', ' ', str(text or '').lower()).strip()


def _token(text):
    return re.sub(r'[^a-z0-9]+', '', str(text or '').lower())


def _slug(text):
    return re.sub(r'[^a-z0-9]+', '-', str(text or '').lower()).strip('-')


def _unescape(text):
    return re.sub(r'\\([\\_*|#\[\]()-])', r'\1', text)


def _smart_title(label):
    letters = [c for c in label if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) / len(letters) < 0.8:
        return label
    words = label.lower().split()
    return ' '.join(
        word if i and word in _SMALL_WORDS else word[:1].upper() + word[1:]
        for i, word in enumerate(words)
    )


def _clean_label(text):
    label = _unescape(str(text or ''))
    label = re.sub(r'[*_`]+', '', label)
    label = _NUMBERING_RE.sub('', label.strip())
    label = re.sub(r'\s+', ' ', label).strip().rstrip(':;,.').strip()
    return _smart_title(label)


def _is_noise_label(label):
    words = label.split()
    lowered = label.lower()
    return (
        not 1 <= len(words) <= 12
        or len(label) > 90
        or sum(c.isalpha() for c in label) < 3
        or lowered in _TITLE_LABELS
        or label.startswith(('(', '!', '['))
        or '@' in label
        or 'http' in lowered
        or re.search(r'\d{5,}', label) is not None
        or len(re.findall(r'\(\d+\)', label)) >= 2
    )


def _is_caps_line(text):
    letters = [c for c in text if c.isalpha()]
    return (
        len(letters) >= 4
        and all(c.isupper() for c in letters)
        and 1 <= len(text.split()) <= 8
        and not text.endswith('.')
    )


def _split_row(line):
    return [_unescape(cell.strip()) for cell in line.strip().strip('|').split('|')]


# ── Markdown → blocks ───────────────────────────────────────────────────────

def _blocks(markdown):
    """Yield (kind, payload) blocks: heading, bold, caps, table, text."""
    table = []
    for raw in markdown.splitlines():
        line = raw.strip()
        if line.startswith('|'):
            if not _TABLE_SEPARATOR_RE.match(line):
                table.append(_split_row(line))
            continue
        if table:
            yield 'table', table
            table = []
        if not line or line.startswith('<!--'):
            continue
        heading = _HEADING_RE.match(line)
        if heading:
            yield 'heading', (len(heading.group(1)), heading.group(2))
            continue
        bold = _BOLD_LINE_RE.match(line)
        if bold:
            yield 'bold', bold.group(1).strip()
            continue
        if _is_caps_line(line):
            yield 'caps', line
            continue
        yield 'text', line
    if table:
        yield 'table', table


def _is_key_value_table(rows):
    if len(rows) < 2 or any(len(row) != 2 for row in rows):
        return False
    labels = [row[0] for row in rows]
    good = [
        label for label in labels
        if label and 1 <= len(label.split()) <= 6 and not label.endswith('.')
    ]
    return len(good) >= 0.8 * len(labels)


def _table_columns(rows):
    header = rows[0] if rows else []
    filled = [cell for cell in header if cell.strip()]
    if len(filled) < 2 or len(filled) < 0.6 * len(header):
        return []
    for cell in filled:
        if (
            len(cell.split()) > 8
            or cell.rstrip().endswith('.')
            or '•' in cell
            or cell.lstrip()[:1].islower()
        ):
            return []
    columns = [_clean_label(cell) for cell in filled]
    return [column for column in columns if column][:MAX_COLUMNS]


def _section_level(blocks):
    counts = {}
    for kind, payload in blocks:
        if kind == 'heading' and not _is_noise_label(_clean_label(payload[1])):
            counts[payload[0]] = counts.get(payload[0], 0) + 1
    if not counts:
        return None
    return max(sorted(counts), key=lambda level: counts[level])


# ── deterministic outline ───────────────────────────────────────────────────

def _new_section(label):
    return {'label': label, 'subsections': [], 'table_columns': [], 'body': []}


def _add_subsection(section, label, columns=None):
    if _norm(label) == _norm(section['label']):
        return
    if any(_norm(sub['label']) == _norm(label) for sub in section['subsections']):
        return
    section['subsections'].append({'label': label, 'table_columns': columns or []})


def build_outline(markdown):
    """Build a heading/table outline. Each section keeps its body text."""
    blocks = list(_blocks(markdown))
    section_level = _section_level(blocks)
    sections = []
    seen = set()
    current = None
    current_sub = None
    pending_sub_table = False

    def start_section(raw_label):
        nonlocal current, current_sub, pending_sub_table
        label = _clean_label(raw_label)
        if _is_noise_label(label):
            return
        if _norm(label) in seen:
            current = next(s for s in sections if _norm(s['label']) == _norm(label))
        else:
            seen.add(_norm(label))
            current = _new_section(label)
            sections.append(current)
        current_sub = None
        pending_sub_table = False

    def start_subsection(raw_label):
        nonlocal current_sub, pending_sub_table
        label = _clean_label(raw_label)
        if _is_noise_label(label):
            return
        if current is None:
            start_section(raw_label)
            return
        _add_subsection(current, label)
        current_sub = next(
            (sub for sub in current['subsections'] if _norm(sub['label']) == _norm(label)),
            None,
        )
        pending_sub_table = current_sub is not None

    for kind, payload in blocks:
        if kind == 'heading':
            level, text = payload
            if section_level is None or level == section_level:
                start_section(text)
            elif level > section_level:
                start_subsection(text)
                if current is not None:
                    current['body'].append(_clean_label(text) + ':')
            continue
        if kind == 'bold':
            letters = [c for c in payload if c.isalpha()]
            mostly_caps = letters and sum(c.isupper() for c in letters) / len(letters) >= 0.6
            if mostly_caps and len(payload.split()) >= 2:
                start_section(payload)
            elif current is not None:
                current['body'].append(_unescape(payload))
            continue
        if current is None:
            continue
        if kind == 'caps':
            start_subsection(payload)
            current['body'].append(payload)
            continue
        if kind == 'table':
            rows = payload
            if _is_key_value_table(rows):
                for label, value in rows:
                    clean = _clean_label(label)
                    if clean and not _is_noise_label(clean):
                        _add_subsection(current, clean)
                    current['body'].append(f'{label}: {value}'.strip(': '))
                pending_sub_table = False
                continue
            columns = _table_columns(rows)
            if columns:
                if pending_sub_table and not current_sub['table_columns']:
                    current_sub['table_columns'] = columns
                elif not current['table_columns']:
                    current['table_columns'] = columns
            current['body'].extend(' | '.join(c for c in row if c) for row in rows)
            pending_sub_table = False
            continue
        current['body'].append(_unescape(payload))
        pending_sub_table = False

    # A document title at the section level shows up as an empty first section.
    while len(sections) > 1 and not (
        sections[0]['body'] or sections[0]['subsections'] or sections[0]['table_columns']
    ):
        sections.pop(0)
    return sections[:MAX_SECTIONS]


def _skeleton(markdown):
    """A compact view of the document's structure for the LLM prompt."""
    lines = []
    for kind, payload in _blocks(markdown):
        if kind == 'heading':
            lines.append('#' * payload[0] + ' ' + payload[1])
        elif kind == 'bold':
            lines.append(f'**{payload}**')
        elif kind == 'caps':
            lines.append(payload)
        elif kind == 'table':
            rows = payload
            shown = rows if _is_key_value_table(rows) else rows[:2]
            for row in shown[:20]:
                lines.append('| ' + ' | '.join(cell[:40] for cell in row) + ' |')
            if len(rows) > len(shown):
                lines.append(f'| … {len(rows) - len(shown)} more rows |')
        else:
            lines.append(payload[:120] + ('…' if len(payload) > 120 else ''))
    text = '\n'.join(lines)
    return text[:MAX_SKELETON_CHARS]


# ── LLM refinement (grounded) ───────────────────────────────────────────────

_SYSTEM_PROMPT = (
    'You turn a syllabus template into the form structure an institution wants '
    'its faculty to fill out. You only reorganize labels that already exist in '
    'the document. Reply with JSON only.'
)


def _refine_prompt(outline, skeleton):
    draft = [
        {
            'label': s['label'],
            'table_columns': s['table_columns'],
            'subsections': [
                {'label': sub['label'], 'table_columns': sub['table_columns']}
                for sub in s['subsections']
            ],
        }
        for s in outline
    ]
    editors = '\n'.join(f'- "{key}": {desc}' for key, desc in BUILTIN_EDITORS.items())
    return f"""Below is the structure of an uploaded syllabus template (headings, bold lines, table headers and the first column of label/value tables), followed by an automatically detected draft outline.

Return the syllabus FORM STRUCTURE as JSON:
{{"sections": [{{"label": str, "editor": str|null, "is_static": bool, "table_columns": [str], "subsections": [{{"label": str, "table_columns": [str]}}]}}]}}

Rules:
1. Copy every label and column word-for-word from the document (you may fix capitalization and drop numbering or trailing colons). Never invent, translate or paraphrase labels.
2. sections = the top-level parts of the syllabus, in document order. Drop document titles, the institution name/address, approval/signature blocks, legends (e.g. "I = Introduced"), page artifacts, and lines that are really field values.
3. subsections = labelled answer fields inside a section (sub-headings, or the labels in the first column of a label/value table). Nest headings that clearly belong to a preceding section.
4. table_columns only when faculty fill that part as a table row by row; take the columns from the table header. Otherwise []. The labels of a label/value table (e.g. "Course Code | GE 4") are subsections, never table columns.
5. editor = one of these built-in editors when the section clearly corresponds to it, else null. Use each editor at most once:
{editors}
6. is_static = true only for text that is identical for every course of the institution (vision, mission, quality policy, core values, institutional outcomes). Faculty cannot edit static sections.

DOCUMENT STRUCTURE:
{skeleton}

DRAFT OUTLINE:
{json.dumps(draft, ensure_ascii=False)}
"""


def _parse_json(raw):
    clean = re.sub(r'^```(?:json)?\s*|\s*```$', '', str(raw or '').strip())
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', clean, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def _grounded(text, source_norm, source_words):
    norm = _norm(text)
    if not norm:
        return False
    if norm in source_norm:
        return True
    words = [word for word in norm.split() if len(word) >= 3]
    return bool(words) and sum(word in source_words for word in words) >= 0.85 * len(words)


def _grounded_columns(columns, source_norm, source_words):
    if not isinstance(columns, list):
        return []
    cleaned = [_clean_label(column) for column in columns if isinstance(column, str)]
    return [c for c in cleaned if c and _grounded(c, source_norm, source_words)][:MAX_COLUMNS]


def refine_outline(outline, markdown, llm=None):
    """Ask Groq/OpenRouter to clean the outline; drop anything not in the document."""
    from .llm_service import LLMService

    llm = llm or LLMService()
    raw = llm.generate_response_with_fallback(
        [{'role': 'user', 'content': _refine_prompt(outline, _skeleton(markdown))}],
        preferred_provider='groq',
        system=_SYSTEM_PROMPT,
        max_tokens=3000,
    )
    data = _parse_json(raw)
    items = data.get('sections') if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise ValueError('LLM did not return a list of sections.')

    source_norm = _norm(markdown)
    source_words = set(source_norm.split())
    bodies = {_norm(s['label']): s['body'] for s in outline}
    outline_fields = {
        _norm(s['label']): {_norm(sub['label']) for sub in s['subsections']}
        for s in outline
    }

    sections = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        label = _clean_label(item.get('label'))
        if not label or _is_noise_label(label) or _norm(label) in seen:
            continue
        if not _grounded(label, source_norm, source_words):
            logger.info('Dropped ungrounded syllabus section label %r', label)
            continue
        seen.add(_norm(label))
        subsections = []
        for sub in item.get('subsections') or []:
            if not isinstance(sub, dict):
                continue
            sub_label = _clean_label(sub.get('label'))
            if (
                sub_label
                and not _is_noise_label(sub_label)
                and _grounded(sub_label, source_norm, source_words)
                and all(_norm(s['label']) != _norm(sub_label) for s in subsections)
            ):
                subsections.append({
                    'label': sub_label,
                    'table_columns': _grounded_columns(sub.get('table_columns'), source_norm, source_words),
                })
        columns = _grounded_columns(item.get('table_columns'), source_norm, source_words)
        known_fields = outline_fields.get(_norm(label), set())
        if columns and all(_norm(column) in known_fields for column in columns):
            for column in columns:
                if all(_norm(s['label']) != _norm(column) for s in subsections):
                    subsections.append({'label': column, 'table_columns': []})
            columns = []
        editor = item.get('editor')
        sections.append({
            'label': label,
            'editor': editor if editor in BUILTIN_EDITORS else None,
            'is_static': bool(item.get('is_static')) and _norm(label) in bodies,
            'table_columns': columns,
            'subsections': subsections[:MAX_SUBSECTIONS],
            'body': bodies.get(_norm(label), []),
        })
    if not sections:
        raise ValueError('LLM returned no usable sections.')
    return sections[:MAX_SECTIONS]


# ── final schema ────────────────────────────────────────────────────────────

def _rule_editors(section):
    """Candidate editors from the label, then from the subsection labels."""
    label = _norm(section['label'])
    candidates = [
        editor for editor, needles in _EDITOR_RULES
        if any(needle in label for needle in needles)
    ]
    sub_labels = [_norm(sub['label']) for sub in section.get('subsections', [])]
    for editor in ('details', 'basic'):
        needles = dict(_EDITOR_RULES)[editor]
        if any(needle in sub for sub in sub_labels for needle in needles):
            candidates.append(editor)
    return candidates


def _covered_by_editors(editor, used_editors, label):
    """True when a built-in editor in this syllabus already renders the field."""
    if editor in _LIST_EDITORS:
        return True
    token = _token(label)
    if token.startswith(_EDITOR_FIELD_PREFIXES):
        return True
    return any(token in _EDITOR_FIELDS.get(used, set()) for used in used_editors)


def _unique_key(base, used):
    key = base or f'section-{len(used) + 1}'
    candidate, n = key, 2
    while candidate in used:
        candidate, n = f'{key}-{n}', n + 1
    used.add(candidate)
    return candidate


def to_syllabus_sections(sections):
    """Convert outline sections into InstitutionCustomization.syllabus_sections."""
    editors = []
    used_editors = set()
    for section in sections:
        editor = None
        if not section.get('is_static'):
            for candidate in (section.get('editor'), *_rule_editors(section)):
                if candidate in BUILTIN_EDITORS and candidate not in used_editors:
                    editor = candidate
                    used_editors.add(editor)
                    break
        editors.append(editor)

    result = []
    used_keys = set(used_editors)
    for section, editor in zip(sections, editors):
        is_static = bool(section.get('is_static'))
        key = editor or _unique_key(_slug(section['label']), used_keys)

        subsections = []
        sub_keys = set()
        if not is_static:
            for sub in section.get('subsections', []):
                if editor and _covered_by_editors(editor, used_editors, sub['label']):
                    continue
                columns = sub.get('table_columns') or []
                subsections.append({
                    'key': _unique_key(_slug(sub['label']), sub_keys),
                    'label': sub['label'],
                    'required': False,
                    'table_enabled': bool(columns),
                    'table_columns': columns,
                    'table_column_groups': [''] * len(columns),
                })

        columns = [] if is_static or editor in _LIST_EDITORS else (section.get('table_columns') or [])
        static_content = ''
        if is_static:
            static_content = '\n'.join(section.get('body') or []).strip()[:MAX_STATIC_CHARS]
            if not static_content:
                is_static = False
        result.append({
            'key': key,
            'label': section['label'],
            'enabled': True,
            'is_static': is_static,
            'static_content': static_content,
            'table_enabled': bool(columns),
            'table_columns': columns,
            'table_column_groups': [''] * len(columns),
            'subsections': subsections[:MAX_SUBSECTIONS],
        })
    return result


def markdown_from_upload(file_obj, file_type):
    """Markdown for a PDF/DOCX template, falling back to plain extracted text."""
    pages = []
    try:
        if file_type == 'pdf':
            pages = DocumentProcessor.extract_markdown_from_pdf(file_obj)
        elif file_type == 'docx':
            pages = DocumentProcessor.extract_markdown_from_docx(file_obj)
    except Exception:
        logger.exception('Markdown conversion failed; falling back to plain text')
        pages = []
    if not pages:
        if hasattr(file_obj, 'seek'):
            file_obj.seek(0)
        pages = DocumentProcessor.extract_text(file_obj, file_type)
    return '\n\n'.join(text for text, _page in pages)


def extract_syllabus_structure(markdown, refine=True, llm=None):
    """
    Returns (syllabus_sections, source) where source is 'ai' when the LLM
    refinement was used and 'outline' for the deterministic result.
    """
    outline = build_outline(markdown)
    if not outline:
        return [], 'outline'
    if refine:
        try:
            return to_syllabus_sections(refine_outline(outline, markdown, llm=llm)), 'ai'
        except Exception as exc:
            logger.warning('Syllabus structure refinement failed, using outline: %s', exc)
    return to_syllabus_sections(outline), 'outline'
