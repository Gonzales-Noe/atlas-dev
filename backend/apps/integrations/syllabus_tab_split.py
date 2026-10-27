"""
Split an uploaded syllabus into one text block per faculty syllabus tab.

The split is heading- and table-based. A language model is not asked to
decide where a section starts, and it is not asked to retype the document.
"""

from __future__ import annotations

import logging
import re

from .syllabus_structure import _clean_label, _is_caps_line, _norm, build_outline

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


_MARKDOWN_HEADING_RE = re.compile(r'^#{1,6}\s+(.*\S)\s*$')
_BOLD_HEADING_RE = re.compile(r'^\*\*([^*]+)\*\*:?$')
_NUMBERED_HEADING_RE = re.compile(r'^(?:[IVXLC]{1,6}|\d{1,2})[.)]\s+(.+)$')


def _heading_text(line):
    """A line that starts a syllabus section, or None when it is body text."""
    stripped = str(line or '').strip()
    if not stripped or '|' in stripped or stripped.endswith(('.', '?', '!')):
        return None
    match = _MARKDOWN_HEADING_RE.match(stripped) or _BOLD_HEADING_RE.match(stripped)
    if match:
        return _clean_label(match.group(1))
    numbered = _NUMBERED_HEADING_RE.match(stripped)
    if numbered:
        label = _clean_label(numbered.group(1))
        if label and (_best_tab(label) or _is_caps_line(label)):
            return label
        return None
    if _is_caps_line(stripped):
        return _clean_label(stripped)
    label = _clean_label(stripped)
    if label and 1 <= len(label.split()) <= 12 and _best_tab(label):
        return label
    return None


def _append_chunk(buckets, heading, lines, last_key):
    text = '\n'.join(part for part in lines if str(part).strip()).strip()
    if not text:
        return last_key
    key = _best_tab(heading or '') or last_key or 'basic'
    buckets[key].append(text)
    return key


def _split_by_heading_lines(markdown):
    buckets = {key: [] for key, _label, _keywords in _TAB_KEYWORDS}
    heading = ''
    lines = []
    last_key = None
    for raw in (markdown or '').splitlines():
        next_heading = _heading_text(raw)
        if next_heading and lines:
            last_key = _append_chunk(buckets, heading, lines, last_key)
            heading = next_heading
            lines = [next_heading]
            continue
        if next_heading and not lines:
            heading = next_heading
            lines = [next_heading]
            continue
        lines.append(raw)
    _append_chunk(buckets, heading, lines, last_key)
    return buckets


def _body_lines(section):
    body = section.get('body') or []
    if isinstance(body, list):
        return [str(line).strip() for line in body if str(line).strip()]
    text = str(body).strip()
    return [text] if text else []


def _split_by_outline(markdown, outline):
    """Route each subsection's own lines, so a parent title cannot swallow later tabs."""
    buckets = {key: [] for key, _label, _keywords in _TAB_KEYWORDS}
    sections = [section for section in (outline or []) if isinstance(section, dict)]
    if not sections:
        sections = build_outline(markdown or '')
    for section in sections:
        label = str(section.get('label') or '').strip()
        parent_key = _best_tab(label)
        subsections = [
            sub for sub in (section.get('subsections') or [])
            if isinstance(sub, dict) and str(sub.get('label') or '').strip()
        ]
        labels = {_norm(sub.get('label')): sub.get('label') for sub in subsections}
        current_key = parent_key
        current_lines = [label] if label else []
        columns = [str(column).strip() for column in (section.get('table_columns') or []) if str(column).strip()]
        if columns:
            current_lines.append(' | '.join(columns))

        def flush():
            nonlocal current_lines, current_key
            text = '\n'.join(line for line in current_lines if line).strip()
            if text and current_key:
                buckets[current_key].append(text)
            current_lines = []

        for line in _body_lines(section):
            probe = line[:-1].strip() if line.endswith(':') else line
            matched = labels.get(_norm(probe)) or _heading_text(line)
            matched_key = _best_tab(matched or '')
            if matched and matched_key and matched_key != current_key:
                flush()
                current_key = matched_key
                current_lines = [line]
                continue
            current_lines.append(line)
        if not current_key and current_lines:
            current_key = 'basic'
        flush()
    return buckets


def _tabs_from_buckets(buckets):
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


def _merge_buckets(primary, secondary):
    """Keep the split that found more tabs, and fill any tab it missed."""
    primary_count = sum(1 for parts in primary.values() if any(parts))
    secondary_count = sum(1 for parts in secondary.values() if any(parts))
    if secondary_count > primary_count:
        primary, secondary = secondary, primary
    merged = {key: list(primary[key]) for key in primary}
    for key, parts in secondary.items():
        if parts and not any(merged[key]):
            merged[key] = list(parts)
    return merged


def split_markdown_into_tabs(markdown, outline=None):
    """Return [{key, label, text}] for tabs that received source text."""
    by_heading = _split_by_heading_lines(markdown)
    by_outline = _split_by_outline(markdown, outline)
    return _tabs_from_buckets(_merge_buckets(by_heading, by_outline))


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
