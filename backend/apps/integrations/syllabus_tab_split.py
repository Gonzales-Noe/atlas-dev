"""
Split an uploaded syllabus into one text block per faculty syllabus tab.

The split is heading- and table-based. A language model is not asked to
decide where a section starts, and it is not asked to retype the document.
"""

from __future__ import annotations

import logging

from .syllabus_structure import _norm, build_outline

logger = logging.getLogger(__name__)

_MAX_TAB_CHARS = 12000

# Longer phrases outrank short ones. A section title decides the tab;
# subsection titles are used only when the title itself matches nothing.
_TAB_KEYWORDS = (
    ('tos', 'Table of Specifications', (
        'table of specifications', 'table of specification', 'tos',
    )),
    ('grading', 'Grading', (
        'grading system', 'grade equivalence', 'grading',
    )),
    ('policies', 'Policies', (
        'course policies', 'class policies', 'policies', 'policy',
    )),
    ('ilofwmatrix', 'ILO–Framework Matrix', (
        'ilo-framework', 'ilo framework', 'ilo-so', 'ilo so', 'ilo-iga',
        'ilo-cdio', 'ilo-sdg', 'framework matrix',
    )),
    ('iloatmatrix', 'ILO–AT Matrix', (
        'ilo-at', 'ilo at matrix', 'assessment task matrix', 'ilo assessment matrix',
    )),
    ('schedule', 'Weekly Schedule', (
        'course learning plan', 'learning plan', 'weekly schedule',
        'teaching and learning activities', 'tla activities', 'weekly',
    )),
    ('iloat', 'ILOs & Assessments', (
        'intended learning outcomes', 'learning outcomes', 'course outcomes',
        'assessment method', 'score distribution', 'assessment tasks',
    )),
    ('fwmap', 'Framework Mapping', (
        'institutional graduate attributes', 'graduate attributes',
        'student outcomes', 'cdio', 'sustainable development',
        'references', 'bibliography',
    )),
    ('details', 'Course Details', (
        'course description', 'course rationale', 'rationale', 'description',
        'contact hours', 'teaching and learning strategies', 'technology integration',
    )),
    ('basic', 'Basic Info', (
        'course information', 'course specifications', 'course identification',
        'university direction', 'vision', 'mission', 'instructor',
    )),
)


def _keyword_score(text, keywords):
    norm = _norm(text)
    if not norm:
        return 0
    padded = f' {norm} '
    best = 0
    for keyword in keywords:
        token = _norm(keyword)
        if not token:
            continue
        if len(token) < 6:
            if f' {token} ' in padded:
                best = max(best, len(token) + 8)
            continue
        if token in norm:
            best = max(best, len(token))
    return best


def _best_tab(label, subsections=None):
    title_scores = [
        (key, _keyword_score(label, keywords))
        for key, _tab_label, keywords in _TAB_KEYWORDS
    ]
    title_scores.sort(key=lambda item: item[1], reverse=True)
    if title_scores and title_scores[0][1] > 0:
        return title_scores[0][0]

    best_key = None
    best = 0
    for sub in subsections or []:
        sub_label = sub.get('label') if isinstance(sub, dict) else ''
        for key, _tab_label, keywords in _TAB_KEYWORDS:
            score = _keyword_score(sub_label, keywords)
            if score > best:
                best = score
                best_key = key
    return best_key


def _section_text(section):
    lines = []
    label = str(section.get('label') or '').strip()
    if label:
        lines.append(label)
    columns = [str(column).strip() for column in (section.get('table_columns') or []) if str(column).strip()]
    if columns:
        lines.append(' | '.join(columns))
    for sub in section.get('subsections') or []:
        if not isinstance(sub, dict):
            continue
        sub_label = str(sub.get('label') or '').strip()
        if sub_label:
            lines.append(sub_label)
        sub_columns = [str(column).strip() for column in (sub.get('table_columns') or []) if str(column).strip()]
        if sub_columns:
            lines.append(' | '.join(sub_columns))
    body = section.get('body') or []
    if isinstance(body, list):
        lines.extend(str(line).strip() for line in body if str(line).strip())
    elif str(body).strip():
        lines.append(str(body).strip())
    return '\n'.join(lines).strip()


def _preamble(markdown):
    lines = []
    for line in (markdown or '').splitlines():
        if line.lstrip().startswith('#'):
            break
        lines.append(line)
    return '\n'.join(lines).strip()


def _outline_sections(markdown, outline):
    sections = [section for section in (outline or []) if isinstance(section, dict)]
    if sections:
        return sections
    built = build_outline(markdown or '')
    if built:
        return built
    text = (markdown or '').strip()
    if not text:
        return []
    return [{'label': 'Course Information', 'subsections': [], 'table_columns': [], 'body': text.splitlines()}]


def split_markdown_into_tabs(markdown, outline=None):
    """Return [{key, label, text}] for tabs that received source text."""
    buckets = {key: [] for key, _label, _keywords in _TAB_KEYWORDS}
    preamble = _preamble(markdown)
    if len(preamble) >= 40:
        buckets['basic'].append(preamble)

    for section in _outline_sections(markdown, outline):
        key = _best_tab(section.get('label') or '', section.get('subsections'))
        text = _section_text(section)
        if not key or not text:
            continue
        buckets[key].append(text)

    tabs = []
    for key, label, _keywords in _TAB_KEYWORDS:
        combined = '\n\n'.join(part for part in buckets[key] if part).strip()
        if not combined:
            continue
        tabs.append({
            'key': key,
            'label': label,
            'text': combined[:_MAX_TAB_CHARS],
        })
    return tabs


def tabs_from_layout_bytes(data, file_type):
    """Read a PDF or DOCX once and split its headings and tables into tabs."""
    from .syllabus_docling import build_outline_from_docling
    from .syllabus_parse import extract_layout

    parsed = extract_layout(data, file_type)
    outline = None
    document = parsed.get('document')
    if document is not None:
        try:
            outline = build_outline_from_docling(document)
        except Exception:
            logger.exception('Docling outline failed; using markdown headings')
    return {
        'parser': parsed.get('parser') or 'liteparse',
        'tabs': split_markdown_into_tabs(parsed.get('markdown') or '', outline),
    }
